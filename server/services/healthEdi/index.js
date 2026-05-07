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

  upsertTradingPartner,
  listTradingPartners,
  getTradingPartner,
  deactivateTradingPartner,
  listSubmissionsForClaim,

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
