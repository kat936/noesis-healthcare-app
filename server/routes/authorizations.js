/**
 * Noesis.io Health  - Prior Authorizations Route
 * © 2026 Athena Core Technologies, Inc.
 *
 * Prior authorization (PA) management for Group and Enterprise plans.
 * Dual-path: PostgreSQL when connected, in-memory fallback for dev.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { authorizationSchema, authorizationUpdateSchema } = require('../schemas/validation');
const { ROLES } = require('../config/roles');
const db = require('../db');
const { buildScopeClause, canAccessResource, inMemoryFilter } = require('../utils/tenantScope');

const router = express.Router();

// ── In-memory fallback ────────────────────────────────────────────────────────
const authStore = new Map();

// ── DB helpers ────────────────────────────────────────────────────────────────
function rowToApi(r) {
  return {
    id:               r.id,
    providerId:       r.provider_id,
    organizationId:   r.organization_id,
    patientName:      r.patient_name,
    patientDob:       r.patient_dob,
    memberId:         r.member_id,
    payerId:          r.payer_id,
    payerName:        r.payer_name,
    serviceType:      r.service_type,
    cptCodes:         r.cpt_codes  || [],
    icd10Codes:       r.icd10_codes || [],
    requestedDate:    r.requested_date,
    serviceStartDate: r.service_start_date,
    serviceEndDate:   r.service_end_date,
    urgency:          r.urgency,
    clinicalNotes:    r.clinical_notes,
    status:           r.status,
    authNumber:       r.auth_number,
    approvedUnits:    r.approved_units,
    denialReason:     r.denial_reason,
    submittedBy:      r.submitted_by,
    reviewedBy:       r.reviewed_by,
    reviewedAt:       r.reviewed_at,
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  };
}

// ── GET /  - list authorizations ───────────────────────────────────────────────
router.get('/', authenticate, apiLimiter, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const lim = parseInt(limit);
    const off = parseInt(offset);

    if (db.isConnected()) {
      const scope  = buildScopeClause(req);
      const params = [...scope.params];
      let where    = `WHERE 1=1${scope.clause}`;

      if (status) { params.push(status); where += ` AND status = $${params.length}`; }

      const countRes = await db.query(`SELECT COUNT(*) FROM authorizations ${where}`, params);
      const total    = parseInt(countRes.rows[0].count);
      params.push(lim, off);
      const dataRes  = await db.query(
        `SELECT * FROM authorizations ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return res.json({ success: true, data: dataRes.rows.map(rowToApi), pagination: { total, limit: lim, offset: off, hasMore: off + lim < total } });
    }

    let list = Array.from(authStore.values()).filter(inMemoryFilter(req));
    if (status) { list = list.filter((a) => a.status === status); }
    const total = list.length;
    res.json({ success: true, data: list.slice(off, off + lim), pagination: { total, limit: lim, offset: off } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list authorizations', code: 'LIST_ERROR' });
  }
});

// ── POST /  - request prior authorization ──────────────────────────────────────
router.post('/', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), requirePlan('group', 'enterprise'), submissionLimiter, validate(authorizationSchema), async (req, res) => {
  try {
    const d = req.validated;

    if (db.isConnected()) {
      const result = await db.query(
        `INSERT INTO authorizations
           (provider_id, organization_id, patient_name, patient_dob, member_id, payer_id, payer_name,
            service_type, cpt_codes, icd10_codes, requested_date, service_start_date, service_end_date,
            urgency, clinical_notes, status, submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_DATE,$11,$12,$13,$14,'submitted',$15)
         RETURNING *`,
        [
          req.user.id, req.user.organizationId || null,
          d.patientName, d.patientDob || null, d.memberId || null,
          d.payerId, d.payerName || null, d.serviceType,
          d.cptCodes || [], d.icd10Codes || [],
          d.serviceStartDate || null, d.serviceEndDate || null,
          d.urgency || 'routine', d.clinicalNotes || null,
          req.user.id,
        ]
      );
      return res.status(201).json({ success: true, authorization: rowToApi(result.rows[0]), message: 'Prior authorization request submitted' });
    }

    const id   = uuidv4();
    const auth = { id, ...d, providerId: req.user.id, organizationId: req.user.organizationId, status: 'submitted', requestedAt: new Date().toISOString() };
    authStore.set(id, auth);
    res.status(201).json({ success: true, authorization: auth, message: 'Prior authorization request submitted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create authorization', code: 'CREATE_ERROR', details: err.message });
  }
});

// ── GET /:id  - authorization detail ──────────────────────────────────────────
router.get('/:id', authenticate, apiLimiter, async (req, res) => {
  try {
    if (db.isConnected()) {
      const result = await db.query('SELECT * FROM authorizations WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
      const auth = rowToApi(result.rows[0]);
      if (!canAccessResource(req, auth)) {
        return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
      }
      return res.json({ success: true, authorization: auth });
    }

    const auth = authStore.get(req.params.id);
    if (!auth) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
    if (!canAccessResource(req, auth)) {
      return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
    }
    res.json({ success: true, authorization: auth });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve authorization', code: 'GET_ERROR' });
  }
});

// ── POST /:id/approve ────────────────────────────────────────────────────────
router.post('/:id/approve', authenticate, authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN), submissionLimiter, async (req, res) => {
  try {
    const { authNumber, approvedUnits, notes } = req.body;
    const now = new Date().toISOString();

    if (db.isConnected()) {
      const existing = await db.query('SELECT * FROM authorizations WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
      if (!canAccessResource(req, rowToApi(existing.rows[0]))) {
        return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
      }
      const result = await db.query(
        `UPDATE authorizations SET status='approved', auth_number=$1, approved_units=$2, clinical_notes=COALESCE($3,clinical_notes), reviewed_by=$4, reviewed_at=$5, updated_at=NOW()
         WHERE id=$6 RETURNING *`,
        [authNumber || `AUTH-${Date.now()}`, approvedUnits || null, notes || null, req.user.id, now, req.params.id]
      );
      return res.json({ success: true, authorization: rowToApi(result.rows[0]), message: 'Authorization approved' });
    }

    const auth = authStore.get(req.params.id);
    if (!auth) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
    if (!canAccessResource(req, auth)) {
      return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
    }
    Object.assign(auth, { status: 'approved', authNumber: authNumber || `AUTH-${Date.now()}`, approvedUnits, approvedAt: now, approvedBy: req.user.id });
    res.json({ success: true, authorization: auth, message: 'Authorization approved' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve authorization', code: 'APPROVE_ERROR' });
  }
});

// ── POST /:id/deny ────────────────────────────────────────────────────────────
router.post('/:id/deny', authenticate, authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN), submissionLimiter, async (req, res) => {
  try {
    const { reason } = req.body;
    const now = new Date().toISOString();

    if (db.isConnected()) {
      const existing = await db.query('SELECT * FROM authorizations WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
      if (!canAccessResource(req, rowToApi(existing.rows[0]))) {
        return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
      }
      const result = await db.query(
        `UPDATE authorizations SET status='denied', denial_reason=$1, reviewed_by=$2, reviewed_at=$3, updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [reason || null, req.user.id, now, req.params.id]
      );
      return res.json({ success: true, authorization: rowToApi(result.rows[0]), message: 'Authorization denied' });
    }

    const auth = authStore.get(req.params.id);
    if (!auth) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
    if (!canAccessResource(req, auth)) {
      return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
    }
    Object.assign(auth, { status: 'denied', denialReason: reason, deniedAt: now, deniedBy: req.user.id });
    res.json({ success: true, authorization: auth, message: 'Authorization denied' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deny authorization', code: 'DENY_ERROR' });
  }
});

// ── PUT /:id  - update authorization ──────────────────────────────────────────
router.put('/:id', authenticate, authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN), apiLimiter, validate(authorizationUpdateSchema), async (req, res) => {
  try {
    const { status, approvalNotes } = req.validated;

    if (db.isConnected()) {
      const existing = await db.query('SELECT * FROM authorizations WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
      if (!canAccessResource(req, rowToApi(existing.rows[0]))) {
        return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
      }
      const result = await db.query(
        `UPDATE authorizations SET status=$1, clinical_notes=COALESCE($2,clinical_notes), reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW()
         WHERE id=$4 RETURNING *`,
        [status, approvalNotes || null, req.user.id, req.params.id]
      );
      return res.json({ success: true, authorization: rowToApi(result.rows[0]) });
    }

    const auth = authStore.get(req.params.id);
    if (!auth) { return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' }); }
    if (!canAccessResource(req, auth)) {
      return res.status(404).json({ error: 'Authorization not found', code: 'NOT_FOUND' });
    }
    Object.assign(auth, { status, approvalNotes, reviewedAt: new Date().toISOString(), reviewedBy: req.user.id });
    res.json({ success: true, authorization: auth });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update authorization', code: 'UPDATE_ERROR' });
  }
});

module.exports = router;
