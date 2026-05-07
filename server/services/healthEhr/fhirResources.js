/**
 * Noesis.io Health  - FHIR R4 resource mapping
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Bidirectional mapping between FHIR R4 JSON resources and the internal
 * Noesis claim/patient model. Each `normalize*` function reduces a FHIR
 * resource to a stable plain object suitable for JSON storage and audit
 * logging. Each `buildFhir*` function does the inverse for write paths.
 *
 * Spec references:
 *   FHIR R4 - https://hl7.org/fhir/R4/
 *   US Core - https://hl7.org/fhir/us/core/
 */

'use strict';

const SYS_NPI       = 'http://hl7.org/fhir/sid/us-npi';
const SYS_ICD10     = 'http://hl7.org/fhir/sid/icd-10-cm';
const SYS_CPT       = 'http://www.ama-assn.org/go/cpt';
const SYS_LOINC     = 'http://loinc.org';
const SYS_CLAIMTYPE = 'http://terminology.hl7.org/CodeSystem/claim-type';
const SYS_MR        = 'http://terminology.hl7.org/CodeSystem/v2-0203';

function pickName(r) {
  const arr = Array.isArray(r.name) ? r.name : [];
  // Prefer "official" -> "usual" -> first
  return arr.find((n) => n.use === 'official') || arr.find((n) => n.use === 'usual') || arr[0] || {};
}

function pickAddress(r) {
  const arr = Array.isArray(r.address) ? r.address : [];
  return arr.find((a) => a.use === 'home') || arr[0] || {};
}

function pickContact(r, system) {
  const arr = Array.isArray(r.telecom) ? r.telecom : [];
  const hit = arr.find((t) => t && t.system === system);
  return hit ? hit.value : null;
}

/**
 * Normalize FHIR R4 Patient -> Noesis patient object.
 *
 * @param {object} r - FHIR Patient resource
 * @returns {object}
 */
function normalizePatient(r) {
  if (!r || r.resourceType !== 'Patient') {
    throw new Error('normalizePatient: resource.resourceType must be "Patient"');
  }
  const name = pickName(r);
  const addr = pickAddress(r);
  const mrn = (Array.isArray(r.identifier) ? r.identifier : []).find((i) => {
    const code = i && i.type && Array.isArray(i.type.coding) && i.type.coding[0] && i.type.coding[0].code;
    return code === 'MR' || (i && i.system && /mrn|medical/i.test(i.system));
  });
  const ssn = (Array.isArray(r.identifier) ? r.identifier : []).find((i) => {
    const code = i && i.type && Array.isArray(i.type.coding) && i.type.coding[0] && i.type.coding[0].code;
    return code === 'SS';
  });

  return {
    fhirId:       r.id || null,
    mrn:          mrn ? mrn.value : null,
    ssnLast4:     ssn && ssn.value ? String(ssn.value).slice(-4) : null,
    firstName:    Array.isArray(name.given) ? name.given.join(' ') : (name.given || ''),
    lastName:     name.family || '',
    middleName:   Array.isArray(name.given) && name.given[1] ? name.given[1] : null,
    dateOfBirth:  r.birthDate || null,
    gender:       r.gender || null,
    deceased:     typeof r.deceasedBoolean === 'boolean'
                    ? r.deceasedBoolean
                    : !!r.deceasedDateTime,
    deceasedDate: r.deceasedDateTime || null,
    address: {
      line:   Array.isArray(addr.line) ? addr.line.join(', ') : (addr.line || ''),
      city:   addr.city || '',
      state:  addr.state || '',
      zip:    addr.postalCode || '',
      country: addr.country || 'US',
    },
    phone:    pickContact(r, 'phone'),
    email:    pickContact(r, 'email'),
    language: r.communication && r.communication[0] && r.communication[0].language &&
              r.communication[0].language.coding && r.communication[0].language.coding[0]
                ? r.communication[0].language.coding[0].code
                : null,
    active:   r.active !== false,
    raw:      undefined,
  };
}

/**
 * Normalize FHIR R4 Coverage -> Noesis coverage object.
 *
 * @param {object} r - FHIR Coverage resource
 * @returns {object}
 */
