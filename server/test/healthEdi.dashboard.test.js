'use strict';

/**
 * EDI operations dashboard aggregation
 *   - empty org returns zeroed shape with all required keys
 *   - 837P submissions roll into byTransactionSet + throughputByMonth
 *   - non-terminal submissions populate AR aging buckets by claim age
 *   - denied responses produce ranked top-reasons
 *   - 835 totals roll into eraReconciliation.paidTotal
 *   - acceptanceRate / denialRate / rejectionRate computed correctly
 *   - missing orgId throws
 *
 * No DB required: tradingPartner falls back to its in-memory map when
 * DATABASE_URL is unset, which is the default in `npm test`.
 */

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY ||
  'a'.repeat(64);

const edi = require('../services/healthEdi');

const ORG_EMPTY = '00000000-0000-0000-0000-0000000000e1';
const ORG_FULL  = '00000000-0000-0000-0000-0000000000e2';

beforeEach(() => edi.partners._resetForTests());

function _backdate(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

test('dashboard: empty org returns zeroed shape with all keys', async () => {
  const d = await edi.getDashboard(ORG_EMPTY);
  assert.equal(typeof d.generatedAt, 'string');
  assert.equal(d.orgId, ORG_EMPTY);
  assert.deepEqual(d.totals.byTransactionSet, { '837P': 0, '276': 0, '277': 0, '835': 0 });
  assert.equal(d.totals.submissions,    0);
  assert.equal(d.totals.acceptanceRate, 0);
  assert.equal(d.totals.denialRate,     0);
  assert.equal(d.totals.rejectionRate,  0);
  assert.ok(Array.isArray(d.denialReasons));
  assert.equal(d.denialReasons.length, 0);
  assert.equal(d.partners.count, 0);
  assert.equal(d.eraReconciliation.billedTotal, 0);
  assert.equal(d.eraReconciliation.paidTotal,   0);
  assert.equal(d.arAging.openCount, 0);
  assert.equal(d.arAging.openAmount, 0);
  assert.ok(d.arAging.buckets['0_30']);
  assert.ok(d.arAging.buckets['120_plus']);
  assert.ok(typeof d.disclaimer === 'string' && d.disclaimer.includes('CAQH-certified'));
  assert.ok(d.standards && d.standards.envelope);
});

test('dashboard: 837P + 835 submissions roll up correctly', async () => {
  // Seed three 837P at varying ages, plus an 835 ERA, plus a denial
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'C-001', transactionSet: '837P',
    versionId: '005010X222A1', totalAmount: 250.00, status: 'submitted',
  });
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'C-002', transactionSet: '837P',
    versionId: '005010X222A1', totalAmount: 480.00, status: 'accepted',
  });
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'C-003', transactionSet: '837P',
    versionId: '005010X222A1', totalAmount: 175.50, status: 'denied',
  });
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'C-002', transactionSet: '835',
    versionId: '005010X221A1', totalAmount: 480.00, status: 'paid',
  });

  const d = await edi.getDashboard(ORG_FULL);
  assert.equal(d.totals.byTransactionSet['837P'], 3);
  assert.equal(d.totals.byTransactionSet['835'],  1);
  assert.equal(d.totals.submissions, 4);

  assert.equal(d.totals.byStatus['submitted'], 1);
  assert.equal(d.totals.byStatus['accepted'],  1);
  assert.equal(d.totals.byStatus['denied'],    1);
  assert.equal(d.totals.byStatus['paid'],      1);

  // 1 of 3 837P denied -> denialRate ~= 0.3333
  assert.ok(d.totals.denialRate > 0.30 && d.totals.denialRate < 0.34);

  // billedTotal = 250 + 480 + 175.50; paidTotal = 480
  assert.ok(Math.abs(d.eraReconciliation.billedTotal - 905.50) < 0.01);
  assert.equal(d.eraReconciliation.paidTotal, 480.00);
  assert.ok(d.eraReconciliation.paidPercentOfBilled > 0.5);

  // 837Ps that are not paid/denied/finalized count as open AR.
  // submitted (250) + accepted (480) = 2 open, 730.00 (denied is terminal)
  assert.equal(d.arAging.openCount, 2);
  assert.ok(Math.abs(d.arAging.openAmount - 730.00) < 0.01);

  // All freshly-submitted -> 0_30 bucket
  assert.equal(d.arAging.buckets['0_30'].count, 2);
});

