/**
 * Noesis.io Health  - EHR/FHIR routes
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Routes mounted at /api/v1/health/ehr/* (NEW namespace; does not modify
 * the existing /api/v1/integrations/ehr/* endpoints used by the iOS app
 * currently in App Review).
 *
 * Endpoints:
 *   GET  /vendors                      - list supported vendors + config status
 *   GET  /status                       - feature status summary
 *   GET  /connections                  - list this org's connections
 *   GET  /connections/:vendor          - connection status for a vendor
 *   POST /connect/:vendor              - start SMART OAuth (returns authorize URL)
 *   GET  /callback                     - OAuth redirect target (state, code)
 *   POST /connections/:vendor/disconnect - disconnect
 *   POST /sync/:vendor/patient         - sync Patient + Coverage + Encounters
 *   POST /search/:vendor/patients      - search patients by demographics
 *   POST /claims/:vendor               - submit a FHIR R4 Claim
 */

'use strict';

const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');

const ehr = require('../services/healthEhr');

const router = express.Router();

/**
 * Feature flag gate. The EHR vertical ships ON by default because the
 * technical implementation is complete; per-vendor live connection still
 * requires vendor portal credentials, but the surface (vendor catalog,
 * connection status, OAuth start) is investor-visible. To explicitly hide
 * the entire surface set HEALTH_EHR_FEATURE_ENABLED=false (kill switch).
 * Endpoints that require credentials return EHR_VENDOR_NOT_CONFIGURED (400)
 * when a vendor's env config is missing, so investors see a clear error
 * rather than a 404.
 */
const FEATURE_ENABLED =
  String(process.env.HEALTH_EHR_FEATURE_ENABLED || 'true').toLowerCase() !== 'false';

function _featureGate(req, res, next) {
  if (FEATURE_ENABLED) { return next(); }
  return res.status(503).json({
    error: 'EHR feature is disabled',
    code: 'EHR_FEATURE_DISABLED',
    hint: 'Unset HEALTH_EHR_FEATURE_ENABLED or set to "true" to enable',
  });
}

router.use(_featureGate);

function _orgIdFromReq(req) {
  return req.user && (req.user.organizationId || req.user.orgId || req.user.id);
}

router.get('/vendors', authenticate, apiLimiter, (req, res) => {
  res.json({
    success: true,
    vendors: ehr.listVendors().map((v) => ({
      ...v,
      configured: ehr.getVendorEnvConfig(v.id).configured,
    })),
  });
});

router.get('/status', authenticate, apiLimiter, (req, res) => {
  res.json({ success: true, ...ehr.getStatus() });
});

router.get('/connections',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const connections = await ehr.listOrgConnections(orgId);
      res.json({ success: true, connections });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list connections', code: 'EHR_LIST_ERROR', details: err.message });
    }
  }
);

router.get('/connections/:vendor',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const status = await ehr.getConnectionStatus(orgId, req.params.vendor);
      res.json({ success: true, ...status });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch connection status', code: 'EHR_STATUS_ERROR', details: err.message });
    }
  }
);

router.post('/connect/:vendor',
  authenticate,
  requirePlan('group', 'enterprise'),
  submissionLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const { scopes, launchToken } = req.body || {};
      const result = await ehr.startConnect({
        orgId,
        vendorId: req.params.vendor,
        scopes,
        launchToken,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      const status = err.code === 'EHR_VENDOR_NOT_CONFIGURED' ? 400 : 500;
      res.status(status).json({ error: err.message, code: err.code || 'EHR_CONNECT_ERROR' });
    }
  }
);

router.get('/callback',
  apiLimiter,
  async (req, res) => {
    try {
      const { code, state, error: oauthErr } = req.query || {};
      if (oauthErr) {
        return res.status(400).json({ error: 'OAuth provider returned error', code: 'EHR_OAUTH_ERROR', details: oauthErr });
      }
      if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state', code: 'EHR_OAUTH_BAD_REQUEST' });
      }
      const result = await ehr.completeConnect({ code, state });
      res.json({ success: true, ...result });
    } catch (err) {
      const status = err.code === 'EHR_INVALID_STATE' ? 400 : 500;
      res.status(status).json({ error: err.message, code: err.code || 'EHR_CALLBACK_ERROR' });
    }
  }
);

router.post('/connections/:vendor/disconnect',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const result = await ehr.disconnect(orgId, req.params.vendor);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Disconnect failed', code: 'EHR_DISCONNECT_ERROR', details: err.message });
    }
  }
);

router.post('/sync/:vendor/patient',
  authenticate,
  requirePlan('enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const { patientFhirId, options } = req.body || {};
      if (!patientFhirId) {
        return res.status(400).json({ error: 'patientFhirId is required', code: 'VALIDATION_ERROR' });
      }
      const result = await ehr.syncPatient({
        orgId,
        vendorId: req.params.vendor,
        patientFhirId,
        options,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      const status = err.code === 'EHR_NOT_CONNECTED' ? 409 : 500;
      res.status(status).json({ error: err.message, code: err.code || 'EHR_SYNC_ERROR' });
    }
  }
);

router.post('/search/:vendor/patients',
  authenticate,
  requirePlan('enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const result = await ehr.searchPatients({
        orgId,
        vendorId:    req.params.vendor,
        lastName:    req.body && req.body.lastName,
        firstName:   req.body && req.body.firstName,
        dateOfBirth: req.body && req.body.dateOfBirth,
        mrn:         req.body && req.body.mrn,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      const status = err.code === 'EHR_NOT_CONNECTED' ? 409 : 500;
      res.status(status).json({ error: err.message, code: err.code || 'EHR_SEARCH_ERROR' });
    }
  }
);

router.post('/claims/:vendor',
  authenticate,
  requirePlan('enterprise'),
  submissionLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const { claim, provider, patient, coverage } = req.body || {};
      if (!claim || !patient || !patient.fhirId) {
        return res.status(400).json({ error: 'claim and patient.fhirId are required', code: 'VALIDATION_ERROR' });
      }
      const result = await ehr.submitClaim({
        orgId,
        vendorId: req.params.vendor,
        claim,
        provider: provider || {},
        patient,
        coverage: coverage || {},
      });
      res.json(result);
    } catch (err) {
      const status = err.code === 'EHR_NOT_CONNECTED' ? 409 : 500;
      res.status(status).json({ error: err.message, code: err.code || 'EHR_CLAIM_ERROR' });
    }
  }
);

module.exports = router;
