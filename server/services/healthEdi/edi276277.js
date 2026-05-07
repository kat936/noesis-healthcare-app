/**
 * Noesis.io Health  - X12N 276 / 277 Claim Status Inquiry & Response
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Implementation of ASC X12N 005010X212.
 *
 *   276 - Information Receiver (provider) -> Information Source (payer):
 *         "what is the status of this claim?"
 *
 *   277 - Information Source (payer) -> Information Receiver (provider):
 *         status response, including STC (Status Category Code) +
 *         Status Reason Code categories.
 *
 * Spec reference (loops per the 276/277 TR3):
 *   276 Builder loops:
 *     2000A Information Source (payer):                  HL*1**20
 *       2100A NM1*PR (Payer)
 *     2000B Information Receiver (provider):              HL*2*1*21
 *       2100B NM1*1P (Provider)
 *     2000C Subscriber:                                   HL*3*2*22
 *       2100C NM1*IL (Subscriber)
 *     2000D Service-line Status (claim level):            HL*4*3*PT
 *       2200D TRN + REF*BLT/EJ + AMT*T3 + DTP*472
 *
 *   277 Parser categorizes each STC into a normalized status:
 *     A0=accepted, A1=acknowledged, A2=accepted/processing, A3=returned,
 *     A4=denied, A5=split, A6=rejected, A7=acknowledged/rejected, etc.
 *
 * Reference: CMS HIPAA-Adopted Standards.
 */

'use strict';

const env = require('./x12Envelope');

const VERSION_ID = '005010X212';

// ── 276 builder ──────────────────────────────────────────────────────────────

/**
 * Build a 276 Health Care Claim Status Inquiry envelope.
 *
 * @param {object} input
 * @param {object} input.submitter   - { id, name }
 * @param {object} input.receiver    - { id, name }
 * @param {object} input.payer       - { name, payerId }
 * @param {object} input.provider    - { name, npi }
 * @param {object} input.subscriber  - { lastName, firstName, memberId }
 * @param {object} input.claim       - { trackingId, claimAmount?, serviceDate? }
 * @param {object} [input.envelope]
 * @returns {{ edi:string, controlNumbers:object, segmentCount:number }}
 */
function build276(input) {
  _validate276Input(input);
  const segments = [];
  const now = new Date();

  segments.push(env.writeSegment([
    'BHT', '0010', '13',
    'BHT-' + (input.claim.trackingId || env.nextControlNumber9()),
    env.ymd(now), env.hm(now),
  ]));

  // 2000A Information Source (payer)
  segments.push(env.writeSegment(['HL', '1', '', '20', '1']));
  segments.push(env.writeSegment([
    'NM1', 'PR', '2', String(input.payer.name).toUpperCase().slice(0, 60),
    '', '', '', '', 'PI', input.payer.payerId,
  ]));

  // 2000B Information Receiver (provider)
  segments.push(env.writeSegment(['HL', '2', '1', '21', '1']));
  segments.push(env.writeSegment([
    'NM1', '1P', '2', String(input.provider.name).toUpperCase().slice(0, 60),
    '', '', '', '', 'XX', input.provider.npi,
  ]));

  // 2000C Subscriber
  segments.push(env.writeSegment(['HL', '3', '2', '22', '0']));
  segments.push(env.writeSegment([
    'NM1', 'IL', '1',
    String(input.subscriber.lastName).toUpperCase(),
    String(input.subscriber.firstName).toUpperCase(),
    '', '', '', 'MI', input.subscriber.memberId,
  ]));

  // 2200D TRN (claim trace)
  segments.push(env.writeSegment([
    'TRN', '1', String(input.claim.trackingId), input.submitter.id,
  ]));
  if (Number.isFinite(input.claim.claimAmount)) {
    segments.push(env.writeSegment(['AMT', 'T3', Number(input.claim.claimAmount).toFixed(2)]));
  }
  if (input.claim.serviceDate) {
    segments.push(env.writeSegment(['DTP', '472', 'D8', _onlyDigits(input.claim.serviceDate)]));
  }

  const envInput = {
    interchange: {
      senderId:       (input.envelope && input.envelope.senderId)   || input.submitter.id,
      receiverId:     (input.envelope && input.envelope.receiverId) || input.receiver.id,
      usageIndicator: (input.envelope && input.envelope.usageIndicator) || 'T',
      controlNumber:  input.envelope && input.envelope.isaControl,
      date:           now,
    },
    functionalGroup: {
      transactionSet: '276',
      versionId:      VERSION_ID,
      controlNumber:  input.envelope && input.envelope.gsControl,
      date:           now,
    },
    transaction: {
      transactionSet: '276',
      versionId:      VERSION_ID,
      controlNumber:  input.envelope && input.envelope.stControl,
    },
    body: segments,
  };

  const result = env.buildEnvelope(envInput);
  return {
    edi: result.edi,
    controlNumbers: result.controlNumbers,
    segmentCount: segments.length + 2,
    versionId: VERSION_ID,
  };
}

function _validate276Input(input) {
  if (!input)             { throw new Error('build276: input required'); }
  for (const k of ['submitter', 'receiver', 'payer', 'provider', 'subscriber', 'claim']) {
    if (!input[k])        { throw new Error(`build276: input.${k} required`); }
  }
  if (!input.claim.trackingId) {
    throw new Error('build276: claim.trackingId required');
  }
  if (input.subscriber && (!input.subscriber.memberId || !input.subscriber.lastName || !input.subscriber.firstName)) {
    throw new Error('build276: subscriber.memberId, lastName, firstName required');
  }
  if (input.provider && !/^\d{10}$/.test(String(input.provider.npi))) {
    throw new Error('build276: provider.npi must be 10 digits');
  }
}