test('dashboard: denial reasons ranked by frequency', async () => {
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'C-D1', transactionSet: '837P',
    versionId: '005010X222A1', totalAmount: 100, status: 'denied',
  });
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'C-D2', transactionSet: '837P',
    versionId: '005010X222A1', totalAmount: 100, status: 'denied',
  });
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'C-D3', transactionSet: '837P',
    versionId: '005010X222A1', totalAmount: 100, status: 'denied',
  });

  // Patch responseMessage on each via the public listAllSubmissions handle.
  const all = await edi.listAllSubmissions(ORG_FULL);
  // The mem-store rows are the same object references the dashboard reads,
  // so we can mutate in place.
  all[0].responseMessage = 'CO-29 The time limit for filing has expired';
  all[1].responseMessage = 'CO-29 The time limit for filing has expired';
  all[2].responseMessage = 'CO-97 Service is bundled into another procedure';

  const d = await edi.getDashboard(ORG_FULL);
  assert.equal(d.denialReasons.length, 2);
  assert.equal(d.denialReasons[0].count, 2);
  assert.match(d.denialReasons[0].reason, /CO-29/);
  assert.equal(d.denialReasons[1].count, 1);
});

test('dashboard: AR bucket assignment honors claim age', async () => {
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'AR-OLD', transactionSet: '837P',
    versionId: '005010X222A1', totalAmount: 1000, status: 'submitted',
  });
  // Mutate submittedAt to 95 days ago
  const all = await edi.listAllSubmissions(ORG_FULL);
  all[0].submittedAt = _backdate(95);

  const d = await edi.getDashboard(ORG_FULL);
  assert.equal(d.arAging.buckets['91_120'].count, 1);
  assert.equal(d.arAging.buckets['91_120'].totalAmount, 1000);
  assert.equal(d.arAging.openCount, 1);
});

test('dashboard: trading-partner status mix surfaces in partners.byStatus', async () => {
  await edi.upsertTradingPartner({
    orgId: ORG_FULL, partnerCode: 'OFFICEALLY', partnerName: 'Office Ally',
    senderId: 'NOESIS', receiverId: 'OFFICEALLY01', transport: 'rest',
    supportedSets: ['837P', '835'], status: 'active',
  });
  await edi.upsertTradingPartner({
    orgId: ORG_FULL, partnerCode: 'AVAILITY', partnerName: 'Availity',
    senderId: 'NOESIS', receiverId: 'AVAILITY01', transport: 'rest',
    supportedSets: ['837P', '835'], status: 'enrolling',
  });

  const d = await edi.getDashboard(ORG_FULL);
  assert.equal(d.partners.count, 2);
  assert.equal(d.partners.byStatus['active'], 1);
  assert.equal(d.partners.byStatus['enrolling'], 1);
});

test('dashboard: missing orgId throws', async () => {
  await assert.rejects(() => edi.getDashboard(''), /orgId required/);
});

test('listAllSubmissions: limit and transactionSets filters work', async () => {
  for (let i = 0; i < 5; i++) {
    await edi.partners.recordSubmission({
      orgId: ORG_FULL, claimId: 'L-' + i, transactionSet: '837P',
      versionId: '005010X222A1', totalAmount: 100 + i, status: 'submitted',
    });
  }
  await edi.partners.recordSubmission({
    orgId: ORG_FULL, claimId: 'L-ERA', transactionSet: '835',
    versionId: '005010X221A1', totalAmount: 250, status: 'paid',
  });
  const onlyEra = await edi.listAllSubmissions(ORG_FULL, { transactionSets: ['835'] });
  assert.equal(onlyEra.length, 1);
  assert.equal(onlyEra[0].transactionSet, '835');

  const capped = await edi.listAllSubmissions(ORG_FULL, { limit: 3 });
  assert.equal(capped.length, 3);
});

