/**
 * Noesis.io Health  - Authentication & Authorization Middleware
 * © 2026 Athena Core Technologies, Inc.
 *
 * authenticate()    - verifies JWT Bearer token, checks Redis blacklist (by token),
 *                    enforces HIPAA session timeout (§164.312(a)(2)(iii))
 * authorize()       - role-based access control
 * requirePlan()     - plan-based feature gating (handles legacy plan names)
 * generateToken()   - signs JWT with jti UUID for per-token blacklisting
 *
 * AUDIT FIX 2026-04-27:
 *   - Session timeout now integrated here (was in global middleware before req.user was set)
 *   - Blacklist keyed by full token string, not user ID (logout now actually works)
 *   - jti added to JWT payload for unique per-token identification
 *   - clearActivity exported for use by logout route
 */

const jwt  = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { normalizePlan, PLAN_LIMITS, PLANS } = require('../config/roles');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET env var not set in production.');
  }
  console.warn('⚠ Using dev JWT secret. Set JWT_SECRET in .env for production.');
  return 'dev-secret-change-in-production';
})();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ── In-memory session activity fallback (dev only) ────────────────────────────
const activityStore = new Map();
const DEFAULT_TIMEOUT_MINUTES = 30;

async function getLastActivity(userId) {
  try {
    const redis = require('../utils/redis');
    if (redis.isAvailable()) {
      const ts = await redis.getClient().get(`session:activity:${userId}`);
      return ts ? parseInt(ts, 10) : null;
    }
  } catch { /* fall through */ }
  return activityStore.get(userId) || null;
}

async function setLastActivity(userId, timeoutMinutes) {
  const now = Date.now();
  try {
    const redis = require('../utils/redis');
    if (redis.isAvailable()) {
      const ttl = (timeoutMinutes || DEFAULT_TIMEOUT_MINUTES) * 60 * 2;
      await redis.getClient().set(`session:activity:${userId}`, now, 'EX', ttl);
      return;
    }
  } catch { /* fall through */ }
  activityStore.set(userId, now);
  // Prune in-memory store to prevent unbounded growth (HIPAA cleanup)
  if (activityStore.size > 5000) {
    const cutoff = now - DEFAULT_TIMEOUT_MINUTES * 60 * 1000 * 2;
    for (const [k, v] of activityStore) {
      if (v < cutoff) activityStore.delete(k);
    }
  }
}

async function clearActivity(userId) {
  try {
    const redis = require('../utils/redis');
    if (redis.isAvailable()) {
      await redis.getClient().del(`session:activity:${userId}`);
      return;
    }
  } catch { /* fall through */ }
  activityStore.delete(userId);
}

// ── Token blacklist check (keyed by full token string) ────────────────────────
// FIX: was using jti/userId as key; auth checks by token string → they never matched
async function isBlacklisted(token) {
  try {
    const redis = require('../utils/redis');
    if (!redis.isAvailable()) { return false; }
    return redis.isTokenBlacklisted(token);
  } catch {
    return false; // fail open  - don't lock out users over Redis issues
  }
}

// ── Paths exempt from HIPAA session timeout check ─────────────────────────────
const SESSION_EXEMPT_PATHS = [
  '/auth/refresh',
  '/auth/logout',
  '/auth/login',
  '/health',
  '/billing/plans',
];

