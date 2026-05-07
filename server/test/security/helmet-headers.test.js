/**
 * Regression test for April 2026 audit Critical #7: Helmet default config.
 *
 * Original vulnerability (audit ref index.js:10):
 *   helmet() was invoked with no options, so the response was missing
 *   an explicit Content-Security-Policy, HSTS preload directives,
 *   X-Frame-Options 'deny', and a tight referrer-policy. The default
 *   config alone is not enough for a HIPAA-claiming endpoint.
 *
 * Attack path:
 *   1. Without a CSP, an injected script tag (XSS, dependency confusion,
 *      compromised CDN) executes against the browser's full origin and
 *      can exfiltrate session tokens or PHI displayed in the DOM.
 *   2. Without HSTS preload, a network attacker can downgrade an HTTPS
 *      session to HTTP on first visit and steal credentials in flight.
 *   3. Without X-Frame-Options 'deny', the API can be embedded in an
 *      attacker iframe to host clickjacking payloads against
 *      authenticated users.
 *   4. Without referrer-policy 'no-referrer', sensitive PHI URLs leak
 *      to third-party domains the user navigates to next.
 *
 * Fix: index.js delegates Helmet to config/helmet.js which pins each
 * directive explicitly. This PR adds the regression test that locks
 * the policy in.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Source-grep test would fail because helmet() was bare in
 *     pre-fix code.
 *   - Behavior tests on the helmet module would fail if any directive
 *     were silently relaxed (e.g. defaultSrc set to '*', scriptSrc
 *     including 'unsafe-eval', HSTS maxAge dropped below a year).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const INDEX_PATH = path.join(SERVER_DIR, 'index.js');

const { buildHelmetOptions } = require('../../config/helmet');

test('index.js does not invoke helmet() with no options (default config)', () => {
  const src = fs.readFileSync(INDEX_PATH, 'utf8');
  // Bare helmet() returns the default config, which is the pre-fix
  // vulnerable shape. After the fix, helmet is invoked with an
  // options builder.
  assert.ok(
    !/app\.use\(\s*helmet\s*\(\s*\)\s*\)/.test(src),
    'index.js calls helmet() with no options; default config does not pin '
      + 'CSP, HSTS preload, frameguard "deny", or referrer-policy.'
  );
});

test('index.js wires helmet through buildHelmetOptions for testability', () => {
  const src = fs.readFileSync(INDEX_PATH, 'utf8');
  assert.ok(
    /buildHelmetOptions\s*\(\s*\)/.test(src),
    'index.js must wire helmet via buildHelmetOptions() so the policy is '
      + 'unit-testable. Inlining the literal options bypasses these tests.'
  );
});

test('Content-Security-Policy: defaultSrc, scriptSrc, connectSrc are self-only', () => {
  const opts = buildHelmetOptions();
  const csp = opts.contentSecurityPolicy && opts.contentSecurityPolicy.directives;
  assert.ok(csp, 'CSP directives missing entirely');

  for (const directive of ['defaultSrc', 'scriptSrc', 'connectSrc']) {
    const sources = csp[directive];
    assert.ok(Array.isArray(sources) && sources.length > 0, `${directive} missing or empty`);
    assert.deepStrictEqual(
      sources,
      ["'self'"],
      `${directive} must be exactly ["'self'"]; got ${JSON.stringify(sources)}`
    );
  }
});

test('Content-Security-Policy: scriptSrc forbids unsafe-inline and unsafe-eval', () => {
  const opts = buildHelmetOptions();
  const scriptSrc = opts.contentSecurityPolicy.directives.scriptSrc;
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "scriptSrc must not include 'unsafe-inline'");
  assert.ok(!scriptSrc.includes("'unsafe-eval'"), "scriptSrc must not include 'unsafe-eval'");
});

test('Content-Security-Policy: objectSrc and frameSrc are denied', () => {
  const opts = buildHelmetOptions();
  const csp = opts.contentSecurityPolicy.directives;
  assert.deepStrictEqual(csp.objectSrc, ["'none'"], 'objectSrc must be "none"');
  assert.deepStrictEqual(csp.frameSrc,  ["'none'"], 'frameSrc must be "none"');
});

test('HSTS is preload-list eligible (maxAge >= 1 year, includeSubDomains, preload)', () => {
  const opts = buildHelmetOptions();
  const hsts = opts.hsts;
  assert.ok(hsts, 'hsts directive missing');
  assert.ok(hsts.maxAge >= 31536000, `HSTS maxAge must be >= 1 year, got ${hsts.maxAge}`);
  assert.strictEqual(hsts.includeSubDomains, true, 'HSTS includeSubDomains must be true');
  assert.strictEqual(hsts.preload, true, 'HSTS preload must be true');
});

test('frameguard is set to deny (X-Frame-Options: DENY)', () => {
  const opts = buildHelmetOptions();
  assert.strictEqual(opts.frameguard && opts.frameguard.action, 'deny',
    'frameguard.action must be "deny" to block clickjacking via iframe embedding');
});

test('Referrer-Policy is no-referrer', () => {
  const opts = buildHelmetOptions();
  const policy = opts.referrerPolicy && opts.referrerPolicy.policy;
  assert.strictEqual(policy, 'no-referrer',
    'referrer-policy must be "no-referrer" so PHI URLs do not leak to third-party origins');
});

test('noSniff and hidePoweredBy are enabled', () => {
  const opts = buildHelmetOptions();
  assert.strictEqual(opts.noSniff, true, 'X-Content-Type-Options: nosniff must be enabled');
  assert.strictEqual(opts.hidePoweredBy, true, 'X-Powered-By must be hidden');
});

test('buildHelmetOptions returns a fresh object each call (so tests cannot mutate prod config)', () => {
  const a = buildHelmetOptions();
  const b = buildHelmetOptions();
  assert.notStrictEqual(a, b, 'helmet options must not share a reference between calls');
  assert.notStrictEqual(
    a.contentSecurityPolicy.directives,
    b.contentSecurityPolicy.directives,
    'CSP directives must not share a reference between calls'
  );
});
