'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePatient,
  normalizeCoverage,
  normalizeEncounter,
  normalizeObservation,
  normalizeClaim,
  buildFhirClaim,
  buildFhirPatient,
  SYS_NPI,
  SYS_ICD10,
  SYS_CPT,
} = require('../services/healthEhr/fhirResources');

// ── Patient ──────────────────────────────────────────────────────────────────

test('normalizePatient extracts identifiers, name, address, contact', () => {
  const r = {
    resourceType: 'Patient',
    id: 'pt-1',
    active: true,
    name: [{ use: 'official', family: 'Vasquez', given: ['Maria', 'Elena'] }],
    birthDate: '1981-05-12',
    gender: 'female',
    identifier: [
      { type: { coding: [{ code: 'MR' }] }, value: 'MRN-7788' },
      { type: { coding: [{ code: 'SS' }] }, value: '123-45-6789' },
    ],
    address: [{
      use: 'home',
      line: ['742 Evergreen Terrace'],
      city: 'Springfield', state: 'IL', postalCode: '62704', country: 'US',
    }],
    telecom: [
      { system: 'phone', value: '555-0123' },
      { system: 'email', value: 'maria@example.com' },
    ],
  };
  const p = normalizePatient(r);
  assert.equal(p.fhirId, 'pt-1');
  assert.equal(p.firstName, 'Maria Elena');
  assert.equal(p.middleName, 'Elena');
  assert.equal(p.lastName, 'Vasquez');
  assert.equal(p.dateOfBirth, '1981-05-12');
  assert.equal(p.gender, 'female');
  assert.equal(p.mrn, 'MRN-7788');
  assert.equal(p.ssnLast4, '6789');
  assert.equal(p.address.city, 'Springfield');
  assert.equal(p.phone, '555-0123');
  assert.equal(p.email, 'maria@example.com');
  assert.equal(p.active, true);
});

test('normalizePatient throws on wrong resourceType', () => {
  assert.throws(() => normalizePatient({ resourceType: 'Practitioner', id: 'x' }),
    /Patient/);
});

// ── Coverage ─────────────────────────────────────────────────────────────────

test('normalizeCoverage maps payor, group, plan, period', () => {
  const r = {
    resourceType: 'Coverage',
    id: 'cov-1',
    status: 'active',
    subscriberId: 'SUB-001',
    identifier: [{ value: 'MEM-9001' }],
    payor: [{ display: 'Aetna Health Plans', reference: 'Organization/aetna' }],
    class: [
      { type: { coding: [{ code: 'group' }] }, value: 'GRP-7890' },
      { type: { coding: [{ code: 'plan' }]  }, value: 'PPO Gold' },
    ],
    period: { start: '2026-01-01', end: '2026-12-31' },
    order: 1,
  };
  const c = normalizeCoverage(r);
  assert.equal(c.payorName, 'Aetna Health Plans');
  assert.equal(c.memberId, 'MEM-9001');
  assert.equal(c.subscriberId, 'SUB-001');
  assert.equal(c.groupNumber, 'GRP-7890');
  assert.equal(c.planName, 'PPO Gold');
  assert.equal(c.effectiveDate, '2026-01-01');
  assert.equal(c.endDate, '2026-12-31');
  assert.equal(c.order, 1);
  assert.equal(c.status, 'active');
});

// ── Encounter ────────────────────────────────────────────────────────────────

test('normalizeEncounter maps type, status, period, practitioner', () => {
  const r = {
    resourceType: 'Encounter', id: 'enc-1', status: 'finished',
    class: { code: 'AMB', display: 'Ambulatory' },
    type: [{ coding: [{ code: 'OFFICE', display: 'Office visit' }] }],
    subject: { reference: 'Patient/pt-1' },
    period: { start: '2026-03-15T09:00:00Z', end: '2026-03-15T09:30:00Z' },
    reasonCode: [{ coding: [{ code: 'Z00.00', display: 'Annual exam' }] }],
    participant: [{ individual: { reference: 'Practitioner/dr-1' } }],
    location: [{ location: { display: 'Springfield Clinic' } }],
  };
  const e = normalizeEncounter(r);
  assert.equal(e.fhirId, 'enc-1');
  assert.equal(e.status, 'finished');
  assert.equal(e.class, 'AMB');
  assert.equal(e.classDisplay, 'Ambulatory');
  assert.equal(e.type, 'Office visit');
  assert.equal(e.reasonCode, 'Z00.00');
  assert.equal(e.practitionerRef, 'Practitioner/dr-1');
  assert.equal(e.locationDisplay, 'Springfield Clinic');
});

// ── Observation ──────────────────────────────────────────────────────────────

