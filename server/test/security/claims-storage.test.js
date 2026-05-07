/**
 * Regression test for April 2026 audit Critical #6: in-memory race conditions.
 *
 * Original vulnerability (audit ref routes/claims.js:13-14):
 *   Concurrent mutations to a shared in-memory Map. Two simultaneous
 *   PUT /claims/:id/status calls (or appeal submissions, or status
 *   updates from clearinghouse webhooks) read the current value,
 *   each modifies its own copy, and the second write clobbers the
 *   first. Lost writes corrupt claim status, audit history, and
 *   billable amounts under load.
 *
 * Attack path (lost-write scenario):
 *   1. Two concurrent admin actions race to update claim X status.
 *   2. Worker A reads memClaims.get(X) -> { status: 'submitted' }.
 *   3. Worker B reads memClaims.get(X) -> { status: 'submitted' }.
 *   4. Worker A writes status='approved'.
 *   5. Worker B writes status='denied' AFTER A.
 *   6. Audit log shows both actions ran, but the final stored state
 *      reflects only B. The 'approved' write is silently lost.
 *
 * Fix: routes/claims.js uses Postgres (db.query) when db.isConnected()
 * returns true, and the in-memory Map is reduced to an explicit
 * dev-only fallback. Mutations go through atomic single-statement
 * UPDATE ... WHERE id = $1 calls so the database serializes
 * concurrent writes per row. The in-memory path is gated behind
 * !useDB() and only runs in dev environments without a database.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Source-grep tests would fail if any mutating route mutated
 *     memClaims without the !useDB() gate.
 *   - Source-grep tests would fail if PUT /:id/status no longer
 *     used a single-statement db.query UPDATE.
 *   - Source-grep tests would fail if the dev-only label on the
 *     in-memory Map were removed (signal that someone is reusing
 *     the in-memory path in production).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const ROUTE_PATH = path.join(SERVER_DIR, 'routes', 'claims.js');

test('In-memory claims Map is labeled as a dev-only fallback', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  // The label tells future maintainers that this is not the canonical
  // store. Removing the label is a signal that someone is repurposing
  // the in-memory path for production.
  assert.ok(
    /dev[^a-z]?\s*(only|\/|fallback)/i.test(src) || /In-memory fallback/i.test(src),
    'routes/claims.js must label the in-memory store as a dev-only fallback. '
      + 'A label-free in-memory Map is the pre-fix race-condition surface.'
  );
});

test('PUT /:id/status uses atomic single-statement UPDATE when DB is connected', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  const start = src.indexOf("router.put");
  assert.ok(start >= 0, 'PUT route not found');
  // Window the PUT handler.
  const next = src.indexOf("router.", start + 1);
  const block = src.slice(start, next > 0 ? next : start + 2000);
  assert.ok(
    /db\.query\s*\(\s*['"`]UPDATE\s+claims\s+SET[^'"`]*WHERE\s+id\s*=\s*\$/i.test(block),
    'PUT /:id/status must use a single-statement UPDATE ... WHERE id = $1. '
      + 'Read-modify-write loops reintroduce the lost-write race.'
  );
});

test('Every mutation handler branches on db.isConnected() (or useDB()) before touching state', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  const offenders = [];
  // Walk every router.{post,put,patch,delete} block and verify it
  // either uses db.query inside a useDB() branch, or returns before
  // touching memClaims directly.
  const re = /router\.(post|put|patch|delete)\s*\([\s\S]*?(?=router\.|module\.exports)/g;
  let match;
  while ((match = re.exec(src)) !== null) {
    const block = match[0];
    if (!/(useDB\(\)|db\.isConnected\(\))/.test(block) && /memClaims\./.test(block)) {
      // Block touches memClaims without any DB-vs-mem gate.
      offenders.push(block.slice(0, 80));
    }
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `Found mutation handlers that touch memClaims without a useDB()/db.isConnected() gate. `
      + `These bypass the Postgres production path and reintroduce the in-memory race surface. `
      + `First offender: ${offenders[0] || ''}`
  );
});

test('Production path encryption: PHI fields encrypted before INSERT', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  // The audit-fix shipped CLAIM_PHI_FIELDS encryption alongside the
  // Postgres migration. Locking the encryption call into the test so
  // someone removing it (and reverting to plaintext writes) trips
  // this assertion.
  assert.ok(
    /encryptFields\s*\(/.test(src) && /CLAIM_PHI_FIELDS/.test(src),
    'routes/claims.js must encrypt PHI fields before INSERT/UPDATE. '
      + 'Removing the encryption call regresses both the race-condition fix '
      + 'and Critical #8 (encryption at rest).'
  );
});

test('useDB() helper exists and resolves through db.isConnected()', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  // The helper makes the DB-vs-mem branching explicit and reviewable.
  // Removing it and inlining memClaims access is the regression vector.
  assert.ok(
    /function\s+useDB\s*\(\s*\)\s*\{\s*return\s+db\.isConnected\(\)/.test(src)
      || /const\s+useDB\s*=[\s\S]{0,80}db\.isConnected\(\)/.test(src),
    'routes/claims.js must define useDB() as a thin wrapper over db.isConnected(). '
      + 'Inline memClaims access without the helper is the regression vector.'
  );
});
