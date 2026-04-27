const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET env var not set. This is required for production.');
  }
  console.warn('WARNING: Using default JWT secret. Set JWT_SECRET env var for production.');
  return 'dev-secret-change-in-production';
})();

/**
 * Authenticate Middleware
 * Verifies Bearer token on every protected route
 * Extracts user { id, email, role, organizationId, plan }
 * Returns 401 for missing/invalid token
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
      message: 'Missing or invalid Authorization header'
    });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check session expiry
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({
        error: 'Session expired',
        code: 'SESSION_EXPIRED',
        expiresAt: new Date(decoded.exp * 1000).toISOString()
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
      details: err.message
    });
  }
}

/**
 * Authorization Middleware
 * Checks if user role is in allowed roles
 * Returns 403 for insufficient permissions
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        userRole: req.user?.role,
        requiredRoles: roles,
        message: `This action requires one of: ${roles.join(', ')}`
      });
    }
    next();
  };
}

/**
 * Plan Requirement Middleware
 * Checks if user subscription plan includes required feature
 * Returns 403 if plan insufficient
 */
function requirePlan(...plans) {
  return (req, res, next) => {
    if (!req.user || !plans.includes(req.user.plan)) {
      return res.status(403).json({
        error: 'This feature requires a higher plan',
        code: 'PLAN_REQUIRED',
        currentPlan: req.user?.plan,
        requiredPlans: plans,
        message: `Your ${req.user?.plan || 'free'} plan does not include this feature. Upgrade to ${plans.join(' or ')}.`
      });
    }
    next();
  };
}

/**
 * Generate JWT Token
 * Used by auth route to create tokens
 */
function generateToken(user, expiresIn = '1h') {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      plan: user.plan
    },
    JWT_SECRET,
    { expiresIn }
  );
}

module.exports = {
  authenticate,
  authorize,
  requirePlan,
  generateToken,
  JWT_SECRET
};
