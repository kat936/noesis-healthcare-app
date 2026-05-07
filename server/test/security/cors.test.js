/**
 * Regression test for April 2026 audit Critical #3: Permissive CORS.
 *
 * Original vulnerability (audit ref index.js:11):
 *   Access-Control-Allow-Origin: *
 *
 * Attack path:
 *   1. User authenticates legitimately and the cookie or token is held.
 *   2. Attacker tricks the user into visiting evil.attacker.com.
 *   3. Browser sends a fetch from that page to api.noesis-io.us with
 *      credentials. Wildcard CORS plus credentials=true means the
 *      browser delivers the response back to the attacker page.
 *   4. Attacker now reads PHI, claim data, organization data, etc.,
 *      using the user's authenticated session.
 *
 * Fix: index.js delegates CORS to config/cors.js which uses an explicit
 * whitelist driven by ALLOWED_ORIGINS env var, plus a null-origin block
 * in production. Wildcard origins are no longer accepted.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Source-grep tests would fail because the wildcard string lived
 *     in index.js.
 *   - Behavior tests on the cors module would fail if the function
 *     ever returns success for an unlisted origin.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const INDEX_PATH = path.join(SERVER_DIR, 'index.js');

const { getAllowedOrigins, buildCorsOptions } = require('../../config/cors');

test('index.js does not configure CORS with wildcard origin', () => {
  const src = fs.readFileSync(INDEX_PATH, 'utf8');
  assert.ok(
    !/origin\s*:\s*['"]\*['"]/.test(src),
    'index.js still configures cors({ origin: "*" }); any site with credentials can call the API.'
  );
  assert.ok(
    !/['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/.test(src),
    'index.js still emits Access-Control-Allow-Origin: * directly; any site can call the API.'
  );
});

test('CORS options expose an origin function callback (not a static value)', () => {
  const opts = buildCorsOptions({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.example.com' });
  assert.strictEqual(typeof opts.origin, 'function', 'CORS origin must be a function callback for whitelist enforcement.');
});

test('Whitelisted origin is accepted', () => {
  const opts = buildCorsOptions({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.noesis-io.us,https://noesiscfo-io.us',
  });
  let captured;
  opts.origin('https://app.noesis-io.us', (err, ok) => {
    captured = { err, ok };
  });
  assert.strictEqual(captured.err, null);
  assert.strictEqual(captured.ok, true);
});

test('Non-whitelisted attacker origin is rejected', () => {
  const opts = buildCorsOptions({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.noesis-io.us',
  });
  let captured;
  opts.origin('https://evil.attacker.com', (err, ok) => {
    captured = { err, ok };
  });
  assert.ok(captured.err instanceof Error, 'attacker origin must be rejected with an Error');
  assert.match(captured.err.message, /CORS/);
  assert.notStrictEqual(captured.ok, true);
});

test('Null origin is rejected in production (blocks file:// and cross-origin redirects)', () => {
  const opts = buildCorsOptions({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: 'https://app.noesis-io.us',
  });
  let captured;
  opts.origin(undefined, (err, ok) => {
    captured = { err, ok };
  });
  assert.ok(captured.err instanceof Error);
  assert.notStrictEqual(captured.ok, true);
});

test('Null origin is allowed in development (curl, local tooling)', () => {
  const opts = buildCorsOptions({ NODE_ENV: 'development' });
  let captured;
  opts.origin(undefined, (err, ok) => {
    captured = { err, ok };
  });
  assert.strictEqual(captured.err, null);
  assert.strictEqual(captured.ok, true);
});

test('getAllowedOrigins returns localhost:3000 default when ALLOWED_ORIGINS unset', () => {
  const origins = getAllowedOrigins({});
  assert.deepStrictEqual(origins, ['http://localhost:3000']);
});

test('getAllowedOrigins parses comma-separated whitelist with surrounding whitespace', () => {
  const origins = getAllowedOrigins({
    ALLOWED_ORIGINS: ' https://a.example.com , https://b.example.com ,https://c.example.com',
  });
  assert.deepStrictEqual(origins, [
    'https://a.example.com',
    'https://b.example.com',
    'https://c.example.com',
  ]);
});

test('CORS options keep credentials enabled (whitelist plus credentials is the safe combination)', () => {
  const opts = buildCorsOptions({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.example.com' });
  assert.strictEqual(opts.credentials, true,
    'credentials must remain true so authenticated cross-origin requests work for whitelisted origins.');
});
