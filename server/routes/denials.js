const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock storage
const denials = new Map();
const mockDenials = [
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-001',
    payerId: 'aetna-001',
    patientName: 'John Smith',
    serviceDate: '2026-03-15',
    deniedAmount: 350.00,
    claimAmount: 500.00,
    denialReason: 'CO-18',
    denialReasonText: 'Adjustment - Pre-authorization not on file',
    denialDate: '2026-03-22',
    appealDeadline: '2026-05-21',
    status: 'pending_review',
    cptCode: '99213',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-001',
    payerId: 'bcbs-002',
    patientName: 'Mary Johnson',
    serviceDate: '2026-03-10',
    deniedAmount: 1200.00,
    claimAmount: 1500.00,
    denialReason: 'CO-4',
    denialReasonText: 'Adjustment - Claim/service type not covered',
    denialDate: '2026-03-18',
    appealDeadline: '2026-05-17',
    status: 'pending_review',
    cptCode: '99214',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-002',
    payerId: 'united-003',
    patientName: 'Robert Davis',
    serviceDate: '2026-03-05',
    deniedAmount: 450.00,
    claimAmount: 600.00,
    denialReason: 'PR-1',
    denialReasonText: 'Payment adjustment - Policy limitations applied',
    denialDate: '2026-03-16',
    appealDeadline: '2026-05-15',
    status: 'appealing',
    cptCode: '99215',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    appeals: [
      {
        id: uuidv4(),
        submittedDate: '2026-04-05',
        letter: 'Appeal submitted with supporting clinical documentation',
        status: 'submitted'
      }
    ]
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-002',
    payerId: 'cigna-004',
    patientName: 'Patricia Miller',
    serviceDate: '2026-02-28',
    deniedAmount: 850.00,
    claimAmount: 1000.00,
    denialReason: 'CO-29',
    denialReasonText: 'Adjustment - The time period covered or life time maximum benefits were exceeded',
    denialDate: '2026-03-12',
    appealDeadline: '2026-05-11',
    status: 'won',
    cptCode: '99213',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    appeals: [
      {
        id: uuidv4(),
        submittedDate: '2026-03-20',
        letter: 'Appeal with benefit clarification',
        status: 'approved'
      }
    ]
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-003',
    payerId: 'humana-005',
    patientName: 'James Wilson',
    serviceDate: '2026-02-20',
    deniedAmount: 200.00,
    claimAmount: 250.00,
    denialReason: 'CO-97',
    denialReasonText: 'Adjustment - Claim is otherwise covered but payment is not payable (e.g., not a covered service)',
    denialDate: '2026-03-10',
    appealDeadline: '2026-05-09',
    status: 'lost',
    cptCode: '99212',
    placeOfService: 'telehealth',
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    appeals: [
      {
        id: uuidv4(),
        submittedDate: '2026-03-25',
        letter: 'Appeal denied - not a covered service',
        status: 'denied'
      }
    ]
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-003',
    payerId: 'aetna-001',
    patientName: 'Susan Anderson',
    serviceDate: '2026-03-08',
    deniedAmount: 500.00,
    claimAmount: 650.00,
    denialReason: 'PR-2',
    denialReasonText: 'Payment adjustment - Incorrect/missing authorization',
    denialDate: '2026-03-19',
    appealDeadline: '2026-05-18',
    status: 'resubmitted',
    cptCode: '99214',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    appeals: [
      {
        id: uuidv4(),
        submittedDate: '2026-04-01',
        letter: 'Resubmitted with correct authorization number',
        status: 'pending'
      }
    ]
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-001',
    payerId: 'bcbs-002',
    patientName: 'Linda Garcia',
    serviceDate: '2026-03-01',
    deniedAmount: 300.00,
    claimAmount: 400.00,
    denialReason: 'CO-45',
    denialReasonText: 'Adjustment - Charge exceeds fee schedule or maximum allowable amount',
    denialDate: '2026-03-14',
    appealDeadline: '2026-05-13',
    status: 'written_off',
    cptCode: '99213',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString()
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-002',
    payerId: 'united-003',
    patientName: 'Michael Brown',
    serviceDate: '2026-02-15',
    deniedAmount: 600.00,
    claimAmount: 800.00,
    denialReason: 'PR-3',
    denialReasonText: 'Payment adjustment - Claim submitted to incorrect insurance plan',
    denialDate: '2026-03-08',
    appealDeadline: '2026-05-07',
    status: 'pending_review',
    cptCode: '99215',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString()
  },
  {
    id: uuidv4(),
    claimId: uuidv4(),
    providerId: 'prov-003',
    payerId: 'cigna-004',
    patientName: 'Jennifer Taylor',
    serviceDate: '2026-03-11',
    deniedAmount: 175.00,
    claimAmount: 250.00,
    denialReason: 'CO-16',
    denialReasonText: 'Adjustment - Claim lacks medical documentation',
    denialDate: '2026-03-21',
    appealDeadline: '2026-05-20',
    status: 'pending_review',
    cptCode: '99214',
    placeOfService: 'office',
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
  },
];

