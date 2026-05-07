'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { build276, parse277, STATUS_CATEGORY, VERSION_ID } =
  require('../services/healthEdi/edi276277');

function _sampleInquiry() {
  return {
    submitter: { id: 'NOESISTEST', name: 'Noesis Health' },
    receiver:  { id: 'CHCID',      name: 'Change Healthcare' },
    payer:     { name: 'Aetna',    payerId: '60054' },
    provider:  { name: 'Springfield Family Clinic', npi: '1234567893' },
    subscriber:{ lastName: 'Synthea', firstName: 'Test', memberId: 'MEM-SYN-001' },
    claim:     { trackingId: 'TRACK-001', claimAmount: 150.00, serviceDate: '2026-05-06' },
  };
}

test('build276 produces an X12N 005010X212 envelope with TRN', () => {
  const r = build276(_sampleInquiry());
  assert.equal(r.versionId, '005010X212');
  assert.match(r.edi, /~ST\*276\*\d{4}\*005010X212~/);
  assert.match(r.edi, /TRN\*1\*TRACK-001\*NOESISTEST~/);
  assert.match(r.edi, /AMT\*T3\*150\.00~/);
  assert.match(r.edi, /DTP\*472\*D8\*20260506~/);
});

test('build276 walks the HL hierarchy (payer -> provider -> subscriber)', () => {
  const r = build276(_sampleInquiry());
  assert.match(r.edi, /HL\*1\*\*20\*1~/); // payer is hierarchical level 1
  assert.match(r.edi, /HL\*2\*1\*21\*1~/); // provider is child of payer
  assert.match(r.edi, /HL\*3\*2\*22\*0~/); // subscriber is child of provider, leaf
});

test('build276 rejects invalid NPI', () => {
  const inq = _sampleInquiry();
  inq.provider.npi = '123';
  assert.throws(() => build276(inq), /must be 10 digits/);
});

test('build276 requires claim.trackingId', () => {
  const inq = _sampleInquiry();
  delete inq.claim.trackingId;
  assert.throws(() => build276(inq), /trackingId/);
});

// ── 277 parsing ──────────────────────────────────────────────────────────────

const SAMPLE_277 = [
  'ISA*00*          *00*          *ZZ*CHCID          *ZZ*NOESISTEST     *260507*0930*^*00501*000000456*0*T*:~',
  'GS*HN*CHCID*NOESISTEST*20260507*0930*1*X*005010X212~',
  'ST*277*0001*005010X212~',
  'BHT*0010*08*BHT-RESP-1*20260507*0930~',
  'NM1*PR*2*AETNA*****PI*60054~',
  'NM1*1P*2*SPRINGFIELD FAMILY CLINIC*****XX*1234567893~',
  'NM1*IL*1*SYNTHEA*TEST****MI*MEM-SYN-001~',
  'TRN*2*TRACK-001*PAYER-XYZ~',
  'STC*F1:1:PR*20260507*WQ*150.00*120.00~',
  'REF*1K*PAYER-CLM-99~',
  'AMT*T3*150.00~',
  'AMT*YU*120.00~',
  'DTP*472*D8*20260506~',
  'SE*11*0001~GE*1*1~IEA*1*000000456~',
].join('');

test('parse277 returns one claim with normalized status and amounts', () => {
  const out = parse277(SAMPLE_277);
  assert.equal(out.versionId, '005010X212');
  assert.equal(out.payer.payerId, '60054');
  assert.equal(out.provider.npi, '1234567893');
  assert.equal(out.claims.length, 1);
  const claim = out.claims[0];
  assert.equal(claim.subscriber.memberId, 'MEM-SYN-001');
  assert.equal(claim.trace.referenceId, 'TRACK-001');
  assert.equal(claim.statuses.length, 1);
  assert.equal(claim.statuses[0].category, 'F1');
  assert.equal(claim.statuses[0].status, 'finalized_paid');
  assert.equal(claim.statuses[0].totalCharged, 150.00);
  assert.equal(claim.statuses[0].totalPaid, 120.00);
  assert.equal(claim.payerClaimControlNumber, 'PAYER-CLM-99');
  assert.equal(claim.claimAmount, 150.00);
  assert.equal(claim.paidAmount, 120.00);
  assert.equal(claim.normalizedStatus, 'finalized_paid');
});

test('parse277 maps rejection categories (A6/A7/A8) to "rejected"', () => {
  const rejected = SAMPLE_277.replace('STC*F1:1:PR', 'STC*A7:21:PR');
  const out = parse277(rejected);
  assert.equal(out.claims[0].statuses[0].category, 'A7');
  assert.equal(out.claims[0].statuses[0].status, 'rejected');
  assert.equal(out.claims[0].normalizedStatus, 'rejected');
});

test('STATUS_CATEGORY exposes the canonical mapping', () => {
  assert.equal(STATUS_CATEGORY.F1, 'finalized_paid');
  assert.equal(STATUS_CATEGORY.F2, 'finalized_denied');
  assert.equal(STATUS_CATEGORY.A4, 'not_found');
  assert.equal(STATUS_CATEGORY.P1, 'pending');
});

test('VERSION_ID matches the X12N TR3 identifier for 276/277', () => {
  assert.equal(VERSION_ID, '005010X212');
});

test('parse277 throws on empty input', () => {
  assert.throws(() => parse277(''), /non-empty string/);
  assert.throws(() => parse277(null), /non-empty string/);
});
