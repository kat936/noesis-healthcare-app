'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// In-memory mode (no DATABASE_URL): connectionStore exercises the Map fallback,
// which is what unit tests cover. Integration tests run against Postgres in CI.
process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY ||
  'a'.repeat(64); // 32 bytes hex

const store = require('../services/healthEhr/connectionStore');

const ORG = '00000000-0000-0000-0000-000000000001';

test('upsertConnection persists tokens in encrypted form (round-trips on read)', async () => {
  store._resetForTests();
  const rec = await store.upsertConnection({
    orgId:       ORG,
    vendor:      'epic',
    fhirBaseUrl: 'https://fhir.epic.com/fhir/r4',
    clientId:    'client-1',
    tokens: {
      accessToken:  'plain-access-token-abc',
      refreshToken: 'plain-refresh-token-xyz',
      tokenType:    'Bearer',
      scope:        'patient/Patient.read',
      expiresInSec: 3600,
    },
  });
  assert.equal(rec.vendor, 'epic');
  assert.equal(rec.status, 'connected');

  const fetched = await store.getConnection(ORG, 'epic');
  assert.ok(fetched, 'connection should exist after upsert');
  assert.equal(fetched.vendor, 'epic');
  assert.equal(fetched.accessToken, 'plain-access-token-abc',
    'accessToken should round-trip through encryption');
  assert.equal(fetched.refreshToken, 'plain-refresh-token-xyz');
  assert.equal(fetched.scope, 'patient/Patient.read');
});

test('upsertConnection is idempotent on (org, vendor) - second call updates tokens', async () => {
  store._resetForTests();
  await store.upsertConnection({
    orgId: ORG, vendor: 'athena', fhirBaseUrl: 'https://athena.example/fhir/r4',
    clientId: 'client-1',
    tokens: { accessToken: 't1', refreshToken: 'r1', expiresInSec: 60 },
  });
  await store.upsertConnection({
    orgId: ORG, vendor: 'athena', fhirBaseUrl: 'https://athena.example/fhir/r4',
    clientId: 'client-1',
    tokens: { accessToken: 't2', refreshToken: 'r2', expiresInSec: 60 },
  });
  const fetched = await store.getConnection(ORG, 'athena');
  assert.equal(fetched.accessToken, 't2');
  assert.equal(fetched.refreshToken, 'r2');
});

test('updateTokens rotates the access token and clears prior error', async () => {
  store._resetForTests();
  await store.upsertConnection({
    orgId: ORG, vendor: 'cerner', fhirBaseUrl: 'https://fhir-myrecord.cerner.com/r4/x',
    clientId: 'c', tokens: { accessToken: 'old', refreshToken: 'r', expiresInSec: 1 },
  });
  await store.markFailed(ORG, 'cerner', 'simulated 401');
  let after = await store.getConnection(ORG, 'cerner');
  assert.equal(after.status, 'refresh_failed');
  assert.equal(after.lastError, 'simulated 401');

  await store.updateTokens({
    orgId: ORG, vendor: 'cerner',
    accessToken: 'fresh', refreshToken: 'newr', expiresInSec: 3600,
  });
  after = await store.getConnection(ORG, 'cerner');
  assert.equal(after.status, 'connected');
  assert.equal(after.accessToken, 'fresh');
  assert.equal(after.refreshToken, 'newr');
  assert.equal(after.lastError, null);
});

test('disconnect clears tokens and marks status disconnected', async () => {
  store._resetForTests();
  await store.upsertConnection({
    orgId: ORG, vendor: 'epic', fhirBaseUrl: 'https://x/fhir/r4',
    clientId: 'c', tokens: { accessToken: 'a', refreshToken: 'r', expiresInSec: 60 },
  });
  await store.disconnect(ORG, 'epic');
  const after = await store.getConnection(ORG, 'epic');
  assert.equal(after.status, 'disconnected');
  assert.equal(after.accessToken, null, 'accessToken cleared on disconnect');
  assert.equal(after.refreshToken, null);
});

test('listConnections returns one summary per vendor (no PHI tokens)', async () => {
  store._resetForTests();
  await store.upsertConnection({
    orgId: ORG, vendor: 'epic', fhirBaseUrl: 'https://e/fhir/r4',
    clientId: 'c', tokens: { accessToken: 'a', refreshToken: 'r', expiresInSec: 60 },
  });
  await store.upsertConnection({
    orgId: ORG, vendor: 'athena', fhirBaseUrl: 'https://a/fhir/r4',
    clientId: 'c', tokens: { accessToken: 'a', refreshToken: 'r', expiresInSec: 60 },
  });
  const list = await store.listConnections(ORG);
  assert.equal(list.length, 2);
  for (const c of list) {
    assert.ok(!('accessToken' in c), 'list summaries must not include accessToken');
    assert.ok(!('refreshToken' in c), 'list summaries must not include refreshToken');
  }
});

test('saveOAuthState + consumeOAuthState round-trip the PKCE verifier', async () => {
  store._resetForTests();
  await store.saveOAuthState({
    state: 'state-abc',
    orgId: ORG,
    vendor: 'epic',
    codeVerifier: 'verifier-1234567890abcdef',
    tenantId: 'tenant-1',
    fhirBaseUrl: 'https://e/fhir/r4',
    redirectUri: 'https://noesis.example/cb',
  });
  const consumed = await store.consumeOAuthState('state-abc');
  assert.equal(consumed.codeVerifier, 'verifier-1234567890abcdef');
  assert.equal(consumed.vendor, 'epic');

  // Second consume must return null (single-use)
  const again = await store.consumeOAuthState('state-abc');
  assert.equal(again, null);
});
