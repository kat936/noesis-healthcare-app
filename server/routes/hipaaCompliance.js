/**
 * Noesis.io Health  - HIPAA Compliance Surfaces
 * © 2026 Athena Core Technologies, Inc.
 *
 * Three workflows surfaced as REST endpoints. They live in their own
 * router (mounted alongside /api/v1/hipaa) so the existing hipaa.js
 * file stays untouched and we can review/test these in isolation.
 *
 *   1. Business Associate Agreement (BAA) tracking - §164.308(b)(1)
 *      Every vendor that processes PHI on our behalf needs an executed
 *      BAA on file. This surface lets a practice_admin see status and
 *      expiration dates; super_admin can register / update entries.
 *
 *   2. Accounting of disclosures - §164.528
 *      Every PHI disclosure that is NOT for treatment / payment / health
 *      care operations (TPO) must be logged for six years and made
 *      available to the patient on request. This surface records
 *      disclosures and lists them for a given patient.
 *
 *   3. Right of access - §164.524
 *      A patient may request a copy of their own designated record set.
 *      The covered entity has 30 days to fulfill (one 30-day extension
 *      permitted with written notice). This surface tracks the request
 *      lifecycle and surfaces the SLA clock to the practice_admin.
 *
 * Posture statement
 *   These endpoints are scaffolding that a covered entity can adopt to
 *   meet the cited HIPAA controls. Production HIPAA compliance still
 *   requires executed BAAs with each vendor and customer; this code is
 *   BAA-ready architecture, not a HIPAA certification.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// ── In-memory stores ──────────────────────────────────────────────────────────
// Production deployments swap these for Postgres-backed tables (see
// server/db/migrations/004_hipaa_compliance.sql in this commit).
const baaStore        = new Map();   // vendorId -> baa entry
const disclosureStore = new Map();   // disclosureId -> disclosure entry
const accessReqStore  = new Map();   // requestId -> access request entry

// ── BAA seed (synthetic only) ─────────────────────────────────────────────────
// These vendor names are ones the platform routes through, but the BAA
// status is a placeholder. A real deployment populates from a vendor
// inventory. Do NOT let this surface display "signed" without a real
// document on file.
function seedBAA() {
  if (baaStore.size > 0) { return; }
  const seeds = [
    { vendor: 'AWS',                  category: 'cloud_infrastructure', status: 'pending', expiresAt: null },
    { vendor: 'Stripe',               category: 'payment_processor',    status: 'pending', expiresAt: null },
    { vendor: 'Sentry',               category: 'error_telemetry',      status: 'pending', expiresAt: null },
    { vendor: 'Office Ally',          category: 'edi_clearinghouse',    status: 'pending', expiresAt: null },
    { vendor: 'Change Healthcare',    category: 'edi_clearinghouse',    status: 'pending', expiresAt: null },
    { vendor: 'Availity',             category: 'edi_clearinghouse',    status: 'pending', expiresAt: null },
    { vendor: 'Epic Systems',         category: 'ehr_connector',        status: 'pending', expiresAt: null },
    { vendor: 'Athenahealth',         category: 'ehr_connector',        status: 'pending', expiresAt: null },
    { vendor: 'Oracle Cerner',        category: 'ehr_connector',        status: 'pending', expiresAt: null },
  ];
  seeds.forEach((s) => {
    const id = uuidv4();
    baaStore.set(id, {
      id, vendor: s.vendor, category: s.category, status: s.status,
      expiresAt: s.expiresAt, signedAt: null, documentReference: null,
      notes: 'Placeholder entry - replace before production launch.',
      createdAt: new Date().toISOString(),
    });
  });
}
seedBAA();

// ── Validation schemas ────────────────────────────────────────────────────────
const VALID_BAA_STATUS = ['pending', 'signed', 'expired', 'terminated'];

const baaSchema = z.object({
  vendor:            z.string().trim().min(1).max(120),
  category:          z.string().trim().min(1).max(60),
  status:            z.enum(VALID_BAA_STATUS).default('pending'),
  expiresAt:         z.string().datetime().optional().nullable(),
  signedAt:          z.string().datetime().optional().nullable(),
  documentReference: z.string().trim().max(500).optional().nullable(),
  notes:             z.string().trim().max(2000).optional(),
});

const baaUpdateSchema = baaSchema.partial();

// Per §164.528 a disclosure log must capture: date, recipient, brief
// description of PHI disclosed, purpose, basis (court order, public
// health, etc.). Patient identifier is the patient's internal ID; do
// not store the patient's name or DOB here in plaintext - those are
// already encrypted in the claims/auth tables.
const disclosureSchema = z.object({
  patientId:        z.string().trim().min(1).max(120),
  disclosedAt:      z.string().datetime().default(() => new Date().toISOString()),
  recipient:        z.string().trim().min(1).max(200),
  recipientType:    z.enum([
    'public_health_authority', 'court_order', 'subpoena', 'law_enforcement',
    'health_oversight', 'medical_examiner', 'organ_donation', 'research',
    'workers_compensation', 'patient_directed', 'other_non_tpo',
  ]),
  description:      z.string().trim().min(1).max(1000),
  purpose:          z.string().trim().min(1).max(500),
  legalBasis:       z.string().trim().min(1).max(500),
  recordedBy:       z.string().trim().optional(),
});

// §164.524 right-of-access request lifecycle.
const accessRequestSchema = z.object({
  patientId:    z.string().trim().min(1).max(120),
  patientEmail: z.string().email().max(254),
  scope:        z.string().trim().min(1).max(1000),  // what they want
  format:       z.enum(['electronic', 'paper', 'cd', 'other']).default('electronic'),
  notes:        z.string().trim().max(2000).optional(),
});

const accessFulfillSchema = z.object({
  fulfilledAt:   z.string().datetime().default(() => new Date().toISOString()),
  documentReference: z.string().trim().max(500).optional(),
  fulfillmentNotes:  z.string().trim().max(2000).optional(),
});

// HIPAA grants 30 days, plus one 30-day extension with written notice.
const ACCESS_SLA_DAYS = 30;
const ACCESS_EXTENSION_DAYS = 30;

function daysBetween(fromIso, toIso) {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function decorateAccessRequest(req) {
  const now = new Date().toISOString();
  const slaDeadline = new Date(
    new Date(req.requestedAt).getTime() + ACCESS_SLA_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const slaDeadlineWithExtension = new Date(
    new Date(req.requestedAt).getTime()
      + (ACCESS_SLA_DAYS + ACCESS_EXTENSION_DAYS) * 24 * 60 * 60 * 1000
  ).toISOString();
  const daysSinceRequest = daysBetween(req.requestedAt, now);
  const daysUntilDeadline = daysBetween(now, slaDeadline);
  return {
    ...req,
    slaDeadline,
    slaDeadlineWithExtension,
    daysSinceRequest,
    daysUntilDeadline,
    isOverdue: req.status !== 'fulfilled' && daysUntilDeadline < 0,
  };
}

// ── BAA endpoints ─────────────────────────────────────────────────────────────

/**
 * GET /baa - list business associates with BAA status
 * Per §164.308(b)(1) every covered entity must obtain satisfactory
 * assurances (a BAA) that each vendor handling PHI will safeguard it.
 */
