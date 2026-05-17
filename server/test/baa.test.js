'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

// The baa service uses an in-memory map when db.isConnected() is false, so
// these tests exercise the full surface without a live Postgres.
const baa = require('../services/baa');

test('recordBAA rejects unknown counterparty type', async () => {
  await assert.rejects(
    () => baa.recordBAA({ counterpartyType: 'not_a_type', partyName: 'X' }),
    /counterpartyType must be one of/
  );
});

test('recordBAA requires orgId when counterpartyType=customer_org', async () => {
  await assert.rejects(
    () => baa.recordBAA({ counterpartyType: 'customer_org', partyName: 'Test Practice' }),
    /orgId required/
  );
});

test('recordBAA persists and listBAAs filters by counterparty type', async () => {
  const created = await baa.recordBAA({
    counterpartyType: 'ehr_vendor',
    partyName:        'Epic Systems Corporation',
    partyIdentifier:  'epic',
    executedAt:       '2026-01-15',
    scope:            'fhir_r4_phi',
  });
  assert.ok(created.id);
  assert.equal(created.counterpartyType, 'ehr_vendor');
  assert.equal(created.status, 'active');

  const all = await baa.listBAAs({ counterpartyType: 'ehr_vendor' });
  assert.ok(all.some((b) => b.id === created.id));
});

test('getOrgBAAStatus reports not_on_file when no active BAA exists', async () => {
  // Use a fresh fake orgId to avoid collisions with other tests.
  const orgId = '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0');
  const status = await baa.getOrgBAAStatus(orgId);
  assert.equal(status.baaRequired, true);
  assert.equal(status.baaOnFile, false);
  assert.equal(status.status, 'not_on_file');
  assert.match(status.message, /Business Associate Agreement/);
});

test('getOrgBAAStatus reports active when a customer_org BAA is on file', async () => {
  const orgId = '11111111-1111-4111-8111-' + Date.now().toString(16).padStart(12, '0');
  await baa.recordBAA({
    counterpartyType: 'customer_org',
    orgId,
    partyName:        'Test Group Practice LLC',
    executedAt:       '2026-03-01',
    expiresAt:        '2027-03-01',
  });
  const status = await baa.getOrgBAAStatus(orgId);
  assert.equal(status.baaOnFile, true);
  assert.equal(status.status, 'active');
});

test('revokeBAA flips status to revoked and excludes from active checks', async () => {
  const orgId = '22222222-2222-4222-8222-' + Date.now().toString(16).padStart(12, '0');
  const created = await baa.recordBAA({
    counterpartyType: 'customer_org',
    orgId,
    partyName:        'About-To-Revoke LLC',
  });
  const revoked = await baa.revokeBAA(created.id, 'duplicate entry');
  assert.equal(revoked.status, 'revoked');
  const status = await baa.getOrgBAAStatus(orgId);
  assert.equal(status.baaOnFile, false);
});

test('getVendorBAAStatus surfaces vendor-level posture', async () => {
  await baa.recordBAA({
    counterpartyType: 'ehr_vendor',
    partyName:        'athenahealth, Inc.',
    partyIdentifier:  'athena',
    executedAt:       '2026-02-01',
  });
  const status = await baa.getVendorBAAStatus('athena', 'ehr_vendor');
  assert.equal(status.baaOnFile, true);
  assert.equal(status.status, 'active');
});
