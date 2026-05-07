/**
 * Noesis.io Health  - EDI routes
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Routes mounted at /api/v1/health/edi/* (NEW namespace; does not modify
 * the existing /api/v1/integrations/clearinghouse/* used by the iOS app
 * currently in App Review).
 *
 * Endpoints:
 *   GET  /status                                 - feature status
 *   GET  /standards                              - X12N versions referenced
 *   GET  /partners                               - list trading partners
 *   POST /partners                               - register / update partner
 *   GET  /partners/:code                         - partner details (no creds)
 *   POST /partners/:code/deactivate              - soft delete
 *   POST /837p                                   - build + persist 837P
 *   POST /837p/parse                             - parse a 837P EDI string
 *   POST /276                                    - build a 276 inquiry
 *   POST /277/parse                              - parse a 277 response
 *   POST /835/parse                              - parse an 835 ERA
 *   GET  /submissions/:claimId                   - submission ledger for a claim
 */

'use strict';

const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');

const edi = require('../services/healthEdi');

const router = express.Router();

/**
 * Feature flag gate. Default ON because the technical implementation is
 * complete; setting HEALTH_EDI_FEATURE_ENABLED=false acts as a kill switch
 * (returns 503). Per-partner missing credentials still return clear
 * EDI_PARTNER_NOT_FOUND (404) errors.
 */
const FEATURE_ENABLED =
  String(process.env.HEALTH_EDI_FEATURE_ENABLED || 'true').toLowerCase() !== 'false';

function _featureGate(req, res, next) {
  if (FEATURE_ENABLED) { return next(); }
  return res.status(503).json({
    error: 'EDI feature is disabled',
    code: 'EDI_FEATURE_DISABLED',
    hint: 'Unset HEALTH_EDI_FEATURE_ENABLED or set to "true" to enable',
  });
}

function _orgIdFromReq(req) {
  return req.user && (req.user.organizationId || req.user.orgId || req.user.id);
}

router.use(_featureGate);

router.get('/status', authenticate, apiLimiter, (req, res) => {
  res.json({ success: true, ...edi.getStatus() });
});

router.get('/standards', authenticate, apiLimiter, (req, res) => {
  res.json({ success: true, standards: edi.STANDARDS });
});

// ── Trading partners ─────────────────────────────────────────────────────────

router.get('/partners',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const partners = await edi.listTradingPartners(_orgIdFromReq(req));
      res.json({ success: true, partners });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list partners', code: 'EDI_LIST_ERROR', details: err.message });
    }
  }
);

router.post('/partners',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const summary = await edi.upsertTradingPartner({ ...(req.body || {}), orgId });
      res.json({ success: true, partner: summary });
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'EDI_PARTNER_VALIDATION' });
    }
  }
);

router.get('/partners/:code',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const partner = await edi.getTradingPartner(_orgIdFromReq(req), req.params.code);
      if (!partner) {
        return res.status(404).json({ error: 'Partner not found', code: 'EDI_PARTNER_NOT_FOUND' });
      }
      // Strip secrets from response
      const safe = { ...partner };
      delete safe.apiSecret;
      delete safe.sftpPassword;
      res.json({ success: true, partner: safe });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load partner', code: 'EDI_PARTNER_ERROR', details: err.message });
    }
  }
);

router.post('/partners/:code/deactivate',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      await edi.deactivateTradingPartner(_orgIdFromReq(req), req.params.code);
      res.json({ success: true, partnerCode: req.params.code.toUpperCase(), status: 'disabled' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to deactivate partner', code: 'EDI_PARTNER_DEACTIVATE_ERROR', details: err.message });
    }
  }
);

// ── 837P ─────────────────────────────────────────────────────────────────────

router.post('/837p',
  authenticate,
  requirePlan('group', 'enterprise'),
  submissionLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const { partnerCode, submitter, receiver, billingProvider, subscriber,
              payer, claim, diagnoses, serviceLines } = req.body || {};
      if (!partnerCode || !claim || !payer) {
        return res.status(400).json({ error: 'partnerCode, claim, payer required', code: 'VALIDATION_ERROR' });
      }
      const result = await edi.submit837P({
        orgId, partnerCode, submitter, receiver, billingProvider, subscriber,
        payer, claim, diagnoses, serviceLines,
      });
      res.json(result);
    } catch (err) {
      const status = err.code === 'EDI_PARTNER_NOT_FOUND'   ? 404
                   : err.code === 'EDI_PARTNER_DISABLED'    ? 409
                   : err.code === 'EDI_PARTNER_UNSUPPORTED' ? 409
                   : 400;
      res.status(status).json({ error: err.message, code: err.code || 'EDI_837P_ERROR' });
    }
  }
);

router.post('/837p/parse',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { edi: ediText } = req.body || {};
      if (!ediText || typeof ediText !== 'string') {
        return res.status(400).json({ error: 'edi (string) required', code: 'VALIDATION_ERROR' });
      }
      const parsed = edi.parse837P(ediText);
      res.json({ success: true, parsed });
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'EDI_837P_PARSE_ERROR' });
    }
  }
);

// ── 276 / 277 ────────────────────────────────────────────────────────────────

router.post('/276',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const orgId = _orgIdFromReq(req);
      const { partnerCode, payer, provider, subscriber, claim } = req.body || {};
      if (!partnerCode || !payer || !provider || !subscriber || !claim) {
        return res.status(400).json({
          error: 'partnerCode, payer, provider, subscriber, claim required',
          code: 'VALIDATION_ERROR',
        });
      }
      const result = await edi.buildClaimStatusInquiry({
        orgId, partnerCode, payer, provider, subscriber, claim,
      });
      res.json(result);
    } catch (err) {
      const status = err.code === 'EDI_PARTNER_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: err.message, code: err.code || 'EDI_276_ERROR' });
    }
  }
);

router.post('/277/parse',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { edi: ediText } = req.body || {};
      if (!ediText || typeof ediText !== 'string') {
        return res.status(400).json({ error: 'edi (string) required', code: 'VALIDATION_ERROR' });
      }
      const parsed = edi.parse277(ediText);
      res.json({ success: true, parsed });
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'EDI_277_PARSE_ERROR' });
    }
  }
);

// ── 835 ──────────────────────────────────────────────────────────────────────

router.post('/835/parse',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  (req, res) => {
    try {
      const { edi: ediText } = req.body || {};
      if (!ediText || typeof ediText !== 'string') {
        return res.status(400).json({ error: 'edi (string) required', code: 'VALIDATION_ERROR' });
      }
      const parsed = edi.parse835(ediText);
      res.json({ success: true, parsed });
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'EDI_835_PARSE_ERROR' });
    }
  }
);

// ── Submission ledger ────────────────────────────────────────────────────────

router.get('/submissions/:claimId',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const submissions = await edi.listSubmissionsForClaim(_orgIdFromReq(req), req.params.claimId);
      res.json({ success: true, submissions });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list submissions', code: 'EDI_SUBMISSIONS_ERROR', details: err.message });
    }
  }
);

module.exports = router;
