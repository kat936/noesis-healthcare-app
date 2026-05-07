/**
 * Noesis.io Health  - EDI orchestration facade
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Public surface for the X12 EDI feature. Routes import only this module:
 *
 *   - getStatus()                       - feature status + standards refs
 *   - upsertTradingPartner()            - register / update partner
 *   - listTradingPartners()             - org-scoped catalog
 *   - getTradingPartner()               - decrypted credentials for use
 *   - deactivateTradingPartner()        - soft delete
 *   - submit837P({ orgId, partnerCode, ... })  - build + persist 837P
 *   - build276()                         - inquire claim status (callers
 *                                          are responsible for actually
 *                                          submitting via the partner
 *                                          transport)
 *   - parse277(edi) / parse835(edi)
 */

'use strict';

const env       = require('./x12Envelope');
const edi837p   = require('./edi837p');
const edi276277 = require('./edi276277');
const edi835    = require('./edi835');
const partners  = require('./tradingPartner');

const STANDARDS = Object.freeze({
  envelope: 'ASC X12N 005010',
  '837P':   edi837p.VERSION_ID,
  '276/277': edi276277.VERSION_ID,
  '835':    edi835.VERSION_ID,
});

function getStatus() {
  return {
    standards: STANDARDS,
    transactionSets: ['837P', '276', '277', '835'],
    transports:      partners.TRANSPORT_TYPES,
    encryptionKeyConfigured: !!process.env.PHI_ENCRYPTION_KEY,
    disclaimer:
      'EDI transactions are formatted to ASC X12N 005010 specifications. ' +
      'Production submission requires enrollment with a CAQH-certified ' +
      'clearinghouse (Office Ally, Change Healthcare, Availity, Waystar) or ' +
      'direct payer EDI gateway. This module ships the X12 builder, parser, ' +
      'and trading-partner registry; clearinghouse certification, payer ' +
      'enrollment matrices, and Business Associate Agreements are a separate ' +
      'parallel track.',
  };
}

// ── Trading partners pass-through ────────────────────────────────────────────

const upsertTradingPartner   = partners.upsertTradingPartner;
const listTradingPartners    = partners.listTradingPartners;
const getTradingPartner      = partners.getTradingPartner;
const deactivateTradingPartner = partners.deactivateTradingPartner;
const listSubmissionsForClaim = partners.listSubmissionsForClaim;
const listAllSubmissions      = partners.listAllSubmissions;

// ── Dashboard aggregation ────────────────────────────────────────────────────

const AR_BUCKETS = Object.freeze([
  { key: '0_30',    label: '0 to 30 days',    minDays: 0,   maxDays: 30 },
  { key: '31_60',   label: '31 to 60 days',   minDays: 31,  maxDays: 60 },
  { key: '61_90',   label: '61 to 90 days',   minDays: 61,  maxDays: 90 },
  { key: '91_120',  label: '91 to 120 days',  minDays: 91,  maxDays: 120 },
  { key: '120_plus', label: 'Over 120 days',   minDays: 121, maxDays: Infinity },
]);

const TERMINAL_STATES = new Set(['paid', 'denied', 'finalized', 'closed']);

function _arBucketForDays(days) {
  for (const b of AR_BUCKETS) {
    if (days >= b.minDays && days <= b.maxDays) { return b.key; }
  }
  return '120_plus';
}

function _emptyArBuckets() {
  const out = {};
  for (const b of AR_BUCKETS) { out[b.key] = { count: 0, totalAmount: 0 }; }
  return out;
}

function _emptyMonthMap(months) {
  const out = {};
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out[key] = 0;
  }
  return out;
}

/**
 * Build a claims-pipeline snapshot for an organization. Aggregates the
 * persisted submission ledger into the shape an operations dashboard needs.
 *
 * Output:
 *   - totals.byTransactionSet   (837P / 276 / 277 / 835 counts)
 *   - totals.byStatus           (submitted / accepted / rejected / paid / denied / ...)
 *   - throughputByMonth         (last 12 months of 837P count)
 *   - arAging                   (5 buckets: 0-30, 31-60, 61-90, 91-120, 120+)
 *   - denialReasons             (top responseMessage values where status='denied')
 *   - eraReconciliation         (total billed vs total paid against 835)
 *   - partners.count, partners.byStatus
 *
 * @param {string} orgId
 * @param {object} [options]
 * @param {number} [options.throughputMonths=12]
 * @param {number} [options.topDenialReasons=10]
 * @returns {Promise<object>}
 */
