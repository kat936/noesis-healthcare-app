/**
 * Noesis.io Health — HIPAA Session Timeout Middleware
 * © 2026 Athena Core Technologies, Inc.
 *
 * HIPAA §164.312(a)(2)(iii) — Automatic Logoff:
 * "Implement electronic procedures that terminate an electronic session
 * after a predetermined time of inactivity."
 *
 * Default timeout: 30 minutes of inactivity (per PLAN_LIMITS).
 * Tracked via X-Last-Activity header on every authenticated request.
 * Redis-backed when available; in-memory fallback for dev.
 */

const { PLAN_LIMITS, PLANS } = require('../config/roles');

const DEFAULT_TIMEOUT_MINUTES = 30;

// In-memory fallback session activity tracker
const activityStore = new Map();

// ── Activity helpers ──────────────────────────────────────────────────────────

async function getLastActivity(userId) {
  try {
    const redis = require('../utils/redis');
    if (redis.isAvailable()) {
      const ts = await redis.get(`session:activity:${userId}`);
      return ts ? parseInt(ts) : null;
    }
  } catch { /* fall through */ }
  return activityStore.get(userId) || null;
}

async function setLastActivity(userId) {
  const now = Date.now();
  try {
    const redis = require('../utils/redis');
    if (redis.isAvailable()) {
      // Expire Redis key after 2× the max timeout so it cleans up automatically
      await redis.getClient().set(`session:activity:${userId}`, now, 'EX', DEFAULT_TIMEOUT_MINUTES * 60 * 2);
      return;
    }
  } catch { /* fall through */ }
  activityStore.set(userId, now);
  // Prune in-memory store to prevent unbounded growth
  if (activityStore.size > 5000) {
    const cutoff = Date.now() - DEFAULT_TIMEOUT_MINUTES * 60 * 1000 * 2;
    for (const [k, v] of activityStore) {
      if (v < cutoff) { activityStore.delete(k); }
    }
  }
}

async function clearActivity(userId) {
  try {
    const redis = require('../utils/redis');
    if (redis.isAvailable()) {
      await redis.del(`session:activity:${userId}`);
      return;
    }
  } catch { /* fall through */ }
  activityStore.delete(userId);
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Attaches to every authenticated request.
 * Returns 401 SESSION_EXPIRED if the user has been inactive beyond their plan limit.
 */
async function sessionTimeoutMiddleware(req, res, next) {
  if (!req.user) { return next(); } // unauthenticated request — skip

  const userId  = req.user.id;
  const plan    = req.user.plan || PLANS.SOLO;
  const limits  = PLAN_LIMITS[plan] || PLAN_LIMITS[PLANS.SOLO];
  const timeoutMs = (limits.sessionTimeoutMinutes || DEFAULT_TIMEOUT_MINUTES) * 60 * 1000;

  // Exempt token refresh and logout endpoints from timeout check
  const exemptPaths = ['/api/v1/auth/refresh', '/api/v1/auth/logout'];
  if (exemptPaths.some((p) => req.path.endsWith(p))) {
    await setLastActivity(userId);
    return next();
  }

  const lastActivity = await getLastActivity(userId);
  const now = Date.now();

  if (lastActivity && (now - lastActivity) > timeoutMs) {
    // Clear the stale session
    await clearActivity(userId);

    // Blacklist the token so it can't be reused
    try {
      const redis = require('../utils/redis');
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (token && redis.isAvailable()) {
        await redis.blacklistToken(token);
      }
    } catch { /* non-critical */ }

    return res.status(401).json({
      error:     'Session expired due to inactivity',
      code:      'SESSION_EXPIRED',
      message:   `Your session timed out after ${limits.sessionTimeoutMinutes || DEFAULT_TIMEOUT_MINUTES} minutes of inactivity. Please log in again.`,
      timeoutAt: new Date(lastActivity + timeoutMs).toISOString(),
    });
  }

  // Update last activity timestamp
  await setLastActivity(userId);

  // Inform client of remaining session time
  if (lastActivity) {
    const remaining = Math.max(0, Math.floor((timeoutMs - (now - lastActivity)) / 1000));
    res.setHeader('X-Session-Remaining', remaining);
    res.setHeader('X-Session-Timeout', limits.sessionTimeoutMinutes || DEFAULT_TIMEOUT_MINUTES);
  }

  next();
}

module.exports = { sessionTimeoutMiddleware, getLastActivity, setLastActivity, clearActivity };
