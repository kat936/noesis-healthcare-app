/**
 * Noesis.io Health — EHR FHIR R4 Connector
 * © 2026 Athena Core Technologies, Inc.
 *
 * Connects to EHR systems via HL7 FHIR R4 REST API.
 * Supports SMART on FHIR OAuth2 app launch for user-facing EHR integrations.
 *
 * Tested EHR targets:
 *   Epic        — https://fhir.epic.com       (sandbox: open.epic.com/FHIR/R4)
 *   Athenahealth — https://api.platform.athenahealth.com/fhir/r4
 *   Cerner      — https://fhir-myrecord.cerner.com/r4
 *   Meditech    — https://mtwilson.meditech.com/fhir/r4
 *
 * Environment variables:
 *   EHR_PROVIDER         = 'epic' | 'athena' | 'cerner' | 'meditech'
 *   EHR_FHIR_BASE_URL    = base URL of the FHIR endpoint
 *   EHR_CLIENT_ID        = OAuth2 client ID (registered in EHR developer portal)
 *   EHR_CLIENT_SECRET    = OAuth2 client secret (system-to-system only)
 *   EHR_TOKEN_URL        = OAuth2 token endpoint
 *   EHR_ORGANIZATION_ID  = Your NPI / organization ID in the EHR
 *
 * FHIR resources used:
 *   Patient         — demographics, insurance
 *   Practitioner    — provider directory
 *   Coverage        — insurance coverage
 *   Claim           — professional claims (outbound)
 *   ClaimResponse   — adjudication results (inbound)
 *   Encounter       — visit/encounter records
 *   Condition       — diagnoses (ICD-10)
 *   Procedure       — procedures (CPT)
 *   ExplanationOfBenefit — ERA/EOB data
 */

const https = require('https');
const http  = require('http');

const EHR_PROVIDER  = process.env.EHR_PROVIDER        || 'demo';
const FHIR_BASE_URL = process.env.EHR_FHIR_BASE_URL   || '';
const CLIENT_ID     = process.env.EHR_CLIENT_ID        || '';
const CLIENT_SECRET = process.env.EHR_CLIENT_SECRET    || '';
const TOKEN_URL     = process.env.EHR_TOKEN_URL        || '';
const ORG_ID        = process.env.EHR_ORGANIZATION_ID  || '';

// ── Token Cache ───────────────────────────────────────────────────────────────
let _tokenCache = null;
let _tokenExpiry = 0;

async function getAccessToken() {
  if (_tokenCache && Date.now() < _tokenExpiry) { return _tokenCache; }
  if (!CLIENT_ID || !CLIENT_SECRET || !TOKEN_URL) { return null; }

  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope:         'system/Patient.read system/Claim.write system/Coverage.read system/Encounter.read system/Condition.read system/Procedure.read',
    }).toString();

    const urlObj  = new URL(TOKEN_URL);
    const isHttps = urlObj.protocol === 'https:';

    const options = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (isHttps ? 443 : 80),
      path:     urlObj.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          _tokenCache  = json.access_token;
          _tokenExpiry = Date.now() + ((json.expires_in || 3600) - 60) * 1000;
          resolve(_tokenCache);
        } catch { reject(new Error('Token parse error: ' + data)); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── FHIR Request Helper ───────────────────────────────────────────────────────
async function fhirRequest(method, resourcePath, body) {
  const token   = await getAccessToken();
  const url     = FHIR_BASE_URL.replace(/\/$/, '') + '/' + resourcePath.replace(/^\//, '');
  const urlObj  = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const payload = body ? JSON.stringify(body) : null;

  const headers = {
    'Accept':       'application/fhir+json',
    'Content-Type': 'application/fhir+json',
  };
  if (token)   { headers['Authorization']  = `Bearer ${token}`; }
  if (payload) { headers['Content-Length'] = Buffer.byteLength(payload); }

  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (isHttps ? 443 : 80),
      path:     urlObj.pathname + urlObj.search,
      method,
      headers,
    };

    const req = (isHttps ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) { req.write(payload); }
    req.end();
  });
}

