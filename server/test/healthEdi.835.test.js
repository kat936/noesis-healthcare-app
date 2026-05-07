'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parse835, CARC_DESCRIPTIONS, GROUP_DESCRIPTIONS, CLAIM_STATUS, VERSION_ID } =
  require('../services/healthEdi/edi835');

const SAMPLE_835_PAID = [
  'ISA*00*          *00*          *ZZ*AETNA          *ZZ*NOESISTEST     *260510*0900*^*00501*000000789*0*P*:~',
  'GS*HP*AETNA*NOESISTEST*20260510*0900*1*X*005010X221A1~',
  'ST*835*0001~',
  'BPR*I*120.00*C*ACH*CCP*01*021000021*DA*1112223334*1512345678**01*021000021*DA*0000099999*20260510~',
  'TRN*1*EFT-12345*1112223334~',
  'N1*PR*AETNA*XV*60054~',
  'N3*1 AETNA WAY~',
  'N4*HARTFORD*CT*06156~',
  'N1*PE*SPRINGFIELD FAMILY CLINIC*XX*1234567893~',
  'REF*TJ*123456789~',
  'LX*1~',
  'CLP*CLM-TEST-001*1*150.00*120.00*30.00*MC*PAYER-CLM-99*11*1~',
  'CAS*CO*45*30.00~',
  'NM1*QC*1*SYNTHEA*TEST****MI*MEM-SYN-001~',
  'SVC*HC:99213*150.00*120.00**1~',
  'DTM*472*20260506~',
  'CAS*CO*45*30.00~',
  'AMT*B6*120.00~',
  'SE*16*0001~GE*1*1~IEA*1*000000789~',
].join('');

const SAMPLE_835_DENIED = [
  'ISA*00*          *00*          *ZZ*AETNA          *ZZ*NOESISTEST     *260510*0900*^*00501*000000790*0*P*:~',
  'GS*HP*AETNA*NOESISTEST*20260510*0900*1*X*005010X221A1~',
  'ST*835*0001~',
  'BPR*I*0.00*C*NON*****20260510~',
  'TRN*1*EFT-DENIED-1*1112223334~',
  'N1*PR*AETNA*XV*60054~',
  'N1*PE*SPRINGFIELD FAMILY CLINIC*XX*1234567893~',
  'LX*1~',
  'CLP*CLM-DENY-001*4*150.00*0.00*0.00*MC*PAYER-CLM-100*11*1~',
  'CAS*CO*22*150.00~',
  'NM1*QC*1*SYNTHEA*TEST****MI*MEM-SYN-001~',
  'SE*8*0001~GE*1*1~IEA*1*000000790~',
].join('');

test('parse835 captures BPR financial fields', () => {
  const out = parse835(SAMPLE_835_PAID);
  assert.equal(out.versionId, '005010X221A1');
  assert.equal(out.creditDebitFlag, 'C');
  assert.equal(out.paymentMethod, 'ACH');
  assert.equal(out.paymentAmount, 120.00);
  assert.equal(out.paymentDate, '20260510');
});

test('parse835 captures payer + payee identifiers', () => {
  const out = parse835(SAMPLE_835_PAID);
  assert.equal(out.payer.name, 'AETNA');
  assert.equal(out.payer.id, '60054');
  assert.equal(out.payee.name, 'SPRINGFIELD FAMILY CLINIC');
  assert.equal(out.payee.id, '1234567893');
  assert.equal(out.payee.taxId, '123456789');
});

test('parse835 normalizes a paid claim with line + service adjustments', () => {
  const out = parse835(SAMPLE_835_PAID);
  assert.equal(out.payments.length, 1);
  const p = out.payments[0];
  assert.equal(p.claimId, 'CLM-TEST-001');
  assert.equal(p.statusCode, '1');
  assert.equal(p.status, 'paid');
  assert.equal(p.claimAmount, 150.00);
  assert.equal(p.paidAmount, 120.00);
  assert.equal(p.patientResponsibility, 30.00);
  assert.equal(p.contractualAdjustment, 30.00);
  assert.equal(p.adjustments.length, 1);
  assert.equal(p.adjustments[0].groupCode, 'CO');
  assert.equal(p.adjustments[0].lines[0].reasonCode, '45');
  assert.equal(p.serviceLines.length, 1);
  assert.equal(p.serviceLines[0].cptCode, '99213');
  assert.equal(p.serviceLines[0].chargedAmount, 150.00);
  assert.equal(p.serviceLines[0].paidAmount, 120.00);
  assert.equal(p.serviceLines[0].allowedAmount, 120.00);
});

test('parse835 handles zero-payment denials (BPR 0.00, CLP status 4)', () => {
  const out = parse835(SAMPLE_835_DENIED);
  assert.equal(out.paymentAmount, 0);
  assert.equal(out.paymentMethod, 'NON');
  assert.equal(out.payments.length, 1);
  const p = out.payments[0];
  assert.equal(p.statusCode, '4');
  assert.equal(p.status, 'denied');
  assert.equal(p.claimAmount, 150.00);
  assert.equal(p.paidAmount, 0);
  assert.equal(p.adjustments[0].lines[0].reasonCode, '22');
  assert.equal(p.adjustments[0].lines[0].description, CARC_DESCRIPTIONS['22']);
});

test('parse835 summary aggregates totals across claims', () => {
  const out = parse835(SAMPLE_835_PAID);
  assert.equal(out.summary.claimCount, 1);
  assert.equal(out.summary.totalCharged, 150.00);
  assert.equal(out.summary.totalPaid, 120.00);
  assert.equal(out.summary.totalPatientLiability, 30.00);
  assert.equal(out.summary.totalContractual, 30.00);
});

test('CARC_DESCRIPTIONS contains common claim adjustment reason codes', () => {
  assert.equal(CARC_DESCRIPTIONS['1'], 'Deductible amount');
  assert.equal(CARC_DESCRIPTIONS['2'], 'Coinsurance amount');
  assert.equal(CARC_DESCRIPTIONS['18'], 'Exact duplicate claim/service');
  assert.equal(CARC_DESCRIPTIONS['45'], 'Charge exceeds fee schedule / max allowable');
});

test('GROUP_DESCRIPTIONS maps HIPAA standard adjustment groups', () => {
  assert.equal(GROUP_DESCRIPTIONS.CO, 'Contractual obligation');
  assert.equal(GROUP_DESCRIPTIONS.PR, 'Patient responsibility');
});

test('CLAIM_STATUS maps CLP02 codes to normalized statuses', () => {
  assert.equal(CLAIM_STATUS['1'], 'paid');
  assert.equal(CLAIM_STATUS['4'], 'denied');
  assert.equal(CLAIM_STATUS['22'], 'reversal_of_previous_payment');
});

test('VERSION_ID matches the X12N TR3 identifier for 835', () => {
  assert.equal(VERSION_ID, '005010X221A1');
});

test('parse835 throws on empty input', () => {
  assert.throws(() => parse835(''), /non-empty string/);
});