// ── authenticate ──────────────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error:   'Authentication required',
      code:    'AUTH_REQUIRED',
      message: 'Include Authorization: Bearer <token> header',
    });
  }

  const token = header.split(' ')[1];

  // Check token blacklist (uses full token as key)
  isBlacklisted(token).then(async (blacklisted) => {
    if (blacklisted) {
      return res.status(401).json({
        error:   'Token has been revoked',
        code:    'TOKEN_REVOKED',
        message: 'Please log in again.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      // Normalize legacy plan names (essentials→solo, professional→group)
      decoded.plan = normalizePlan(decoded.plan) || decoded.plan;
      req.user  = decoded;
      req.token = token;
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        error:   isExpired ? 'Session expired' : 'Invalid token',
        code:    isExpired ? 'SESSION_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired ? 'Please log in again.' : err.message,
      });
    }

    // ── HIPAA §164.312(a)(2)(iii)  - Automatic Session Logoff ──────────────
    // Session timeout is checked HERE (post-JWT-verify) so req.user is available.
    // Previously this was a global middleware where req.user was never set.
    const isExempt = SESSION_EXEMPT_PATHS.some((p) => req.originalUrl.includes(p));

    if (!isExempt) {
      try {
        const plan           = decoded.plan || PLANS.SOLO;
        const limits         = PLAN_LIMITS[plan] || PLAN_LIMITS[PLANS.SOLO];
        const timeoutMinutes = limits.sessionTimeoutMinutes || DEFAULT_TIMEOUT_MINUTES;
        const timeoutMs      = timeoutMinutes * 60 * 1000;

        const lastActivity = await getLastActivity(decoded.id);
        const now          = Date.now();

        if (lastActivity && (now - lastActivity) > timeoutMs) {
          await clearActivity(decoded.id);
          // Blacklist token so it can't be reused after inactivity expiry
          try {
            const redis = require('../utils/redis');
            if (redis.isAvailable()) {
              await redis.blacklistToken(token, decoded.exp * 1000);
            }
          } catch { /* non-critical */ }

          return res.status(401).json({
            error:     'Session expired due to inactivity',
            code:      'SESSION_EXPIRED',
            message:   `Session timed out after ${timeoutMinutes} minutes of inactivity. Please log in again.`,
            timeoutAt: new Date(lastActivity + timeoutMs).toISOString(),
          });
        }

        // Update activity timestamp and inform client of remaining time
        await setLastActivity(decoded.id, timeoutMinutes);
        if (lastActivity) {
          const remaining = Math.max(0, Math.floor((timeoutMs - (now - lastActivity)) / 1000));
          res.setHeader('X-Session-Remaining', remaining);
          res.setHeader('X-Session-Timeout',   timeoutMinutes);
        }
      } catch {
        // Session check failure is non-fatal  - continue with the request
      }
    }

    next();
  }).catch(() => {
    // Redis completely unavailable  - proceed without blacklist/session check (fail open)
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      decoded.plan  = normalizePlan(decoded.plan) || decoded.plan;
      req.user      = decoded;
      req.token     = token;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN', message: err.message });
    }
  });
}

// ── authorize  - role-based ────────────────────────────────────────────────────
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error:         'Insufficient permissions',
        code:          'FORBIDDEN',
        userRole:      req.user?.role,
        requiredRoles: roles,
        message:       `Requires one of: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

// ── requirePlan  - plan-based feature gating ───────────────────────────────────
// Normalizes both allowed plans AND user plan for legacy name backward compat
function requirePlan(...plans) {
  const normalized = plans.map((p) => normalizePlan(p) || p);

  return (req, res, next) => {
    const userPlan = normalizePlan(req.user?.plan) || req.user?.plan;

    if (!req.user || !normalized.includes(userPlan)) {
      return res.status(403).json({
        error:         'Plan upgrade required',
        code:          'PLAN_REQUIRED',
        currentPlan:   userPlan || 'none',
        requiredPlans: normalized,
        message:       `Your ${userPlan || 'current'} plan does not include this feature. Upgrade to ${normalized.join(' or ')}.`,
        upgradeUrl:    '/billing/plans',
      });
    }
    next();
  };
}

// ── generateToken ─────────────────────────────────────────────────────────────
// Includes jti (UUID) so individual tokens can be blacklisted on logout
function generateToken(user, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(
    {
      jti:            uuidv4(),                              // unique per-token ID
      id:             user.id,
      email:          user.email,
      name:           user.name             || null,
      role:           user.role,
      organizationId: user.organizationId   || null,
      organizationName: user.organizationName || null,
      npi:            user.npi              || null,
      plan:           normalizePlan(user.plan) || user.plan || 'solo',
      stripeCustomerId:     user.stripeCustomerId     || user.stripe_customer_id     || null,
      stripeSubscriptionId: user.stripeSubscriptionId || user.stripe_subscription_id || null,
    },
    JWT_SECRET,
    { expiresIn }
  );
}

module.exports = { authenticate, authorize, requirePlan, generateToken, JWT_SECRET, clearActivity };
