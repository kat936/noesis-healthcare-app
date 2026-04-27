const rateLimit = require('express-rate-limit');

/**
 * Authentication Rate Limiter
 * 10 login attempts per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts',
    code: 'RATE_LIMITED',
    retryAfter: '15 minutes'
  },
  skip: (req) => {
    // Skip limiting for non-POST requests
    return req.method !== 'POST';
  }
});

/**
 * General API Rate Limiter
 * 100 requests per minute
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Rate limit exceeded',
    code: 'RATE_LIMITED',
    retryAfter: '1 minute'
  }
});

/**
 * Submission Rate Limiter
 * 10 submissions per minute (claims, authorizations, etc.)
 */
const submissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many submissions',
    code: 'RATE_LIMITED',
    retryAfter: '1 minute'
  }
});

/**
 * Strict Rate Limiter
 * 5 requests per minute for sensitive operations
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests to sensitive endpoint',
    code: 'RATE_LIMITED',
    retryAfter: '1 minute'
  }
});

module.exports = {
  authLimiter,
  apiLimiter,
  submissionLimiter,
  strictLimiter
};
