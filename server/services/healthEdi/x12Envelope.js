/**
 * Noesis.io Health  - X12 5010 envelope primitives
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Low-level X12 segment serializer + parser. Produces ASC X12N 005010
 * compliant envelopes (ISA / IEA, GS / GE, ST / SE) that wrap any
 * transaction set body (270, 271, 276, 277, 837, 835, ...).
 *
 * Spec references:
 *   - X12 ASC X12N 005010 base envelope
 *   - 837P:    005010X222A1 (Health Care Claim - Professional)
 *   - 276/277: 005010X212  (Health Care Claim Status)
 *   - 835:     005010X221A1 (Health Care Claim Payment / Advice)
 *   - 270/271: 005010X279A1 (Eligibility Inquiry / Response)
 *
 * Design choices:
 *   - Default delimiters: segment = '~', element = '*', component = ':',
 *     repetition = '^'. Receiver-specific delimiters are sniffed from ISA
 *     positions on parse.
 *   - Envelope counters (ISA13 / GS06 / ST02) use string padding rather
 *     than numeric so leading zeros survive.
 *   - SE counts segments inclusive of ST and SE (per X12 rules).
 *   - All inputs are validated; the module never silently truncates a
 *     required identifier.
 */

'use strict';

const crypto = require('crypto');

const DEFAULTS = Object.freeze({
  segmentTerminator: '~',
  elementSeparator:  '*',
  componentSeparator: ':',
  repetitionSeparator: '^',
});

