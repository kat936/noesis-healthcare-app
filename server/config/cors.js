/**
 * CORS configuration for Noesis.io Health.
 *
 * Whitelist driven by the ALLOWED_ORIGINS env var (comma-separated).
 * In production, requests with no Origin header (file://, cross-origin
 * redirects, some scripted abuse paths) are rejected. In development,
 * missing Origin is permitted so local tooling and curl work.
 *
 * The handler returns a fresh options object on each call so callers
 * can pass a synthetic env when unit-testing.
 */

const DEFAULT_DEV_ORIGIN = 'http://localhost:3000';

function getAllowedOrigins(env) {
  const source = env || process.env;
  const raw = source.ALLOWED_ORIGINS;
  if (!raw) {
    return [DEFAULT_DEV_ORIGIN];
  }
  return raw.split(',').map((o) => o.trim()).filter(Boolean);
}

function buildCorsOptions(env) {
  const source = env || process.env;
  return {
    origin: (origin, callback) => {
      const allowed = getAllowedOrigins(source);
      if (!origin) {
        if (source.NODE_ENV === 'production') {
          return callback(new Error('CORS: null origin not allowed'));
        }
        return callback(null, true);
      }
      if (allowed.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('CORS not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Session-Remaining', 'X-Session-Timeout'],
  };
}

module.exports = { getAllowedOrigins, buildCorsOptions };
