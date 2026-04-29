const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { claimSchema } = require('../schemas/validation');
const strategyEngine = require('../services/strategyEngine');
const { ROLES } = require('../config/roles');
const db = require('../db');
const { encryptFields, decryptFields, CLAIM_PHI_FIELDS } = require('../utils/encryption');

const router = express.Router();

// ── In-memory fallback (dev / no DB) ──────────────────────────────────────────
const memClaims = new Map();

function useDB() {
  return db.isConnected();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a DB row to the API response shape.
 */
function rowToApi(row) {
  const dec = decryptFields(
    {
      patient_name: row.patient_name,
      patient_dob: row.patient_dob,
    },
    CLAIM_PHI_FIELDS
  );

  return {
    id: row.id,
    patientName: dec.patient_name,
    patientDob: dec.patient_dob,
    cptCode: row.cpt_code,
    icd10Code: row.icd10_code,
    serviceDate: row.service_date,
    amount: parseFloat(row.amount),
    payer: row.payer,
    status: row.status,
    modifiers: row.modifiers || [],
    urgency: row.urgency,
    strategicScore: row.strategic_score,
    adjudicationNotes: row.adjudication_notes,
    appeals: row.appeals || [],
    providerId: row.provider_id,
    organizationId: row.organization_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /claims
 * List claims filtered by role, with optional status filter and pagination.
 */
router.get('/', authenticate, apiLimiter, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const lim = Math.min(parseInt(limit) || 20, 100);
    const off = parseInt(offset) || 0;

    if (useDB()) {
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (req.user.role === ROLES.PROVIDER_STAFF) {
        params.push(req.user.id);
        whereClause += ` AND provider_id = $${params.length}`;
      }

      if (status) {
        params.push(status);
        whereClause += ` AND status = $${params.length}`;
      }

      const countRes = await db.query(`SELECT COUNT(*) FROM claims ${whereClause}`, params);
      const total = parseInt(countRes.rows[0].count);

      params.push(lim, off);
      const dataRes = await db.query(
        `SELECT * FROM claims ${whereClause} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({
        success: true,
        data: dataRes.rows.map(rowToApi),
        pagination: { total, limit: lim, offset: off, hasMore: off + lim < total },
      });
    }

    // In-memory fallback
    let results = Array.from(memClaims.values());
    if (req.user.role === ROLES.PROVIDER_STAFF) {
      results = results.filter((c) => c.providerId === req.user.id);
    }
    if (status) results = results.filter((c) => c.status === status);
    const total = results.length;

    return res.json({
      success: true,
      data: results.slice(off, off + lim),
      pagination: { total, limit: lim, offset: off, hasMore: off + lim < total },
    });
  } catch (err) {
    console.error('Claims list error:', err.message);
    res.status(500).json({ error: 'Failed to list claims', code: 'LIST_ERROR' });
  }
});

/**
 * POST /claims
 * Submit new claim  - runs through strategy engine before saving.
 */
router.post(
  '/',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  requirePlan('professional', 'enterprise'),
  submissionLimiter,
  validate(claimSchema),
  async (req, res) => {
    try {
      const claimData = req.validated;
      const claimId = uuidv4();

      // Run strategy engine (server-side, deterministic)
      const score = await strategyEngine.scoreClaim(
        { ...claimData, id: claimId },
        useDB() ? [] : Array.from(memClaims.values())
      );

      const status = score.decision === 'APPROVE_SUBMIT' ? 'ready_to_submit' : 'draft';

      if (useDB()) {
        const encrypted = encryptFields(
          {
            patient_name: claimData.patientName,
            patient_dob: claimData.patientDob,
          },
          CLAIM_PHI_FIELDS
        );

        const result = await db.query(
          `INSERT INTO claims
            (id, provider_id, organization_id, patient_name, patient_dob, cpt_code, icd10_code,
             service_date, amount, payer, status, modifiers, urgency, strategic_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            claimId,
            req.user.id,
            req.user.organizationId || null,
            encrypted.patient_name,
            encrypted.patient_dob || null,
            claimData.cptCode,
            claimData.icd10Code,
            claimData.serviceDate,
            claimData.amount,
            claimData.payer,
            status,
            claimData.modifiers || [],
            claimData.urgency || 'standard',
            JSON.stringify(score),
          ]
        );

        return res.status(201).json({
          success: true,
          claim: rowToApi(result.rows[0]),
          engineDecision: {
            action: score.decision,
            rationale: score.rationale,
            recommendations: score.recommendations,
          },
        });
      }

      // In-memory fallback
      const claim = {
        id: claimId,
        ...claimData,
        providerId: req.user.id,
        organizationId: req.user.organizationId,
        status,
        strategicScore: score,
        appeals: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memClaims.set(claimId, claim);

      return res.status(201).json({
        success: true,
        claim,
        engineDecision: {
          action: score.decision,
          rationale: score.rationale,
          recommendations: score.recommendations,
        },
      });
    } catch (err) {
      console.error('Claim create error:', err.message);
      res.status(500).json({ error: 'Failed to create claim', code: 'CREATE_ERROR' });
    }
  }
);

/**
 * GET /claims/:id
 * Get full claim detail.
 */
router.get('/:id', authenticate, apiLimiter, async (req, res) => {
  try {
    if (useDB()) {
      const result = await db.query('SELECT * FROM claims WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
      }
      const claim = rowToApi(result.rows[0]);
      if (req.user.role === ROLES.PROVIDER_STAFF && claim.providerId !== req.user.id) {
        return res.status(403).json({ error: 'Cannot access this claim', code: 'FORBIDDEN' });
      }
      return res.json({ success: true, claim });
    }

    const claim = memClaims.get(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
    if (req.user.role === ROLES.PROVIDER_STAFF && claim.providerId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot access this claim', code: 'FORBIDDEN' });
    }
    return res.json({ success: true, claim });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve claim', code: 'GET_ERROR' });
  }
});

/**
 * PUT /claims/:id/status
 * Update claim status (insurer / admin only).
 */
router.put(
  '/:id/status',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  async (req, res) => {
    try {
      const { status, notes } = req.body;
      const validStatuses = ['draft', 'ready_to_submit', 'submitted', 'adjudicated', 'approved', 'denied', 'appealed'];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status', code: 'INVALID_STATUS', validStatuses });
      }

      if (useDB()) {
        const result = await db.query(
          'UPDATE claims SET status=$1, adjudication_notes=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
          [status, notes || null, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
        return res.json({ success: true, claim: rowToApi(result.rows[0]) });
      }

      const claim = memClaims.get(req.params.id);
      if (!claim) return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
      claim.status = status;
      claim.adjudicationNotes = notes;
      claim.updatedAt = new Date().toISOString();
      return res.json({ success: true, claim });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update claim', code: 'UPDATE_ERROR' });
    }
  }
);

/**
 * POST /claims/:id/appeal
 * Submit appeal for a denied claim.
 */
router.post(
  '/:id/appeal',
  authenticate,
  authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN),
  submissionLimiter,
  async (req, res) => {
    try {
      const { appealReason } = req.body;
      if (!appealReason) {
        return res.status(400).json({ error: 'appealReason is required', code: 'VALIDATION_ERROR' });
      }

      const appeal = {
        id: uuidv4(),
        reason: appealReason,
        submittedBy: req.user.id,
        submittedAt: new Date().toISOString(),
        status: 'submitted',
      };

      if (useDB()) {
        const existing = await db.query('SELECT * FROM claims WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
        if (existing.rows[0].status !== 'denied') {
          return res.status(400).json({ error: 'Only denied claims can be appealed', code: 'INVALID_STATE' });
        }

        const currentAppeals = existing.rows[0].appeals || [];
        const updatedAppeals = [...currentAppeals, appeal];

        const result = await db.query(
          'UPDATE claims SET status=$1, appeals=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
          ['appealed', JSON.stringify(updatedAppeals), req.params.id]
        );
        return res.status(201).json({ success: true, appeal, claim: rowToApi(result.rows[0]) });
      }

      const claim = memClaims.get(req.params.id);
      if (!claim) return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
      if (claim.status !== 'denied') {
        return res.status(400).json({ error: 'Only denied claims can be appealed', code: 'INVALID_STATE' });
      }
      claim.appeals = [...(claim.appeals || []), appeal];
      claim.status = 'appealed';
      return res.status(201).json({ success: true, appeal, claim });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit appeal', code: 'APPEAL_ERROR' });
    }
  }
);

/**
 * GET /claims/:id/score
 * Return the strategy engine score stored on the claim.
 */
router.get('/:id/score', authenticate, apiLimiter, async (req, res) => {
  try {
    if (useDB()) {
      const result = await db.query('SELECT id, strategic_score FROM claims WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
      return res.json({ success: true, claimId: result.rows[0].id, score: result.rows[0].strategic_score });
    }

    const claim = memClaims.get(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found', code: 'NOT_FOUND' });
    return res.json({ success: true, claimId: claim.id, score: claim.strategicScore });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve score', code: 'SCORE_ERROR' });
  }
});

module.exports = router;
