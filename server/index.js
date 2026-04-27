const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Parse allowed origins from environment variable
const getAllowedOrigins = () => {
  const originsEnv = process.env.ALLOWED_ORIGINS;
  if (!originsEnv) {
    return ['http://localhost:3000'];
  }
  return originsEnv.split(',').map(origin => origin.trim());
};

const allowedOrigins = getAllowedOrigins();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: {
    action: 'deny'
  },
  noSniff: true,
  referrerPolicy: {
    policy: 'no-referrer'
  },
  xssFilter: true,
  hidePoweredBy: true
}));

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Audit Logging Middleware (after auth for request body parsing)
const { auditLogMiddleware } = require('./middleware/auditLog');

// Startup Banner
console.log('\n' + '='.repeat(70));
console.log('Noesis.io Health API Server v1.0');
console.log('© 2026 Athena Core Technologies. All rights reserved.');
console.log('Powered by Athena Core Technologies');
console.log('='.repeat(70) + '\n');

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Noesis.io Health API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mount audit logging AFTER auth middleware processes but BEFORE routes
app.use(auditLogMiddleware);

// Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/claims', require('./routes/claims'));
app.use('/api/v1/authorizations', require('./routes/authorizations'));
app.use('/api/v1/messaging', require('./routes/messaging'));
app.use('/api/v1/eligibility', require('./routes/eligibility'));
app.use('/api/v1/contracts', require('./routes/contracts'));
app.use('/api/v1/guardrails', require('./routes/guardrails'));
app.use('/api/v1/billing', require('./routes/billing'));
app.use('/api/v1/integrations', require('./routes/integrations'));
app.use('/api/v1/legal', require('./routes/legal'));
app.use('/api/v1/denials', require('./routes/denials'));
app.use('/api/v1/payments', require('./routes/payments'));
app.use('/api/v1/adjudication', require('./routes/adjudication'));
app.use('/api/v1/network', require('./routes/network'));
app.use('/api/v1/estimator', require('./routes/estimator'));
app.use('/api/v1/scrubbing', require('./routes/scrubbing'));
app.use('/api/v1/audit', require('./routes/audit'));
app.use('/api/v1/hipaa', require('./routes/hipaa'));

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'ROUTE_NOT_FOUND',
    path: req.path,
    method: req.method
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const isDevelopment = process.env.NODE_ENV === 'development';

  const response = {
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  };

  // Only expose stack traces in development
  if (isDevelopment) {
    response.stack = err.stack;
  }

  res.status(err.status || 500).json(response);
});

// Start Server
app.listen(PORT, () => {
  console.log(`✓ Server listening on port ${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : 'CHANGE IN PRODUCTION'}`);
  console.log(`✓ Stripe: ${require('./services/stripe').getStatus().configured ? 'Configured' : 'Test mode'}`);
  console.log('');
});

module.exports = app;
