'use strict';

/**
 * EHR connector dashboard aggregation
 *   - empty org returns vendor catalog with all "not_connected"
 *   - connected vendor with fresh token reports "fresh"
 *   - connected vendor with expired token reports "expired"
 *   - connected vendor with token inside warning window reports "expiring_soon"
 *   - refresh-failed connection rolls up into totals.refreshFailed
 *
 * No DB required: connectionStore falls back to its in-memory map when
 * DATABASE_URL is unset, which is the default in `npm test`.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY ||
  'a'.repeat(64);

const ehr   = require('../services/healthEhr');
const store = require('../services/healthEhr/connectionStore');

const ORG_EMPTY      = '00000000-0000-0000-0000-000000000d01';
const ORG_FRESH      = '00000000-0000-0000-0000-000000000d02';
const ORG_EXPIRED    = '00000000-0000-0000-0000-000000000d03';
const ORG_EXPIRING   = '00000000-0000-0000-0000-000000000d04';
const ORG_FAILED     = '00000000-0000-0000-0000-000000000d05';

beforeEach(() => store._resetForTests());

test('dashboard: empty org reports catalog with all not_connected', async () => {
  const d = await ehr.getDashboard(ORG_EMPTY);
  assert.equal(typeof d.generatedAt, 'string');
  assert.equal(d.orgId, ORG_EMPTY);
  assert.ok(Array.isArray(d.vendors));
  assert.ok(d.vendors.length >= 3, 'expected catalog of 3+ vendors');

  for (const v of d.vendors) {
    assert.equal(v.connectionState, 'not_connected', `vendor ${v.vendorId} should be not_connected`);
    assert.equal(v.tokenState,      'unknown');
    assert.equal(v.lastSyncedAt,    null);
    assert.equal(v.lastError,       null);
    assert.ok(typeof v.vendorName === 'string' && v.vendorName.length > 0);
    assert.ok(typeof v.appRegistry === 'string' && v.appRegistry.length > 0);
  }
  assert.equal(d.totals.connected,    0);
  assert.equal(d.totals.notConnected, d.vendors.length);
  assert.ok(typeof d.disclaimer === 'string' && d.disclaimer.includes('Business Associate Agreement'));
});

test('dashboard: fresh access token reports tokenState=fresh', async () => {
  const futureMs = Date.now() + 60 * 60 * 1000; // 1h in the future
  await store.upsertConnection({
    orgId:       ORG_FRESH,
    vendor:      'epic',
    fhirBaseUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
    tokens: {
      accessToken:  'tok-fresh',
      refreshToken: 'rfsh-fresh',
      expiresAt:    new Date(futureMs).toISOString(),
      scope:        'patient/Patient.read',
    },
  });

  const d = await ehr.getDashboard(ORG_FRESH);
  const epic = d.vendors.find((v) => v.vendorId === 'epic');
  assert.ok(epic, 'epic vendor row missing');
  assert.equal(epic.connectionState, 'connected');
  assert.equal(epic.tokenState,      'fresh');
  assert.ok(epic.minutesToExpiry > 30, 'expected >30min to expiry on a 1h token');
  assert.equal(d.totals.connected, 1);
  assert.equal(d.totals.expired, 0);
  assert.equal(d.totals.expiringSoon, 0);
});

test('dashboard: expired token reports tokenState=expired', async () => {
  const pastMs = Date.now() - 60 * 1000;
  await store.upsertConnection({
    orgId:       ORG_EXPIRED,
    vendor:      'athena',
    fhirBaseUrl: 'https://api.preview.platform.athenahealth.com/fhir/r4',
    tokens: {
      accessToken:  'tok-old',
      refreshToken: 'rfsh-old',
      expiresAt:    new Date(pastMs).toISOString(),
    },
  });

  const d = await ehr.getDashboard(ORG_EXPIRED);
  const athena = d.vendors.find((v) => v.vendorId === 'athena');
  assert.equal(athena.tokenState, 'expired');
  assert.ok(athena.minutesToExpiry <= 0);
  assert.equal(d.totals.expired, 1);
});

test('dashboard: token inside warning window reports expiring_soon', async () => {
  const soonMs = Date.now() + 5 * 60 * 1000; // 5min into the future
  await store.upsertConnection({
    orgId:       ORG_EXPIRING,
    vendor:      'cerner',
    fhirBaseUrl: 'https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d',
    tokens: {
      accessToken:  'tok-soon',
      refreshToken: 'rfsh-soon',
      expiresAt:    new Date(soonMs).toISOString(),
    },
  });

  const d = await ehr.getDashboard(ORG_EXPIRING, { tokenWarningWindowMs: 10 * 60 * 1000 });
  const cerner = d.vendors.find((v) => v.vendorId === 'cerner');
  assert.equal(cerner.tokenState, 'expiring_soon');
  assert.equal(d.totals.expiringSoon, 1);
});

test('dashboard: refresh-failed connection surfaces lastError + totals.refreshFailed', async () => {
  await store.upsertConnection({
    orgId:       ORG_FAILED,
    vendor:      'epic',
    fhirBaseUrl: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4',
    tokens: {
      accessToken:  'tok',
      refreshToken: 'rfsh',
      expiresAt:    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });
  await store.markFailed(ORG_FAILED, 'epic', 'invalid_grant');

  const d = await ehr.getDashboard(ORG_FAILED);
  const epic = d.vendors.find((v) => v.vendorId === 'epic');
  assert.equal(epic.connectionState, 'refresh_failed');
  assert.equal(epic.lastError, 'invalid_grant');
  assert.equal(d.totals.refreshFailed, 1);
  assert.equal(d.totals.withErrors, 1);
});

test('dashboard: missing orgId throws', async () => {
  await assert.rejects(() => ehr.getDashboard(''), /orgId required/);
});
