const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Validation schema
const estimationSchema = z.object({
  payerId: z.string().min(1, 'Payer ID required'),
  cptCodes: z
    .array(z.string().regex(/^\d{5}$/, 'Each CPT code must be 5 digits'))
    .min(1)
    .max(10),
  placeOfService: z.enum(['office', 'hospital', 'facility', 'telehealth']).optional().default('office')
});

// Mock payer fee schedules
const feeSchedules = {
  'aetna-001': {
    payerName: 'Aetna Insurance',
    '99213': { allowedAmount: 125.00, copay: 30.00, deductible: 1000.00 },
    '99214': { allowedAmount: 175.00, copay: 30.00, deductible: 1000.00 },
    '99215': { allowedAmount: 225.00, copay: 40.00, deductible: 1000.00 },
    '99395': { allowedAmount: 200.00, copay: 0.00, deductible: 0.00 }, // Preventive
    '99212': { allowedAmount: 85.00, copay: 20.00, deductible: 1000.00 }
  },
  'bcbs-002': {
    payerName: 'BCBS Insurance',
    '99213': { allowedAmount: 130.00, copay: 25.00, deductible: 1500.00 },
    '99214': { allowedAmount: 180.00, copay: 25.00, deductible: 1500.00 },
    '99215': { allowedAmount: 240.00, copay: 40.00, deductible: 1500.00 },
    '99395': { allowedAmount: 210.00, copay: 0.00, deductible: 0.00 },
    '99212': { allowedAmount: 90.00, copay: 20.00, deductible: 1500.00 }
  },
  'united-003': {
    payerName: 'United Healthcare',
    '99213': { allowedAmount: 120.00, copay: 35.00, deductible: 1200.00 },
    '99214': { allowedAmount: 170.00, copay: 35.00, deductible: 1200.00 },
    '99215': { allowedAmount: 220.00, copay: 40.00, deductible: 1200.00 },
    '99395': { allowedAmount: 190.00, copay: 0.00, deductible: 0.00 },
    '99212': { allowedAmount: 80.00, copay: 20.00, deductible: 1200.00 }
  },
  'cigna-004': {
    payerName: 'Cigna',
    '99213': { allowedAmount: 128.00, copay: 30.00, deductible: 1000.00 },
    '99214': { allowedAmount: 178.00, copay: 30.00, deductible: 1000.00 },
    '99215': { allowedAmount: 228.00, copay: 40.00, deductible: 1000.00 },
    '99395': { allowedAmount: 205.00, copay: 0.00, deductible: 0.00 },
    '99212': { allowedAmount: 88.00, copay: 20.00, deductible: 1000.00 }
  },
  'humana-005': {
    payerName: 'Humana',
    '99213': { allowedAmount: 122.00, copay: 25.00, deductible: 1500.00 },
    '99214': { allowedAmount: 172.00, copay: 25.00, deductible: 1500.00 },
    '99215': { allowedAmount: 222.00, copay: 40.00, deductible: 1500.00 },
    '99395': { allowedAmount: 195.00, copay: 0.00, deductible: 0.00 },
    '99212': { allowedAmount: 85.00, copay: 20.00, deductible: 1500.00 }
  }
};

// Mock patient data (for context)
const mockPatients = {
  'patient-001': {
    name: 'John Smith',
    dateOfBirth: '1960-05-15',
    age: 65,
    deductibleMet: 500.00, // Remaining
    outOfPocketMet: 1500.00, // Remaining
    coinsuranceRate: 0.2 // 20%
  }
};

/**
 * POST /estimator/calculate
 * Calculate patient financial responsibility
 * Input: payer, CPT codes, place of service
 * Output: allowed amount, payer responsibility, patient responsibility breakdown
 * INCLUDES GUARDRAIL DISCLAIMER
 */
router.post(
  '/calculate',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      // Validate request
      const validation = estimationSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid estimation parameters',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const { payerId, cptCodes, placeOfService } = validation.data;

      // Check if payer exists in fee schedule
      if (!feeSchedules[payerId]) {
        return res.status(400).json({
          error: 'Payer not found or fee schedule not available',
          code: 'PAYER_NOT_FOUND',
          availablePayers: Object.keys(feeSchedules)
        });
      }

      const payerSchedule = feeSchedules[payerId];
      const estimations = [];
      let totalAllowedAmount = 0;
      let totalPayerResponsibility = 0;
      let totalPatientResponsibility = 0;

      // Calculate for each CPT code
      cptCodes.forEach((cpt) => {
        const feeInfo = payerSchedule[cpt];

        if (!feeInfo) {
          estimations.push({
            cptCode: cpt,
            error: 'CPT code not found in payer fee schedule',
            status: 'unavailable'
          });
          return;
        }

        const allowedAmount = feeInfo.allowedAmount;
        const copay = feeInfo.copay;
        const deductible = feeInfo.deductible;

        // Calculate patient responsibility
        let patientResponsibility = 0;
        let payerResponsibility = allowedAmount;

        // Simple mock calculation
        // (In production, this would check patient deductible, max out-of-pocket, etc.)
        if (copay > 0) {
          patientResponsibility += copay;
          payerResponsibility = allowedAmount - copay;
        }

        totalAllowedAmount += allowedAmount;
        totalPayerResponsibility += payerResponsibility;
        totalPatientResponsibility += patientResponsibility;

        estimations.push({
          cptCode: cpt,
          status: 'available',
          allowedAmount,
          payerResponsibility,
          patientResponsibility: {
            copay: copay,
            coinsurance: 0,
            deductible: 0,
            total: patientResponsibility
          }
        });
      });

      // Build response
      const response = {
        success: true,
        estimation: {
          payerId,
          payerName: payerSchedule.payerName,
          placeOfService,
          services: estimations,
          summary: {
            totalAllowedAmount,
            totalPayerResponsibility,
            totalPatientResponsibility,
            estimatedPatientShare: ((totalPatientResponsibility / totalAllowedAmount) * 100).toFixed(2) + '%'
          }
        },
        // GUARDRAIL: REQUIRED DISCLAIMER
        disclaimer:
          'This is an estimate only. Actual patient responsibility may differ. This estimate does not account for: plan deductibles that may not be met, maximum out-of-pocket limits, plan changes, prior authorization requirements, or address or bundling rules. Verify with the patient\'s insurance company for accurate cost estimates.'
      };

      res.json(response);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to calculate estimate',
        code: 'CALCULATION_ERROR',
        details: err.message
      });
    }
  }
);

module.exports = router;
