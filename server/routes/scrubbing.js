const express = require('express');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock claim scrubbing rules (rules-based validation, NOT AI)
const scrubRules = [
  {
    id: 'MODIFIER_CONSISTENCY',
    name: 'Modifier Consistency Check',
    description: 'Verify modifiers match procedure and service requirements',
    enabled: true,
    severity: 'error'
  },
  {
    id: 'CPT_ICD_COMPAT',
    name: 'CPT-ICD Compatibility',
    description: 'Check CPT code matches ICD-10 diagnosis codes',
    enabled: true,
    severity: 'error'
  },
  {
    id: 'POS_VALIDATION',
    name: 'Place of Service Validation',
    description: 'Verify place of service code is valid and matches service type',
    enabled: true,
    severity: 'error'
  },
  {
    id: 'AGE_ELIGIBILITY',
    name: 'Age-Based Payer Eligibility',
    description: 'Check patient age eligibility for payer (e.g., Medicare at 65)',
    enabled: true,
    severity: 'error'
  },
  {
    id: 'TIMELY_FILING',
    name: 'Timely Filing Deadline',
    description: 'Verify submission is within payer timely filing window',
    enabled: true,
    severity: 'error'
  },
  {
    id: 'DUPLICATE_CHECK',
    name: 'Duplicate Service Check',
    description: 'Detect if claim is duplicate of previously submitted service',
    enabled: true,
    severity: 'error'
  },
  {
    id: 'NCCI_BUNDLING',
    name: 'NCCI Bundling Check',
    description: 'Check for NCCI bundling conflicts between CPT codes',
    enabled: true,
    severity: 'warning'
  }
];

// Mock NCCI bundling pairs (sample)
const ncciBundles = [
  { primary: '99214', bundled: '99213', description: 'Cannot bill both office visit levels' },
  { primary: '90834', bundled: '90835', description: 'Cannot bill both therapy session lengths' },
  { primary: '99203', bundled: '99204', description: 'Cannot bill both problem-focused and detailed visits' }
];

// Mock place of service codes
const posValidCodes = ['office', 'hospital', 'facility', 'telehealth', 'home', 'urgent_care'];

