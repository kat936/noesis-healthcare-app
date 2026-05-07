'use strict';

/**
 * End-to-end smoke test stitching the EDI feature pieces together:
 *   1. Register a trading partner
 *   2. Build + persist an 837P claim submission
 *   3. Re-parse the 837P (round-trip) and verify the persisted ledger
 *   4. Parse a synthetic 277 response and reconcile it against the claim
 *   5. Parse a synthetic 835 ERA and reconcile payment totals
 *
 * No network. No real PHI; synthetic patient identifiers throughout.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.PHI_ENCRYPTION_KEY = process.env.PHI_ENCRYPTION_KEY ||
  'a'.repeat(64);

const edi = require('../services/healthEdi');

const ORG = '00000000-0000-0000-0000-000000000099';

test('e2e: trading partner -> 837P submit -> 277 parse -> 835 parse', async () => {
  edi.partners._resetForTests();

  // Step 1: register a trading partner
  await edi.upsertTradingPartner({
    orgId:        ORG,
    partnerCode:  'OFFICEALLY',
    partnerName:  'Office Ally',
    senderId:     'NOESISTEST',
    receiverId:   'OFFICEALLY01',
    transport:    'rest',
    endpointUrl:  'https://api.officeally.example/edi',
    apiKey:       'pub-key-001',
    supportedSets: ['837P', '276', '835'],
  });

  // Step 2: build + persist 837P
  const submission = await edi.submit837P({
    orgId:       ORG,
    partnerCode: 'OFFICEALLY',
    billingProvider: {
      npi: '1234567893', organizationName: 'Springfield Family Clinic',
      address: '742 Evergreen Terrace', city: 'Springfield', state: 'IL', zip: '62704',
    },
    subscriber: {
      lastName: 'Synthea', firstName: 'Test', dob: '1980-01-15', gender: 'M',
      memberId: 'MEM-SYN-001', address: '742 Evergreen Terrace',
      city: 'Springfield', state: 'IL', zip: '62704',
    },
    payer: { name: 'Aetna Health Plans', payerId: '60054' },
    claim: { id: 'CLM-E2E-001', totalAmount: 150.00, placeOfService: '11', frequencyCode: '1' },
    diagnoses: ['Z00.00'],
    serviceLines: [{
      cptCode: '99213', units: 1, unitCharge: 150.00,
      serviceDate: '2026-05-06', diagnosisPointers: [1],
    }],
  });

  assert.equal(submission.success, true);
  assert.match(submission.edi, /~ST\*837\*\d{4}\*005010X222A1~/);
  assert.equal(submission.totalAmount, 150.00);
  assert.equal(submission.transport, 'rest');

  // Step 3: re-parse the 837P and verify persisted ledger
  const reparsed = edi.parse837P(submission.edi);
  assert.equal(reparsed.versionId, '005010X222A1');
  assert.equal(reparsed.claim.id, 'CLM-E2E-001');
  assert.equal(reparsed.payer.payerId, '60054');
  assert.equal(reparsed.serviceLines[0].cptCode, '99213');

  const ledger = await edi.listSubmissionsForClaim(ORG, 'CLM-E2E-001');
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].transactionSet, '837P');
  assert.equal(ledger[0].versionId, '005010X222A1');
  assert.equal(ledger[0].controlNumbers.isa, submission.controlNumbers.isa);

  // Step 4: parse a synthetic 277 response that references the same claim
  const synthetic277 = [
    'ISA*00*          *00*          *ZZ*OFFICEALLY01   *ZZ*NOESISTEST     *260507*0900*^*00501*000000456*0*T*:~',
    'GS*HN*OFFICEALLY01*NOESISTEST*20260507*0900*1*X*005010X212~',
    'ST*277*0001*005010X212~',
    'BHT*0010*08*RESP-1*20260507*0900~',
    'NM1*PR*2*AETNA*****PI*60054~',
    'NM1*1P*2*SPRINGFIELD FAMILY CLINIC*****XX*1234567893~',
    'NM1*IL*1*SYNTHEA*TEST****MI*MEM-SYN-001~',
    'TRN*2*CLM-E2E-001*' + submission.controlNumbers.isa + '~',
    'STC*A2:20:PR*20260507~',
    'AMT*T3*150.00~',
    'SE*9*0001~GE*1*1~IEA*1*000000456~',
  ].join('');
  const parsed277 = edi.parse277(synthetic277);
  assert.equal(parsed277.claims.length, 1);
  assert.equal(parsed277.claims[0].normalizedStatus, 'accepted_processing');
  assert.equal(parsed277.claims[0].trace.referenceId, 'CLM-E2E-001');
  assert.equal(parsed277.claims[0].claimAmount, 150.00);

  // Step 5: parse a synthetic 835 ERA paying the claim with a contractual reduction
  const synthetic835 = [
    'ISA*00*          *00*          *ZZ*AETNA          *ZZ*NOESISTEST     *260510*0900*^*00501*000000789*0*P*:~',
    'GS*HP*AETNA*NOESISTEST*20260510*0900*1*X*005010X221A1~',
    'ST*835*0001~',
    'BPR*I*120.00*C*ACH*CCP*01*021000021*DA*1112223334*1512345678**01*021000021*DA*0000099999*20260510~',
    'TRN*1*EFT-12345*1112223334~',
    'N1*PR*AETNA*XV*60054~',
    'N1*PE*SPRINGFIELD FAMILY CLINIC*XX*1234567893~',
    'LX*1~',
    'CLP*CLM-E2E-001*1*150.00*120.00*30.00*MC*PAYER-CLM-99*11*1~',
    'CAS*CO*45*30.00~',
    'NM1*QC*1*SYNTHEA*TEST****MI*MEM-SYN-001~',
    'SVC*HC:99213*150.00*120.00**1~',
    'DTM*472*20260506~',
    'AMT*B6*120.00~',
    'SE*13*0001~GE*1*1~IEA*1*000000789~',
  ].join('');
  const parsed835 = edi.parse835(synthetic835);
  assert.equal(parsed835.payments.length, 1);
  assert.equal(parsed835.payments[0].claimId, 'CLM-E2E-001');
  assert.equal(parsed835.payments[0].status, 'paid');
  assert.equal(parsed835.payments[0].claimAmount, 150.00);
  assert.equal(parsed835.payments[0].paidAmount, 120.00);
  assert.equal(parsed835.payments[0].patientResponsibility, 30.00);
  assert.equal(parsed835.payments[0].contractualAdjustment, 30.00);
  assert.equal(parsed835.summary.totalPaid, 120.00);
  assert.equal(parsed835.summary.totalContractual, 30.00);

  // Reconciliation: 837P submitted total = 277 acknowledged total = 835 charged
  const submitted = ledger[0].totalAmount;
  const acked     = parsed277.claims[0].claimAmount;
  const charged   = parsed835.payments[0].claimAmount;
  assert.equal(submitted, acked);
  assert.equal(submitted, charged);
});

test('e2e: building 837P for a partner that does not support it is rejected', async () => {
  edi.partners._resetForTests();
  await edi.upsertTradingPartner({
    orgId: ORG, partnerCode: 'ELIG-ONLY', partnerName: 'Eligibility Only',
    senderId: 'A', receiverId: 'B', supportedSets: ['270'],
  });
  await assert.rejects(
    edi.submit837P({
      orgId: ORG, partnerCode: 'ELIG-ONLY',
      billingProvider: {
        npi: '1234567893', organizationName: 'Test',
        address: '1', city: 'X', state: 'IL', zip: '00000',
      },
      subscriber: { lastName: 'X', firstName: 'Y', dob: '19800101', memberId: 'M' },
      payer: { name: 'Z', payerId: '00000' },
      claim: { id: 'C-1', totalAmount: 100, placeOfService: '11', frequencyCode: '1' },
      diagnoses: ['Z00.00'],
      serviceLines: [{ cptCode: '99213', units: 1, unitCharge: 100, serviceDate: '2026-05-06', diagnosisPointers: [1] }],
    }),
    /does not support 837P/
  );
});
