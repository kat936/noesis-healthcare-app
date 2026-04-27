const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const {
  getPaginatedLogs,
  getLogsByUser,
  getStats
} = require('../middleware/auditLog');
const { ROLES } = require('../config/roles');

const router = express.Router();

/**
 * GET /audit/logs
 * Returns paginated audit logs
 * Requires: practice_admin or insurance_rep role
 */
router.get(
  '/logs',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.INSURANCE_REP),
  apiLimiter,
  (req, res) => {
    try {
      const { limit = 100, offset = 0 } = req.query;

      const parsedLimit = Math.min(parseInt(limit) || 100, 1000);
      const parsedOffset = parseInt(offset) || 0;

      const result = getPaginatedLogs(parsedLimit, parsedOffset);

      res.json({
        success: true,
        data: result.logs,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve audit logs',
        code: 'AUDIT_LOGS_ERROR'
      });
    }
  }
);

/**
 * GET /audit/logs/user/:userId
 * Returns audit logs for a specific user
 * Requires: practice_admin or insurance_rep role
 */
router.get(
  '/logs/user/:userId',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.INSURANCE_REP),
  apiLimiter,
  (req, res) => {
    try {
      const { userId } = req.params;

      if (!userId || userId.length === 0) {
        return res.status(400).json({
          error: 'User ID is required',
          code: 'MISSING_USER_ID'
        });
      }

      const logs = getLogsByUser(userId);

      // Support pagination
      const { limit = 100, offset = 0 } = req.query;
      const parsedLimit = Math.min(parseInt(limit) || 100, 1000);
      const parsedOffset = parseInt(offset) || 0;

      const paginated = logs.slice(parsedOffset, parsedOffset + parsedLimit);

      res.json({
        success: true,
        userId,
        data: paginated,
        pagination: {
          total: logs.length,
          limit: parsedLimit,
          offset: parsedOffset,
          hasMore: parsedOffset + parsedLimit < logs.length
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve user audit logs',
        code: 'USER_AUDIT_LOGS_ERROR'
      });
    }
  }
);

/**
 * GET /audit/logs/stats
 * Returns summary statistics about audit logs
 * Requires: practice_admin or insurance_rep role
 */
router.get(
  '/logs/stats',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.INSURANCE_REP),
  apiLimiter,
  (req, res) => {
    try {
      const stats = getStats();

      res.json({
        success: true,
        data: {
          totalActions: stats.totalActions,
          actionsByType: stats.actionsByType,
          actionsByStatus: stats.actionsByStatus,
          topUsers: stats.topUsers,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve audit statistics',
        code: 'AUDIT_STATS_ERROR'
      });
    }
  }
);

module.exports = router;
