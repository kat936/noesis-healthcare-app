const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { claimSchema, searchSchema } = require('../schemas/validation');
const strategyEngine = require('../services/strategyEngine');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock storage - in production use database
const claims = new Map();
const existingClaims = [];

/**
 * GET /claims
 * List claims (filtered by role)
 * Providers see own, insurers see assigned
 */
router.get('/', authenticate, apiLimiter, (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let filteredClaims = Array.from(claims.values());

    // Filter by role
    if (req.user.role === ROLES.PROVIDER_STAFF) {
      filteredClaims = filteredClaims.filter((c) => c.providerId === req.user.id);
    }

    // Filter by status if provided
    if (status) {
      filteredClaims = filteredClaims.filter((c) => c.status === status);
    }

    const total = filteredClaims.length;
    const paginated = filteredClaims.slice(offset, offset + parseInt(limit));

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
      error: 'Failed to list claims',
      code: 'LIST_ERROR'
    });
  }
});

/**
 * POST /claims
 * Submit new claim with strategy engine validation
 */
router.post(
  '/',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  requirePlan('professional', 'enterprise'),
  submissionLimiter,
  validate(claimSchema),
  async (req, res) => {
    try {
      const claimData = req.validated;

      // Generate claim ID
      const claimId = uuidv4();

      // Run through strategy engine
      const score = await strategyEngine.scoreClaim(
        { ...claimData, id: claimId },
        existingClaims
      );

      // Create claim record
      const claim = {
        id: claimId,
        ...claimData,
        providerId: req.user.id,
        organizationId: req.user.organizationId,
        status: score.decision === 'APPROVE_SUBMIT' ? 'ready_to_submit' : 'draft',
        strategicScore: score,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store claim
      claims.set(claimId, claim);
      existingClaims.push(claim);

      res.status(201).json({
        success: true,
        claim,
        engineDecision: {
          action: score.decision,
          rationale: score.rationale,
          recommendations: score.recommendations
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to create claim',
        code: 'CREATE_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /claims/:id
 * Get claim detail with full score data
 */
router.get('/:id', authenticate, apiLimiter, (req, res) => {
  try {
    const claim = claims.get(req.params.id);

    if (!claim) {
      return res.status(404).json({
        error: 'Claim not found',
        code: 'NOT_FOUND'
      });
    }

    // Check authorization
    if (req.user.role === ROLES.PROVIDER_STAFF && claim.providerId !== req.user.id) {
      return res.status(403).json({
        error: 'Cannot access this claim',
        code: 'FORBIDDEN'
      });
    }

    res.json({
      success: true,
      claim
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve claim',
      code: 'GET_ERROR'
    });
  }
});

/**
 * PUT /claims/:id/status
 * Update claim status (insurer role only)
 */
router.put(
  '/:id/status',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      const { status, notes } = req.body;

      const claim = claims.get(req.params.id);
      if (!claim) {
        return res.status(404).json({
          error: 'Claim not found',
          code: 'NOT_FOUND'
        });
      }

      const validStatuses = [
        'draft',
        'ready_to_submit',
        'submitted',
        'adjudicated',
        'approved',
        'denied',
        'appealed'
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          code: 'INVALID_STATUS',
          validStatuses
        });
      }

      claim.status = status;
      claim.adjudicationNotes = notes;
      claim.updatedAt = new Date().toISOString();

      res.json({
        success: true,
        claim
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to update claim',
        code: 'UPDATE_ERROR'
      });
    }
  }
);

/**
 * POST /claims/:id/appeal
 * Submit appeal for denied claim
 */
router.post(
  '/:id/appeal',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  submissionLimiter,
  (req, res) => {
    try {
      const { appealReason } = req.body;

      const claim = claims.get(req.params.id);
      if (!claim) {
        return res.status(404).json({
          error: 'Claim not found',
          code: 'NOT_FOUND'
        });
      }

      if (claim.status !== 'denied') {
        return res.status(400).json({
          error: 'Only denied claims can be appealed',
          code: 'INVALID_STATE'
        });
      }

      const appeal = {
        id: uuidv4(),
        claimId: claim.id,
        reason: appealReason,
        submittedBy: req.user.id,
        submittedAt: new Date().toISOString(),
        status: 'submitted'
      };

      claim.appeals = claim.appeals || [];
      claim.appeals.push(appeal);
      claim.status = 'appealed';

      res.status(201).json({
        success: true,
        appeal,
        claim
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to submit appeal',
        code: 'APPEAL_ERROR'
      });
    }
  }
);

/**
 * GET /claims/:id/score
 * Get strategy engine score for claim
 * Shows decision logic and recommendations
 */
router.get('/:id/score', authenticate, apiLimiter, (req, res) => {
  try {
    const claim = claims.get(req.params.id);

    if (!claim) {
      return res.status(404).json({
        error: 'Claim not found',
        code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      claimId: claim.id,
      score: claim.strategicScore
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve score',
      code: 'SCORE_ERROR'
    });
  }
});

module.exports = router;
