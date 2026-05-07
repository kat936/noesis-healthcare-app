/**
 * Helmet security-header configuration for Noesis.io Health.
 *
 * Pre-fix vulnerability: Helmet was invoked with no options, leaving
 * the default config. The default config does not include an explicit
 * Content-Security-Policy, which means modern browsers will not
 * enforce a tight CSP, and other directives the team wants pinned
 * (HSTS preload, frameguard 'deny', referrer-policy 'no-referrer')
 * were not pinned at all.
 *
 * Post-fix policy locked here:
 *   - CSP defaults to 'self' for every directive that can leak data
 *     or execute code, with 'unsafe-inline' restricted to styleSrc
 *     (Tailwind / inline style attributes are unavoidable for the
 *     legacy single-file React UI).
 *   - HSTS preload-list-eligible: maxAge >= 1 year, includeSubDomains,
 *     preload.
 *   - frameguard 'deny' (no embedding the API in any iframe).
 *   - noSniff true.
 *   - referrer-policy 'no-referrer'.
 *   - hidePoweredBy true.
 *
 * The function builds a fresh options object on each call so it can
 * be unit-tested in server/test/security/helmet-headers.test.js.
 */

function buildHelmetOptions() {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc:    ["'self'"],
        objectSrc:  ["'none'"],
        mediaSrc:   ["'self'"],
        frameSrc:   ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard:     { action: 'deny' },
    noSniff:        true,
    referrerPolicy: { policy: 'no-referrer' },
    hidePoweredBy:  true,
  };
}

module.exports = { buildHelmetOptions };
