const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize, requirePlan } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { contractSchema } = require('../schemas/validation');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock storage
const contracts = new Map();

/**
 * GET /contracts
 * List payer contracts
 */
router.get(
  '/',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { status, payerId, limit = 20, offset = 0 } = req.query;

      let filtered = Array.from(contracts.values());

      if (status) {
        filtered = filtered.filter((c) => c.status === status);
      }
      if (payerId) {
        filtered = filtered.filter((c) => c.payerId === payerId);
      }

      // Filter by organization
      filtered = filtered.filter((c) => c.organizationId === req.user.organizationId);

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: paginated,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to list contracts',
        code: 'LIST_ERROR'
      });
    }
  }
);

/**
 * POST /contracts
 * Create new payer contract
 */
router.post(
  '/',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN),
  requirePlan('enterprise'),
  apiLimiter,
  validate(contractSchema),
  (req, res) => {
    try {
      const contractData = req.validated;
      const contractId = uuidv4();

      const contract = {
        id: contractId,
        ...contractData,
        organizationId: req.user.organizationId,
        status: 'draft',
        createdBy: req.user.id,
        createdAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString()
      };

      contracts.set(contractId, contract);

      res.status(201).json({
        success: true,
        contract
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to create contract',
        code: 'CREATE_ERROR'
      });
    }
  }
);

/**
 * GET /contracts/:id
 * Get contract detail
 */
router.get('/:id', authenticate, requirePlan('professional', 'enterprise'), apiLimiter, (req, res) => {
  try {
    const contract = contracts.get(req.params.id);

    if (!contract) {
      return res.status(404).json({
        error: 'Contract not found',
        code: 'NOT_FOUND'
      });
    }

    if (contract.organizationId !== req.user.organizationId) {
      return res.status(403).json({
        error: 'Cannot access this contract',
        code: 'FORBIDDEN'
      });
    }

    res.json({
      success: true,
      contract
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve contract',
      code: 'GET_ERROR'
    });
  }
});

/**
 * PUT /contracts/:id
 * Update contract (admin only)
 */
router.put(
  '/:id',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN),
  requirePlan('enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const contract = contracts.get(req.params.id);

      if (!contract) {
        return res.status(404).json({
          error: 'Contract not found',
          code: 'NOT_FOUND'
        });
      }

      if (contract.organizationId !== req.user.organizationId) {
        return res.status(403).json({
          error: 'Cannot update this contract',
          code: 'FORBIDDEN'
        });
      }

      const { payerId, effectiveDate, termsAndConditions, copay, coinsurancePercentage } =
        req.body;

      if (payerId) contract.payerId = payerId;
      if (effectiveDate) contract.effectiveDate = effectiveDate;
      if (termsAndConditions) contract.termsAndConditions = termsAndConditions;
      if (copay !== undefined) contract.copay = copay;
      if (coinsurancePercentage !== undefined) contract.coinsurancePercentage = coinsurancePercentage;

      contract.lastModifiedAt = new Date().toISOString();
      contract.lastModifiedBy = req.user.id;

      res.json({
        success: true,
        contract
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to update contract',
        code: 'UPDATE_ERROR'
      });
    }
  }
);

/**
 * POST /contracts/:id/activate
 * Activate contract (changes status to active)
 */
router.post(
  '/:id/activate',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN),
  requirePlan('enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const contract = contracts.get(req.params.id);

      if (!contract) {
        return res.status(404).json({
          error: 'Contract not found',
          code: 'NOT_FOUND'
        });
      }

      if (contract.organizationId !== req.user.organizationId) {
        return res.status(403).json({
          error: 'Cannot activate this contract',
          code: 'FORBIDDEN'
        });
      }

      contract.status = 'active';
      contract.activatedAt = new Date().toISOString();
      contract.activatedBy = req.user.id;

      res.json({
        success: true,
        contract,
        message: 'Contract activated'
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to activate contract',
        code: 'ACTIVATE_ERROR'
      });
    }
  }
);

/**
 * POST /contracts/:id/terminate
 * Terminate contract
 */
router.post(
  '/:id/terminate',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN),
  requirePlan('enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { reason } = req.body;

      const contract = contracts.get(req.params.id);
      if (!contract) {
        return res.status(404).json({
          error: 'Contract not found',
          code: 'NOT_FOUND'
        });
      }

      contract.status = 'terminated';
      contract.terminationReason = reason;
      contract.terminatedAt = new Date().toISOString();
      contract.terminatedBy = req.user.id;

      res.json({
        success: true,
        contract,
        message: 'Contract terminated'
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to terminate contract',
        code: 'TERMINATE_ERROR'
      });
    }
  }
);

module.exports = router;
