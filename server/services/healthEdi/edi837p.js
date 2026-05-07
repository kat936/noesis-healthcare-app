/**
 * Noesis.io Health  - X12N 837P Health Care Claim (Professional)
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Implementation of ASC X12N 005010X222A1 - Health Care Claim:
 * Professional. Builds a single-claim, single-billing-provider envelope
 * suitable for direct submission through any X12-conformant clearinghouse
 * (Office Ally, Change Healthcare, Availity, Waystar, etc.).
 *
 * Spec reference (loops are named per the X12N 837P TR3):
 *   Header:                BHT
 *   1000A Submitter:       NM1*41 + PER
 *   1000B Receiver:        NM1*40
 *   2000A Billing Provider Hierarchical: HL*1**20
 *     2010AA Billing Provider: NM1*85 + N3 + N4 + REF*EI/SY
 *   2000B Subscriber Hierarchical:        HL*2*1*22
 *     2010BA Subscriber:    NM1*IL + N3 + N4 + DMG
 *     2010BB Payer:         NM1*PR
 *     2300 Claim:           CLM + DTP*431 (onset) + REF + HI (diagnoses)
 *     2400 Service Lines:   LX + SV1 + DTP*472 (service date)
 *
 * This module is deliberately scoped to "single subscriber, single claim,
 * single billing provider" because (a) that is what every other Noesis
 * write path produces, and (b) batching multiple claims requires a
 * different audit trail. Multi-claim envelopes can be added as a follow-up.
 */

'use strict';

const env = require('./x12Envelope');

const VERSION_ID = '005010X222A1';

/**
 * Build a complete EDI 837P transaction envelope.
 *
 * @param {object} input
 * @param {object} input.submitter   - { id, name, contact: { name, phone, email } }
 * @param {object} input.receiver    - { id, name } (clearinghouse or payer)
 * @param {object} input.billingProvider - { npi, ein?, organizationName, address, city, state, zip, taxonomy? }
 * @param {object} input.subscriber  - { lastName, firstName, dob, gender, memberId, address, city, state, zip }
 * @param {object} input.payer       - { name, payerId }
 * @param {object} input.claim       - { id, totalAmount, placeOfService, frequencyCode?, providerSignatureOnFile?, assignmentOfBenefits?, releaseOfInformation? }
 * @param {string[]} input.diagnoses - ICD-10-CM codes; first becomes the principal diagnosis
 * @param {Array<object>} input.serviceLines - [{ cptCode, modifiers?, units, unitCharge, serviceDate, diagnosisPointers }]
 * @param {object} [input.envelope]  - { senderId, receiverId, usageIndicator, controlNumbers }
 * @returns {{ edi:string, controlNumbers:object, segmentCount:number, totalAmount:number }}
 */
