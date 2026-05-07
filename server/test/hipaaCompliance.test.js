/**
 * Unit tests for the HIPAA compliance surfaces:
 *   - §164.308(b)(1) BAA tracking
 *   - §164.528 accounting of disclosures
 *   - §164.524 right-of-access workflow (30-day SLA + extension)
 *
 * The router is exercised through a real Express app instance so the
 * authenticate / authorize stack runs. Tokens are signed with the same
 * JWT_SECRET fallback that auth.js uses in dev (no real secrets).
 */

const test    = require('node:test');
const assert  = require('node:assert/strict');
const express = require('express');
const jwt     = require('jsonwebtoken');

// dev-secret fallback used by middleware/auth.js when JWT_SECRET is unset.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const router = require('../routes/hipaaCompliance');
const { ROLES } = require('../config/roles');

// Note: auth.js falls back to 'dev-secret-change-in-production' when
// JWT_SECRET is unset. We use the same secret here.
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/hipaa', router);
  return app;
}

function signToken(claims) {
  return jwt.sign({ id: 'u-1', plan: 'enterprise', ...claims }, SECRET, { expiresIn: '1h' });
}

async function call(app, method, path, token, body) {
  const http = require('http');
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const payload = body ? JSON.stringify(body) : null;
  const headers = { 'Authorization': `Bearer ${token}` };
  if (payload) {
    headers['Content-Type']  = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  const result = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(Buffer.concat(chunks).toString()); } catch { parsed = null; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
    req.on('error', reject);
    if (payload) { req.write(payload); }
    req.end();
  });
  await new Promise((r) => server.close(r));
  return result;
}

// ── BAA endpoints ─────────────────────────────────────────────────────────────
test('GET /baa requires authentication', async () => {
  const app = buildApp();
  const r = await call(app, 'GET', '/api/v1/hipaa/baa', '', null);
  assert.equal(r.status, 401);
});

test('GET /baa allowed for practice_admin', async () => {
  const app = buildApp();
  const token = signToken({ id: 'a-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' });
  const r = await call(app, 'GET', '/api/v1/hipaa/baa', token, null);
  assert.equal(r.status, 200);
  assert.equal(r.body.success, true);
  assert.equal(r.body.hipaaCitation, '§164.308(b)(1)');
  assert.ok(Array.isArray(r.body.data));
  assert.match(r.body.posture, /BAA-ready/);
});

test('GET /baa rejects provider_staff (insufficient role)', async () => {
  const app = buildApp();
  const token = signToken({ id: 'p-1', role: ROLES.PROVIDER_STAFF });
  const r = await call(app, 'GET', '/api/v1/hipaa/baa', token, null);
  assert.equal(r.status, 403);
});

test('POST /baa rejects practice_admin (super_admin only - vendors span tenants)', async () => {
  const app = buildApp();
  const token = signToken({ id: 'a-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' });
  const r = await call(app, 'POST', '/api/v1/hipaa/baa', token, {
    vendor: 'TestVendor', category: 'misc', status: 'pending',
  });
  assert.equal(r.status, 403);
});