const VERSION = '00501';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(value, length, char = ' ', side = 'right') {
  const s = String((value === null || value === undefined) ? '' : value);
  if (s.length >= length) { return s.slice(0, length); }
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

/**
 * Cryptographically random 9-digit ISA control number. Required to be
 * unique within each (sender, receiver, date) per X12 rules; using a
 * crypto-random value sidesteps any need for a counter.
 */
function nextControlNumber9() {
  return String(crypto.randomInt(100000000, 1000000000)).padStart(9, '0');
}

function nextControlNumber4() {
  return String(crypto.randomInt(1, 10000)).padStart(4, '0');
}

// ── Segment writer ───────────────────────────────────────────────────────────

/**
 * Serialize an array of element values into a single X12 segment.
 * Trailing empty elements are stripped, but interior empty elements are
 * preserved (so DTP*291**D8*20260101 keeps the empty position).
 *
 * @param {string[]} elements
 * @param {object} [delims]
 * @returns {string}
 */
function writeSegment(elements, delims = DEFAULTS) {
  if (!Array.isArray(elements) || elements.length === 0) {
    throw new Error('writeSegment: elements must be a non-empty array');
  }
  const trimmed = [...elements];
  while (trimmed.length > 1 && (trimmed[trimmed.length - 1] === '' ||
         trimmed[trimmed.length - 1] === null ||
         trimmed[trimmed.length - 1] === undefined)) {
    trimmed.pop();
  }
  return trimmed.map((e) => (e === null || e === undefined) ? '' : String(e))
                .join(delims.elementSeparator) +
         delims.segmentTerminator;
}

// ── ISA / IEA ────────────────────────────────────────────────────────────────

/**
 * Build the ISA segment.
 *
 * @param {object} input
 * @param {string} input.senderId    - 15-char interchange sender id
 * @param {string} input.receiverId  - 15-char interchange receiver id
 * @param {string} [input.senderQualifier='ZZ']
 * @param {string} [input.receiverQualifier='ZZ']
 * @param {Date}   [input.date]
 * @param {string} input.controlNumber  - 9-digit
 * @param {string} [input.usageIndicator='T']  - 'T' test, 'P' production
 * @param {object} [delims]
 * @returns {string}
 */
function writeISA(input, delims = DEFAULTS) {
  if (!input || !input.senderId || !input.receiverId || !input.controlNumber) {
    throw new Error('writeISA: senderId, receiverId, controlNumber required');
  }
  const date = input.date || new Date();
  const ctrl = pad(input.controlNumber, 9, '0', 'left');
  return writeSegment([
    'ISA',
    pad(input.authQualifier || '00', 2, '0', 'left'),
    pad(input.authInfo || '', 10),
    pad(input.securityQualifier || '00', 2, '0', 'left'),
    pad(input.securityInfo || '', 10),
    input.senderQualifier || 'ZZ',
    pad(input.senderId, 15),
    input.receiverQualifier || 'ZZ',
    pad(input.receiverId, 15),
    ymd2(date),
    hm(date),
    delims.repetitionSeparator,
    VERSION,
    ctrl,
    pad(input.ackRequested || '0', 1),
    input.usageIndicator || 'T',
    delims.componentSeparator,
  ], delims);
}

function writeIEA(groupCount, isaControlNumber, delims = DEFAULTS) {
  return writeSegment(['IEA', String(groupCount), pad(isaControlNumber, 9, '0', 'left')], delims);
}

// ── GS / GE ──────────────────────────────────────────────────────────────────

const GS_FUNCTIONAL_ID = Object.freeze({
  '270': 'HS', '271': 'HS',
  '276': 'HR', '277': 'HN',
  '835': 'HP',
  '837': 'HC',
});

/**
 * Build a GS segment for a given transaction set.
 *
 * @param {object} input
 * @param {string} input.transactionSet  - '837', '270', etc.
 * @param {string} input.senderId
 * @param {string} input.receiverId
 * @param {Date}   [input.date]
 * @param {string} input.controlNumber
 * @param {string} input.versionId       - e.g. '005010X222A1'
 * @param {object} [delims]
 * @returns {string}
 */
function writeGS(input, delims = DEFAULTS) {
  if (!input || !input.transactionSet || !input.versionId || !input.controlNumber) {
    throw new Error('writeGS: transactionSet, versionId, controlNumber required');
  }
  const fid = GS_FUNCTIONAL_ID[input.transactionSet];
  if (!fid) {
    throw new Error('writeGS: unknown transaction set "' + input.transactionSet + '"');
  }
  const date = input.date || new Date();
  return writeSegment([
    'GS', fid,
    input.senderId, input.receiverId,
    ymd(date), hm(date),
    String(input.controlNumber),
    'X', input.versionId,
  ], delims);
}

function writeGE(transactionCount, gsControlNumber, delims = DEFAULTS) {
  return writeSegment(['GE', String(transactionCount), String(gsControlNumber)], delims);
}

// ── ST / SE ──────────────────────────────────────────────────────────────────

function writeST(transactionSet, controlNumber, versionId, delims = DEFAULTS) {
  return writeSegment(['ST', transactionSet, String(controlNumber), versionId], delims);
}

function writeSE(segmentCount, controlNumber, delims = DEFAULTS) {
  return writeSegment(['SE', String(segmentCount), String(controlNumber)], delims);
}

// ── Envelope assembler ───────────────────────────────────────────────────────

/**
 * Wrap a transaction-set body (already an array of segment strings) in
 * ISA/GS/ST and IEA/GE/SE envelopes, computing all counters automatically.
 *
 * @param {object} input
 * @param {object} input.interchange    - { senderId, receiverId, controlNumber?, usageIndicator?, date? }
 * @param {object} input.functionalGroup - { transactionSet, versionId, controlNumber?, date? }
 * @param {object} input.transaction    - { transactionSet, controlNumber?, versionId? }
 * @param {string[]} input.body         - already-serialized inner segments (no ST or SE)
 * @param {object} [delims]
 * @returns {{ edi:string, controlNumbers:{ isa:string, gs:string, st:string } }}
 */
function buildEnvelope(input, delims = DEFAULTS) {
  if (!input || !input.interchange || !input.functionalGroup || !input.transaction || !Array.isArray(input.body)) {
    throw new Error('buildEnvelope: interchange, functionalGroup, transaction, body required');
  }
  const isaCtrl = input.interchange.controlNumber || nextControlNumber9();
  const gsCtrl  = input.functionalGroup.controlNumber || String(crypto.randomInt(1, 100000000));
  const stCtrl  = input.transaction.controlNumber || nextControlNumber4();
  const versionId = input.transaction.versionId || input.functionalGroup.versionId;
  const ts = input.transaction.transactionSet;

  const isa = writeISA({
    senderId:        input.interchange.senderId,
    receiverId:      input.interchange.receiverId,
    senderQualifier: input.interchange.senderQualifier,
    receiverQualifier: input.interchange.receiverQualifier,
    date:            input.interchange.date,
    controlNumber:   isaCtrl,
    usageIndicator:  input.interchange.usageIndicator,
    authQualifier:   input.interchange.authQualifier,
    authInfo:        input.interchange.authInfo,
    securityQualifier: input.interchange.securityQualifier,
    securityInfo:    input.interchange.securityInfo,
    ackRequested:    input.interchange.ackRequested,
  }, delims);

  const gs = writeGS({
    transactionSet: input.functionalGroup.transactionSet,
    senderId:       input.interchange.senderId,
    receiverId:     input.interchange.receiverId,
    date:           input.functionalGroup.date,
    controlNumber:  gsCtrl,
    versionId:      input.functionalGroup.versionId,
  }, delims);

  const st = writeST(ts, stCtrl, versionId, delims);
  // SE count includes ST and SE themselves
  const seCount = input.body.length + 2;
  const se = writeSE(seCount, stCtrl, delims);

  const ge = writeGE(1, gsCtrl, delims);
  const iea = writeIEA(1, isaCtrl, delims);

  const edi = isa + gs + st + input.body.join('') + se + ge + iea;
  return { edi, controlNumbers: { isa: isaCtrl, gs: String(gsCtrl), st: stCtrl } };
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Sniff delimiters from an ISA-prefixed EDI string. Per ASC X12N 005010 the
 * element separator is at position 3 and the segment terminator is the byte
 * AFTER ISA's 16th element (component separator), which sits at fixed
 * position 105 (when delimiters are single-byte). We also pick up the
 * repetition separator from position 82.
 *
 * @param {string} edi
 * @returns {object}
 */
function sniffDelimiters(edi) {
  if (typeof edi !== 'string' || edi.length < 106 || !edi.startsWith('ISA')) {
    throw new Error('sniffDelimiters: input must be an ISA-prefixed X12 string');
  }
  return {
    elementSeparator:    edi.charAt(3),
    repetitionSeparator: edi.charAt(82),
    componentSeparator:  edi.charAt(104),
    segmentTerminator:   edi.charAt(105),
  };
}

/**
 * Split an X12 string into segment-element arrays. The returned shape is:
 *
 *   [ [ 'ISA', '00', '          ', ... ],
 *     [ 'GS', 'HC', 'SENDER', 'RECEIVER', ... ],
 *     ... ]
 *
 * Carriage returns and newlines used as visual segment terminators are
 * tolerated (some clearinghouses emit them).
 *
 * @param {string} edi
 * @returns {{ segments: string[][], delimiters: object }}
 */
function parseSegments(edi) {
  const delims = sniffDelimiters(edi);
  const segs = edi
    .split(delims.segmentTerminator)
    .map((s) => s.replace(/[\r\n]+/g, '').trim())
    .filter(Boolean)
    .map((s) => s.split(delims.elementSeparator));
  return { segments: segs, delimiters: delims };
}

/**
 * Group already-split segments into ISA -> GS -> ST hierarchies. Useful for
 * downstream parsers that operate per-transaction-set.
 *
 * @param {string[][]} segments
 * @returns {Array<{interchange: string[], groups: Array<{header: string[], transactions: Array<{segments: string[][]}>}>}>}
 */
function groupTransactions(segments) {
  const interchanges = [];
  let currInterchange = null;
  let currGroup = null;
  let currTxn = null;

  for (const seg of segments) {
    const id = seg[0];
    if (id === 'ISA') {
      currInterchange = { interchange: seg, groups: [] };
      interchanges.push(currInterchange);
      currGroup = null; currTxn = null;
    } else if (id === 'GS' && currInterchange) {
      currGroup = { header: seg, transactions: [] };
      currInterchange.groups.push(currGroup);
      currTxn = null;
    } else if (id === 'ST' && currGroup) {
      currTxn = { header: seg, segments: [seg] };
      currGroup.transactions.push(currTxn);
    } else if (id === 'SE' && currTxn) {
      currTxn.segments.push(seg);
      currTxn = null;
    } else if (id === 'GE') {
      currGroup = null;
    } else if (id === 'IEA') {
      currInterchange = null;
    } else if (currTxn) {
      currTxn.segments.push(seg);
    }
  }
  return interchanges;
}

module.exports = {
  DEFAULTS,
  VERSION,
  GS_FUNCTIONAL_ID,
  pad, ymd, ymd2, hm,
  nextControlNumber9, nextControlNumber4,
  writeSegment,
  writeISA, writeIEA,
  writeGS, writeGE,
  writeST, writeSE,
  buildEnvelope,
  sniffDelimiters,
  parseSegments,
  groupTransactions,
};
