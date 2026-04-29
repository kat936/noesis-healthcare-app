/**
 * Noesis.io Health  - Integrations Route
 * © 2026 Athena Core Technologies, Inc.
 *
 * All external service integrations surfaced as REST endpoints:
 *   GET  /integrations/status                 - health check all integrations
 *   POST /integrations/npi/lookup             - REAL NPI Registry (free, no key)
 *   GET  /integrations/npi/:npi               - quick NPI lookup by number
 *   POST /integrations/fda/drugs              - REAL OpenFDA drug search
 *   POST /integrations/fda/devices            - REAL OpenFDA device search
 *   POST /integrations/eligibility/check      - payer eligibility 270/271
 *   POST /integrations/eligibility/batch      - batch eligibility check
 *   POST /integrations/clearinghouse/submit   - EDI 837P claim submission
 *   GET  /integrations/clearinghouse/status/:id  - claim tracking 276
 *   GET  /integrations/clearinghouse/eras     - retrieve 835 ERAs
 *   POST /integrations/ehr/patients/search    - FHIR R4 patient search
 *   GET  /integrations/ehr/patients/:id/coverage   - FHIR coverage
 *   GET  /integrations/ehr/patients/:id/encounters  - FHIR encounter history
 *   POST /integrations/ehr/claims/submit      - FHIR R4 claim submission
 *   GET  /integrations/proof/:provider        - live proof-of-integration test
 */

const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter, strictLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { npiLookupSchema, drugSearchSchema, fdaDeviceSearchSchema } = require('../schemas/validation');

const npiRegistry      = require('../services/npiRegistry');
const openFDA          = require('../services/openFDA');
const stripeService    = require('../services/stripe');
const clearinghouse    = require('../services/clearinghouse');
const payerEligibility = require('../services/payerEligibility');
const ehrConnector     = require('../services/ehrConnector');

const router = express.Router();

// ── GET /status  - all integrations at a glance ────────────────────────────────
router.get('/status', authenticate, apiLimiter, (req, res) => {
  try {
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      integrations: {
        npiRegistry:      npiRegistry.getStatus(),
        openFDA:          openFDA.getStatus(),
        stripe:           stripeService.getStatus(),
        clearinghouse:    clearinghouse.getStatus(),
        payerEligibility: payerEligibility.getStatus(),
        ehrConnector:     ehrConnector.getStatus(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get integration status', code: 'STATUS_ERROR' });
  }
});

// ── NPI Registry ──────────────────────────────────────────────────────────────

router.post(
  '/npi/lookup',
  authenticate,
  requirePlan('solo', 'group', 'enterprise'),
  apiLimiter,
  validate(npiLookupSchema),
  async (req, res) => {
    try {
      const result = await npiRegistry.lookupNPI(req.validated);
      res.json({ success: result.success, source: result.source, resultCount: result.resultCount, providers: result.providers, timestamp: result.timestamp });
    } catch (err) {
      res.status(500).json({ error: 'NPI lookup failed', code: 'NPI_LOOKUP_ERROR', details: err.message });
    }
  }
);

router.get('/npi/:npi', authenticate, apiLimiter, async (req, res) => {
  try {
    const npi = req.params.npi;
    if (!/^\d{10}$/.test(npi)) {
      return res.status(400).json({ error: 'NPI must be exactly 10 digits', code: 'INVALID_NPI' });
    }
    const result = await npiRegistry.lookupNPI({ npiNumber: npi });
    if (!result.success || result.resultCount === 0) {
      return res.status(404).json({ error: 'NPI not found', code: 'NPI_NOT_FOUND', npi });
    }
    res.json({ success: true, provider: result.providers[0], source: result.source, timestamp: result.timestamp });
  } catch (err) {
    res.status(500).json({ error: 'NPI lookup failed', code: 'NPI_LOOKUP_ERROR', details: err.message });
  }
});

// ── OpenFDA ───────────────────────────────────────────────────────────────────

router.post(
  '/fda/drugs',
  authenticate,
  requirePlan('solo', 'group', 'enterprise'),
  apiLimiter,
  validate(drugSearchSchema),
  async (req, res) => {
    try {
      const result = await openFDA.searchDrugs(req.validated);
      if (!result.success) {
        return res.status(400).json({ error: result.error, code: 'FDA_SEARCH_ERROR', details: result.details });
      }
      res.json({ success: true, source: result.source, resultCount: result.resultCount, drugs: result.drugs, timestamp: result.timestamp });
    } catch (err) {
      res.status(500).json({ error: 'FDA drug search failed', code: 'FDA_SEARCH_ERROR', details: err.message });
    }
  }
);

router.post(
  '/fda/devices',
  authenticate,
  requirePlan('solo', 'group', 'enterprise'),
  apiLimiter,
  validate(fdaDeviceSearchSchema),
  async (req, res) => {
    try {
      const result = await openFDA.searchDevices(req.validated);
      if (!result.success) {
        return res.status(400).json({ error: result.error, code: 'FDA_DEVICE_ERROR', details: result.details });
      }
      res.json({ success: true, source: result.source, resultCount: result.resultCount, events: result.events, timestamp: result.timestamp });
    } catch (err) {
      res.status(500).json({ error: 'FDA device search failed', code: 'FDA_DEVICE_ERROR', details: err.message });
    }
  }
);

// ── Payer Eligibility ─────────────────────────────────────────────────────────

router.post(
  '/eligibility/check',
  authenticate,
  requirePlan('solo', 'group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const { patient, provider, payer, serviceType } = req.body;
      if (!patient || !payer) {
        return res.status(400).json({ error: 'patient and payer are required', code: 'VALIDATION_ERROR' });
      }
      const providerData = provider || { npi: req.user.npi, organizationName: req.user.organizationName };
      const result = await payerEligibility.checkEligibility({ patient, provider: providerData, payer, serviceType });
      res.json({ success: true, ...result, checkedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: 'Eligibility check failed', code: 'ELIGIBILITY_ERROR', details: err.message });
    }
  }
);

router.post(
  '/eligibility/batch',
  authenticate,
  requirePlan('group', 'enterprise'),
  submissionLimiter,
  async (req, res) => {
    try {
      const { requests } = req.body;
      if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({ error: 'requests array is required', code: 'VALIDATION_ERROR' });
      }
      if (requests.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 eligibility checks per batch', code: 'BATCH_TOO_LARGE' });
      }
      const results = await payerEligibility.checkEligibilityBatch(requests);
      res.json({ success: true, total: results.length, results, checkedAt: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: 'Batch eligibility check failed', code: 'BATCH_ERROR', details: err.message });
    }
  }
);