router.get(
  '/baa',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.SUPER_ADMIN),
  apiLimiter,
  (req, res) => {
    const list = Array.from(baaStore.values());
    res.json({
      success: true,
      hipaaCitation: '§164.308(b)(1)',
      count: list.length,
      data: list,
      posture: 'BAA-ready architecture; production HIPAA compliance requires executed BAAs with each vendor.',
    });
  }
);

/**
 * POST /baa - register a vendor BAA (super_admin only - vendors span tenants)
 */
router.post(
  '/baa',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  submissionLimiter,
  (req, res) => {
    const parsed = baaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid BAA entry', code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      });
    }
    const id = uuidv4();
    const entry = {
      id, ...parsed.data,
      createdAt: new Date().toISOString(),
      createdBy: req.user.id,
    };
    baaStore.set(id, entry);
    res.status(201).json({ success: true, baa: entry });
  }
);

/**
 * PUT /baa/:id - update BAA status / expiration
 */
router.put(
  '/baa/:id',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  submissionLimiter,
  (req, res) => {
    const existing = baaStore.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'BAA entry not found', code: 'NOT_FOUND' });
    }
    const parsed = baaUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid BAA update', code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      });
    }
    const updated = {
      ...existing, ...parsed.data,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id,
    };
    baaStore.set(req.params.id, updated);
    res.json({ success: true, baa: updated });
  }
);

// ── Accounting of disclosures (§164.528) ──────────────────────────────────────

/**
 * POST /disclosures - record a non-TPO disclosure of PHI
 * Per §164.528 covered entities must maintain an accounting of every
 * PHI disclosure that is NOT for treatment, payment, or operations.
 * Retention is six years (§164.316(b)(2)(i)).
 */
router.post(
  '/disclosures',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.PROVIDER_STAFF, ROLES.SUPER_ADMIN),
  submissionLimiter,
  (req, res) => {
    const parsed = disclosureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid disclosure record', code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      });
    }
    const id = uuidv4();
    const entry = {
      id, ...parsed.data,
      organizationId: req.user.organizationId || null,
      recordedBy: parsed.data.recordedBy || req.user.id,
      createdAt: new Date().toISOString(),
    };
    disclosureStore.set(id, entry);
    res.status(201).json({
      success: true, disclosure: entry,
      hipaaCitation: '§164.528',
    });
  }
);

