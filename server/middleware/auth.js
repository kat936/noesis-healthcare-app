/**
 * Noesis.io Health — Authentication & Authorization Middleware
 * © 2026 Athena Core Technologies, Inc.
 *
 * authenticate()   — verifies JWT Bearer token, checks Redis blacklist
 * authorize()      — role-based access control
 * requirePlan()    — plan-based feature gating (handles legacy plan names)
 * generateToken()  — signs JWT with 8h default expiry
 */

const jwt = require('jsonwebtoken');
const { normalizePlan } = require('../config/roles');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET env var not set in production.');
  }
  console.warn('⚠ Using dev JWT secret. Set JWT_SECRET in .env for production.');
  return 'dev-secret-change-in-production';
})();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ── Token blacklist check (Redis-backed) ──────────────────────────────────────
async function isBlacklisted(token) {
  try {
    const redis = require('../utils/redis');
    if (!redis.isAvailable()) { return false; }
    return redis.isTokenBlacklisted(token);
  } catch {
    return false; // fail open — don't lock out users over Redis issues
  }
}

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

  // Check blacklist asynchronously (non-blocking path for Redis unavailability)
  isBlacklisted(token).then((blacklisted) => {
    if (blacklisted) {
      return res.status(401).json({
        error:   'Token has been revoked',
        code:    'TOKEN_REVOKED',
        message: 'Please log in again.',
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Normalize legacy plan names (essentials→solo, professional→group)
      decoded.plan = normalizePlan(decoded.plan) || decoded.plan;

      req.user  = decoded;
      req.token = token;
      next();
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        error:   isExpired ? 'Session expired' : 'Invalid token',
        code:    isExpired ? 'SESSION_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired ? 'Please log in again.' : err.message,
      });
    }
  }).catch(() => {
    // Redis check failed — proceed without blacklist check
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

// ── authorize — role-based ────────────────────────────────────────────────────
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

// ── requirePlan — plan-based feature gating ───────────────────────────────────
// Accepts both new names (solo, group) and legacy names (essentials, professional)
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
function generateToken(user, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(
    {
      id:             user.id,
      email:          user.email,
      name:           user.name           || null,
      role:           user.role,
      organizationId: user.organizationId || null,
      organizationName: user.organizationName || null,
      npi:            user.npi            || null,
      plan:           normalizePlan(user.plan) || user.plan || 'solo',
      stripeCustomerId:     user.stripeCustomerId     || user.stripe_customer_id     || null,
      stripeSubscriptionId: user.stripeSubscriptionId || user.stripe_subscription_id || null,
    },
    JWT_SECRET,
    { expiresIn }
  );
}

module.exports = { authenticate, authorize, requirePlan, generateToken, JWT_SECRET };