function build837P(input) {
  _validateInput(input);

  const segments = [];

  // ── Header ────────────────────────────────────────────────────────────────
  // BHT04 = creation date, BHT05 = creation time, BHT06 = '00' chargeable claim
  const now = new Date();
  segments.push(env.writeSegment([
    'BHT', '0019', '00',
    'BHT-' + (input.claim.id || env.nextControlNumber9()),
    env.ymd(now), env.hm(now), '00',
  ]));

  // ── 1000A Submitter ───────────────────────────────────────────────────────
  segments.push(env.writeSegment([
    'NM1', '41', '2', String(input.submitter.name).toUpperCase().slice(0, 60),
    '', '', '', '', '46', input.submitter.id,
  ]));
  if (input.submitter.contact) {
    segments.push(env.writeSegment([
      'PER', 'IC',
      String(input.submitter.contact.name || 'BILLING').toUpperCase().slice(0, 60),
      input.submitter.contact.phone ? 'TE' : '',
      input.submitter.contact.phone ? _digits(input.submitter.contact.phone) : '',
      input.submitter.contact.email ? 'EM' : '',
      input.submitter.contact.email ? input.submitter.contact.email : '',
    ]));
  }

  // ── 1000B Receiver ────────────────────────────────────────────────────────
  segments.push(env.writeSegment([
    'NM1', '40', '2', String(input.receiver.name).toUpperCase().slice(0, 60),
    '', '', '', '', '46', input.receiver.id,
  ]));

  // ── 2000A Billing Provider Hierarchical ───────────────────────────────────
  segments.push(env.writeSegment(['HL', '1', '', '20', '1']));
  if (input.billingProvider.taxonomy) {
    segments.push(env.writeSegment(['PRV', 'BI', 'PXC', input.billingProvider.taxonomy]));
  }

  // 2010AA Billing Provider
  segments.push(env.writeSegment([
    'NM1', '85', '2',
    String(input.billingProvider.organizationName).toUpperCase().slice(0, 60),
    '', '', '', '', 'XX', input.billingProvider.npi,
  ]));
  segments.push(env.writeSegment(['N3', String(input.billingProvider.address).toUpperCase()]));
  segments.push(env.writeSegment([
    'N4',
    String(input.billingProvider.city).toUpperCase(),
    String(input.billingProvider.state).toUpperCase(),
    _digits(input.billingProvider.zip),
  ]));
  if (input.billingProvider.ein) {
    segments.push(env.writeSegment(['REF', 'EI', _digits(input.billingProvider.ein)]));
  }

  // ── 2000B Subscriber Hierarchical ─────────────────────────────────────────
  segments.push(env.writeSegment(['HL', '2', '1', '22', '0']));
  segments.push(env.writeSegment([
    'SBR',
    input.subscriber.payerResponsibility || 'P',
    '18', // subscriber IS patient
    input.subscriber.groupNumber || '',
    '', '', '', '', '', input.subscriber.claimFilingIndicator || 'CI',
  ]));

  // 2010BA Subscriber (also patient when relationship = self)
  segments.push(env.writeSegment([
    'NM1', 'IL', '1',
    String(input.subscriber.lastName).toUpperCase(),
    String(input.subscriber.firstName).toUpperCase(),
    '', '', '', 'MI', input.subscriber.memberId,
  ]));
  segments.push(env.writeSegment(['N3', String(input.subscriber.address).toUpperCase()]));
  segments.push(env.writeSegment([
    'N4',
    String(input.subscriber.city).toUpperCase(),
    String(input.subscriber.state).toUpperCase(),
    _digits(input.subscriber.zip),
  ]));
  segments.push(env.writeSegment([
    'DMG', 'D8',
    _onlyDigits(input.subscriber.dob),
    _normalizeGender(input.subscriber.gender),
  ]));

  // 2010BB Payer
  segments.push(env.writeSegment([
    'NM1', 'PR', '2',
    String(input.payer.name).toUpperCase().slice(0, 60),
    '', '', '', '', 'PI', input.payer.payerId,
  ]));

  // ── 2300 Claim ────────────────────────────────────────────────────────────
  // CLM05 composite: pos-of-service:facility-code-qual:claim-frequency
  const placeOfService = String(input.claim.placeOfService || '11');
  const frequency = String(input.claim.frequencyCode || '1');
  segments.push(env.writeSegment([
    'CLM',
    String(input.claim.id),
    _money(input.claim.totalAmount),
    '', '', placeOfService + ':B:' + frequency,
    input.claim.providerSignatureOnFile || 'Y',
    input.claim.providerAcceptAssignment || 'A',
    input.claim.assignmentOfBenefits || 'Y',
    input.claim.releaseOfInformation || 'I',
  ]));

  // 2300 HI Diagnoses (principal first, then secondary; ABK then ABF qualifier)
  const diagSegments = _buildDiagnosisSegments(input.diagnoses);
  for (const seg of diagSegments) { segments.push(seg); }

  // ── 2400 Service Lines ────────────────────────────────────────────────────
  let lineNumber = 0;
  for (const line of input.serviceLines) {
    lineNumber += 1;
    segments.push(env.writeSegment(['LX', String(lineNumber)]));
    const productOrService = ['HC', line.cptCode, ...(line.modifiers || [])].join(':');
    segments.push(env.writeSegment([
      'SV1', productOrService,
      _money(line.unitCharge * line.units),
      'UN', String(line.units),
      String(line.placeOfService || placeOfService),
      '',
      (line.diagnosisPointers || [1]).join(':'),
    ]));
    segments.push(env.writeSegment([
      'DTP', '472', 'D8', _onlyDigits(line.serviceDate || input.claim.serviceDate),
    ]));
    if (line.referenceLineNumber) {
      segments.push(env.writeSegment(['REF', '6R', String(line.referenceLineNumber)]));
    }
  }

  // ── Envelope ──────────────────────────────────────────────────────────────
  const envInput = {
    interchange: {
      senderId:       (input.envelope && input.envelope.senderId)   || input.submitter.id,
      receiverId:     (input.envelope && input.envelope.receiverId) || input.receiver.id,
      usageIndicator: (input.envelope && input.envelope.usageIndicator) || 'T',
      controlNumber:  input.envelope && input.envelope.isaControl,
      date:           now,
    },
    functionalGroup: {
      transactionSet: '837',
      versionId:      VERSION_ID,
      controlNumber:  input.envelope && input.envelope.gsControl,
      date:           now,
    },
    transaction: {
      transactionSet: '837',
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
    totalAmount: input.claim.totalAmount,
    versionId: VERSION_ID,
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

function _validateInput(input) {
  if (!input) { throw new Error('build837P: input required'); }
  for (const k of ['submitter', 'receiver', 'billingProvider', 'subscriber', 'payer', 'claim', 'diagnoses', 'serviceLines']) {
    if (!input[k]) { throw new Error(`build837P: input.${k} required`); }
  }
  if (!input.submitter.id || !input.submitter.name)        { throw new Error('build837P: submitter.id and submitter.name required'); }
  if (!input.receiver.id  || !input.receiver.name)         { throw new Error('build837P: receiver.id and receiver.name required'); }
  if (!input.billingProvider.npi || !input.billingProvider.organizationName) {
    throw new Error('build837P: billingProvider.npi and organizationName required');
  }
  if (!/^\d{10}$/.test(String(input.billingProvider.npi))) {
    throw new Error('build837P: billingProvider.npi must be 10 digits');
  }
  if (!input.subscriber.memberId || !input.subscriber.lastName || !input.subscriber.firstName || !input.subscriber.dob) {
    throw new Error('build837P: subscriber.memberId, lastName, firstName, dob required');
  }
  if (!input.payer.name || !input.payer.payerId) {
    throw new Error('build837P: payer.name and payer.payerId required');
  }
  if (!input.claim.id) { throw new Error('build837P: claim.id required'); }
  if (!Number.isFinite(input.claim.totalAmount) || input.claim.totalAmount < 0) {
    throw new Error('build837P: claim.totalAmount must be a non-negative number');
  }
  if (!Array.isArray(input.diagnoses) || input.diagnoses.length === 0) {
    throw new Error('build837P: diagnoses must be a non-empty ICD-10 code array');
  }
  if (input.diagnoses.length > 12) {
    throw new Error('build837P: 837P caps diagnosis pointers at 12 (per TR3)');
  }
  if (!Array.isArray(input.serviceLines) || input.serviceLines.length === 0) {
    throw new Error('build837P: serviceLines must be a non-empty array');
  }
  if (input.serviceLines.length > 50) {
    throw new Error('build837P: 837P caps service lines at 50 per claim (per TR3)');
  }
  let sum = 0;
  for (const sl of input.serviceLines) {
    if (!sl.cptCode) { throw new Error('build837P: serviceLines[].cptCode required'); }
    if (!Number.isFinite(sl.units) || sl.units <= 0) {
      throw new Error('build837P: serviceLines[].units must be a positive number');
    }
    if (!Number.isFinite(sl.unitCharge) || sl.unitCharge < 0) {
      throw new Error('build837P: serviceLines[].unitCharge must be a non-negative number');
    }
    sum += sl.unitCharge * sl.units;
  }
  // Reconciliation check: line totals must match claim total within 1 cent
  if (Math.abs(sum - input.claim.totalAmount) > 0.01) {
    throw new Error(
      'build837P: claim.totalAmount (' + input.claim.totalAmount + ') does not match ' +
      'sum of service line charges (' + sum.toFixed(2) + ')'
    );
  }
}

function _buildDiagnosisSegments(diagnoses) {
  // 837P caps at 12 diagnoses; principal uses ABK qualifier, secondaries ABF.
  // The HI segment groups up to 12 codes per segment as composite elements.
  const segments = [];
  const MAX = Math.min(12, diagnoses.length);
  const composites = [];
  for (let i = 0; i < MAX; i++) {
    const qual = i === 0 ? 'ABK' : 'ABF';
    composites.push(qual + ':' + String(diagnoses[i]).toUpperCase().replace(/\./g, ''));
  }
  segments.push(env.writeSegment(['HI', ...composites]));
  return segments;
}

function _money(v) {
  // X12 monetary fields are decimal, no currency symbol, max 2 decimals, no comma
  return Number(v).toFixed(2);
}

function _onlyDigits(s) {
  return String(s).replace(/\D/g, '');
}

function _digits(s) {
  return _onlyDigits(s);
}

function _normalizeGender(g) {
  if (!g) { return 'U'; }
  const u = String(g).toUpperCase();
  if (u === 'F' || u === 'FEMALE') { return 'F'; }
  if (u === 'M' || u === 'MALE')   { return 'M'; }
  if (u === 'U' || u === 'UNK' || u === 'UNKNOWN') { return 'U'; }
  return 'U';
}

// ── Parser (best-effort, for round-trip tests + Noesis-internal use) ─────────

/**
 * Parse a previously-built (or clearinghouse-returned) 837P envelope back into
 * a plain object. Coverage is intentionally limited to the fields the builder
 * produces; loops outside that scope are exposed via the `unmappedSegments`
 * array so audits can still see the full payload.
 *
 * @param {string} edi
 * @returns {object}
 */
function parse837P(edi) {
  const { segments } = env.parseSegments(edi);
  const out = {
    versionId: null,
    submitter: null, receiver: null,
    billingProvider: null,
    subscriber: null, payer: null,
    claim: null,
    diagnoses: [],
    serviceLines: [],
    unmappedSegments: [],
  };

  let ctx = null;
  let currentLine = null;

  for (const seg of segments) {
    const id = seg[0];
    switch (id) {
      case 'GS': out.versionId = seg[8]; break;
      case 'NM1': {
        const ent = seg[1];
        if (ent === '41') { out.submitter = { name: seg[3], id: seg[9] }; ctx = 'submitter'; }
        else if (ent === '40') { out.receiver  = { name: seg[3], id: seg[9] }; ctx = 'receiver'; }
        else if (ent === '85') { out.billingProvider = { organizationName: seg[3], npi: seg[9] }; ctx = 'billingProvider'; }
        else if (ent === 'IL') { out.subscriber = { lastName: seg[3], firstName: seg[4], memberId: seg[9] }; ctx = 'subscriber'; }
        else if (ent === 'PR') { out.payer = { name: seg[3], payerId: seg[9] }; ctx = 'payer'; }
        else { out.unmappedSegments.push(seg); }
        break;
      }
      case 'N3':
        if (ctx === 'billingProvider') { out.billingProvider.address = seg[1]; }
        else if (ctx === 'subscriber')  { out.subscriber.address     = seg[1]; }
        break;
      case 'N4':
        if (ctx === 'billingProvider') {
          out.billingProvider.city = seg[1]; out.billingProvider.state = seg[2]; out.billingProvider.zip = seg[3];
        } else if (ctx === 'subscriber') {
          out.subscriber.city = seg[1]; out.subscriber.state = seg[2]; out.subscriber.zip = seg[3];
        }
        break;
      case 'DMG':
        if (ctx === 'subscriber') { out.subscriber.dob = seg[2]; out.subscriber.gender = seg[3]; }
        break;
      case 'CLM': {
        const compose = (seg[5] || '').split(':');
        out.claim = {
          id:             seg[1],
          totalAmount:    Number(seg[2]),
          placeOfService: compose[0] || null,
          frequencyCode:  compose[2] || null,
          providerSignatureOnFile:   seg[6] || null,
          providerAcceptAssignment:  seg[7] || null,
          assignmentOfBenefits:      seg[8] || null,
          releaseOfInformation:      seg[9] || null,
        };
        break;
      }
      case 'HI': {
        for (let i = 1; i < seg.length; i++) {
          const composite = String(seg[i] || '');
          if (!composite) { continue; }
          const [qual, code] = composite.split(':');
          if (code) { out.diagnoses.push({ qualifier: qual, code }); }
        }
        break;
      }
      case 'LX': {
        currentLine = { sequence: Number(seg[1]) || null };
        out.serviceLines.push(currentLine);
        break;
      }
      case 'SV1': {
        if (!currentLine) { break; }
        const compose = (seg[1] || '').split(':');
        currentLine.cptCode    = compose[1] || null;
        currentLine.modifiers  = compose.slice(2);
        currentLine.charge     = Number(seg[2]);
        currentLine.units      = Number(seg[4]);
        currentLine.placeOfService = seg[5] || null;
        currentLine.diagnosisPointers = (seg[7] || '').split(':').map(Number).filter(Boolean);
        break;
      }
      case 'DTP':
        if (currentLine && seg[1] === '472') { currentLine.serviceDate = seg[3]; }
        break;
      default:
        if (id !== 'ISA' && id !== 'GS' && id !== 'GE' && id !== 'IEA' &&
            id !== 'ST' && id !== 'SE' && id !== 'BHT' && id !== 'HL' &&
            id !== 'SBR' && id !== 'PER' && id !== 'PRV' && id !== 'REF') {
          out.unmappedSegments.push(seg);
        }
        break;
    }
  }

  return out;
}

module.exports = {
  VERSION_ID,
  build837P,
  parse837P,
};