// Validation schema
const claimScrubSchema = z.object({
  cptCodes: z.array(z.string().regex(/^\d{5}$/)).min(1),
  icd10Codes: z.array(z.string()).min(1),
  modifiers: z.array(z.string()).optional().default([]),
  placeOfService: z.string(),
  patientDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payerId: z.string(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

/**
 * POST /scrubbing/validate
 * Run claim through comprehensive scrubbing rules
 * Rules-based validation (NOT AI)
 * Returns: errors, warnings, clean claim status
 */
router.post(
  '/validate',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  (req, res) => {
    try {
      // Validate schema
      const validation = claimScrubSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid claim data',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const {
        cptCodes,
        icd10Codes,
        modifiers,
        placeOfService,
        patientDateOfBirth,
        payerId,
        serviceDate
      } = validation.data;

      const errors = [];
      const warnings = [];
      let scrubScore = 100;

      // RULE 1: Place of Service Validation
      if (!posValidCodes.includes(placeOfService)) {
        errors.push({
          rule: 'POS_VALIDATION',
          severity: 'error',
          message: `Invalid place of service: ${placeOfService}`,
          validValues: posValidCodes
        });
        scrubScore -= 20;
      }

      // RULE 2: Age-Based Payer Eligibility Check
      if (payerId.includes('medicare')) {
        const dob = new Date(patientDateOfBirth);
        const age = new Date().getFullYear() - dob.getFullYear();
        if (age < 65) {
          errors.push({
            rule: 'AGE_ELIGIBILITY',
            severity: 'error',
            message: `Patient age ${age} is below Medicare eligibility age of 65`,
            patientAge: age,
            requiredAge: 65
          });
          scrubScore -= 20;
        }
      }

      // RULE 3: CPT-ICD Compatibility (mock check)
      // In production, would use official CPT-to-ICD mapping tables
      const validDiagnosisFormat = icd10Codes.every((code) => /^[A-Z]\d{2}(\.\d{1,4})?$/.test(code));
      if (!validDiagnosisFormat) {
        errors.push({
          rule: 'CPT_ICD_COMPAT',
          severity: 'error',
          message: 'Invalid ICD-10 code format. Expected format: A12.3'
        });
        scrubScore -= 15;
      }

      // RULE 4: Modifier Consistency (mock check)
      // In production, would validate against CPT guidelines
      const invalidModifiers = modifiers.filter((m) => m.length !== 2 || !/^[A-Z]{2}$/.test(m));
      if (invalidModifiers.length > 0) {
        errors.push({
          rule: 'MODIFIER_CONSISTENCY',
          severity: 'error',
          message: `Invalid modifiers: ${invalidModifiers.join(', ')}. Modifiers must be 2 alphanumeric characters.`,
          invalidModifiers
        });
        scrubScore -= 15;
      }

      // RULE 5: Timely Filing Deadline
      const submissionDate = new Date();
      const serviceDate_obj = new Date(serviceDate);
      const daysSinceService = Math.floor((submissionDate - serviceDate_obj) / (1000 * 60 * 60 * 24));
      const timelyFilingWindow = 90; // Mock 90-day window

      if (daysSinceService > timelyFilingWindow) {
        errors.push({
          rule: 'TIMELY_FILING',
          severity: 'error',
          message: `Claim submitted ${daysSinceService} days after service. Timely filing deadline is ${timelyFilingWindow} days.`,
          daysSinceService,
          timelyFilingWindow,
          deadline: new Date(serviceDate_obj.getTime() + timelyFilingWindow * 24 * 60 * 60 * 1000).toISOString()
        });
        scrubScore -= 25;
      }

      // RULE 6: Duplicate Service Check (mock - would check against claim history)
      // In this demo, we'll assume no duplicates
      // In production: check if same patient, provider, CPT code, DOS, and place of service exist

      // RULE 7: NCCI Bundling Check
      cptCodes.forEach((cpt, idx) => {
        const bundleConflict = ncciBundles.find((bundle) => bundle.primary === cpt);
        if (bundleConflict && cptCodes.includes(bundleConflict.bundled)) {
          warnings.push({
            rule: 'NCCI_BUNDLING',
            severity: 'warning',
            message: `NCCI bundling conflict detected: ${cpt} and ${bundleConflict.bundled}`,
            primaryCode: bundleConflict.primary,
            bundledCode: bundleConflict.bundled,
            description: bundleConflict.description
          });
          scrubScore -= 5;
        }
      });

      // Determine clean claim status
      const isCleanClaim = errors.length === 0 && scrubScore >= 80;

      res.json({
        success: true,
        scrubbing: {
          claimData: {
            cptCodes,
            icd10Codes,
            modifiers,
            placeOfService,
            serviceDate
          },
          results: {
            errors: errors.length > 0 ? errors : [],
            warnings: warnings.length > 0 ? warnings : [],
            scrubScore,
            cleanClaimStatus: isCleanClaim,
            readyForSubmission: isCleanClaim,
            issues: errors.length + warnings.length
          }
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to run scrubbing validation',
        code: 'SCRUB_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /scrubbing/rules
 * List all active scrubbing rules and their descriptions
 */
router.get(
  '/rules',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      const activeRules = scrubRules.filter((rule) => rule.enabled);

      res.json({
        success: true,
        rules: activeRules,
        totalRules: activeRules.length,
        note: 'All rules are rules-based validation (NOT AI). Each rule checks claim data against healthcare coding standards.'
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve rules',
        code: 'RULES_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /scrubbing/stats
 * Daily scrubbing statistics
 * Shows clean rate, error types, trends
 */
router.get(
  '/stats',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      // Mock stats for today
      const stats = {
        today: {
          totalClaims: 45,
          cleanClaims: 38,
          cleanRate: ((38 / 45) * 100).toFixed(2) + '%',
          errorClaims: 7,
          commonErrors: [
            {
              rule: 'MODIFIER_CONSISTENCY',
              count: 3,
              percentage: ((3 / 7) * 100).toFixed(2) + '%'
            },
            {
              rule: 'CPT_ICD_COMPAT',
              count: 2,
              percentage: ((2 / 7) * 100).toFixed(2) + '%'
            },
            {
              rule: 'POS_VALIDATION',
              count: 2,
              percentage: ((2 / 7) * 100).toFixed(2) + '%'
            }
          ],
          averageScrubScore: 94.2
        },
        week: {
          totalClaims: 320,
          cleanClaims: 288,
          cleanRate: '90.00%',
          errorClaims: 32,
          trend: 'improving'
        },
        byProvider: {
          'prov-001': { cleanRate: '92%', totalClaims: 50 },
          'prov-002': { cleanRate: '88%', totalClaims: 120 },
          'prov-003': { cleanRate: '95%', totalClaims: 75 }
        }
      };

      res.json({
        success: true,
        stats
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve scrubbing stats',
        code: 'STATS_ERROR',
        details: err.message
      });
    }
  }
);

module.exports = router;
