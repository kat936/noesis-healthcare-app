const express = require('express');
const { authenticate, authorize, requirePlan } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const strategyEngine = require('../services/strategyEngine');
const complianceEngine = require('../services/complianceEngine');
const { ROLES } = require('../config/roles');

const router = express.Router();

/**
 * GET /guardrails/compliance
 * Get organization HIPAA compliance score
 * Server-side calculation only
 */
router.get(
  '/compliance',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      // Mock org data - in production fetch from database
      const orgData = {
        id: req.user.organizationId,
        mfaEnforced: true,
        rbacConfigured: true,
        passwordPolicyEnforced: true,
        sessionTimeoutMinutes: 30,
        tls13Enforced: true,
        keyRotationMonths: 6,
        auditEnabled: true,
        auditRetentionYears: 6,
        logMonitoringEnabled: true,
        lastTrainingDate: '2025-01-15',
        policyDocumented: true,
        incidentResponsePlan: true,
        baaCount: 12
      };

      const complianceScore = complianceEngine.calculateComplianceScore(orgData);

      res.json({
        success: true,
        compliance: complianceScore
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to calculate compliance score',
        code: 'CALC_ERROR'
      });
    }
  }
);

/**
 * POST /guardrails/validate-claim
 * Validate claim against rules (returns strategy engine score)
 */
router.post(
  '/validate-claim',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const claim = req.body;

      // Validate required fields
      if (!claim.id || !claim.cptCode || !claim.icd10Code) {
        return res.status(400).json({
          error: 'Missing required claim fields',
          code: 'VALIDATION_ERROR'
        });
      }

      // Run through strategy engine
      const score = await strategyEngine.scoreClaim(claim);

      res.json({
        success: true,
        score,
        decision: score.decision,
        rationale: score.rationale,
        recommendations: score.recommendations
      });
    } catch (err) {
      res.status(500).json({
        error: 'Claim validation failed',
        code: 'VALIDATION_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /guardrails/rules
 * List active validation rules
 */
router.get(
  '/rules',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const rules = {
        standard: {
          name: 'Standard Claims Processing',
          rules: [
            {
              id: 'R001',
              name: 'CPT-DX Compatibility',
              weight: 0.25,
              enabled: true,
              description: 'Validates that CPT code is commonly paired with diagnosis'
            },
            {
              id: 'R002',
              name: 'Medical Necessity',
              weight: 0.20,
              enabled: true,
              description: 'Scores based on diagnosis severity and clinical indication'
            },
            {
              id: 'R003',
              name: 'Timely Filing',
              weight: 0.15,
              enabled: true,
              description: 'Ensures claim is filed within payer filing window'
            },
            {
              id: 'R004',
              name: 'Duplicate Detection',
              weight: 0.15,
              enabled: true,
              description: 'Identifies potential duplicate claims'
            },
            {
              id: 'R005',
              name: 'Modifier Compliance',
              weight: 0.10,
              enabled: true,
              description: 'Validates modifier usage per CMS guidelines'
            },
            {
              id: 'R006',
              name: 'Bundling/Unbundling',
              weight: 0.15,
              enabled: true,
              description: 'Detects NCCI edits and bundling violations'
            }
          ]
        },
        emergency: {
          name: 'Emergency Claims',
          rules: [
            {
              id: 'E001',
              name: 'Emergency Qualifier',
              weight: 0.30,
              enabled: true,
              description: 'Validates emergency claim designation'
            },
            {
              id: 'E002',
              name: 'Level of Care',
              weight: 0.25,
              enabled: true,
              description: 'Ensures level of care appropriate for diagnosis'
            },
            {
              id: 'E003',
              name: 'Out-of-Network Override',
              weight: 0.20,
              enabled: true,
              description: 'Checks out-of-network emergency provisions'
            },
            {
              id: 'E004',
              name: 'Documentation Completeness',
              weight: 0.25,
              enabled: true,
              description: 'Verifies required documentation fields'
            }
          ]
        },
        surgical: {
          name: 'Surgical Claims',
          rules: [
            {
              id: 'S001',
              name: 'Prior Auth Verification',
              weight: 0.30,
              enabled: true,
              description: 'Verifies prior authorization status'
            },
            {
              id: 'S002',
              name: 'Global Period Check',
              weight: 0.25,
              enabled: true,
              description: 'Checks global surgical period compliance'
            },
            {
              id: 'S003',
              name: 'Assistant Surgeon Rules',
              weight: 0.20,
              enabled: true,
              description: 'Validates assistant surgeon billing rules'
            },
            {
              id: 'S004',
              name: 'Bilateral Modifier',
              weight: 0.25,
              enabled: true,
              description: 'Validates bilateral procedure modifiers'
            }
          ]
        }
      };

      res.json({
        success: true,
        rules,
        totalRules: Object.values(rules).reduce((sum, pack) => sum + pack.rules.length, 0)
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to list rules',
        code: 'LIST_ERROR'
      });
    }
  }
);

/**
 * PUT /guardrails/rules/:id
 * Toggle rule enabled/disabled (admin only)
 */
router.put(
  '/rules/:id',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN),
  requirePlan('enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { enabled } = req.body;

      // Mock rule update - in production update in database
      res.json({
        success: true,
        rule: {
          id: req.params.id,
          enabled,
          updatedAt: new Date().toISOString(),
          message: `Rule ${req.params.id} ${enabled ? 'enabled' : 'disabled'}`
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to update rule',
        code: 'UPDATE_ERROR'
      });
    }
  }
);

/**
 * POST /guardrails/rules/:id/override
 * Override rule evaluation (admin only)
 */
router.post(
  '/rules/:id/override',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN),
  requirePlan('enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { score, reason } = req.body;

      if (score === undefined || score < 0 || score > 1) {
        return res.status(400).json({
          error: 'Score must be between 0 and 1',
          code: 'VALIDATION_ERROR'
        });
      }

      // Set override in strategy engine
      strategyEngine.setOverride(req.params.id, score, reason, req.user.id);

      res.json({
        success: true,
        override: {
          ruleId: req.params.id,
          score,
          reason,
          authorizedBy: req.user.id,
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to set override',
        code: 'OVERRIDE_ERROR'
      });
    }
  }
);

/**
 * DELETE /guardrails/rules/:id/override
 * Clear rule override
 */
router.delete(
  '/rules/:id/override',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN),
  requirePlan('enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      strategyEngine.clearOverride(req.params.id);

      res.json({
        success: true,
        message: `Override cleared for rule ${req.params.id}`
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to clear override',
        code: 'CLEAR_ERROR'
      });
    }
  }
);

module.exports = router;