// ── EDI Clearinghouse ─────────────────────────────────────────────────────────

router.post(
  '/clearinghouse/submit',
  authenticate,
  requirePlan('group', 'enterprise'),
  submissionLimiter,
  async (req, res) => {
    try {
      const { claim, provider, payer } = req.body;
      if (!claim || !payer) {
        return res.status(400).json({ error: 'claim and payer objects are required', code: 'VALIDATION_ERROR' });
      }
      const providerData = provider || { npi: req.user.npi, organizationName: req.user.organizationName };
      const result = await clearinghouse.submitClaim(claim, providerData, payer);

      // Update claim status in DB if connected
      const db = require('../db');
      if (db.isConnected() && claim.id && result.success) {
        await db.query(
          `UPDATE claims SET status = 'submitted', adjudication_notes = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify({ trackingId: result.trackingId, submittedAt: result.submittedAt }), claim.id]
        ).catch(() => {});
      }

      res.json({ success: result.success, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Claim submission failed', code: 'SUBMISSION_ERROR', details: err.message });
    }
  }
);

router.get(
  '/clearinghouse/status/:trackingId',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const result = await clearinghouse.getClaimStatus(req.params.trackingId);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Status check failed', code: 'STATUS_ERROR', details: err.message });
    }
  }
);

router.get(
  '/clearinghouse/eras',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const { fromDate, toDate, limit } = req.query;
      const result = await clearinghouse.getERAs({ fromDate, toDate, limit: parseInt(limit) || 20 });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'ERA retrieval failed', code: 'ERA_ERROR', details: err.message });
    }
  }
);

// ── EHR / FHIR R4 ────────────────────────────────────────────────────────────

router.post(
  '/ehr/patients/search',
  authenticate,
  requirePlan('enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const { lastName, firstName, dateOfBirth, mrn } = req.body;
      const result = await ehrConnector.searchPatients({ lastName, firstName, dateOfBirth, mrn });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Patient search failed', code: 'EHR_PATIENT_ERROR', details: err.message });
    }
  }
);

router.get(
  '/ehr/patients/:patientId/coverage',
  authenticate,
  requirePlan('enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const result = await ehrConnector.getPatientCoverage(req.params.patientId);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Coverage lookup failed', code: 'EHR_COVERAGE_ERROR', details: err.message });
    }
  }
);

router.get(
  '/ehr/patients/:patientId/encounters',
  authenticate,
  requirePlan('enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const { fromDate, limit } = req.query;
      const result = await ehrConnector.getPatientEncounters(req.params.patientId, { fromDate, limit: parseInt(limit) || 10 });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Encounter lookup failed', code: 'EHR_ENCOUNTER_ERROR', details: err.message });
    }
  }
);

router.post(
  '/ehr/claims/submit',
  authenticate,
  requirePlan('enterprise'),
  submissionLimiter,
  async (req, res) => {
    try {
      const { claim, provider, patient, coverage } = req.body;
      if (!claim || !patient) {
        return res.status(400).json({ error: 'claim and patient are required', code: 'VALIDATION_ERROR' });
      }
      const result = await ehrConnector.submitFHIRClaim(claim, provider || {}, patient, coverage || {});
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'FHIR claim submission failed', code: 'EHR_CLAIM_ERROR', details: err.message });
    }
  }
);

// ── GET /proof/:provider  - live integration smoke test ────────────────────────
router.get('/proof/:provider', authenticate, apiLimiter, async (req, res) => {
  try {
    const { provider } = req.params;

    switch (provider.toLowerCase()) {
      case 'npi': {
        const result = await npiRegistry.lookupNPI({ npiNumber: '1234567893' });
        return res.json({ success: true, provider: 'NPI_REGISTRY_CMS', proof: { apiCallMade: true, endpoint: 'https://npiregistry.cms.hhs.gov/api/', response: result }, integration: npiRegistry.getStatus() });
      }
      case 'fda': {
        const result = await openFDA.searchDrugs({ genericName: 'acetaminophen', limit: 2 });
        return res.json({ success: true, provider: 'OPEN_FDA', proof: { apiCallMade: true, endpoint: 'https://api.fda.gov/drug/label.json', response: result }, integration: openFDA.getStatus() });
      }
      case 'clearinghouse': {
        const result = await clearinghouse.submitClaim({ id: 'PROOF-001', cptCode: '99213', icd10Code: 'Z00.00', amount: 150, serviceDate: new Date().toISOString().slice(0, 10) }, { npi: '0000000000', organizationName: 'Noesis Proof Test' }, { payerId: 'AETNA', name: 'Aetna' });
        return res.json({ success: true, provider: 'CLEARINGHOUSE', proof: { apiCallMade: !result.demo, demo: !!result.demo, response: result }, integration: clearinghouse.getStatus() });
      }
      case 'eligibility': {
        const result = await payerEligibility.checkEligibility({ patient: { memberId: 'MEM-TEST-001', firstName: 'John', lastName: 'Test', dateOfBirth: '1980-01-01' }, provider: { npi: '0000000000', organizationName: 'Noesis Proof Test' }, payer: { id: 'aetna' } });
        return res.json({ success: true, provider: 'PAYER_ELIGIBILITY', proof: { apiCallMade: !result.demo, demo: !!result.demo, response: result }, integration: payerEligibility.getStatus() });
      }
      case 'ehr': {
        const result = await ehrConnector.searchPatients({ lastName: 'Test', firstName: 'FHIR' });
        return res.json({ success: true, provider: 'EHR_FHIR_R4', proof: { apiCallMade: !result.demo, demo: !!result.demo, response: result }, integration: ehrConnector.getStatus() });
      }
      case 'stripe': {
        return res.json({ success: true, provider: 'STRIPE', proof: { apiCallMade: false, reason: 'Stripe requires live credentials', status: stripeService.getStatus() }, integration: stripeService.getStatus() });
      }
      default:
        return res.status(400).json({ error: 'Unknown provider', code: 'INVALID_PROVIDER', available: ['npi', 'fda', 'clearinghouse', 'eligibility', 'ehr', 'stripe'] });
    }
  } catch (err) {
    res.status(500).json({ error: 'Integration proof failed', code: 'PROOF_ERROR', details: err.message });
  }
});

module.exports = router;
