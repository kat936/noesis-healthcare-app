'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { build837P, parse837P, VERSION_ID } = require('../services/healthEdi/edi837p');

// Synthetic claim used by every test below. No real PHI.
function _sampleClaim() {
  return {
    submitter:  { id: 'NOESISTEST',     name: 'Noesis Health' },
    receiver:   { id: 'CLEARINGHOUSE',  name: 'Test Clearinghouse' },
    billingProvider: {
      npi:              '1234567893',
      organizationName: 'Springfield Family Clinic',
      address:          '742 Evergreen Terrace',
      city:             'Springfield',
      state:            'IL',
      zip:              '62704',
      taxonomy:         '207Q00000X',
      ein:              '12-3456789',
    },
    subscriber: {
      lastName:  'Synthea',
      firstName: 'Test',
      dob:       '1980-01-15',
      gender:    'M',
      memberId:  'MEM-SYN-001',
      address:   '742 Evergreen Terrace',
      city:      'Springfield',
      state:     'IL',
      zip:       '62704',
      groupNumber: 'GRP-001',
    },
    payer: { name: 'Aetna Health Plans', payerId: '60054' },
    claim: {
      id:              'CLM-TEST-001',
      totalAmount:     150.00,
      placeOfService:  '11',
      frequencyCode:   '1',
    },
    diagnoses:    ['Z00.00'],
    serviceLines: [{
      cptCode:           '99213',
      modifiers:         ['25'],
      units:             1,
      unitCharge:        150.00,
      serviceDate:       '2026-05-06',
      diagnosisPointers: [1],
    }],
  };
}

test('build837P produces an X12N 005010X222A1 envelope', () => {
  const r = build837P(_sampleClaim());
  assert.equal(r.versionId, '005010X222A1');
  assert.match(r.edi, /^ISA\*00\*/);
  assert.match(r.edi, /~GS\*HC\*/);
  assert.match(r.edi, /~ST\*837\*\d{4}\*005010X222A1~/);
  assert.match(r.edi, /SE\*\d+\*/);
  assert.match(r.edi, /GE\*1\*/);
  assert.match(r.edi, /IEA\*1\*/);
});

test('build837P writes billing provider NPI and EIN reference', () => {
  const r = build837P(_sampleClaim());
  assert.match(r.edi, /NM1\*85\*2\*SPRINGFIELD FAMILY CLINIC\*+XX\*1234567893~/);
  assert.match(r.edi, /REF\*EI\*123456789~/);
  assert.match(r.edi, /N3\*742 EVERGREEN TERRACE~/);
  assert.match(r.edi, /N4\*SPRINGFIELD\*IL\*62704~/);
});

test('build837P writes subscriber demographics with normalized gender', () => {
  const r = build837P(_sampleClaim());
  assert.match(r.edi, /NM1\*IL\*1\*SYNTHEA\*TEST\*+MI\*MEM-SYN-001~/);
  assert.match(r.edi, /DMG\*D8\*19800115\*M~/);
});

test('build837P encodes claim line with CPT + modifier composite', () => {
  const r = build837P(_sampleClaim());
  // SV1 should carry HC:99213:25 composite
  assert.match(r.edi, /SV1\*HC:99213:25\*150\.00\*UN\*1\*11\*\*1~/);
  // Claim total of 150.00 in CLM02
  assert.match(r.edi, /CLM\*CLM-TEST-001\*150\.00\*+11:B:1\*Y\*A\*Y\*I~/);
});

test('build837P emits ABK for principal diagnosis and ABF for secondaries', () => {
  const claim = _sampleClaim();
  claim.diagnoses = ['Z00.00', 'I10', 'E11.9'];
  const r = build837P(claim);
  // HI segment should include ABK:Z0000, ABF:I10, ABF:E119 (no dots in X12)
  assert.match(r.edi, /HI\*ABK:Z0000\*ABF:I10\*ABF:E119~/);
});

test('build837P validates billing provider NPI is exactly 10 digits', () => {
  const claim = _sampleClaim();
  claim.billingProvider.npi = '12345';
  assert.throws(() => build837P(claim), /must be 10 digits/);
});

test('build837P enforces line totals reconciliation against claim total', () => {
  const claim = _sampleClaim();
  claim.serviceLines[0].unitCharge = 200.00;
  assert.throws(() => build837P(claim), /does not match sum of service line charges/);
});

test('build837P caps diagnoses at 12 per TR3', () => {
  const claim = _sampleClaim();
  claim.diagnoses = Array.from({ length: 13 }, (_, i) => 'Z' + String(i).padStart(2, '0') + '.00');
  assert.throws(() => build837P(claim), /caps diagnosis pointers at 12/);
});

test('build837P round-trips through parse837P (parser recovers core fields)', () => {
  const r = build837P(_sampleClaim());
  const parsed = parse837P(r.edi);
  assert.equal(parsed.versionId, '005010X222A1');
  assert.equal(parsed.submitter.id, 'NOESISTEST');
  assert.equal(parsed.receiver.id,  'CLEARINGHOUSE');
  assert.equal(parsed.billingProvider.npi, '1234567893');
  assert.equal(parsed.subscriber.memberId, 'MEM-SYN-001');
  assert.equal(parsed.payer.payerId, '60054');
  assert.equal(parsed.claim.id, 'CLM-TEST-001');
  assert.equal(parsed.claim.totalAmount, 150.00);
  assert.equal(parsed.diagnoses.length, 1);
  assert.equal(parsed.diagnoses[0].code, 'Z0000');
  assert.equal(parsed.serviceLines.length, 1);
  assert.equal(parsed.serviceLines[0].cptCode, '99213');
  assert.equal(parsed.serviceLines[0].units, 1);
  assert.equal(parsed.serviceLines[0].charge, 150.00);
});

test('build837P with multiple service lines reconciles total', () => {
  const claim = _sampleClaim();
  claim.claim.totalAmount = 280.00;
  claim.serviceLines = [
    { cptCode: '99213', units: 1, unitCharge: 150.00, serviceDate: '2026-05-06', diagnosisPointers: [1] },
    { cptCode: '90471', units: 1, unitCharge: 130.00, serviceDate: '2026-05-06', diagnosisPointers: [1] },
  ];
  const r = build837P(claim);
  // Two LX segments, two SV1 segments
  assert.match(r.edi, /LX\*1~/);
  assert.match(r.edi, /LX\*2~/);
  assert.match(r.edi, /SV1\*HC:99213\*150\.00/);
  assert.match(r.edi, /SV1\*HC:90471\*130\.00/);
});

test('exported VERSION_ID matches the X12N TR3 identifier for 837P', () => {
  assert.equal(VERSION_ID, '005010X222A1');
});