test('POST /baa accepts a valid entry from super_admin', async () => {
  const app = buildApp();
  const token = signToken({ id: 'sa-1', role: ROLES.SUPER_ADMIN });
  const r = await call(app, 'POST', '/api/v1/hipaa/baa', token, {
    vendor: 'NewVendor', category: 'analytics', status: 'pending',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.baa.vendor, 'NewVendor');
  assert.equal(r.body.baa.status, 'pending');
});

test('POST /baa rejects invalid status enum', async () => {
  const app = buildApp();
  const token = signToken({ id: 'sa-1', role: ROLES.SUPER_ADMIN });
  const r = await call(app, 'POST', '/api/v1/hipaa/baa', token, {
    vendor: 'X', category: 'misc', status: 'bogus',
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'VALIDATION_ERROR');
});

// ── Accounting of disclosures ─────────────────────────────────────────────────
test('POST /disclosures records a non-TPO disclosure', async () => {
  const app = buildApp();
  const token = signToken({ id: 'p-1', role: ROLES.PROVIDER_STAFF, organizationId: 'org-A' });
  const r = await call(app, 'POST', '/api/v1/hipaa/disclosures', token, {
    patientId: 'pt-001',
    recipient: 'County Public Health',
    recipientType: 'public_health_authority',
    description: 'Reportable disease event',
    purpose: 'Public-health notification',
    legalBasis: '§164.512(b) public-health activities',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.disclosure.patientId, 'pt-001');
  assert.equal(r.body.hipaaCitation, '§164.528');
});

test('POST /disclosures rejects an unrecognized recipient type', async () => {
  const app = buildApp();
  const token = signToken({ id: 'p-1', role: ROLES.PROVIDER_STAFF, organizationId: 'org-A' });
  const r = await call(app, 'POST', '/api/v1/hipaa/disclosures', token, {
    patientId: 'pt-002',
    recipient: 'Some random recipient',
    recipientType: 'marketing',  // not a permitted non-TPO type
    description: 'x',
    purpose: 'x',
    legalBasis: 'x',
  });
  assert.equal(r.status, 400);
});

test('GET /disclosures lists previously recorded disclosures and returns retention info', async () => {
  const app = buildApp();
  const token = signToken({ id: 'p-1', role: ROLES.PROVIDER_STAFF, organizationId: 'org-A' });
  const r = await call(app, 'GET', '/api/v1/hipaa/disclosures?patientId=pt-001', token, null);
  assert.equal(r.status, 200);
  assert.equal(r.body.retentionYears, 6);
  assert.equal(r.body.hipaaCitation, '§164.528');
});

// ── Right of access ───────────────────────────────────────────────────────────
test('POST /access-requests creates a pending request and exposes the 30-day SLA', async () => {
  const app = buildApp();
  const token = signToken({ id: 'p-1', role: ROLES.PROVIDER_STAFF, organizationId: 'org-A' });
  const r = await call(app, 'POST', '/api/v1/hipaa/access-requests', token, {
    patientId: 'pt-100',
    patientEmail: 'patient@example.com',
    scope: 'Full encounter history 2026-01-01 to 2026-04-30',
    format: 'electronic',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.request.status, 'pending');
  assert.equal(r.body.slaDays, 30);
  assert.ok(r.body.request.slaDeadline);
  assert.ok(r.body.request.slaDeadlineWithExtension);
  assert.equal(r.body.request.isOverdue, false);
});

test('PUT /access-requests/:id/fulfill marks request fulfilled', async () => {
  const app = buildApp();
  const token = signToken({ id: 'a-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' });
  // First, create a request to fulfill.
  const created = await call(app, 'POST', '/api/v1/hipaa/access-requests', token, {
    patientId: 'pt-200',
    patientEmail: 'patient2@example.com',
    scope: 'Coverage and claims 2025',
  });
  assert.equal(created.status, 201);
  const id = created.body.request.id;

  const r = await call(app, 'PUT', `/api/v1/hipaa/access-requests/${id}/fulfill`, token, {
    documentReference: 's3://noesis-rec/fulfilled/pt-200.pdf',
    fulfillmentNotes: 'Encrypted PDF emailed to patient via secure portal',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.request.status, 'fulfilled');
  assert.ok(r.body.request.fulfilledAt);
});

test('access-request decorate computes overdue=true after SLA expiry', () => {
  const { _helpers, _stores } = require('../routes/hipaaCompliance');
  const past = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
  const decorated = _helpers.decorateAccessRequest({
    id: 'x', requestedAt: past, status: 'pending',
  });
  assert.equal(decorated.isOverdue, true);
  assert.ok(decorated.daysSinceRequest >= 35);
});

test('non-claim of HIPAA certification: BAA endpoint posture says BAA-ready, not "HIPAA-compliant"', async () => {
  const app = buildApp();
  const token = signToken({ id: 'a-1', role: ROLES.PRACTICE_ADMIN, organizationId: 'org-A' });
  const r = await call(app, 'GET', '/api/v1/hipaa/baa', token, null);
  assert.equal(r.status, 200);
  assert.match(r.body.posture, /BAA-ready architecture/);
  assert.ok(!/HIPAA[ -]+certified/i.test(r.body.posture),
    'must not assert HIPAA certification');
  assert.ok(!/\bHIPAA-compliant\b/i.test(r.body.posture),
    'must not assert HIPAA compliance without BAA evidence');
});
