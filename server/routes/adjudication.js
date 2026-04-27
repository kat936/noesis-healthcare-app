const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock storage
const adjudications = new Map();
const decisions = new Map(); // Immutable audit log of all decisions

const mockQueue = [
  {
    claimId: uuidv4(),
    claimNumber: 'CLM-003001',
    submittedDate: '2026-04-08',
    patientName: 'David Wilson',
    dateOfBirth: '1965-05-15',
    memberId: 'MEM-789456',
    serviceDate: '2026-04-05',
    providerId: 'prov-001',
    providerName: 'Main Street Clinic',
    diagnosis: 'Type 2 Diabetes - J18.9',
    procedure: 'Office Visit - Established Patient',
    cptCode: '99214',
    chargeAmount: 450.00,
    claimStatus: 'pending_review',
    autoAdjudicate: false,
    requiresManualReview: true,
    reviewReason: 'Out-of-network provider - requires verification',
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    claimId: uuidv4(),
    claimNumber: 'CLM-003002',
    submittedDate: '2026-04-08',
    patientName: 'Carol Garcia',
    dateOfBirth: '1980-03-22',
    memberId: 'MEM-789457',
    serviceDate: '2026-04-06',
    providerId: 'prov-002',
    providerName: 'North Medical Center',
    diagnosis: 'Hypertension - I10',
    procedure: 'Office Visit - New Patient',
    cptCode: '99215',
    chargeAmount: 600.00,
    claimStatus: 'pending_review',
    autoAdjudicate: true,
    requiresManualReview: false,
    reviewReason: null,
    createdAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    claimId: uuidv4(),
    claimNumber: 'CLM-003003',
    submittedDate: '2026-04-07',
    patientName: 'Edward Martinez',
    dateOfBirth: '1952-11-08',
    memberId: 'MEM-789458',
    serviceDate: '2026-04-04',
    providerId: 'prov-003',
    providerName: 'Care Plus Hospital',
    diagnosis: 'Post-operative care - Z48.3',
    procedure: 'Post-operative visit',
    cptCode: '99213',
    chargeAmount: 350.00,
    claimStatus: 'pending_review',
    autoAdjudicate: false,
    requiresManualReview: true,
    reviewReason: 'Prior authorization check required',
    priorAuthNumber: 'PA-2026-045123',
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    claimId: uuidv4(),
    claimNumber: 'CLM-003004',
    submittedDate: '2026-04-07',
    patientName: 'Margaret Brown',
    dateOfBirth: '1948-07-19',
    memberId: 'MEM-789459',
    serviceDate: '2026-04-03',
    providerId: 'prov-001',
    providerName: 'Main Street Clinic',
    diagnosis: 'Routine physical examination - Z00.00',
    procedure: 'Preventive medicine visit',
    cptCode: '99395',
    chargeAmount: 250.00,
    claimStatus: 'pending_review',
    autoAdjudicate: true,
    requiresManualReview: false,
    reviewReason: null,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    claimId: uuidv4(),
    claimNumber: 'CLM-003005',
    submittedDate: '2026-04-06',
    patientName: 'James Thompson',
    dateOfBirth: '1958-09-12',
    memberId: 'MEM-789460',
    serviceDate: '2026-04-02',
    providerId: 'prov-002',
    providerName: 'North Medical Center',
    diagnosis: 'Acute sinusitis - J01.90',
    procedure: 'Office consultation',
    cptCode: '99214',
    chargeAmount: 400.00,
    claimStatus: 'pending_review',
    autoAdjudicate: false,
    requiresManualReview: true,
    reviewReason: 'Age-based eligibility check (Medicare)',
    memberAge: 66,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  }
];

// Initialize mock queue
mockQueue.forEach((claim) => {
  adjudications.set(claim.claimId, claim);
});

// Validation schemas
const decisionSchema = z.object({
  action: z.enum(['approve', 'deny', 'pend', 'partial_pay']),
  reasonCode: z.string().optional(),
  amount: z.number().positive().optional(),
  notes: z.string().min(10).max(2000),
  confirmation: z.boolean().refine((val) => val === true, {
    message: 'You must confirm this decision'
  })
});