// ── 277 parser ───────────────────────────────────────────────────────────────

/**
 * Map STC01 (status category code) to a normalized status string.
 * Categories per ASC X12 005010X212. The full code set lives in the X12
 * external code list; this mapping covers the categories Noesis surfaces.
 */
const STATUS_CATEGORY = Object.freeze({
  A0: 'acknowledged',
  A1: 'acknowledged',
  A2: 'accepted_processing',
  A3: 'returned_unprocessable',
  A4: 'not_found',
  A5: 'split',
  A6: 'rejected',
  A7: 'rejected',
  A8: 'rejected',
  P0: 'pending',
  P1: 'pending',
  P2: 'pending_payer_review',
  P3: 'pending_provider',
  P4: 'pending_patient_info',
  P5: 'pending_attachment',
  F0: 'finalized',
  F1: 'finalized_paid',
  F2: 'finalized_denied',
  F3: 'finalized_revised',
  F3F: 'finalized_revised',
  F4: 'finalized_partial_payment',
  R0: 'requested_information',
});

/**
 * Parse a 277 Claim Status Response back into normalized JS objects.
 *
 * @param {string} edi
 * @returns {{ versionId:?string, payer:?object, provider:?object, claims:object[] }}
 */
function parse277(edi) {
  if (!edi || typeof edi !== 'string') {
    throw new Error('parse277: edi must be a non-empty string');
  }
  const { segments } = env.parseSegments(edi);
  const out = {
    versionId: null,
    payer:     null,
    provider:  null,
    claims:    [],
  };
  let currentClaim = null;

  for (const seg of segments) {
    const id = seg[0];
    switch (id) {
      case 'GS': out.versionId = seg[8]; break;
      case 'NM1': {
        const ent = seg[1];
        if (ent === 'PR')      { out.payer    = { name: seg[3], payerId: seg[9] }; }
        else if (ent === '1P') { out.provider = { name: seg[3], npi: seg[9] };     }
        else if (ent === 'IL') {
          currentClaim = {
            subscriber: { lastName: seg[3], firstName: seg[4], memberId: seg[9] },
            statuses: [],
            trace: null,
            patientControlNumber: null,
            payerClaimControlNumber: null,
            claimAmount: null,
            paidAmount:  null,
            adjudicationDate: null,
          };
          out.claims.push(currentClaim);
        }
        break;
      }
      case 'TRN':
        if (currentClaim) {
          currentClaim.trace = { qualifier: seg[1], referenceId: seg[2], originatingCompany: seg[3] };
        }
        break;
      case 'STC': {
        if (!currentClaim) { break; }
        // Per ASC X12N 005010X212 STC layout:
        //   STC01 = Health Care Claim Status composite (category:reason:entity)
        //   STC02 = Status Information Effective Date
        //   STC03 = Action Code
        //   STC04 = Total Submitted Charges
        //   STC05 = Total Submitted Amount Paid
        //   STC06 = Adjudication or Payment Date
        //   STC11 = Free-form message
        const composite = String(seg[1] || '').split(':');
        const category = composite[0] || null;
        const reason   = composite[1] || null;
        const entity   = composite[2] || null;
        const charged  = seg[4] !== undefined && seg[4] !== '' ? Number(seg[4]) : null;
        const paid     = seg[5] !== undefined && seg[5] !== '' ? Number(seg[5]) : null;
        currentClaim.statuses.push({
          category,
          reason,
          entity,
          status: STATUS_CATEGORY[category] || 'unknown',
          effectiveDate:    seg[2] || null,
          actionCode:       seg[3] || null,
          totalCharged:     Number.isFinite(charged) ? charged : null,
          totalPaid:        Number.isFinite(paid)    ? paid    : null,
          adjudicationDate: seg[6] || null,
          freeForm:         seg[11] || null,
        });
        break;
      }
      case 'REF':
        if (!currentClaim) { break; }
        if (seg[1] === '1K') { currentClaim.payerClaimControlNumber = seg[2]; }
        if (seg[1] === 'EJ') { currentClaim.patientControlNumber    = seg[2]; }
        break;
      case 'DTP':
        if (currentClaim && seg[1] === '472') { currentClaim.adjudicationDate = seg[3]; }
        break;
      case 'AMT':
        if (!currentClaim) { break; }
        if (seg[1] === 'T3') { currentClaim.claimAmount = Number(seg[2]); }
        if (seg[1] === 'YU') { currentClaim.paidAmount  = Number(seg[2]); }
        break;
      default:
        break;
    }
  }

  // Promote the most recent status to a top-level field per claim
  for (const c of out.claims) {
    c.lastStatus = c.statuses.length ? c.statuses[c.statuses.length - 1] : null;
    c.normalizedStatus = c.lastStatus ? c.lastStatus.status : 'unknown';
  }

  return out;
}

function _onlyDigits(s) {
  return String(s).replace(/\D/g, '');
}

module.exports = {
  VERSION_ID,
  STATUS_CATEGORY,
  build276,
  parse277,
};