// Initialize mock data
mockDenials.forEach(denial => denials.set(denial.id, denial));

// CARC/RARC reference codes
const carcCodes = {
  'CO-4': { code: 'CO-4', description: 'Adjustment - Claim/service type not covered', appealable: true },
  'CO-16': { code: 'CO-16', description: 'Claim lacks medical documentation', appealable: true },
  'CO-18': { code: 'CO-18', description: 'Adjustment - Pre-authorization not on file', appealable: true },
  'CO-29': { code: 'CO-29', description: 'Adjustment - The time period covered or life time maximum benefits were exceeded', appealable: true },
  'CO-45': { code: 'CO-45', description: 'Adjustment - Charge exceeds fee schedule or maximum allowable amount', appealable: true },
  'CO-97': { code: 'CO-97', description: 'Adjustment - Claim is otherwise covered but payment is not payable', appealable: false },
  'PR-1': { code: 'PR-1', description: 'Payment adjustment - Policy limitations applied', appealable: true },
  'PR-2': { code: 'PR-2', description: 'Payment adjustment - Incorrect/missing authorization', appealable: true },
  'PR-3': { code: 'PR-3', description: 'Payment adjustment - Claim submitted to incorrect insurance plan', appealable: true }
};

// Validation schemas
const appealSchema = z.object({
  letter: z.string().min(10).max(5000),
  supportingDocs: z.array(z.string()).optional().default([])
});

const statusUpdateSchema = z.object({
  status: z.enum(['pending_review', 'appealing', 'won', 'lost', 'resubmitted', 'written_off'])
});

/**
 * GET /denials
 * List denied claims with filtering options
 * Provider staff/admin role only
 */
router.get('/', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    const { reason, payer, status, startDate, endDate, limit = 20, offset = 0 } = req.query;

    let filteredDenials = Array.from(denials.values());

    // Filter by provider
    filteredDenials = filteredDenials.filter((d) => d.providerId === req.user.id || req.user.role === ROLES.PRACTICE_ADMIN);

    // Filter by denial reason (CARC code)
    if (reason) {
      filteredDenials = filteredDenials.filter((d) => d.denialReason === reason);
    }

    // Filter by payer
    if (payer) {
      filteredDenials = filteredDenials.filter((d) => d.payerId === payer);
    }

    // Filter by status
    if (status) {
      filteredDenials = filteredDenials.filter((d) => d.status === status);
    }

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      filteredDenials = filteredDenials.filter((d) => new Date(d.denialDate) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      filteredDenials = filteredDenials.filter((d) => new Date(d.denialDate) <= end);
    }

    const total = filteredDenials.length;
    const paginated = filteredDenials.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      data: paginated,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: offset + parseInt(limit) < total
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to list denials',
      code: 'LIST_ERROR',
      details: err.message
    });
  }
});

/**
 * GET /denials/:id
 * Get detailed denial information including CARC/RARC codes and appeal deadline
 */