// ── FHIR Resource Normalizers ─────────────────────────────────────────────────
function normalizePatient(r) {
  const name    = r.name?.[0] || {};
  const address = r.address?.[0] || {};
  const phone   = r.telecom?.find((t) => t.system === 'phone')?.value;
  const email   = r.telecom?.find((t) => t.system === 'email')?.value;
  return {
    fhirId:      r.id,
    mrn:         r.identifier?.find((i) => i.type?.coding?.[0]?.code === 'MR')?.value,
    firstName:   name.given?.join(' ') || '',
    lastName:    name.family || '',
    dateOfBirth: r.birthDate,
    gender:      r.gender,
    address:     { line: address.line?.join(', '), city: address.city, state: address.state, zip: address.postalCode },
    phone,
    email,
    coverage:    r.coverage || [],
  };
}

function normalizeCoverage(r) {
  return {
    fhirId:        r.id,
    status:        r.status,
    subscriberId:  r.subscriberId,
    memberId:      r.identifier?.[0]?.value,
    payorName:     r.payor?.[0]?.display,
    payorRef:      r.payor?.[0]?.reference,
    groupNumber:   r.class?.find((c) => c.type?.coding?.[0]?.code === 'group')?.value,
    planName:      r.class?.find((c) => c.type?.coding?.[0]?.code === 'plan')?.value,
    effectiveDate: r.period?.start,
    endDate:       r.period?.end,
    order:         r.order,
  };
}

function normalizeEncounter(r) {
  return {
    fhirId:        r.id,
    status:        r.status,
    type:          r.type?.[0]?.coding?.[0]?.display,
    subject:       r.subject?.reference,
    period:        r.period,
    reasonCode:    r.reasonCode?.[0]?.coding?.[0]?.code,
    serviceType:   r.serviceType?.coding?.[0]?.display,
    practitioner:  r.participant?.[0]?.individual?.reference,
    location:      r.location?.[0]?.location?.display,
  };
}