/**
 * GET /disclosures?patientId=... - accounting of disclosures for a patient
 * Patient may request this; covered entity must respond within 60 days
 * with up to six years of disclosure history.
 */
router.get(
  '/disclosures',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.PROVIDER_STAFF, ROLES.SUPER_ADMIN),
  apiLimiter,
  (req, res) => {
    const { patientId, startDate, endDate } = req.query;
    const list = Array.from(disclosureStore.values())
      .filter((d) => {
        // Tenant scope: practice_admin / provider_staff only see their org.
        if (req.user.role !== ROLES.SUPER_ADMIN && req.user.organizationId
          && d.organizationId !== req.user.organizationId) {
          return false;
        }
        if (patientId && d.patientId !== patientId) { return false; }
        if (startDate && new Date(d.disclosedAt) < new Date(startDate)) { return false; }
        if (endDate   && new Date(d.disclosedAt) > new Date(endDate))   { return false; }
        return true;
      })
      .sort((a, b) => new Date(b.disclosedAt) - new Date(a.disclosedAt));
    res.json({
      success: true,
      hipaaCitation: '§164.528',
      retentionYears: 6,
      count: list.length,
      data: list,
    });
  }
);

// ── Right of access (§164.524) ────────────────────────────────────────────────

/**
 * POST /access-requests - create a right-of-access request
 * Patient submits a request; the SLA clock starts now.
 */
router.post(
  '/access-requests',
  authenticate,
  submissionLimiter,
  (req, res) => {
    const parsed = accessRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid access request', code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      });
    }
    const id = uuidv4();
    const requestedAt = new Date().toISOString();
    const entry = {
      id, ...parsed.data,
      requestedAt,
      status: 'pending',
      organizationId: req.user.organizationId || null,
      createdBy: req.user.id,
    };
    accessReqStore.set(id, entry);
    res.status(201).json({
      success: true,
      request: decorateAccessRequest(entry),
      hipaaCitation: '§164.524',
      slaDays: ACCESS_SLA_DAYS,
    });
  }
);

/**
 * GET /access-requests - list (scoped to caller's organization)
 */
router.get(
  '/access-requests',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.PROVIDER_STAFF, ROLES.SUPER_ADMIN),
  apiLimiter,
  (req, res) => {
    const { status } = req.query;
    const list = Array.from(accessReqStore.values())
      .filter((r) => {
        if (req.user.role !== ROLES.SUPER_ADMIN && req.user.organizationId
          && r.organizationId !== req.user.organizationId) {
          return false;
        }
        if (status && r.status !== status) { return false; }
        return true;
      })
      .map(decorateAccessRequest)
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    res.json({
      success: true,
      hipaaCitation: '§164.524',
      slaDays: ACCESS_SLA_DAYS,
      count: list.length,
      data: list,
    });
  }
);

/**
 * PUT /access-requests/:id/fulfill - mark a request fulfilled
 */
router.put(
  '/access-requests/:id/fulfill',
  authenticate,
  authorize(ROLES.PRACTICE_ADMIN, ROLES.PROVIDER_STAFF, ROLES.SUPER_ADMIN),
  submissionLimiter,
  (req, res) => {
    const existing = accessReqStore.get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Access request not found', code: 'NOT_FOUND' });
    }
    if (req.user.role !== ROLES.SUPER_ADMIN && req.user.organizationId
        && existing.organizationId !== req.user.organizationId) {
      return res.status(404).json({ error: 'Access request not found', code: 'NOT_FOUND' });
    }
    const parsed = accessFulfillSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid fulfillment payload', code: 'VALIDATION_ERROR',
        details: parsed.error.errors,
      });
    }
    const updated = {
      ...existing,
      status: 'fulfilled',
      fulfilledAt: parsed.data.fulfilledAt,
      documentReference: parsed.data.documentReference || null,
      fulfillmentNotes: parsed.data.fulfillmentNotes || null,
      fulfilledBy: req.user.id,
    };
    accessReqStore.set(req.params.id, updated);
    res.json({ success: true, request: decorateAccessRequest(updated) });
  }
);

module.exports = router;

// Exposed for unit tests; not part of the public API surface.
module.exports._stores = { baaStore, disclosureStore, accessReqStore };
module.exports._helpers = { decorateAccessRequest, ACCESS_SLA_DAYS, ACCESS_EXTENSION_DAYS };
