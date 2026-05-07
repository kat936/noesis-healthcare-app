/**
 * Regression test for April 2026 audit Critical #4: Unvalidated PUT /authorizations/:id.
 *
 * Original vulnerability (audit ref routes/authorizations.js:140):
 *   PUT /authorizations/:id accepted req.body without schema validation.
 *   An attacker authenticated as INSURANCE_REP or PRACTICE_ADMIN could
 *   send arbitrary fields and mutate authorization scope, status, or
 *   expiry beyond what the API was meant to expose.
 *
 * Attack path:
 *   1. Attacker compromises or socials any account with PRACTICE_ADMIN
 *      role (or weaker) and gets a valid JWT.
 *   2. Attacker PUTs /api/v1/authorizations/:id with a body that
 *      includes unexpected keys like 'organizationId',
 *      'approvedAmount', or 'expiry' in the far future.
 *   3. Without validation, the handler merges the body into the stored
 *      record. Auth scope, dollar limits, and expiration are now
 *      attacker-controlled.
 *   4. Attacker now has self-approving authorizations for very large
 *      dollar amounts that the payer can be invoiced against.
 *
 * Fix: routes/authorizations.js wraps the PUT handler with
 *   validate(authorizationUpdateSchema). The schema enforces:
 *     - status is a required enum of submitted/approved/denied/expired
 *     - approvalNotes is an optional safeString up to 5000 chars
 *     - conditions is an optional safeString up to 5000 chars
 *   The handler reads req.validated (not raw req.body) so unknown
 *   keys are stripped before any DB write.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Source-shape test would fail because the validate middleware
 *     was absent on the PUT route in the pre-fix code.
 *   - Schema parse tests would fail if the schema were missing or
 *     the enum/required-field constraints were loosened.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const ROUTE_PATH = path.join(SERVER_DIR, 'routes', 'authorizations.js');

const { authorizationUpdateSchema } = require('../../schemas/validation');

test('PUT /authorizations/:id route is wrapped with validate(authorizationUpdateSchema)', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  // Find the PUT route registration and confirm the validate middleware is present in its chain.
  const match = src.match(/router\.put\(\s*['"]\/:id['"][\s\S]*?\)\s*=>/);
  assert.ok(match, 'PUT /:id route registration not found in routes/authorizations.js');
  const chain = match[0];
  assert.ok(
    /validate\s*\(\s*authorizationUpdateSchema\s*\)/.test(chain),
    'PUT /:id route is missing validate(authorizationUpdateSchema). '
      + 'An attacker can send arbitrary fields to mutate authorization scope, status, or expiry.'
  );
});

test('Schema rejects a body with a missing status field', () => {
  const result = authorizationUpdateSchema.safeParse({ approvalNotes: 'ok' });
  assert.strictEqual(result.success, false, 'Schema must reject body without status');
});

test('Schema rejects a body with an invalid status enum value', () => {
  for (const status of ['hacked', '*', 'auto-approved', 'admin', '']) {
    const result = authorizationUpdateSchema.safeParse({ status });
    assert.strictEqual(
      result.success,
      false,
      `Schema must reject status='${status}' (only submitted|approved|denied|expired permitted)`
    );
  }
});

test('Schema accepts each documented status value', () => {
  for (const status of ['submitted', 'approved', 'denied', 'expired']) {
    const result = authorizationUpdateSchema.safeParse({ status });
    assert.strictEqual(result.success, true, `Schema must accept status='${status}'`);
  }
});

test('Schema strips unknown fields like expiry, approvedAmount, organizationId', () => {
  const result = authorizationUpdateSchema.safeParse({
    status: 'approved',
    approvalNotes: 'ok',
    expiry: '9999-12-31',
    approvedAmount: 99999999,
    organizationId: 'attacker-org',
    role: 'super_admin',
  });
  assert.strictEqual(result.success, true);
  // Only the schema-defined keys should be present in parsed output.
  assert.deepStrictEqual(
    Object.keys(result.data).sort(),
    ['approvalNotes', 'status'],
    'Unknown attacker-controlled fields must not appear in validated output. '
      + `Got: ${Object.keys(result.data).join(', ')}`
  );
});

test('PUT handler reads req.validated, not raw req.body', () => {
  // The validate() middleware places parsed output on req.validated.
  // The handler MUST consume that, otherwise unknown attacker fields
  // bypass schema enforcement at the application layer.
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  const putStart = src.indexOf("router.put('/:id'");
  assert.ok(putStart >= 0);
  // Find the end of this route handler (next route boundary).
  const next = src.indexOf("router.", putStart + 1);
  const block = src.slice(putStart, next > 0 ? next : undefined);
  assert.ok(
    /req\.validated/.test(block) || /req\.body/.test(block) === false,
    'PUT handler should read from req.validated (validated output) rather than req.body. '
      + 'Reading req.body bypasses the schema and reintroduces the original vulnerability.'
  );
});

test('approvalNotes and conditions are bounded to 5000 chars', () => {
  const tooLong = 'x'.repeat(5001);
  const result1 = authorizationUpdateSchema.safeParse({
    status: 'approved',
    approvalNotes: tooLong,
  });
  assert.strictEqual(result1.success, false, 'approvalNotes longer than 5000 chars must be rejected');

  const result2 = authorizationUpdateSchema.safeParse({
    status: 'approved',
    conditions: tooLong,
  });
  assert.strictEqual(result2.success, false, 'conditions longer than 5000 chars must be rejected');
});
