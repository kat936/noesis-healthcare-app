/**
 * Regression test for April 2026 audit Critical #5: POST /fda/devices unvalidated.
 *
 * Original vulnerability (audit ref routes/integrations.js:130):
 *   POST /integrations/fda/devices accepted req.body without schema
 *   validation. The deviceName / deviceClass values were forwarded
 *   into an upstream OpenFDA query string, allowing injection of
 *   FDA API search operators or malicious payloads.
 *
 * Attack path:
 *   1. Attacker holds a valid JWT for any plan tier that includes
 *      FDA device search (solo, group, enterprise).
 *   2. Attacker POSTs /api/v1/integrations/fda/devices with a body
 *      such as { deviceName: '<script>alert(1)</script>', limit: 99999 }.
 *   3. Without validation, the value is concatenated into the OpenFDA
 *      query string. Side effects include: server-side response with
 *      stored XSS payload echoed back into UI, runaway upstream cost
 *      from huge limit values, and a foothold for query-injection
 *      against the OpenFDA upstream that other integrations also rely
 *      on.
 *
 * Fix: routes/integrations.js wraps the route with
 *   validate(fdaDeviceSearchSchema). The schema enforces:
 *     - deviceName / deviceClass are optional sanitized safe strings
 *       (HTML / script-injection chars stripped).
 *     - limit is an integer 1..20 with default 5.
 *
 * These assertions exploit the pre-fix behavior:
 *   - Source-shape test would fail because the validate middleware
 *     was absent on the POST route in the pre-fix code.
 *   - Schema parse tests would fail if the schema were missing or
 *     the limit-range / sanitize constraints were loosened.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const ROUTE_PATH = path.join(SERVER_DIR, 'routes', 'integrations.js');

const { fdaDeviceSearchSchema } = require('../../schemas/validation');

test('POST /fda/devices route is wrapped with validate(fdaDeviceSearchSchema)', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  // Find the FDA devices route registration block.
  const start = src.indexOf("'/fda/devices'");
  assert.ok(start > 0, 'FDA devices route not found in routes/integrations.js');
  // Look at a window around the route registration.
  const block = src.slice(Math.max(0, start - 200), start + 600);
  assert.ok(
    /validate\s*\(\s*fdaDeviceSearchSchema\s*\)/.test(block),
    'POST /fda/devices is missing validate(fdaDeviceSearchSchema). '
      + 'Attacker-supplied deviceName / deviceClass / limit values can be injected '
      + 'into the OpenFDA upstream query.'
  );
});

test('Schema accepts a typical valid query', () => {
  const result = fdaDeviceSearchSchema.safeParse({
    deviceName: 'pacemaker',
    deviceClass: 'III',
    limit: 10,
  });
  assert.strictEqual(result.success, true);
});

test('Schema sanitizes HTML / script payloads in deviceName', () => {
  const result = fdaDeviceSearchSchema.safeParse({
    deviceName: '<script>alert(1)</script>pacemaker',
  });
  assert.strictEqual(result.success, true,
    'safeString should accept the field but strip dangerous chars');
  assert.ok(
    !/<script>/.test(result.data.deviceName) && !/[<>'";]/.test(result.data.deviceName),
    'deviceName must be sanitized: HTML tags and injection chars removed. '
      + `Got: ${JSON.stringify(result.data.deviceName)}`
  );
});

test('Schema rejects limit above 20 (cost / DoS guard)', () => {
  for (const limit of [21, 100, 999, 99999]) {
    const result = fdaDeviceSearchSchema.safeParse({ limit });
    assert.strictEqual(
      result.success,
      false,
      `Schema must reject limit=${limit}; OpenFDA upstream cost is unbounded otherwise`
    );
  }
});

test('Schema rejects limit below 1', () => {
  for (const limit of [0, -1, -100]) {
    const result = fdaDeviceSearchSchema.safeParse({ limit });
    assert.strictEqual(
      result.success,
      false,
      `Schema must reject limit=${limit}`
    );
  }
});

test('Schema rejects non-numeric limit (string injection guard)', () => {
  for (const limit of ['10', 'abc', '5 OR 1=1', null]) {
    const result = fdaDeviceSearchSchema.safeParse({ limit });
    assert.strictEqual(
      result.success,
      false,
      `Schema must reject non-numeric limit=${JSON.stringify(limit)}`
    );
  }
});

test('Schema applies default limit of 5 when limit omitted', () => {
  const result = fdaDeviceSearchSchema.safeParse({ deviceName: 'stent' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.limit, 5,
    'Default limit must be 5 to keep OpenFDA cost bounded for unauthenticated abuse paths');
});

test('Schema strips unknown fields like apiKey, manufacturerOverride', () => {
  const result = fdaDeviceSearchSchema.safeParse({
    deviceName: 'stent',
    apiKey: 'attacker-supplied-key',
    manufacturerOverride: 'evil-corp',
    limit: 5,
  });
  assert.strictEqual(result.success, true);
  const keys = Object.keys(result.data).sort();
  assert.ok(
    !keys.includes('apiKey') && !keys.includes('manufacturerOverride'),
    `Unknown fields must not appear in validated output. Got: ${keys.join(', ')}`
  );
});

test('Handler reads req.validated, not raw req.body', () => {
  const src = fs.readFileSync(ROUTE_PATH, 'utf8');
  // Locate the FDA devices handler body.
  const start = src.indexOf("'/fda/devices'");
  assert.ok(start > 0);
  // Take a generous window forward to capture the async handler body.
  const block = src.slice(start, start + 1500);
  assert.ok(
    /req\.validated/.test(block),
    'POST /fda/devices handler must read req.validated; reading req.body bypasses '
      + 'the schema and reintroduces injection / cost-abuse risk.'
  );
});
