/**
 * Noesis.io Health - Business Associate Agreement (BAA) routes
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Mounted at /api/v1/health/baas.
 *
 * Two surfaces:
 *
 *   Admin (super_admin, practice_admin) - record / list / amend / revoke:
 *     GET    /                   - list BAAs (filter by counterpartyType, status, orgId)
 *     POST   /                   - record a newly-executed BAA
 *     GET    /:id                - single BAA
 *     PATCH  /:id                - amend
 *     POST   /:id/revoke         - soft-revoke
 *
 *   Customer-facing (any authenticated user) - "does my org have a BAA?":
 *     GET    /status             - org-scoped BAA posture for current user
 *     GET    /vendors/:vendorId  - vendor-level posture (Noesis ↔ EHR vendor)
 *
 * The customer-facing /status endpoint is what the EHR/EDI status pages
 * surface to show "BAA required before activating EHR/EDI" with a link to
 * request one. Production wiring deferred - see docs/health/ehr-roadmap.md.
 */

'use strict';

const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const baa = require('../services/baa');

const router = express.Router();

function _orgIdFromReq(req) {
  return req.user && (req.user.organizationId || req.user.orgId || req.user.id);
}

function _userIdFromReq(req) {
  return req.user && req.user.id;
}

// ── Customer-facing ─────────────────────────────────────────────────────────

router.get('/status', authenticate, apiLimiter, async (req, res) => {
  try {
    const status = await baa.getOrgBAAStatus(_orgIdFromReq(req));
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'BAA_STATUS_ERROR' });
  }
});

router.get('/vendors/:vendorId', authenticate, apiLimiter, async (req, res) => {
  try {
    const counterpartyType = req.query.counterpartyType || 'ehr_vendor';
    const status = await baa.getVendorBAAStatus(req.params.vendorId, counterpartyType);
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'BAA_VENDOR_STATUS_ERROR' });
  }
});

// ── Admin ───────────────────────────────────────────────────────────────────

router.get('/',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.SUPER_ADMIN),
  apiLimiter,
  async (req, res) => {
    try {
      const filters = {
        counterpartyType: req.query.counterpartyType || undefined,
        status:           req.query.status           || undefined,
        partyIdentifier:  req.query.partyIdentifier  || undefined,
      };
      // Non-super admins see only their own org's customer BAAs.
      if (req.user.role !== ROLES.SUPER_ADMIN) {
        filters.counterpartyType = 'customer_org';
        filters.orgId = _orgIdFromReq(req);
      } else if (req.query.orgId) {
        filters.orgId = req.query.orgId;
      }
      const baas = await baa.listBAAs(filters);
      res.json({ success: true, baas });
    } catch (err) {
      res.status(500).json({ error: err.message, code: 'BAA_LIST_ERROR' });
    }
  }
);

router.post('/',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  submissionLimiter,
  async (req, res) => {
    try {
      const input = { ...(req.body || {}), recordedBy: _userIdFromReq(req) };
      const created = await baa.recordBAA(input);
      res.status(201).json({ success: true, baa: created });
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'BAA_VALIDATION_ERROR' });
    }
  }
);

router.get('/:id',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.SUPER_ADMIN),
  apiLimiter,
  async (req, res) => {
    try {
      const record = await baa.getBAA(req.params.id);
      if (!record) {
        return res.status(404).json({ error: 'BAA not found', code: 'BAA_NOT_FOUND' });
      }
      // Non-super admins may only read their own org's customer BAA.
      if (req.user.role !== ROLES.SUPER_ADMIN) {
        if (record.counterpartyType !== 'customer_org' ||
            record.orgId !== _orgIdFromReq(req)) {
          return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
        }
      }
      res.json({ success: true, baa: record });
    } catch (err) {
      res.status(500).json({ error: err.message, code: 'BAA_READ_ERROR' });
    }
  }
);

router.patch('/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  submissionLimiter,
  async (req, res) => {
    try {
      const updated = await baa.updateBAA(req.params.id, req.body || {});
      if (!updated) {
        return res.status(404).json({ error: 'BAA not found', code: 'BAA_NOT_FOUND' });
      }
      res.json({ success: true, baa: updated });
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'BAA_VALIDATION_ERROR' });
    }
  }
);

router.post('/:id/revoke',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  submissionLimiter,
  async (req, res) => {
    try {
      const reason = (req.body && req.body.reason) || null;
      const updated = await baa.revokeBAA(req.params.id, reason);
      if (!updated) {
        return res.status(404).json({ error: 'BAA not found', code: 'BAA_NOT_FOUND' });
      }
      res.json({ success: true, baa: updated });
    } catch (err) {
      res.status(400).json({ error: err.message, code: 'BAA_REVOKE_ERROR' });
    }
  }
);

module.exports = router;