test('normalizeObservation maps quantity, code, effective date', () => {
  const r = {
    resourceType: 'Observation', id: 'obs-1', status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic BP' }] },
    valueQuantity: { value: 124, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
    effectiveDateTime: '2026-03-15T09:15:00Z',
    subject: { reference: 'Patient/pt-1' },
    encounter: { reference: 'Encounter/enc-1' },
  };
  const o = normalizeObservation(r);
  assert.equal(o.code, '8480-6');
  assert.equal(o.codeSystem, 'http://loinc.org');
  assert.equal(o.value, 124);
  assert.equal(o.unit, 'mmHg');
  assert.equal(o.effectiveDate, '2026-03-15T09:15:00Z');
  assert.equal(o.encounterRef, 'Encounter/enc-1');
});

test('normalizeObservation handles non-quantitative valueString', () => {
  const r = {
    resourceType: 'Observation', id: 'obs-2', status: 'final',
    code: { coding: [{ code: 'note' }] },
    valueString: 'Patient denies recent travel.',
  };
  const o = normalizeObservation(r);
  assert.equal(o.value, 'Patient denies recent travel.');
  assert.equal(o.unit, null);
});

// ── Claim ────────────────────────────────────────────────────────────────────

test('normalizeClaim extracts items, diagnoses, total', () => {
  const r = {
    resourceType: 'Claim', id: 'clm-1', status: 'active', use: 'claim',
    type: { coding: [{ code: 'professional' }] },
    patient: { reference: 'Patient/pt-1' },
    insurer: { display: 'Aetna' },
    provider: { display: 'Springfield Clinic', identifier: { system: SYS_NPI, value: '1234567890' } },
    created: '2026-03-15T10:00:00Z',
    item: [{
      sequence: 1,
      productOrService: { coding: [{ system: SYS_CPT, code: '99213', display: 'Office visit' }] },
      servicedDate: '2026-03-15',
      net: { value: 150, currency: 'USD' },
      diagnosisSequence: [1],
    }],
    diagnosis: [{
      sequence: 1,
      diagnosisCodeableConcept: { coding: [{ system: SYS_ICD10, code: 'Z00.00', display: 'Annual exam' }] },
    }],
    total: { value: 150, currency: 'USD' },
  };
  const c = normalizeClaim(r);
  assert.equal(c.providerNpi, '1234567890');
  assert.equal(c.totalAmount, 150);
  assert.equal(c.items.length, 1);
  assert.equal(c.items[0].cptCode, '99213');
  assert.equal(c.items[0].amount, 150);
  assert.equal(c.diagnoses[0].icd10, 'Z00.00');
});

// ── buildFhirClaim ───────────────────────────────────────────────────────────

test('buildFhirClaim emits a structurally valid R4 Claim with CPT/ICD-10', () => {
  const claim = buildFhirClaim({
    patient:  { fhirId: 'pt-1' },
    coverage: { fhirId: 'cov-1', payorName: 'Aetna' },
    provider: { npi: '1234567890', organizationName: 'Springfield Clinic' },
    claim: {
      id: 'CLM-001',
      cptCode: '99213', cptDescription: 'Office visit, established patient',
      icd10Code: 'Z00.00', icd10Description: 'Annual exam',
      serviceDate: '2026-03-15',
      amount: 150,
      placeOfService: 11,
      modifiers: ['25'],
    },
  });
  assert.equal(claim.resourceType, 'Claim');
  assert.equal(claim.status, 'active');
  assert.equal(claim.use, 'claim');
  assert.equal(claim.patient.reference, 'Patient/pt-1');
  assert.equal(claim.insurance[0].coverage.reference, 'Coverage/cov-1');
  assert.equal(claim.provider.identifier.system, SYS_NPI);
  assert.equal(claim.provider.identifier.value, '1234567890');
  assert.equal(claim.diagnosis[0].diagnosisCodeableConcept.coding[0].system, SYS_ICD10);
  assert.equal(claim.diagnosis[0].diagnosisCodeableConcept.coding[0].code, 'Z00.00');
  assert.equal(claim.item[0].productOrService.coding[0].system, SYS_CPT);
  assert.equal(claim.item[0].productOrService.coding[0].code, '99213');
  assert.equal(claim.item[0].net.value, 150);
  assert.equal(claim.item[0].diagnosisSequence[0], 1);
  assert.equal(claim.item[0].modifier[0].coding[0].code, '25');
  assert.equal(claim.total.value, 150);
  assert.equal(claim.identifier[0].value, 'CLM-001');
});

test('buildFhirClaim rejects negative amounts and missing CPT/ICD', () => {
  assert.throws(() => buildFhirClaim({
    patient: { fhirId: 'pt' }, claim: { cptCode: '99213', icd10Code: 'Z00.00', amount: -1 },
  }), /non-negative/);
  assert.throws(() => buildFhirClaim({
    patient: { fhirId: 'pt' }, claim: { amount: 150 },
  }), /cptCode and claim.icd10Code/);
});

test('buildFhirPatient emits a structurally valid R4 Patient', () => {
  const r = buildFhirPatient({
    firstName: 'John', lastName: 'Doe',
    dateOfBirth: '1980-01-15', gender: 'male',
    mrn: 'MRN-001',
    address: { line: '1 Main St', city: 'Miami', state: 'FL', zip: '33101' },
    phone: '305-555-0100',
  });
  assert.equal(r.resourceType, 'Patient');
  assert.equal(r.name[0].family, 'Doe');
  assert.equal(r.name[0].given[0], 'John');
  assert.equal(r.identifier[0].value, 'MRN-001');
  assert.equal(r.address[0].postalCode, '33101');
  assert.equal(r.telecom[0].value, '305-555-0100');
});
