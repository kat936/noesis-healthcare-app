/**
 * Noesis.io Health — Express Server Entry Point
 * © 2026 Athena Core Technologies, Inc.
 *
 * AUDIT FIXES 2026-04-27:
 *   - Removed global sessionTimeoutMiddleware (req.user was never set at that stage).
 *     Session timeout now integrated inside authenticate() in middleware/auth.js.
 *   - Stripe webhook mounted BEFORE express.json() with express.raw() so raw bytes
 *     are preserved for HMAC signature validation (fixes Stripe webhook in production).
 *   - CORS null-origin blocked in production.
 */

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'https:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      mediaSrc:    ["'self'"],
      frameSrc:    ["'none'"],
    },
  },
  hsts:            { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard:      { action: 'deny' },
  noSniff:         true,
  referrerPolicy:  { policy: 'no-referrer' },
  hidePoweredBy:   true,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
const getAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return ['http://localhost:3000'];
  return raw.split(',').map((o) => o.trim());
};

app.use(cors({
  origin: (origin, callback) => {
    const allowed = getAllowedOrigins();
    // Block null origin in production (file://, cross-origin redirects)
    if (!origin) {
      if (process.env.NODE_ENV === 'production') return callback(new Error('CORS: null origin not allowed'));
      return callback(null, true); // allow in dev
    }
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error('CORS not allowed'));
  },
  credentials: true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Session-Remaining', 'X-Session-Timeout'],
}));

// ── Stripe webhook — MUST be mounted BEFORE express.json() ────────────────────
// Stripe validates the HMAC signature against the raw request bytes.
// If express.json() runs first, the body is parsed and re-serialized, breaking the sig.
// Solution: apply express.raw() only to this one path, then delegate to billing router.
app.post(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    // Tag the request so billing router knows it already has raw body
    req._rawWebhook = true;
    next();
  },
  require('./routes/billing').webhookHandler
);

// ── Body parsers (global, after webhook raw route) ────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Audit logging (HIPAA §164.312(b)) ────────────────────────────────────────
const { auditLogMiddleware } = require('./middleware/auditLog');
app.use(auditLogMiddleware);

// NOTE: sessionTimeoutMiddleware has been REMOVED from here.
// HIPAA session timeout is now enforced inside authenticate() in middleware/auth.js,
// which runs after JWT verification so req.user is available.

// ── Startup banner ────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('Noesis.io Health API Server v1.0');
console.log('© 2026 Athena Core Technologies. All rights reserved.');
console.log('='.repeat(70) + '\n');

// ── Health check (public) ──────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const db    = require('./db');
  const redis = require('./utils/redis');
  res.json({
    status:      'healthy',
    service:     'Noesis.io Health API',
    version:     '1.0.0',
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    db:          db.isConnected()     ? 'connected' : 'in-memory',
    redis:       redis.isAvailable()  ? 'connected' : 'in-memory',
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',         require('./routes/auth'));
app.use('/api/v1/claims',       require('./routes/claims'));
app.use('/api/v1/authorizations', require('./routes/authorizations'));
app.use('/api/v1/messaging',    require('./routes/messaging'));
app.use('/api/v1/eligibility',  require('./routes/eligibility'));
app.use('/api/v1/contracts',    require('./routes/contracts'));
app.use('/api/v1/guardrails',   require('./routes/guardrails'));
app.use('/api/v1/billing',      require('./routes/billing'));
app.use('/api/v1/integrations', require('./routes/integrations'));
app.use('/api/v1/legal',        require('./routes/legal'));
app.use('/api/v1/denials',      require('./routes/denials'));
app.use('/api/v1/payments',     require('./routes/payments'));
app.use('/api/v1/adjudication', require('./routes/adjudication'));
app.use('/api/v1/network',      require('./routes/network'));
app.use('/api/v1/estimator',    require('./routes/estimator'));
app.use('/api/v1/scrubbing',    require('./routes/scrubbing'));
app.use('/api/v1/audit',        require('./routes/audit'));
app.use('/api/v1/hipaa',        require('./routes/hipaa'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', code: 'ROUTE_NOT_FOUND', path: req.path, method: req.method });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  // Don't log CORS errors at full stack — they are client config issues
  if (err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({ error: err.message, code: 'CORS_ERROR' });
  }
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error:     err.message || 'Internal server error',
    code:      err.code    || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Server start + infra init ─────────────────────────────────────────────────
async function start() {
  const redis = require('./utils/redis');
  await redis.initRedis().catch(() => {});

  const db = require('./db');
  await db.initSchema().catch((err) => {
    console.warn('⚠ Schema init skipped:', err.message);
  });

  app.listen(PORT, () => {
    const stripe = require('./services/stripe');
    console.log(`✓ Server listening on port ${PORT}`);
    console.log(`✓ Health check: http://localhost:${PORT}/health`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : '⚠ CHANGE IN PRODUCTION'}`);
    console.log(`✓ Stripe: ${stripe.getStatus().configured ? 'Configured (' + stripe.getStatus().mode + ' mode)' : '⚠ Demo mode (set STRIPE_SECRET_KEY)'}`);
    console.log(`✓ Session timeout: integrated into authenticate() middleware`);
    console.log('');
  });
}

start();

module.exports = app;