function normalizeCoverage(r) {
  if (!r || r.resourceType !== 'Coverage') {
    throw new Error('normalizeCoverage: resource.resourceType must be "Coverage"');
  }
  const cls = Array.isArray(r.class) ? r.class : [];
  const findClass = (code) => {
    const c = cls.find((x) => x && x.type && Array.isArray(x.type.coding) &&
      x.type.coding.some((cc) => cc.code === code));
    return c ? c.value : null;
  };
  const payor = Array.isArray(r.payor) && r.payor[0] ? r.payor[0] : {};
  return {
    fhirId:       r.id || null,
    status:       r.status || 'unknown',
    subscriberId: r.subscriberId || (r.subscriber && r.subscriber.reference) || null,
    memberId:     (Array.isArray(r.identifier) && r.identifier[0]) ? r.identifier[0].value : null,
    payorName:    payor.display || null,
    payorRef:     payor.reference || null,
    groupNumber:  findClass('group'),
    planName:     findClass('plan'),
    planType:     findClass('plantype'),
    relationship: r.relationship && r.relationship.coding && r.relationship.coding[0]
                    ? r.relationship.coding[0].code
                    : null,
    effectiveDate: r.period && r.period.start ? r.period.start : null,
    endDate:       r.period && r.period.end   ? r.period.end   : null,
    order:        Number.isFinite(r.order) ? r.order : null,
  };
}

/**
 * Normalize FHIR R4 Encounter -> Noesis encounter object.
 *
 * @param {object} r - FHIR Encounter resource
 * @returns {object}
 */
function normalizeEncounter(r) {
  if (!r || r.resourceType !== 'Encounter') {
    throw new Error('normalizeEncounter: resource.resourceType must be "Encounter"');
  }
  const type = Array.isArray(r.type) && r.type[0] && Array.isArray(r.type[0].coding) && r.type[0].coding[0]
                 ? r.type[0].coding[0]
                 : {};
  const reason = Array.isArray(r.reasonCode) && r.reasonCode[0] && Array.isArray(r.reasonCode[0].coding) && r.reasonCode[0].coding[0]
                   ? r.reasonCode[0].coding[0]
                   : {};
  const participant = Array.isArray(r.participant) && r.participant[0] ? r.participant[0] : {};
  const location = Array.isArray(r.location) && r.location[0] && r.location[0].location
                     ? r.location[0].location
                     : {};
  return {
    fhirId:           r.id || null,
    status:           r.status || 'unknown',
    class:            r.class && r.class.code ? r.class.code : null,
    classDisplay:     r.class && r.class.display ? r.class.display : null,
    type:             type.display || type.code || null,
    typeCode:         type.code || null,
    subjectRef:       r.subject && r.subject.reference ? r.subject.reference : null,
    period:           r.period || null,
    serviceType:      r.serviceType && r.serviceType.coding && r.serviceType.coding[0]
                        ? r.serviceType.coding[0].display || r.serviceType.coding[0].code
                        : null,
    reasonCode:       reason.code || null,
    reasonDisplay:    reason.display || null,
    practitionerRef:  participant.individual && participant.individual.reference || null,
    locationDisplay:  location.display || null,
  };
}

/**
 * Normalize FHIR R4 Observation -> Noesis observation object.
 *
 * @param {object} r - FHIR Observation resource
 * @returns {object}
 */
function normalizeObservation(r) {
  if (!r || r.resourceType !== 'Observation') {
    throw new Error('normalizeObservation: resource.resourceType must be "Observation"');
  }
  const code = r.code && Array.isArray(r.code.coding) && r.code.coding[0] ? r.code.coding[0] : {};
  let value = null;
  let unit  = null;
  if (r.valueQuantity) {
    value = r.valueQuantity.value;
    unit  = r.valueQuantity.unit || r.valueQuantity.code || null;
  } else if (r.valueString !== null && r.valueString !== undefined) {
    value = r.valueString;
  } else if (r.valueCodeableConcept && Array.isArray(r.valueCodeableConcept.coding) && r.valueCodeableConcept.coding[0]) {
    value = r.valueCodeableConcept.coding[0].display || r.valueCodeableConcept.coding[0].code;
  } else if (typeof r.valueBoolean === 'boolean') {
    value = r.valueBoolean;
  } else if (Number.isFinite(r.valueInteger)) {
    value = r.valueInteger;
  }
  return {
    fhirId:    r.id || null,
    status:    r.status || 'unknown',
    code:      code.code || null,
    codeSystem: code.system || null,
    display:   code.display || null,
    value,
    unit,
    interpretation: Array.isArray(r.interpretation) && r.interpretation[0] && Array.isArray(r.interpretation[0].coding) && r.interpretation[0].coding[0]
                      ? r.interpretation[0].coding[0].code
                      : null,
    effectiveDate:  r.effectiveDateTime || (r.effectivePeriod && r.effectivePeriod.start) || null,
    issued:         r.issued || null,
    subjectRef:     r.subject && r.subject.reference ? r.subject.reference : null,
    encounterRef:   r.encounter && r.encounter.reference ? r.encounter.reference : null,
  };
}

