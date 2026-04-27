/**
 * Noesis.io Health — Redis Client
 * © 2026 Athena Core Technologies
 *
 * Shared Redis connection used for:
 *   - Rate limiter persistent store (replaces in-memory counters)
 *   - Session cache
 *   - NPI/FDA response caching
 *   - Token blacklist (logout)
 *
 * Falls back gracefully when REDIS_URL is not set —
 * rate limiting and caching continue in-memory (development only).
 */

let client = null;
let available = false;

/**
 * Initialize Redis. Called once at server startup.
 * Non-blocking — server starts even if Redis is down.
 */
async function initRedis() {
  if (!process.env.REDIS_URL) {
    console.warn('⚠ REDIS_URL not set — running without Redis (in-memory rate limiting, not for production)');
    return;
  }

  try {
    // Dynamic import so the server doesn't crash if ioredis isn't installed yet
    const Redis = require('ioredis');
    client = new Redis(process.env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    client.on('connect', () => {
      available = true;
      console.log('✓ Redis connected');
    });

    client.on('error', (err) => {
      available = false;
      console.error('Redis error:', err.message);
    });

    client.on('close', () => {
      available = false;
    });

    await client.ping();
    available = true;
    console.log('✓ Redis connection verified');
  } catch (err) {
    console.warn('⚠ Redis unavailable — falling back to in-memory mode:', err.message);
    client = null;
    available = false;
  }
}

/**
 * @returns {boolean} Whether Redis is currently available
 */
function isAvailable() {
  return available && client !== null;
}

/**
 * Get the raw Redis client (ioredis).
 * Returns null if not connected.
 */
function getClient() {
  return client;
}

/**
 * Set a key with optional TTL in seconds.
 */
async function set(key, value, ttlSeconds = null) {
  if (!isAvailable()) return false;
  if (ttlSeconds) {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } else {
    await client.set(key, JSON.stringify(value));
  }
  return true;
}

/**
 * Get a key. Returns null if not found or Redis unavailable.
 */
async function get(key) {
  if (!isAvailable()) return null;
  const val = await client.get(key);
  return val ? JSON.parse(val) : null;
}

/**
 * Delete a key.
 */
async function del(key) {
  if (!isAvailable()) return false;
  await client.del(key);
  return true;
}

/**
 * Add a JWT to the token blacklist (used on logout).
 * TTL matches the token's remaining lifetime.
 */
async function blacklistToken(jti, expiresAtMs) {
  const ttl = Math.ceil((expiresAtMs - Date.now()) / 1000);
  if (ttl <= 0) return;
  await set(`blacklist:${jti}`, 1, ttl);
}

/**
 * Check if a token is blacklisted.
 */
async function isTokenBlacklisted(jti) {
  const val = await get(`blacklist:${jti}`);
  return val !== null;
}

module.exports = { initRedis, isAvailable, getClient, set, get, del, blacklistToken, isTokenBlacklisted };
