const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, generateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { loginSchema } = require('../schemas/validation');
const db = require('../db');

const router = express.Router();

/**
 * POST /auth/login
 * Authenticate user with email and password.
 * Uses DB lookup + bcrypt when connected; falls back to dev credentials.
 */
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.validated;

    let user;

    if (db.isConnected()) {
      // --- Production path: lookup user in database ---
      const result = await db.query(
        'SELECT id, email, password_hash, role, organization_id, plan FROM users WHERE email = $1 LIMIT 1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: 'Invalid credentials',
          code: 'AUTH_FAILED',
        });
      }

      const dbUser = result.rows[0];
      const passwordMatch = await bcrypt.compare(password, dbUser.password_hash);

      if (!passwordMatch) {
        return res.status(401).json({
          error: 'Invalid credentials',
          code: 'AUTH_FAILED',
        });
      }

      user = {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        organizationId: dbUser.organization_id,
        plan: dbUser.plan,
      };
    } else {
      // --- Development fallback: single demo user ---
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({
          error: 'Database unavailable',
          code: 'DB_ERROR',
        });
      }

      const DEV_EMAIL = process.env.DEV_EMAIL || 'demo@noesis.io';
      const DEV_PASSWORD = process.env.DEV_PASSWORD || 'Demo123456!';

      if (email.toLowerCase() !== DEV_EMAIL.toLowerCase() || password !== DEV_PASSWORD) {
        return res.status(401).json({
          error: 'Invalid credentials',
          code: 'AUTH_FAILED',
        });
      }

      user = {
        id: 'dev-user-001',
        email: DEV_EMAIL,
        role: 'provider_staff',
        organizationId: 'dev-org-001',
        plan: 'professional',
      };
    }

    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
      },
      expiresIn: '1h',
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR',
    });
  }
});

/**
 * POST /auth/logout
 * Invalidates session. Client must discard the token.
 * With Redis, token is blacklisted for its remaining TTL.
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { blacklistToken } = require('../utils/redis');
    if (req.user.exp) {
      await blacklistToken(req.user.jti || req.user.id, req.user.exp * 1000);
    }
  } catch {
    // Redis unavailable — logout still succeeds; client discards token
  }

  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /auth/refresh
 * Returns a new JWT token with a fresh 1h expiry.
 */
router.post('/refresh', authenticate, (req, res) => {
  try {
    const newToken = generateToken(req.user);
    res.json({ success: true, token: newToken, expiresIn: '1h' });
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed', code: 'REFRESH_ERROR' });
  }
});

/**
 * GET /auth/session
 * Returns current authenticated session info.
 */
router.get('/session', authenticate, (req, res) => {
  res.json({
    user: req.user,
    isAuthenticated: true,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /auth/register (dev/admin only — not exposed in production by default)
 * Creates a new user with a hashed password.
 */
router.post('/register', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_REGISTRATION) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const { email, password, role = 'provider_staff', plan = 'essentials' } = req.body;

    if (!email || !password || password.length < 10) {
      return res.status(400).json({ error: 'Email and password (min 10 chars) required', code: 'VALIDATION_ERROR' });
    }

    if (!db.isConnected()) {
      return res.status(503).json({ error: 'Database required for registration', code: 'DB_ERROR' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (email, password_hash, role, plan) VALUES ($1, $2, $3, $4) RETURNING id, email, role, plan',
      [email.toLowerCase(), hash, role, plan]
    );

    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered', code: 'DUPLICATE_EMAIL' });
    }
    res.status(500).json({ error: 'Registration failed', code: 'REGISTER_ERROR' });
  }
});

module.exports = router;