/**
 * Normalize FHIR R4 Claim -> Noesis claim summary object.
 *
 * @param {object} r - FHIR Claim resource
 * @returns {object}
 */
function normalizeClaim(r) {
  if (!r || r.resourceType !== 'Claim') {
    throw new Error('normalizeClaim: resource.resourceType must be "Claim"');
  }
  const items = Array.isArray(r.item) ? r.item.map((it) => ({
    sequence:    it.sequence,
    cptCode:     it.productOrService && Array.isArray(it.productOrService.coding) && it.productOrService.coding[0]
                   ? it.productOrService.coding[0].code
                   : null,
    cptDisplay:  it.productOrService && Array.isArray(it.productOrService.coding) && it.productOrService.coding[0]
                   ? it.productOrService.coding[0].display
                   : null,
    serviceDate: it.servicedDate || (it.servicedPeriod && it.servicedPeriod.start) || null,
    amount:      it.net && Number.isFinite(it.net.value) ? it.net.value : null,
    currency:    it.net && it.net.currency ? it.net.currency : 'USD',
    diagnosisLinks: it.diagnosisLinkId || it.diagnosisSequence || [],
  })) : [];
  const diagnoses = Array.isArray(r.diagnosis) ? r.diagnosis.map((d) => ({
    sequence: d.sequence,
    icd10:    d.diagnosisCodeableConcept && Array.isArray(d.diagnosisCodeableConcept.coding) && d.diagnosisCodeableConcept.coding[0]
                ? d.diagnosisCodeableConcept.coding[0].code
                : null,
    display:  d.diagnosisCodeableConcept && Array.isArray(d.diagnosisCodeableConcept.coding) && d.diagnosisCodeableConcept.coding[0]
                ? d.diagnosisCodeableConcept.coding[0].display
                : null,
  })) : [];
  return {
    fhirId:    r.id || null,
    status:    r.status || 'unknown',
    use:       r.use || null,
    type:      r.type && Array.isArray(r.type.coding) && r.type.coding[0] ? r.type.coding[0].code : null,
    patientRef: r.patient && r.patient.reference ? r.patient.reference : null,
    insurerDisplay: r.insurer && r.insurer.display ? r.insurer.display : null,
    providerDisplay: r.provider && r.provider.display ? r.provider.display : null,
    providerNpi:     r.provider && r.provider.identifier && r.provider.identifier.system === SYS_NPI
                       ? r.provider.identifier.value
                       : null,
    created:   r.created || null,
    items,
    diagnoses,
    totalAmount:   r.total && Number.isFinite(r.total.value) ? r.total.value : null,
    totalCurrency: r.total && r.total.currency ? r.total.currency : 'USD',
  };
}

/**
 * Build a FHIR R4 Claim resource for professional submission.
 *
 * The shape follows US Core 5.0 conventions: identifiers go through canonical
 * NPI/ICD-10/CPT systems, and the Claim links its items to its diagnoses by
 * `diagnosisLinkId` (positive integers, NOT zero-based).
 *
 * @param {object} input
 * @param {object} input.patient   - { fhirId }
 * @param {object} input.coverage  - { fhirId, payorName }
 * @param {object} input.provider  - { npi, organizationName, lastName, firstName }
 * @param {object} input.claim     - { id, cptCode, cptDescription, icd10Code, icd10Description, serviceDate, amount, placeOfService, modifiers }
 * @returns {object} FHIR R4 Claim resource
 */