async function getDashboard(orgId, options) {
  if (!orgId) { throw new Error('getDashboard: orgId required'); }
  const throughputMonths  = (options && options.throughputMonths) || 12;
  const topDenialReasons  = (options && options.topDenialReasons) || 10;
  const now               = Date.now();

  await partners.ensureSchema();

  const [partnerList, submissions] = await Promise.all([
    partners.listTradingPartners(orgId),
    partners.listAllSubmissions(orgId, { limit: 5000 }),
  ]);

  const byTransactionSet = { '837P': 0, '276': 0, '277': 0, '835': 0 };
  const byStatus         = {};
  const arBuckets        = _emptyArBuckets();
  const denialCounts     = new Map();
  const throughputByMonth = _emptyMonthMap(throughputMonths);

  let billedTotal = 0;
  let paidTotal   = 0;
  let openCount   = 0;
  let openAmount  = 0;

  for (const s of submissions) {
    const set = String(s.transactionSet || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(byTransactionSet, set)) {
      byTransactionSet[set] += 1;
    }

    const status = String(s.status || 'unknown').toLowerCase();
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (set === '837P' && s.submittedAt) {
      const d = new Date(s.submittedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (Object.prototype.hasOwnProperty.call(throughputByMonth, key)) {
        throughputByMonth[key] += 1;
      }

      const amount = Number(s.totalAmount) || 0;
      billedTotal += amount;

      if (!TERMINAL_STATES.has(status)) {
        const ageDays = Math.max(0, Math.floor((now - d.getTime()) / (24 * 60 * 60 * 1000)));
        const bucket = _arBucketForDays(ageDays);
        arBuckets[bucket].count += 1;
        arBuckets[bucket].totalAmount += amount;
        openCount += 1;
        openAmount += amount;
      }
    }

    if (set === '835' && Number.isFinite(Number(s.totalAmount))) {
      paidTotal += Number(s.totalAmount);
    }

    if (status === 'denied' && s.responseMessage) {
      const reason = String(s.responseMessage).slice(0, 120);
      denialCounts.set(reason, (denialCounts.get(reason) || 0) + 1);
    }
  }

  const partnerByStatus = {};
  for (const p of partnerList) {
    const ps = String(p.status || 'unknown').toLowerCase();
    partnerByStatus[ps] = (partnerByStatus[ps] || 0) + 1;
  }

  const denials = Array.from(denialCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topDenialReasons);

  const totalDenied   = byStatus['denied'] || 0;
  const totalAccepted = byStatus['accepted'] || 0;
  const totalRejected = byStatus['rejected'] || 0;
  const totalSubmitted = byTransactionSet['837P'];
  const denialRate = totalSubmitted > 0
    ? Number((totalDenied / totalSubmitted).toFixed(4))
    : 0;
  const acceptanceRate = totalSubmitted > 0
    ? Number(((totalAccepted + (byStatus['paid'] || 0)) / totalSubmitted).toFixed(4))
    : 0;
  const rejectionRate = totalSubmitted > 0
    ? Number((totalRejected / totalSubmitted).toFixed(4))
    : 0;

  return {
    generatedAt: new Date(now).toISOString(),
    orgId,
    standards: STANDARDS,
    totals: {
      submissions:        submissions.length,
      byTransactionSet,
      byStatus,
      acceptanceRate,
      denialRate,
      rejectionRate,
    },
    throughputByMonth,
    arAging: {
      buckets: arBuckets,
      bucketDefinitions: AR_BUCKETS.map((b) => ({ key: b.key, label: b.label })),
      openCount,
      openAmount: Number(openAmount.toFixed(2)),
    },
    denialReasons: denials,
    eraReconciliation: {
      billedTotal: Number(billedTotal.toFixed(2)),
      paidTotal:   Number(paidTotal.toFixed(2)),
      paidPercentOfBilled: billedTotal > 0
        ? Number((paidTotal / billedTotal).toFixed(4))
        : 0,
    },
    partners: {
      count:    partnerList.length,
      byStatus: partnerByStatus,
    },
    disclaimer:
      'EDI dashboard for educational and development use. Production submission ' +
      'requires enrollment with a CAQH-certified clearinghouse (Office Ally, ' +
      'Change Healthcare, Availity, Waystar) or direct payer EDI gateway, plus ' +
      'a Business Associate Agreement (BAA). Data shown reflects synthetic ' +
      'test traffic unless live trading partners are configured.',
  };
}

// ── 837P submission ─────────────────────────────────────────────────────────

/**
 * Build an 837P envelope and persist a submission record. Does NOT push the
 * EDI to the clearinghouse - that step depends on partner transport (REST,
 * SFTP, AS2) and lives outside this module. The returned object includes
 * the EDI string so the caller can post it through whichever transport is
 * configured for the partner.
 *
 * @param {object} input
 * @param {string} input.orgId
 * @param {string} input.partnerCode  - resolved via tradingPartner registry
 * @param {object} input.submitter
 * @param {object} input.receiver
 * @param {object} input.billingProvider
 * @param {object} input.subscriber
 * @param {object} input.payer
 * @param {object} input.claim
 * @param {string[]} input.diagnoses
 * @param {object[]} input.serviceLines
 * @returns {Promise<object>}
 */
async function submit837P(input) {
  if (!input || !input.orgId || !input.partnerCode || !input.claim) {
    throw new Error('submit837P: orgId, partnerCode, claim required');
  }
  await partners.ensureSchema();

  const partner = await partners.getTradingPartner(input.orgId, input.partnerCode);
  if (!partner) {
    const err = new Error('Unknown trading partner "' + input.partnerCode + '"');
    err.code = 'EDI_PARTNER_NOT_FOUND';
    throw err;
  }
  if (partner.status === 'disabled') {
    const err = new Error('Trading partner "' + input.partnerCode + '" is disabled');
    err.code = 'EDI_PARTNER_DISABLED';
    throw err;
  }
  if (partner.supportedSets.length && !partner.supportedSets.includes('837P')) {
    const err = new Error('Trading partner "' + input.partnerCode + '" does not support 837P');
    err.code = 'EDI_PARTNER_UNSUPPORTED';
    throw err;
  }

  const submitter = input.submitter || {
    id:   partner.senderId,
    name: partner.partnerName + ' SUBMITTER',
  };
  const receiver = input.receiver || {
    id:   partner.receiverId,
    name: partner.partnerName,
  };

  const built = edi837p.build837P({
    submitter,
    receiver,
    billingProvider: input.billingProvider,
    subscriber:      input.subscriber,
    payer:           input.payer,
    claim:           input.claim,
    diagnoses:       input.diagnoses,
    serviceLines:    input.serviceLines,
    envelope: {
      senderId:       partner.senderId,
      receiverId:     partner.receiverId,
      usageIndicator: partner.usageIndicator,
    },
  });

  const submission = await partners.recordSubmission({
    orgId:          input.orgId,
    partnerId:      partner.id,
    claimId:        input.claim.id,
    transactionSet: '837P',
    versionId:      built.versionId,
    controlNumbers: built.controlNumbers,
    totalAmount:    built.totalAmount,
    trackingId:     built.controlNumbers.isa,
  });

  return {
    success:        true,
    submissionId:   submission.id,
    submittedAt:    submission.submittedAt,
    trackingId:     built.controlNumbers.isa,
    controlNumbers: built.controlNumbers,
    totalAmount:    built.totalAmount,
    versionId:      built.versionId,
    segmentCount:   built.segmentCount,
    edi:            built.edi,
    transport:      partner.transport,
    endpointUrl:    partner.endpointUrl,
  };
}

/**
 * Build a 276 inquiry for a previously-submitted claim.
 *
 * @param {object} input - { orgId, partnerCode, payer, provider, subscriber, claim }
 */
async function buildClaimStatusInquiry(input) {
  if (!input || !input.orgId || !input.partnerCode) {
    throw new Error('buildClaimStatusInquiry: orgId, partnerCode required');
  }
  const partner = await partners.getTradingPartner(input.orgId, input.partnerCode);
  if (!partner) {
    const err = new Error('Unknown trading partner "' + input.partnerCode + '"');
    err.code = 'EDI_PARTNER_NOT_FOUND';
    throw err;
  }
  const built = edi276277.build276({
    submitter:  { id: partner.senderId,   name: partner.partnerName + ' SUBMITTER' },
    receiver:   { id: partner.receiverId, name: partner.partnerName },
    payer:      input.payer,
    provider:   input.provider,
    subscriber: input.subscriber,
    claim:      input.claim,
    envelope: {
      senderId:       partner.senderId,
      receiverId:     partner.receiverId,
      usageIndicator: partner.usageIndicator,
    },
  });
  return {
    success:        true,
    edi:            built.edi,
    controlNumbers: built.controlNumbers,
    versionId:      built.versionId,
    segmentCount:   built.segmentCount,
  };
}

const parse277 = edi276277.parse277;
const parse835 = edi835.parse835;
const parse837P = edi837p.parse837P;

module.exports = {
  STANDARDS,
  getStatus,
  getDashboard,

  upsertTradingPartner,
  listTradingPartners,
  getTradingPartner,
  deactivateTradingPartner,
  listSubmissionsForClaim,
  listAllSubmissions,

  submit837P,
  buildClaimStatusInquiry,

  parse277,
  parse835,
  parse837P,

  // re-exports for downstream callers that want low-level access
  envelope: env,
  edi837p,
  edi276277,
  edi835,
  partners,
};
