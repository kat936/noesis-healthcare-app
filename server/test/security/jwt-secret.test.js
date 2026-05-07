/**
 * Regression test for April 2026 audit Critical #1: Hardcoded JWT secret.
 *
 * Original vulnerability (audit ref middleware/auth.js:3):
 *   const JWT_SECRET = 'CHANGE_ME_IN_PRODUCTION';
 *
 * Attack path:
 *   1. Attacker reads the source (open-source repo or leaked snapshot).
 *   2. Attacker forges any JWT they want by signing with the literal secret.
 *   3. Server verifies the forged token because the same literal is the
 *      verification key. Total authentication bypass: any role, any user,
 *      any organization, any plan tier.
 *
 * Fix: middleware/auth.js reads JWT_SECRET from process.env. In production
 * the absence of the env var is a fatal startup error rather than a silent
 * fallback to a known constant.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Source-grep test would fail because the literal lived in source.
 *   - Production-spawn test would fail because module load did not throw
 *     when the env var was missing.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const AUTH_PATH = path.resolve(__dirname, '..', '..', 'middleware', 'auth.js');

test('middleware/auth.js does not contain the pre-fix hardcoded literal', () => {
  const src = fs.readFileSync(AUTH_PATH, 'utf8');
  assert.ok(
    !src.includes('CHANGE_ME_IN_PRODUCTION'),
    'middleware/auth.js still contains the pre-fix literal CHANGE_ME_IN_PRODUCTION; '
      + 'an attacker who reads the source can forge any JWT.'
  );
});

test('production startup throws when JWT_SECRET env var is unset', () => {
  const probe = `
    try {
      require(${JSON.stringify(AUTH_PATH)});
      console.log('NO_THROW');
    } catch (e) {
      console.log('THREW:' + e.message);
    }
  `;
  const env = { ...process.env };
  delete env.JWT_SECRET;
  env.NODE_ENV = 'production';

  const result = spawnSync(process.execPath, ['-e', probe], {
    env,
    encoding: 'utf8',
  });

  assert.ok(
    result.stdout.includes('THREW:CRITICAL: JWT_SECRET'),
    'Production startup must refuse to load without JWT_SECRET. '
      + `Got stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}.`
  );
});

test('production startup loads when JWT_SECRET env var is provided', () => {
  const probe = `
    require(${JSON.stringify(AUTH_PATH)});
    console.log('LOADED');
  `;
  const env = { ...process.env };
  env.NODE_ENV = 'production';
  env.JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const result = spawnSync(process.execPath, ['-e', probe], {
    env,
    encoding: 'utf8',
  });

  assert.ok(
    result.stdout.includes('LOADED'),
    `Production module must load when JWT_SECRET is set. Got stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}.`
  );
});

test('development fallback still loads when JWT_SECRET env var is unset', () => {
  const probe = `
    require(${JSON.stringify(AUTH_PATH)});
    console.log('LOADED');
  `;
  const env = { ...process.env };
  delete env.JWT_SECRET;
  env.NODE_ENV = 'development';

  const result = spawnSync(process.execPath, ['-e', probe], {
    env,
    encoding: 'utf8',
  });

  assert.ok(
    result.stdout.includes('LOADED'),
    `Development fallback must still load (with warning). Got stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}.`
  );
});
