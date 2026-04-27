const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { eligibilitySchema } = require('../schemas/validation');

const router = express.Router();

/**
 * GET /eligibility/verify
 * Check patient eligibility with payer
 * In production, this would call payer APIs (Eligibility API standards)
 */
router.post(
  '/verify',
  authenticate,
  requirePlan('essentials', 'professional', 'enterprise'),
  apiLimiter,
  validate(eligibilitySchema),
  (req, res) => {
    try {
      const { patientName, dateOfBirth, memberId, payerId, serviceType } =
        req.validated;

      // Mock eligibility response
      // In production: call payer's eligibility API (EDI 270/271, API)
      const eligibility = {
        memberId: memberId || 'MEM-000123',
        patientName: patientName || 'John Doe',
        payerId,
        serviceType: serviceType || 'medical',
        isEligible: true,
        eligibilityStartDate: '2025-01-01',
        eligibilityEndDate: '2025-12-31',
        groupNumber: 'GRP-00456',
        plan: {
          name: 'Professional Health Plan',
          type: 'PPO',
          deductible: 1000,
          deductibleMet: 250,
          outOfPocketMax: 5000,
          outOfPocketMet: 500,
          copay: {
            officeVisit: 30,
            specialist: 50,
            emergency: 250,
            urgent: 75
          },
          coinsurance: 0.2,
          coverage: {
            preventive: '100%',
            office_visit: '80%',
            emergency: '80%',
            hospitalization: '80%',
            surgery: '80%'
          }
        },
        coverage: {
          preventiveServices: true,
          emergencyCare: true,
          urgentCare: true,
          primaryCare: true,
          specialistCare: true,
          surgicalProcedures: true
        },
        exclusions: [],
        priorAuthRequired: [
          'cardiac surgery',
          'orthopedic surgery',
          'mental health services'
        ],
        references: {
          payerReferenceId: 'PAY-REF-789012',
          verificationMethod: 'Online',
          verifiedBy: 'Automated System'
        },
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      res.json({
        success: true,
        eligibility
      });
    } catch (err) {
      res.status(500).json({
        error: 'Eligibility verification failed',
        code: 'VERIFY_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /eligibility/history/:memberId
 * Get eligibility history for member
 */
router.get(
  '/history/:memberId',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { memberId } = req.params;

      // Mock history
      const history = [
        {
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          plan: 'Professional Health Plan',
          deductible: 1000,
          status: 'active'
        },
        {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          plan: 'Professional Health Plan',
          deductible: 1000,
          status: 'expired'
        }
      ];

      res.json({
        success: true,
        memberId,
        history
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve eligibility history',
        code: 'HISTORY_ERROR'
      });
    }
  }
);

/**
 * POST /eligibility/batch
 * Verify eligibility for multiple patients
 */
router.post(
  '/batch',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { patients, payerId } = req.body;

      if (!Array.isArray(patients) || patients.length === 0) {
        return res.status(400).json({
          error: 'patients array required',
          code: 'VALIDATION_ERROR'
        });
      }

      // Mock batch verification
      const results = patients.map((p) => ({
        memberId: p.memberId,
        name: p.name,
        isEligible: true,
        plan: 'Professional Health Plan',
        verifiedAt: new Date().toISOString()
      }));

      res.json({
        success: true,
        payerId,
        total: results.length,
        eligible: results.filter((r) => r.isEligible).length,
        results
      });
    } catch (err) {
      res.status(500).json({
        error: 'Batch verification failed',
        code: 'BATCH_ERROR'
      });
    }
  }
);

/**
 * GET /eligibility/payers
 * List connected payers for eligibility verification
 */
router.get(
  '/payers',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const payers = [
        {
          payerId: 'ANTHEM',
          name: 'Anthem Blue Cross',
          status: 'connected',
          method: 'API'
        },
        {
          payerId: 'AETNA',
          name: 'Aetna Insurance',
          status: 'connected',
          method: 'EDI 270/271'
        },
        {
          payerId: 'CIGNA',
          name: 'Cigna Healthcare',
          status: 'connected',
          method: 'API'
        },
        {
          payerId: 'UNITED',
          name: 'United Healthcare',
          status: 'connected',
          method: 'EDI 270/271'
        },
        {
          payerId: 'HUMANA',
          name: 'Humana Insurance',
          status: 'disconnected',
          method: 'Manual'
        }
      ];

      res.json({
        success: true,
        payers,
        connected: payers.filter((p) => p.status === 'connected').length,
        total: payers.length
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to list payers',
        code: 'LIST_ERROR'
      });
    }
  }
);

module.exports = router;