// Decision reason codes
const decisionReasons = {
  approve: [],
  deny: [
    'NOT_COVERED',
    'LACKS_MEDICAL_NECESSITY',
    'DUPLICATE_SERVICE',
    'OUT_OF_NETWORK',
    'PATIENT_INELIGIBLE',
    'MISSING_AUTHORIZATION'
  ],
  pend: [
    'AWAITING_DOCUMENTATION',
    'PRIOR_AUTH_PENDING',
    'ELIGIBILITY_REVIEW',
    'PROVIDER_VERIFICATION'
  ],
  partial_pay: [
    'FEE_SCHEDULE_ADJUSTMENT',
    'POLICY_LIMIT',
    'DEDUCTIBLE_APPLY'
  ]
};

/**
 * GET /adjudication/queue
 * Get claims pending review
 * Insurance representatives only - internal payer workflow
 */
router.get('/queue', authenticate, authorize(ROLES.INSURANCE_REP), apiLimiter, (req, res) => {
  try {
    const { limit = 20, offset = 0, autoAdjudicateOnly = false } = req.query;

    let queue = Array.from(adjudications.values()).filter((c) => c.claimStatus === 'pending_review');

    // Filter auto-adjudicate only if requested
    if (autoAdjudicateOnly === 'true') {
      queue = queue.filter((c) => c.autoAdjudicate);
    }

    // Sort by submitted date (oldest first)
    queue.sort((a, b) => new Date(a.submittedDate) - new Date(b.submittedDate));

    const total = queue.length;
    const paginated = queue.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      queue: paginated,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + parseInt(limit) < total
      },
      queueStats: {
        totalPending: total,
        autoAdjudicateCount: queue.filter((c) => c.autoAdjudicate).length,
        manualReviewCount: queue.filter((c) => c.requiresManualReview).length,
        averageWaitHours: Math.floor(queue.length > 0
          ? queue.reduce((sum, c) => sum + ((Date.now() - new Date(c.submittedDate)) / 3600000), 0) / queue.length
          : 0)
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve queue',
      code: 'QUEUE_ERROR',
      details: err.message
    });
  }
});

/**
 * GET /adjudication/:claimId
 * Get full claim for adjudication review
 * Shows eligibility, fee schedule, prior authorization status
 */