// ── FHIR Claim Builder ────────────────────────────────────────────────────────
function buildFHIRClaim(claim, provider, patient, coverage) {
  return {
    resourceType: 'Claim',
    status:       'active',
    type:         { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
    use:          'claim',
    patient:      { reference: `Patient/${patient.fhirId || patient.id}` },
    created:      new Date().toISOString(),
    insurer:      { display: coverage?.payorName || 'Unknown Payer' },
    provider: {
      identifier: { system: 'http://hl7.org/fhir/sid/us-npi', value: provider.npi },
      display:    provider.organizationName || provider.name,
    },
    priority:     { coding: [{ code: 'normal' }] },
    insurance:    [{
      sequence: 1,
      focal:    true,
      coverage: { reference: `Coverage/${coverage?.fhirId || 'unknown'}` },
    }],
    item: [{
      sequence:       1,
      productOrService: {
        coding: [{
          system:  'http://www.ama-assn.org/go/cpt',
          code:    claim.cptCode,
          display: claim.cptDescription || claim.cptCode,
        }],
      },
      servicedDate:   claim.serviceDate,
      unitPrice:      { value: claim.amount, currency: 'USD' },
      net:            { value: claim.amount, currency: 'USD' },
      diagnosisLinkId: [1],
    }],
    diagnosis: [{
      sequence: 1,
      diagnosisCodeableConcept: {
        coding: [{
          system:  'http://hl7.org/fhir/sid/icd-10-cm',
          code:    claim.icd10Code,
          display: claim.icd10Description || claim.icd10Code,
        }],
      },
    }],
    total: { value: claim.amount, currency: 'USD' },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────
function isConfigured() {
  return !!(FHIR_BASE_URL && CLIENT_ID && EHR_PROVIDER !== 'demo');
}

function getStatus() {
  return {
    provider:     EHR_PROVIDER,
    configured:   isConfigured(),
    fhirVersion:  'R4',
    fhirBaseUrl:  FHIR_BASE_URL || null,
    orgId:        ORG_ID || null,
    features:     ['patient_search', 'coverage_lookup', 'claim_submission', 'encounter_history', 'condition_list'],
    supportedEHRs: [
      { name: 'Epic',         id: 'epic',      sandboxUrl: 'https://open.epic.com/FHIR/R4',                      requiresPartnership: true  },
      { name: 'Athenahealth', id: 'athena',    sandboxUrl: 'https://api.platform.athenahealth.com/fhir/r4',      requiresPartnership: true  },
      { name: 'Cerner',       id: 'cerner',    sandboxUrl: 'https://fhir-myrecord.cerner.com/r4',                requiresPartnership: false },
      { name: 'Meditech',     id: 'meditech',  sandboxUrl: 'https://mtwilson.meditech.com/fhir/r4',              requiresPartnership: false },
    ],
    smartOnFHIR: {
      supported:        true,
      launchTypes:      ['standalone', 'ehr_launch'],
      scopes:           ['openid', 'fhirUser', 'launch', 'patient/*.read', 'system/Claim.write'],
      tokenEndpoint:    TOKEN_URL || null,
    },
  };
}

async function searchPatients({ lastName, firstName, dateOfBirth, mrn }) {
  if (!isConfigured()) {
    return { success: true, demo: true, total: 1, patients: [{
      fhirId: 'demo-patient-001', mrn: 'MRN-12345',
      firstName: firstName || 'John', lastName: lastName || 'Doe',
      dateOfBirth: dateOfBirth || '1980-05-15', gender: 'male',
      address: { line: '123 Main St', city: 'Miami', state: 'FL', zip: '33101' },
      phone: '305-555-0100', email: 'john.doe@email.com',
    }]};
  }

  const params = new URLSearchParams();
  if (lastName)    { params.set('family', lastName); }
  if (firstName)   { params.set('given', firstName); }
  if (dateOfBirth) { params.set('birthdate', dateOfBirth); }
  if (mrn)         { params.set('identifier', mrn); }

  const res = await fhirRequest('GET', `Patient?${params.toString()}`);
  const patients = (res.body?.entry || []).map((e) => normalizePatient(e.resource));
  return { success: res.status < 300, total: res.body?.total || patients.length, patients };
}

async function getPatientCoverage(patientFhirId) {
  if (!isConfigured()) {
    return { success: true, demo: true, coverages: [{
      fhirId: 'demo-cov-001', status: 'active', subscriberId: 'SUB-001',
      memberId: 'MEM-12345', payorName: 'Aetna Health Plans',
      groupNumber: 'GRP-7890', planName: 'PPO Gold', effectiveDate: '2026-01-01', endDate: '2026-12-31',
    }]};
  }

  const res = await fhirRequest('GET', `Coverage?patient=${patientFhirId}&status=active`);
  const coverages = (res.body?.entry || []).map((e) => normalizeCoverage(e.resource));
  return { success: res.status < 300, coverages };
}

async function getPatientEncounters(patientFhirId, { fromDate, limit = 10 } = {}) {
  if (!isConfigured()) {
    return { success: true, demo: true, encounters: [{
      fhirId: 'demo-enc-001', status: 'finished', type: 'Office visit',
      period: { start: '2026-03-15T09:00:00Z', end: '2026-03-15T09:30:00Z' },
      reasonCode: 'Z00.00', serviceType: 'Primary Care',
    }]};
  }

  const params = new URLSearchParams({ patient: patientFhirId, _count: limit, _sort: '-date' });
  if (fromDate) { params.set('date', `ge${fromDate}`); }
  const res = await fhirRequest('GET', `Encounter?${params.toString()}`);
  const encounters = (res.body?.entry || []).map((e) => normalizeEncounter(e.resource));
  return { success: res.status < 300, encounters };
}

async function submitFHIRClaim(claim, provider, patient, coverage) {
  const fhirClaim = buildFHIRClaim(claim, provider, patient, coverage);

  if (!isConfigured()) {
    return { success: true, demo: true, claimId: 'demo-claim-fhir-001', fhirClaim, status: 'active' };
  }

  const res = await fhirRequest('POST', 'Claim', fhirClaim);
  return {
    success:   res.status < 300,
    claimId:   res.body?.id,
    fhirClaim,
    status:    res.body?.status,
    raw:       res.body,
  };
}

async function getExplanationOfBenefits(patientFhirId, { limit = 20 } = {}) {
  if (!isConfigured()) {
    return { success: true, demo: true, eobs: [{
      fhirId: 'demo-eob-001', status: 'active', use: 'claim',
      outcome: 'complete', totalBenefit: { value: 720.00, currency: 'USD' },
      totalCost: { value: 850.00, currency: 'USD' },
    }]};
  }

  const params = new URLSearchParams({ patient: patientFhirId, _count: limit });
  const res    = await fhirRequest('GET', `ExplanationOfBenefit?${params.toString()}`);
  const eobs   = (res.body?.entry || []).map((e) => e.resource);
  return { success: res.status < 300, eobs };
}

module.exports = {
  getStatus,
  isConfigured,
  searchPatients,
  getPatientCoverage,
  getPatientEncounters,
  submitFHIRClaim,
  getExplanationOfBenefits,
  buildFHIRClaim,
};
