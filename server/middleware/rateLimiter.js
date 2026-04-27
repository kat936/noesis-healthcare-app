/**
 * Noesis.io Health — Rate Limiting Middleware
 * © 2026 Athena Core Technologies
 *
 * Uses Redis store when available (rate-limit-redis) for distributed
 * rate limiting across multiple server instances.
 * Falls back to in-memory store when Redis is unavailable (dev only).
 */

const rateLimit = require('express-rate-limit');

function getStore() {
  try {
    const redis = require('../utils/redis');
    if (!redis.isAvailable()) return undefined; // use in-memory

    const { RedisStore } = require('rate-limit-redis');
    return new RedisStore({
      sendCommand: (...args) => redis.getClient().call(...args),
      prefix: 'rl:noesis:',
    });
  } catch {
    return undefined; // ioredis / rate-limit-redis not installed yet
  }
}

const store = getStore();

/**
 * Authentication Rate Limiter — 10 login attempts per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  message: { error: 'Too many login attempts', code: 'RATE_LIMITED', retryAfter: '15 minutes' },
  skip: (req) => req.method !== 'POST',
});

/**
 * General API Rate Limiter — 100 requests per minute
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED', retryAfter: '1 minute' },
});

/**
 * Submission Rate Limiter — 10 submissions per minute
 */
const submissionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  message: { error: 'Too many submissions', code: 'RATE_LIMITED', retryAfter: '1 minute' },
});

/**
 * Strict Rate Limiter — 5 requests per minute for sensitive operations
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store,
  message: { error: 'Too many requests to sensitive endpoint', code: 'RATE_LIMITED', retryAfter: '1 minute' },
});

module.exports = { authLimiter, apiLimiter, submissionLimiter, strictLimiter };