function buildFhirClaim(input) {
  if (!input || !input.patient || !input.patient.fhirId) {
    throw new Error('buildFhirClaim: patient.fhirId required');
  }
  if (!input.claim || !input.claim.cptCode || !input.claim.icd10Code) {
    throw new Error('buildFhirClaim: claim.cptCode and claim.icd10Code required');
  }
  if (!Number.isFinite(input.claim.amount) || input.claim.amount < 0) {
    throw new Error('buildFhirClaim: claim.amount must be a non-negative number');
  }

  const provider = input.provider || {};
  const coverage = input.coverage || {};
  const claim    = input.claim;

  const item = {
    sequence: 1,
    productOrService: {
      coding: [{
        system:  SYS_CPT,
        code:    claim.cptCode,
        display: claim.cptDescription || claim.cptCode,
      }],
    },
    servicedDate:    claim.serviceDate || new Date().toISOString().slice(0, 10),
    quantity:        { value: 1 },
    unitPrice:       { value: claim.amount, currency: 'USD' },
    net:             { value: claim.amount, currency: 'USD' },
    diagnosisSequence: [1],
  };
  if (Array.isArray(claim.modifiers) && claim.modifiers.length) {
    item.modifier = claim.modifiers.map((m) => ({ coding: [{ system: SYS_CPT, code: m }] }));
  }
  if (claim.placeOfService) {
    item.locationCodeableConcept = {
      coding: [{
        system:  'https://www.cms.gov/Medicare/Coding/place-of-service-codes',
        code:    String(claim.placeOfService),
      }],
    };
  }

  const fhirClaim = {
    resourceType: 'Claim',
    status:       'active',
    type: {
      coding: [{ system: SYS_CLAIMTYPE, code: 'professional', display: 'Professional' }],
    },
    use:          'claim',
    patient:      { reference: 'Patient/' + input.patient.fhirId },
    created:      new Date().toISOString(),
    insurer:      { display: coverage.payorName || 'Unknown Payer' },
    provider: {
      display:    provider.organizationName || (provider.lastName ? `${provider.lastName}, ${provider.firstName || ''}`.trim() : 'PROVIDER'),
      identifier: provider.npi ? { system: SYS_NPI, value: provider.npi } : undefined,
    },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [{
      sequence: 1,
      focal:    true,
      coverage: { reference: coverage.fhirId ? ('Coverage/' + coverage.fhirId) : 'Coverage/unknown' },
    }],
    diagnosis: [{
      sequence: 1,
      diagnosisCodeableConcept: {
        coding: [{
          system:  SYS_ICD10,
          code:    claim.icd10Code,
          display: claim.icd10Description || claim.icd10Code,
        }],
      },
    }],
    item:  [item],
    total: { value: claim.amount, currency: 'USD' },
  };

  if (claim.id) {
    fhirClaim.identifier = [{
      system: 'urn:noesis:claim-id',
      value:  String(claim.id),
    }];
  }

  return fhirClaim;
}

/**
 * Build a FHIR R4 Patient resource for write paths (e.g. demographic sync).
 *
 * @param {object} input - Noesis patient
 * @returns {object}
 */
function buildFhirPatient(input) {
  if (!input || !input.lastName) {
    throw new Error('buildFhirPatient: at least lastName required');
  }
  const r = {
    resourceType: 'Patient',
    active:       input.active !== false,
    name: [{
      use:    'official',
      family: input.lastName,
      given:  [input.firstName, input.middleName].filter(Boolean),
    }],
  };
  if (input.dateOfBirth) { r.birthDate = input.dateOfBirth; }
  if (input.gender)      { r.gender    = input.gender; }
  if (input.mrn) {
    r.identifier = [{
      type:   { coding: [{ system: SYS_MR, code: 'MR' }] },
      value:  input.mrn,
    }];
  }
  if (input.address && (input.address.line || input.address.city || input.address.zip)) {
    r.address = [{
      use:        'home',
      line:       input.address.line ? [input.address.line] : undefined,
      city:       input.address.city || undefined,
      state:      input.address.state || undefined,
      postalCode: input.address.zip || undefined,
      country:    input.address.country || 'US',
    }];
  }
  const tel = [];
  if (input.phone) { tel.push({ system: 'phone', value: input.phone, use: 'home' }); }
  if (input.email) { tel.push({ system: 'email', value: input.email }); }
  if (tel.length) { r.telecom = tel; }
  return r;
}

module.exports = {
  SYS_NPI,
  SYS_ICD10,
  SYS_CPT,
  SYS_LOINC,
  SYS_CLAIMTYPE,
  normalizePatient,
  normalizeCoverage,
  normalizeEncounter,
  normalizeObservation,
  normalizeClaim,
  buildFhirClaim,
  buildFhirPatient,
};
