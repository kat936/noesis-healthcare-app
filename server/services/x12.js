/**
 * Noesis.io Health — X12 EDI 270 / 271 (Eligibility) primitives
 * © 2026 Athena Core Technologies, Inc.
 *
 * Standalone builder + parser for X12N 005010X279A1 (Eligibility Inquiry
 * and Response). This module has zero dependencies on the clearinghouse
 * service; it produces and consumes raw EDI strings so it can be reused
 * by `payerEligibility.js`, `clearinghouse.js`, and direct payer-portal
 * integrations.
 *
 * Spec references:
 *   X12N TR3   - 005010X279A1 (270/271)
 *   CMS guide  - HIPAA-Adopted Standards
 *
 * Note on PHI: the inputs and outputs of this module contain PHI by
 * definition. Callers MUST encrypt at rest and audit-log accesses
 * (`server/utils/encryption.js`, `server/middleware/auditLog.js`).
 */

const crypto = require('crypto');

const STANDARD_VERSION = '005010X279A1';
const SEGMENT_TERM = '~';
const ELEMENT_SEP  = '*';
const COMPONENT_SEP = ':';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(value, length, char = ' ', side = 'right') {
  const s = String(value ?? '');
  if (s.length >= length) return s.slice(0, length);
  return side === 'right' ? s.padEnd(length, char) : s.padStart(length, char);
}