router.get('/:id', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    const denial = denials.get(req.params.id);

    if (!denial) {
      return res.status(404).json({
        error: 'Denial not found',
        code: 'NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role === ROLES.PROVIDER_STAFF && denial.providerId !== req.user.id) {
      return res.status(403).json({
        error: 'Cannot access this denial',
        code: 'FORBIDDEN'
      });
    }

    const carcInfo = carcCodes[denial.denialReason];

    res.json({
      success: true,
      denial: {
        ...denial,
        carcCode: carcInfo,
        appealable: carcInfo?.appealable || false,
        daysUntilDeadline: Math.floor((new Date(denial.appealDeadline) - new Date()) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve denial',
      code: 'GET_ERROR',
      details: err.message
    });
  }
});

/**
 * POST /denials/:id/appeal
 * Submit appeal for denied claim with letter and supporting documentation
 */
router.post(
  '/:id/appeal',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  (req, res) => {
    try {
      const denial = denials.get(req.params.id);

      if (!denial) {
        return res.status(404).json({
          error: 'Denial not found',
          code: 'NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role === ROLES.PROVIDER_STAFF && denial.providerId !== req.user.id) {
        return res.status(403).json({
          error: 'Cannot access this denial',
          code: 'FORBIDDEN'
        });
      }

      // Validate request body
      const validation = appealSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid appeal data',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const carcInfo = carcCodes[denial.denialReason];
      if (!carcInfo?.appealable) {
        return res.status(400).json({
          error: 'This denial reason is not appealable',
          code: 'NOT_APPEALABLE',
          denialReason: denial.denialReason,
          denialReasonText: carcInfo?.description
        });
      }

      // Check deadline
      if (new Date() > new Date(denial.appealDeadline)) {
        return res.status(400).json({
          error: 'Appeal deadline has passed',
          code: 'DEADLINE_EXCEEDED',
          appealDeadline: denial.appealDeadline
        });
      }

      // Create appeal
      const appeal = {
        id: uuidv4(),
        submittedDate: new Date().toISOString(),
        letter: validation.data.letter,
        supportingDocs: validation.data.supportingDocs,
        status: 'submitted',
        submittedBy: req.user.id
      };

      denial.appeals = denial.appeals || [];
      denial.appeals.push(appeal);
      denial.status = 'appealing';
      denial.updatedAt = new Date().toISOString();

      res.status(201).json({
        success: true,
        appeal,
        denial
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to submit appeal',
        code: 'APPEAL_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * PUT /denials/:id/status
 * Update denial status (pending_review, appealing, won, lost, resubmitted, written_off)
 * Immutable once recorded - includes audit trail
 */
router.put(
  '/:id/status',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  (req, res) => {
    try {
      const denial = denials.get(req.params.id);

      if (!denial) {
        return res.status(404).json({
          error: 'Denial not found',
          code: 'NOT_FOUND'
        });
      }

      // Check authorization
      if (req.user.role === ROLES.PROVIDER_STAFF && denial.providerId !== req.user.id) {
        return res.status(403).json({
          error: 'Cannot access this denial',
          code: 'FORBIDDEN'
        });
      }

      // Validate status
      const validation = statusUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid status',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      // Log status change (immutable audit trail)
      denial.statusHistory = denial.statusHistory || [];
      denial.statusHistory.push({
        previousStatus: denial.status,
        newStatus: validation.data.status,
        changedAt: new Date().toISOString(),
        changedBy: req.user.id
      });

      denial.status = validation.data.status;
      denial.updatedAt = new Date().toISOString();

      res.json({
        success: true,
        denial,
        auditLog: denial.statusHistory
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to update status',
        code: 'UPDATE_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /denials/analytics
 * Denial analytics: rates by payer, by reason, appeal success rates, trends
 */
router.get('/analytics/summary', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    const allDenials = Array.from(denials.values());

    // Filter by provider
    let providerDenials = allDenials;
    if (req.user.role === ROLES.PROVIDER_STAFF) {
      providerDenials = allDenials.filter((d) => d.providerId === req.user.id);
    }

    // Calculate metrics
    const totalDenials = providerDenials.length;
    const totalDeniedAmount = providerDenials.reduce((sum, d) => sum + d.deniedAmount, 0);

    // By payer
    const byPayer = {};
    providerDenials.forEach((d) => {
      if (!byPayer[d.payerId]) {
        byPayer[d.payerId] = { count: 0, amount: 0, appealCount: 0, successCount: 0 };
      }
      byPayer[d.payerId].count += 1;
      byPayer[d.payerId].amount += d.deniedAmount;
      if (d.appeals) {
        byPayer[d.payerId].appealCount += 1;
        if (d.status === 'won') byPayer[d.payerId].successCount += 1;
      }
    });

    // By denial reason
    const byReason = {};
    providerDenials.forEach((d) => {
      if (!byReason[d.denialReason]) {
        byReason[d.denialReason] = { count: 0, amount: 0, appealSuccessRate: 0 };
      }
      byReason[d.denialReason].count += 1;
      byReason[d.denialReason].amount += d.deniedAmount;
    });

    // Appeal success rate
    const appealed = providerDenials.filter((d) => d.appeals && d.appeals.length > 0);
    const successfulAppeals = providerDenials.filter((d) => d.status === 'won');
    const appealSuccessRate = appealed.length > 0 ? ((successfulAppeals.length / appealed.length) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      analytics: {
        totalDenials,
        totalDeniedAmount,
        denialRate: ((totalDenials / (totalDenials + 50)) * 100).toFixed(2), // Mock calculation
        byPayer,
        byReason,
        appeals: {
          totalAppealed: appealed.length,
          totalSuccessful: successfulAppeals.length,
          successRate: appealSuccessRate + '%'
        }
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve analytics',
      code: 'ANALYTICS_ERROR',
      details: err.message
    });
  }
});

module.exports = router;
