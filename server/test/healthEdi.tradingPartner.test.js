'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY ||
  'a'.repeat(64);

const partners = require('../services/healthEdi/tradingPartner');

const ORG = '00000000-0000-0000-0000-000000000010';

test('upsertTradingPartner persists with encrypted secrets (round-trip)', async () => {
  partners._resetForTests();
  const summary = await partners.upsertTradingPartner({
    orgId:        ORG,
    partnerCode:  'OFFICEALLY',
    partnerName:  'Office Ally',
    partnerType:  'clearinghouse',
    senderId:     'NOESISTEST',
    receiverId:   'OFFICEALLY01',
    transport:    'rest',
    endpointUrl:  'https://api.officeally.example/edi',
    apiKey:       'pub-key-123',
    apiSecret:    'super-secret-value',
    supportedSets: ['837P', '276', '835'],
    usageIndicator: 'T',
    status:       'enrolling',
  });
  assert.equal(summary.partnerCode, 'OFFICEALLY');
  assert.equal(summary.transport, 'rest');
  assert.equal(summary.supportedSets.length, 3);
  // Summary must NOT include credentials
  assert.ok(!('apiSecret' in summary));

  const fetched = await partners.getTradingPartner(ORG, 'officeally');
  assert.equal(fetched.partnerCode, 'OFFICEALLY');
  assert.equal(fetched.apiSecret, 'super-secret-value',
    'apiSecret should round-trip through encryption');
  assert.equal(fetched.apiKey, 'pub-key-123');
});

test('upsertTradingPartner is idempotent on (org, partnerCode)', async () => {
  partners._resetForTests();
  await partners.upsertTradingPartner({
    orgId: ORG, partnerCode: 'CHC', partnerName: 'Change Healthcare',
    senderId: 'A', receiverId: 'B', supportedSets: ['837P'],
  });
  await partners.upsertTradingPartner({
    orgId: ORG, partnerCode: 'CHC', partnerName: 'Change Healthcare (Updated)',
    senderId: 'A', receiverId: 'B2', supportedSets: ['837P', '835'],
  });
  const fetched = await partners.getTradingPartner(ORG, 'CHC');
  assert.equal(fetched.partnerName, 'Change Healthcare (Updated)');
  assert.equal(fetched.receiverId, 'B2');
  assert.equal(fetched.supportedSets.length, 2);
});

test('upsertTradingPartner rejects unknown transport types', async () => {
  partners._resetForTests();
  await assert.rejects(
    partners.upsertTradingPartner({
      orgId: ORG, partnerCode: 'X', partnerName: 'X',
      senderId: 'A', receiverId: 'B', transport: 'pigeon',
    }),
    /transport must be one of/
  );
});

test('upsertTradingPartner rejects unsupported transaction sets', async () => {
  partners._resetForTests();
  await assert.rejects(
    partners.upsertTradingPartner({
      orgId: ORG, partnerCode: 'X', partnerName: 'X',
      senderId: 'A', receiverId: 'B', supportedSets: ['837Q'],
    }),
    /supportedSet "837Q" not in/
  );
});

test('listTradingPartners returns summaries (no credentials)', async () => {
  partners._resetForTests();
  await partners.upsertTradingPartner({
    orgId: ORG, partnerCode: 'P1', partnerName: 'P1',
    senderId: 'A', receiverId: 'B', apiSecret: 'leak-me',
  });
  await partners.upsertTradingPartner({
    orgId: ORG, partnerCode: 'P2', partnerName: 'P2',
    senderId: 'A', receiverId: 'B',
  });
  const list = await partners.listTradingPartners(ORG);
  assert.equal(list.length, 2);
  for (const p of list) {
    assert.ok(!('apiSecret' in p), 'list summaries must not include apiSecret');
    assert.ok(!('sftpPassword' in p));
  }
});

test('deactivateTradingPartner clears credentials and sets status disabled', async () => {
  partners._resetForTests();
  await partners.upsertTradingPartner({
    orgId: ORG, partnerCode: 'P1', partnerName: 'P1',
    senderId: 'A', receiverId: 'B', apiSecret: 'sec',
  });
  await partners.deactivateTradingPartner(ORG, 'P1');
  const after = await partners.getTradingPartner(ORG, 'P1');
  assert.equal(after.status, 'disabled');
  assert.equal(after.apiSecret, null);
});

test('recordSubmission + listSubmissionsForClaim round-trip a submission', async () => {
  partners._resetForTests();
  await partners.recordSubmission({
    orgId: ORG, claimId: 'CLM-001', transactionSet: '837P',
    versionId: '005010X222A1',
    controlNumbers: { isa: '000000123', gs: '1', st: '0001' },
    totalAmount: 150.00, trackingId: '000000123',
  });
  const list = await partners.listSubmissionsForClaim(ORG, 'CLM-001');
  assert.equal(list.length, 1);
  assert.equal(list[0].transactionSet, '837P');
  assert.equal(list[0].versionId, '005010X222A1');
  assert.equal(list[0].controlNumbers.isa, '000000123');
  assert.equal(list[0].totalAmount, 150.00);
});
