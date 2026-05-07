/**
 * Regression test for April 2026 audit Critical #2: Hardcoded test password.
 *
 * Original vulnerability (audit ref routes/auth.js:29):
 *   The login handler accepted the literal password 'Test123456!' for any
 *   user in any environment. Anyone who saw the source could log in
 *   without legitimate credentials.
 *
 * Attack path:
 *   1. Attacker reads source or pulls a snapshot.
 *   2. Attacker POSTs /auth/login with any email and password 'Test123456!'.
 *   3. Server returns a valid JWT for the impersonated user.
 *   4. Attacker now has a session with whatever role/org/plan the
 *      impersonated user holds. PHI access included.
 *
 * Fix: routes/auth.js now goes through bcrypt + DB lookup. When the DB
 * is not connected and NODE_ENV is production, the handler returns 503
 * instead of falling back to any literal credential. The dev fallback
 * uses env-driven DEV_EMAIL / DEV_PASSWORD and is unreachable in prod.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Source-grep tests would fail because the literal lived in source.
 *   - Source-shape test for the prod-no-db gate would fail because the
 *     pre-fix handler had no such gate; the literal accepted in any env.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const AUTH_ROUTE_PATH = path.join(SERVER_DIR, 'routes', 'auth.js');

test('routes/auth.js does not contain the pre-fix literal Test123456!', () => {
  const src = fs.readFileSync(AUTH_ROUTE_PATH, 'utf8');
  assert.ok(
    !src.includes('Test123456!'),
    'routes/auth.js still contains the pre-fix hardcoded password literal '
      + "'Test123456!'. Anyone reading the source can authenticate as any user."
  );
});

test('No file under server/ contains the pre-fix literal Test123456!', () => {
  function walk(dir, files) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.git') {
        continue;
      }
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, files);
      } else if (full.endsWith('.js')) {
        files.push(full);
      }
    }
    return files;
  }

  const offenders = [];
  for (const f of walk(SERVER_DIR, [])) {
    // Allow this regression-test directory to mention the literal as a reference.
    if (f.includes(path.join('test', 'security'))) {
      continue;
    }
    const src = fs.readFileSync(f, 'utf8');
    if (src.includes('Test123456!')) {
      offenders.push(path.relative(SERVER_DIR, f));
    }
  }

  assert.deepStrictEqual(
    offenders,
    [],
    `Found pre-fix literal Test123456! in: ${offenders.join(', ')}. `
      + 'Remove and replace any hardcoded credential with bcrypt + DB lookup.'
  );
});

test('Login handler enforces production-503 gate when DB is not connected', () => {
  // Pre-fix code had no DB-or-503 gate; any password-equality check
  // against a literal would authenticate the request. The fix is the
  // explicit 503 short-circuit when NODE_ENV is production and the DB
  // is not available.
  const src = fs.readFileSync(AUTH_ROUTE_PATH, 'utf8');

  assert.ok(
    src.includes('db.isConnected()'),
    'routes/auth.js login handler must branch on db.isConnected() to gate '
      + 'the production code path through bcrypt + DB lookup.'
  );

  // Find the login handler block and assert that the no-db branch has a
  // production guard that returns 503.
  const loginStart = src.indexOf("router.post('/login'");
  assert.ok(loginStart >= 0, 'login route handler not found in routes/auth.js');
  const loginEnd = src.indexOf("router.post('/logout'", loginStart);
  const loginBlock = src.slice(loginStart, loginEnd > 0 ? loginEnd : undefined);

  assert.ok(
    /NODE_ENV\s*===?\s*['"]production['"]/.test(loginBlock),
    'login handler must check NODE_ENV === "production" in the no-db branch '
      + 'so that the dev fallback never authenticates a production request.'
  );

  assert.ok(
    /status\(503\)/.test(loginBlock),
    'login handler must return 503 in the production-no-db branch instead '
      + 'of falling back to any literal credential.'
  );
});

test('Login handler uses bcrypt for production password verification', () => {
  const src = fs.readFileSync(AUTH_ROUTE_PATH, 'utf8');
  assert.ok(
    src.includes("require('bcryptjs')") || src.includes('require("bcryptjs")'),
    'routes/auth.js must require bcryptjs for production password verification.'
  );
  assert.ok(
    /bcrypt\.compare\s*\(/.test(src),
    'routes/auth.js must call bcrypt.compare to verify the submitted password '
      + 'against the stored hash. Plain-string equality on a literal is the '
      + 'pre-fix vulnerability.'
  );
});