function ymd(date) {
  const d = date instanceof Date ? date : new Date(date);
  return [
    d.getUTCFullYear().toString(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('');
}

function ymd2(date) {
  return ymd(date).slice(2);
}

function hm(date) {
  const d = date instanceof Date ? date : new Date(date);
  return [
    d.getUTCHours().toString().padStart(2, '0'),
    d.getUTCMinutes().toString().padStart(2, '0'),
  ].join('');
}

function nextControlNumber() {
  return crypto.randomInt(100000000, 999999999).toString();
}

// ── 270 Builder (Eligibility Inquiry) ───────────────────────────────────────

/**
 * Build a structurally valid X12 270 eligibility inquiry.
 *
 * @param {object} input
 * @param {object} input.sender    - { id, qualifier ('ZZ' default) }
 * @param {object} input.receiver  - { id, qualifier ('ZZ' default), name }
 * @param {object} input.provider  - { npi, name }
 * @param {object} input.subscriber - { memberId, firstName, lastName, dob }
 * @param {object} [input.dependent] - if dependent inquiry: { firstName, lastName, dob, relationship }
 * @param {string[]} [input.serviceTypes] - X12 service-type codes (default '30' = health benefit plan coverage)
 * @param {Date}     [input.serviceDate]  - date of service (default today)
 * @returns {{ edi: string, controlNumbers: { isa: string, gs: string, st: string } }}
 */
function build270(input) {
  if (!input?.sender?.id || !input?.receiver?.id) {
    throw new Error('build270: sender.id and receiver.id are required');
  }
  if (!input?.subscriber?.memberId) {
    throw new Error('build270: subscriber.memberId is required');
  }

  const isaCtrl = nextControlNumber();
  const gsCtrl  = nextControlNumber().slice(0, 9);
  const stCtrl  = '0001';

  const now = new Date();
  const senderQual   = input.sender.qualifier   || 'ZZ';
  const receiverQual = input.receiver.qualifier || 'ZZ';
  const serviceTypes = input.serviceTypes || ['30'];
  const serviceDate  = input.serviceDate ? ymd(input.serviceDate) : ymd(now);

  const segments = [];

  // Interchange envelope
  segments.push([
    'ISA', '00', pad('', 10), '00', pad('', 10),
    senderQual,   pad(input.sender.id,   15),
    receiverQual, pad(input.receiver.id, 15),
    ymd2(now), hm(now),
    '^', '00501', pad(isaCtrl, 9, '0', 'left'), '0', 'P', COMPONENT_SEP,
  ].join(ELEMENT_SEP) + SEGMENT_TERM);

  segments.push([
    'GS', 'HS', input.sender.id, input.receiver.id,
    ymd(now), hm(now), gsCtrl, 'X', STANDARD_VERSION,
  ].join(ELEMENT_SEP) + SEGMENT_TERM);

  segments.push(['ST', '270', stCtrl, STANDARD_VERSION].join(ELEMENT_SEP) + SEGMENT_TERM);
  segments.push(['BHT', '0022', '13', `BHT-${stCtrl}`, ymd(now), hm(now)].join(ELEMENT_SEP) + SEGMENT_TERM);

  // Loop 2000A: Information Source (payer)
  segments.push(['HL', '1', '', '20', '1'].join(ELEMENT_SEP) + SEGMENT_TERM);
  segments.push(['NM1', 'PR', '2', input.receiver.name || 'PAYER',
                 '', '', '', '', 'PI', input.receiver.id].join(ELEMENT_SEP) + SEGMENT_TERM);

  // Loop 2000B: Information Receiver (provider)
  segments.push(['HL', '2', '1', '21', '1'].join(ELEMENT_SEP) + SEGMENT_TERM);
  segments.push(['NM1', '1P', '2', input.provider?.name || 'PROVIDER',
                 '', '', '', '', 'XX', input.provider?.npi || ''].join(ELEMENT_SEP) + SEGMENT_TERM);

  // Loop 2000C: Subscriber
  const hasDep = !!input.dependent;
  segments.push(['HL', '3', '2', '22', hasDep ? '1' : '0'].join(ELEMENT_SEP) + SEGMENT_TERM);
  segments.push([
    'TRN', '1', `TRN-${stCtrl}`, input.sender.id,
  ].join(ELEMENT_SEP) + SEGMENT_TERM);
  segments.push([
    'NM1', 'IL', '1',
    (input.subscriber.lastName  || '').toUpperCase(),
    (input.subscriber.firstName || '').toUpperCase(),
    '', '', '', 'MI', input.subscriber.memberId,
  ].join(ELEMENT_SEP) + SEGMENT_TERM);
  if (input.subscriber.dob) {
    segments.push(['DMG', 'D8', ymd(input.subscriber.dob),
                   input.subscriber.gender || 'U'].join(ELEMENT_SEP) + SEGMENT_TERM);
  }
  segments.push(['DTP', '291', 'D8', serviceDate].join(ELEMENT_SEP) + SEGMENT_TERM);
  for (const st of serviceTypes) {
    segments.push(['EQ', st].join(ELEMENT_SEP) + SEGMENT_TERM);
  }

  // Loop 2000D: Dependent (optional)
  if (hasDep) {
    segments.push(['HL', '4', '3', '23', '0'].join(ELEMENT_SEP) + SEGMENT_TERM);
    segments.push([
      'NM1', '03', '1',
      (input.dependent.lastName  || '').toUpperCase(),
      (input.dependent.firstName || '').toUpperCase(),
    ].join(ELEMENT_SEP) + SEGMENT_TERM);
    if (input.dependent.dob) {
      segments.push(['DMG', 'D8', ymd(input.dependent.dob),
                     input.dependent.gender || 'U'].join(ELEMENT_SEP) + SEGMENT_TERM);
    }
    if (input.dependent.relationship) {
      segments.push(['INS', 'N', input.dependent.relationship].join(ELEMENT_SEP) + SEGMENT_TERM);
    }
  }

  // Trailers
  // SE count = number of segments between ST and SE inclusive
  const stIndex = segments.findIndex((s) => s.startsWith('ST*'));
  const insideST = segments.length - stIndex; // ST..(end), then +1 for SE
  segments.push(['SE', String(insideST + 1), stCtrl].join(ELEMENT_SEP) + SEGMENT_TERM);
  segments.push(['GE', '1', gsCtrl].join(ELEMENT_SEP) + SEGMENT_TERM);
  segments.push(['IEA', '1', pad(isaCtrl, 9, '0', 'left')].join(ELEMENT_SEP) + SEGMENT_TERM);

  return {
    edi: segments.join(''),
    controlNumbers: { isa: isaCtrl, gs: gsCtrl, st: stCtrl },
  };
}

// ── 271 Parser (Eligibility Response) ───────────────────────────────────────

/**
 * Parse an X12 271 eligibility response into a normalized JS object.
 * Robust to whitespace and line wrapping; validates segment terminator.
 *
 * @param {string} edi - raw 271 EDI text
 * @returns {object} normalized response
 */
function parse271(edi) {
  if (!edi || typeof edi !== 'string') {
    throw new Error('parse271: input must be a non-empty string');
  }
  // Sniff terminators from ISA (positions 103 = element sep terminator;
  // last byte before \n or end is segment terminator).
  const segTerm = edi.charAt(105) || SEGMENT_TERM;
  const elSep   = edi.charAt(3)   || ELEMENT_SEP;

  const segments = edi.split(segTerm).map((s) => s.trim()).filter(Boolean);
  const result = {
    standard: STANDARD_VERSION,
    senderId: null,
    receiverId: null,
    transactionDate: null,
    payer: null,
    provider: null,
    subscriber: { coverage: [], benefits: [] },
    dependent: null,
    eligibility: 'unknown',
    raw: { segmentCount: segments.length },
  };

  let currentLoop = null; // 'subscriber' | 'dependent'

  for (const seg of segments) {
    const els = seg.split(elSep);
    const id  = els[0];

    switch (id) {
      case 'ISA':
        result.senderId   = (els[6]  || '').trim();
        result.receiverId = (els[8]  || '').trim();
        break;
      case 'GS':
        result.transactionDate = els[4]; // CCYYMMDD
        break;
      case 'NM1':
        if (els[1] === 'PR') {
          result.payer = { name: els[3], id: els[9] };
        } else if (els[1] === '1P') {
          result.provider = { name: els[3], npi: els[9] };
        } else if (els[1] === 'IL') {
          currentLoop = 'subscriber';
          result.subscriber.lastName  = els[3];
          result.subscriber.firstName = els[4];
          result.subscriber.memberId  = els[9];
        } else if (els[1] === '03') {
          currentLoop = 'dependent';
          result.dependent = result.dependent || {};
          result.dependent.lastName  = els[3];
          result.dependent.firstName = els[4];
        }
        break;
      case 'DMG':
        if (currentLoop === 'subscriber') {
          result.subscriber.dob    = els[2];
          result.subscriber.gender = els[3];
        } else if (currentLoop === 'dependent') {
          result.dependent.dob    = els[2];
          result.dependent.gender = els[3];
        }
        break;
      case 'EB': {
        // Eligibility / Benefit Information segment — primary signal
        const eb = {
          code:       els[1], // '1' = active coverage, '6' = inactive, etc.
          coverageLevel: els[2],
          serviceType:   els[3],
          insuranceType: els[4],
          planDescription: els[5],
          timeQualifier:   els[6],
          monetaryAmount:  els[7] ? Number(els[7]) : null,
          percent:         els[8] ? Number(els[8]) : null,
        };
        if (eb.code === '1') result.eligibility = 'active';
        else if (eb.code === '6') result.eligibility = 'inactive';
        if (currentLoop === 'subscriber') {
          result.subscriber.benefits.push(eb);
        } else if (currentLoop === 'dependent') {
          (result.dependent.benefits ||= []).push(eb);
        }
        break;
      }
      case 'AAA': {
        // Request rejection — capture reason
        result.rejection = {
          validRequest: els[1] === 'Y',
          rejectReason: els[3],
          followUp:     els[4],
        };
        result.eligibility = 'rejected';
        break;
      }
      default:
        // Other segments retained in raw segment count only
        break;
    }
  }

  return result;
}

module.exports = {
  STANDARD_VERSION,
  build270,
  parse271,
};