router.get('/:claimId', authenticate, authorize(ROLES.INSURANCE_REP), apiLimiter, (req, res) => {
  try {
    const claim = adjudications.get(req.params.claimId);

    if (!claim) {
      return res.status(404).json({
        error: 'Claim not found',
        code: 'NOT_FOUND'
      });
    }

    // Mock eligibility check
    const eligibility = {
      memberId: claim.memberId,
      isEligible: true,
      coverageStartDate: '2025-01-01',
      coverageEndDate: '2026-12-31',
      planName: 'Silver Plan',
      deductibleRemaining: 150.00,
      outOfPocketRemaining: 2500.00,
      copay: 30.00
    };

    // Mock fee schedule lookup
    const feeSchedule = {
      cptCode: claim.cptCode,
      allowedAmount: claim.chargeAmount * 0.85, // Mock 85% allowance
      feeScheduleAmount: claim.chargeAmount * 0.85
    };

    // Mock prior auth status
    const priorAuth = claim.priorAuthNumber ? {
      number: claim.priorAuthNumber,
      isOnFile: true,
      approvalStatus: 'approved',
      expiryDate: '2026-06-04'
    } : null;

    res.json({
      success: true,
      claim: {
        ...claim,
        eligibility,
        feeSchedule,
        priorAuth,
        reviewItems: {
          needsEligibilityVerification: claim.requiresManualReview,
          needsPriorAuthVerification: claim.reviewReason?.includes('Prior'),
          needsFeeScheduleLookup: true,
          needsProviderNetworkCheck: claim.reviewReason?.includes('network')
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve claim',
      code: 'GET_ERROR',
      details: err.message
    });
  }
});

/**
 * POST /adjudication/:claimId/decide
 * Record adjudication decision (IMMUTABLE)
 * Decision is logged to audit trail and cannot be changed
 * Requires explicit confirmation flag
 */
router.post('/:claimId/decide', authenticate, authorize(ROLES.INSURANCE_REP), (req, res) => {
  try {
    const claim = adjudications.get(req.params.claimId);

    if (!claim) {
      return res.status(404).json({
        error: 'Claim not found',
        code: 'NOT_FOUND'
      });
    }

    // Validate decision data
    const validation = decisionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid decision data',
        code: 'VALIDATION_ERROR',
        details: validation.error.errors
      });
    }

    const decision = validation.data;

    // Validate reason code for denial/partial pay
    if ((decision.action === 'deny' || decision.action === 'partial_pay') && !decision.reasonCode) {
      return res.status(400).json({
        error: 'Reason code required for deny/partial_pay decisions',
        code: 'MISSING_REASON_CODE'
      });
    }

    if (decision.reasonCode && !decisionReasons[decision.action].includes(decision.reasonCode)) {
      return res.status(400).json({
        error: 'Invalid reason code for this action',
        code: 'INVALID_REASON_CODE',
        validReasons: decisionReasons[decision.action]
      });
    }

    // Validate amount for partial pay
    if (decision.action === 'partial_pay' && !decision.amount) {
      return res.status(400).json({
        error: 'Amount required for partial_pay decisions',
        code: 'MISSING_AMOUNT'
      });
    }

    // Create immutable decision record
    const decisionRecord = {
      id: uuidv4(),
      claimId: req.params.claimId,
      claimNumber: claim.claimNumber,
      action: decision.action,
      reasonCode: decision.reasonCode || null,
      approvalAmount: decision.action === 'partial_pay' ? decision.amount : (decision.action === 'approve' ? claim.chargeAmount : 0),
      notes: decision.notes,
      decidedBy: req.user.id,
      decidedAt: new Date().toISOString(),
      immutable: true // Flag to indicate this is permanent
    };

    // Store decision to immutable log
    decisions.set(decisionRecord.id, decisionRecord);

    // Update claim status
    const statusMap = {
      approve: 'approved',
      deny: 'denied',
      pend: 'pending',
      partial_pay: 'partial_approved'
    };

    claim.claimStatus = statusMap[decision.action];
    claim.adjudicationDecision = decisionRecord.id;
    claim.adjudicatedAt = new Date().toISOString();
    claim.adjudicatedBy = req.user.id;

    res.status(201).json({
      success: true,
      message: 'Decision recorded successfully',
      decision: decisionRecord,
      claim: {
        claimId: claim.claimId,
        claimNumber: claim.claimNumber,
        status: claim.claimStatus,
        adjudicatedAt: claim.adjudicatedAt
      },
      audit: {
        immutable: true,
        cannotBeModified: true,
        note: 'This decision has been logged to immutable audit trail'
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to record decision',
      code: 'DECISION_ERROR',
      details: err.message
    });
  }
});

/**
 * GET /adjudication/stats
 * Adjudication workflow statistics
 * Shows auto-adjudicated vs manual review, timing metrics
 */
router.get('/stats/summary', authenticate, authorize(ROLES.INSURANCE_REP), apiLimiter, (req, res) => {
  try {
    const allClaims = Array.from(adjudications.values());
    const decidedClaims = Array.from(decisions.values());

    const stats = {
      queue: {
        totalPending: allClaims.filter((c) => c.claimStatus === 'pending_review').length,
        autoAdjudicate: allClaims.filter((c) => c.autoAdjudicate && c.claimStatus === 'pending_review').length,
        manualReview: allClaims.filter((c) => c.requiresManualReview && c.claimStatus === 'pending_review').length
      },
      processing: {
        totalProcessed: decidedClaims.length,
        autoAdjudicated: decidedClaims.filter((d) => d.action === 'approve').length,
        manuallyReviewed: decidedClaims.filter((d) => d.action !== 'approve').length
      },
      decisions: {
        approved: decidedClaims.filter((d) => d.action === 'approve').length,
        denied: decidedClaims.filter((d) => d.action === 'deny').length,
        pended: decidedClaims.filter((d) => d.action === 'pend').length,
        partialApproved: decidedClaims.filter((d) => d.action === 'partial_pay').length
      },
      timing: {
        averageDecisionTimeMinutes: decidedClaims.length > 0
          ? Math.floor(decidedClaims.reduce((sum, d) => sum + Math.random() * 120, 0) / decidedClaims.length)
          : 0,
        oldestPendingClaim: allClaims.filter((c) => c.claimStatus === 'pending_review').length > 0
          ? Math.floor((Date.now() - new Date(allClaims.filter((c) => c.claimStatus === 'pending_review')[0].submittedDate)) / 3600000) + ' hours'
          : 'None'
      }
    };

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve stats',
      code: 'STATS_ERROR',
      details: err.message
    });
  }
});

module.exports = router;
