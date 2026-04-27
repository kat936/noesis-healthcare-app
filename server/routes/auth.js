const express = require('express');
const { authenticate, generateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { loginSchema } = require('../schemas/validation');

const router = express.Router();

/**
 * POST /auth/login
 * Authenticate user with email and password
 * Returns JWT token for protected routes
 */
router.post('/login', authLimiter, validate(loginSchema), (req, res) => {
  try {
    const { email, password } = req.validated;

    // Mock authentication - in production, lookup user in database
    // Verify password with bcrypt
    const user = {
      id: 'user-123',
      email,
      role: 'provider_staff',
      organizationId: 'org-456',
      plan: 'professional'
    };

    // Check password (mock - use bcrypt in production)
    if (password !== 'Test123456!') {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'AUTH_FAILED'
      });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan
      },
      expiresIn: '1h'
    });
  } catch (err) {
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR',
      details: err.message
    });
  }
});

/**
 * POST /auth/logout
 * Invalidate session (client removes token)
 */
router.post('/logout', authenticate, (req, res) => {
  // Token invalidation happens on client (remove from localStorage)
  // In production, could maintain a blacklist or use refresh token rotation
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * POST /auth/refresh
 * Refresh JWT token before expiry
 */
router.post('/refresh', authenticate, (req, res) => {
  try {
    const user = req.user;
    const newToken = generateToken(user);

    res.json({
      success: true,
      token: newToken,
      expiresIn: '1h'
    });
  } catch (err) {
    res.status(500).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR'
    });
  }
});

/**
 * GET /auth/session
 * Get current authenticated session info
 */
router.get('/session', authenticate, (req, res) => {
  res.json({
    user: req.user,
    isAuthenticated: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
