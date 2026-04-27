const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { authorizationSchema, authorizationUpdateSchema } = require('../schemas/validation');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock storage
const authorizations = new Map();

/**
 * GET /authorizations
 * List prior authorizations (filtered by role)
 */
router.get('/', authenticate, apiLimiter, (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let filtered = Array.from(authorizations.values());

    if (req.user.role === ROLES.PROVIDER_STAFF) {
      filtered = filtered.filter((a) => a.providerId === req.user.id);
    }

    if (status) {
      filtered = filtered.filter((a) => a.status === status);
    }

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
      error: 'Failed to list authorizations',
      code: 'LIST_ERROR'
    });
  }
});

/**
 * POST /authorizations
 * Request prior authorization
 */
router.post(
  '/',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  requirePlan('professional', 'enterprise'),
  submissionLimiter,
  validate(authorizationSchema),
  (req, res) => {
    try {
      const authData = req.validated;
      const authId = uuidv4();

      const auth = {
        id: authId,
        ...authData,
        providerId: req.user.id,
        organizationId: req.user.organizationId,
        status: 'submitted',
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      authorizations.set(authId, auth);

      res.status(201).json({
        success: true,
        authorization: auth,
        message: 'Prior authorization request submitted'
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to create authorization',
        code: 'CREATE_ERROR'
      });
    }
  }
);

/**
 * GET /authorizations/:id
 * Get authorization detail
 */
router.get('/:id', authenticate, apiLimiter, (req, res) => {
  try {
    const auth = authorizations.get(req.params.id);

    if (!auth) {
      return res.status(404).json({
        error: 'Authorization not found',
        code: 'NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role === ROLES.PROVIDER_STAFF && auth.providerId !== req.user.id) {
      return res.status(403).json({
        error: 'Cannot access this authorization',
        code: 'FORBIDDEN'
      });
    }

    res.json({
      success: true,
      authorization: auth
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve authorization',
      code: 'GET_ERROR'
    });
  }
});

/**
 * PUT /authorizations/:id
 * Update authorization (insurer can approve/deny)
 */
router.put(
  '/:id',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  validate(authorizationUpdateSchema),
  (req, res) => {
    try {
      const { status, approvalNotes, conditions } = req.validated;

      const auth = authorizations.get(req.params.id);
      if (!auth) {
        return res.status(404).json({
          error: 'Authorization not found',
          code: 'NOT_FOUND'
        });
      }

      auth.status = status;
      auth.approvalNotes = approvalNotes;
      auth.conditions = conditions;
      auth.reviewedAt = new Date().toISOString();
      auth.reviewedBy = req.user.id;

      res.json({
        success: true,
        authorization: auth
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to update authorization',
        code: 'UPDATE_ERROR'
      });
    }
  }
);

/**
 * POST /authorizations/:id/approve
 * Approve prior authorization (insurer only)
 */
router.post(
  '/:id/approve',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  submissionLimiter,
  (req, res) => {
    try {
      const auth = authorizations.get(req.params.id);
      if (!auth) {
        return res.status(404).json({
          error: 'Authorization not found',
          code: 'NOT_FOUND'
        });
      }

      auth.status = 'approved';
      auth.approvedAt = new Date().toISOString();
      auth.approvedBy = req.user.id;

      res.json({
        success: true,
        authorization: auth,
        message: 'Authorization approved'
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to approve authorization',
        code: 'APPROVE_ERROR'
      });
    }
  }
);

/**
 * POST /authorizations/:id/deny
 * Deny prior authorization (insurer only)
 */
router.post(
  '/:id/deny',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  submissionLimiter,
  (req, res) => {
    try {
      const { reason, alternativeProcedure } = req.body;

      const auth = authorizations.get(req.params.id);
      if (!auth) {
        return res.status(404).json({
          error: 'Authorization not found',
          code: 'NOT_FOUND'
        });
      }

      auth.status = 'denied';
      auth.denialReason = reason;
      auth.alternativeProcedure = alternativeProcedure;
      auth.deniedAt = new Date().toISOString();
      auth.deniedBy = req.user.id;

      res.json({
        success: true,
        authorization: auth,
        message: 'Authorization denied'
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to deny authorization',
        code: 'DENY_ERROR'
      });
    }
  }
);

module.exports = router;
