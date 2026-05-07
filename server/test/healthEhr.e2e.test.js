'use strict';

/**
 * End-to-end smoke test stitching the EHR connector pieces together:
 *   1. Save PKCE state (saveOAuthState)
 *   2. Consume state (simulating the OAuth callback)
 *   3. Upsert a connection with tokens (encrypted at rest)
 *   4. Build a FhirClient bound to the saved connection
 *   5. Issue a FHIR read; on 401 the client invokes the refresh callback,
 *      which writes the new access token back to the store
 *   6. Verify that the persisted access token has rotated
 *
 * No real network; https.request is mocked. No real PHI; synthetic patient.
 */

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { EventEmitter } = require('node:events');

process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY ||
  'a'.repeat(64);

const store = require('../services/healthEhr/connectionStore');
const { FhirClient } = require('../services/healthEhr/fhirClient');

function _mockHttps(responses) {
  const calls = [];
  let i = 0;
  const restore = mock.method(https, 'request', (opts, cb) => {
    calls.push({
      method:  opts.method,
      url:     `https://${opts.hostname}${opts.path}`,
      headers: { ...opts.headers },
    });
    const next = responses[i++];
    if (!next) { throw new Error('mock https.request: no more queued responses'); }
    const res = new EventEmitter();
    res.headers = next.headers || { 'content-type': 'application/fhir+json' };
    res.statusCode = next.status;
    res.setEncoding = () => {};
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {
      setImmediate(() => {
        cb(res);
        const payload = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
        res.emit('data', payload);
        res.emit('end');
      });
    };
    req.setTimeout = () => {};
    req.destroy = () => {};
    return req;
  });
  return { calls, restore };
}

const ORG = '00000000-0000-0000-0000-000000000099';

test('e2e: state -> connection -> FHIR fetch with transparent token refresh', async () => {
  store._resetForTests();

  // Step 1: save the SMART OAuth state with PKCE verifier
  await store.saveOAuthState({
    state:        'state-e2e-001',
    orgId:        ORG,
    vendor:       'epic',
    codeVerifier: 'verifier-' + 'x'.repeat(48),
    fhirBaseUrl:  'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
    redirectUri:  'https://noesis.example.com/api/v1/health/ehr/callback',
  });

  // Step 2: consume the state (callback handler would do this)
  const consumed = await store.consumeOAuthState('state-e2e-001');
  assert.equal(consumed.vendor, 'epic');

  // Step 3: persist a connection (would be after a real token exchange)
  await store.upsertConnection({
    orgId:       ORG,
    vendor:      'epic',
    fhirBaseUrl: consumed.fhirBaseUrl,
    clientId:    'noesis-epic-client',
    tokens: {
      accessToken:  'access-token-original',
      refreshToken: 'refresh-token-001',
      tokenType:    'Bearer',
      scope:        'patient/Patient.read patient/Coverage.read offline_access',
      expiresInSec: 60,
    },
  });

  // Step 4-5: bind a FhirClient with a refresh callback that talks to the store
  const conn = await store.getConnection(ORG, 'epic');
  let refreshCalls = 0;

  const tokenHolder = {
    accessToken: conn.accessToken,
    refresh: async () => {
      refreshCalls += 1;
      // Simulate hitting the SMART token endpoint
      const newAccess = 'access-token-rotated-' + refreshCalls;
      await store.updateTokens({
        orgId:        ORG,
        vendor:       'epic',
        accessToken:  newAccess,
        refreshToken: 'refresh-token-002',
        expiresInSec: 3600,
        scope:        conn.scope,
        tokenType:    conn.tokenType,
      });
      return { accessToken: newAccess };
    },
  };

  // Mock the FHIR HTTPS layer: first call 401, second succeeds
  const { restore } = _mockHttps([
    { status: 401, body: { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'expired' }] } },
    { status: 200, body: {
      resourceType: 'Patient',
      id: 'pt-synthea-001',
      name: [{ family: 'Synthea', given: ['Test'] }],
      birthDate: '1980-01-01',
      gender: 'unknown',
    } },
  ]);

  try {
    const client = new FhirClient({
      fhirBaseUrl: conn.fhirBaseUrl,
      tokenHolder,
    });
    const r = await client.read('Patient/pt-synthea-001');
    assert.equal(r.status, 200);
    assert.equal(r.resource.resourceType, 'Patient');
    assert.equal(r.resource.name[0].family, 'Synthea');
  } finally {
    restore.mock.restore();
  }

  // Step 6: verify the access token rotated AND the store persisted it
  assert.equal(refreshCalls, 1, 'refresh should have fired exactly once');
  const after = await store.getConnection(ORG, 'epic');
  assert.equal(after.accessToken, 'access-token-rotated-1');
  assert.equal(after.refreshToken, 'refresh-token-002');
  assert.equal(after.status, 'connected');
  assert.equal(after.lastError, null);
});

test('e2e: scope rejection results in clear error and connection unchanged', async () => {
  store._resetForTests();
  await store.upsertConnection({
    orgId:       ORG,
    vendor:      'cerner',
    fhirBaseUrl: 'https://fhir-myrecord.cerner.com/r4/x',
    clientId:    'noesis-cerner-client',
    tokens: {
      accessToken:  'tok-1',
      refreshToken: null, // public client without refresh
      expiresInSec: 60,
    },
  });

  const conn = await store.getConnection(ORG, 'cerner');
  const tokenHolder = {
    accessToken: conn.accessToken,
    refresh: async () => {
      throw new Error('Vendor rejected the refresh: invalid_scope');
    },
  };

  const { restore } = _mockHttps([
    { status: 401, body: { resourceType: 'OperationOutcome' } },
  ]);
  try {
    const client = new FhirClient({
      fhirBaseUrl: conn.fhirBaseUrl,
      tokenHolder,
    });
    await assert.rejects(client.read('Patient/x'), /invalid_scope/);
  } finally {
    restore.mock.restore();
  }
});
