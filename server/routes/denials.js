/**
 * Noesis.io Health  - Denials Route
 * © 2026 Athena Core Technologies
 *
 * Denial management: list, retrieve, appeal, status updates, analytics.
 * PHI fields (patient_name) are AES-256-GCM encrypted at rest.
 * Dual-path: PostgreSQL when connected, in-memory fallback for dev.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');
const db = require('../db');
const { encryptPHI, decryptPHI } = require('../utils/encryption');
const { buildScopeClause, canAccessResource, inMemoryFilter } = require('../utils/tenantScope');

const router = express.Router();

// ── CARC/RARC reference codes ────────────────────────────────────────────────
const carcCodes = {
  'CO-4':  { code: 'CO-4',  description: 'Adjustment - Claim/service type not covered',                              appealable: true  },
  'CO-16': { code: 'CO-16', description: 'Claim lacks medical documentation',                                         appealable: true  },
  'CO-18': { code: 'CO-18', description: 'Adjustment - Pre-authorization not on file',                                appealable: true  },
  'CO-29': { code: 'CO-29', description: 'Adjustment - Time period/lifetime maximum exceeded',                        appealable: true  },
  'CO-45': { code: 'CO-45', description: 'Adjustment - Charge exceeds fee schedule/maximum allowable',                appealable: true  },
  'CO-97': { code: 'CO-97', description: 'Adjustment - Claim is otherwise covered but payment not payable',           appealable: false },
  'PR-1':  { code: 'PR-1',  description: 'Payment adjustment - Policy limitations applied',                           appealable: true  },
  'PR-2':  { code: 'PR-2',  description: 'Payment adjustment - Incorrect/missing authorization',                      appealable: true  },
  'PR-3':  { code: 'PR-3',  description: 'Payment adjustment - Claim submitted to incorrect insurance plan',          appealable: true  },
};

// ── Validation schemas ────────────────────────────────────────────────────────
const appealSchema = z.object({
  letter: z.string().min(10).max(5000),
  supportingDocs: z.array(z.string()).optional().default([]),
});

const statusUpdateSchema = z.object({
  status: z.enum(['pending_review', 'appealing', 'won', 'lost', 'resubmitted', 'written_off']),
});

// ── In-memory fallback store ──────────────────────────────────────────────────
const denialStore = new Map();

function seedFallback() {
  if (denialStore.size > 0) { return; }
  const seeds = [
    { providerId: 'prov-001', payerId: 'aetna-001',  patientName: 'John Smith',       serviceDate: '2026-03-15', deniedAmount: 350,  claimAmount: 500,  denialReason: 'CO-18', denialDate: '2026-03-22', appealDeadline: '2026-05-21', status: 'pending_review', cptCode: '99213', placeOfService: 'office' },
    { providerId: 'prov-001', payerId: 'bcbs-002',   patientName: 'Mary Johnson',     serviceDate: '2026-03-10', deniedAmount: 1200, claimAmount: 1500, denialReason: 'CO-4',  denialDate: '2026-03-18', appealDeadline: '2026-05-17', status: 'pending_review', cptCode: '99214', placeOfService: 'office' },
    { providerId: 'prov-002', payerId: 'united-003', patientName: 'Robert Davis',     serviceDate: '2026-03-05', deniedAmount: 450,  claimAmount: 600,  denialReason: 'PR-1',  denialDate: '2026-03-16', appealDeadline: '2026-05-15', status: 'appealing',      cptCode: '99215', placeOfService: 'office', appeals: [{ id: uuidv4(), submittedDate: '2026-04-05', letter: 'Appeal submitted with supporting clinical documentation', status: 'submitted' }] },
    { providerId: 'prov-002', payerId: 'cigna-004',  patientName: 'Patricia Miller',  serviceDate: '2026-02-28', deniedAmount: 850,  claimAmount: 1000, denialReason: 'CO-29', denialDate: '2026-03-12', appealDeadline: '2026-05-11', status: 'won',            cptCode: '99213', placeOfService: 'office', appeals: [{ id: uuidv4(), submittedDate: '2026-03-20', letter: 'Appeal with benefit clarification', status: 'approved' }] },
    { providerId: 'prov-003', payerId: 'humana-005', patientName: 'James Wilson',     serviceDate: '2026-02-20', deniedAmount: 200,  claimAmount: 250,  denialReason: 'CO-97', denialDate: '2026-03-10', appealDeadline: '2026-05-09', status: 'lost',           cptCode: '99212', placeOfService: 'telehealth', appeals: [{ id: uuidv4(), submittedDate: '2026-03-25', letter: 'Appeal denied - not a covered service', status: 'denied' }] },
    { providerId: 'prov-003', payerId: 'aetna-001',  patientName: 'Susan Anderson',   serviceDate: '2026-03-08', deniedAmount: 500,  claimAmount: 650,  denialReason: 'PR-2',  denialDate: '2026-03-19', appealDeadline: '2026-05-18', status: 'resubmitted',    cptCode: '99214', placeOfService: 'office', appeals: [{ id: uuidv4(), submittedDate: '2026-04-01', letter: 'Resubmitted with correct authorization number', status: 'pending' }] },
    { providerId: 'prov-001', payerId: 'bcbs-002',   patientName: 'Linda Garcia',     serviceDate: '2026-03-01', deniedAmount: 300,  claimAmount: 400,  denialReason: 'CO-45', denialDate: '2026-03-14', appealDeadline: '2026-05-13', status: 'written_off',    cptCode: '99213', placeOfService: 'office' },
    { providerId: 'prov-002', payerId: 'united-003', patientName: 'Michael Brown',    serviceDate: '2026-02-15', deniedAmount: 600,  claimAmount: 800,  denialReason: 'PR-3',  denialDate: '2026-03-08', appealDeadline: '2026-05-07', status: 'pending_review', cptCode: '99215', placeOfService: 'office' },
    { providerId: 'prov-003', payerId: 'cigna-004',  patientName: 'Jennifer Taylor',  serviceDate: '2026-03-11', deniedAmount: 175,  claimAmount: 250,  denialReason: 'CO-16', denialDate: '2026-03-21', appealDeadline: '2026-05-20', status: 'pending_review', cptCode: '99214', placeOfService: 'office' },
  ];
  seeds.forEach((s) => {
    const id = uuidv4();
    denialStore.set(id, { id, claimId: uuidv4(), appeals: [], statusHistory: [], createdAt: new Date().toISOString(), ...s });
  });
}
seedFallback();

// ── DB helpers ────────────────────────────────────────────────────────────────
function rowToApi(row) {
  return {
    id: row.id,
    claimId: row.claim_id,
    providerId: row.provider_id,
    payerId: row.payer_id,
    patientName: (() => { try { return decryptPHI(row.patient_name); } catch { return row.patient_name; } })(),
    serviceDate: row.service_date,
    deniedAmount: parseFloat(row.denied_amount),
    claimAmount: parseFloat(row.claim_amount),
    denialReason: row.denial_reason,
    denialReasonText: row.denial_reason_text,
    denialDate: row.denial_date,
    appealDeadline: row.appeal_deadline,
    status: row.status,
    cptCode: row.cpt_code,
    placeOfService: row.place_of_service,
    appeals: row.appeals || [],
    statusHistory: row.status_history || [],
    organizationId: row.organization_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function addCarcInfo(denial) {
  const carcInfo = carcCodes[denial.denialReason];
  return {
    ...denial,
    denialReasonText: denial.denialReasonText || carcInfo?.description,
    carcCode: carcInfo,
    appealable: carcInfo?.appealable || false,
    daysUntilDeadline: denial.appealDeadline
      ? Math.floor((new Date(denial.appealDeadline) - new Date()) / (1000 * 60 * 60 * 24))
      : null,
  };
}

// ── GET /  - List denials ──────────────────────────────────────────────────────
router.get('/', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, async (req, res) => {
  try {
    const { reason, payer, status, startDate, endDate, limit = 20, offset = 0 } = req.query;
    const lim = parseInt(limit);
    const off = parseInt(offset);

    if (db.isConnected()) {
      const scope  = buildScopeClause(req);
      const params = [...scope.params];
      let where    = `WHERE 1=1${scope.clause}`;

      if (reason)    { params.push(reason);    where += ` AND denial_reason = $${params.length}`; }
      if (payer)     { params.push(payer);      where += ` AND payer_id = $${params.length}`; }
      if (status)    { params.push(status);     where += ` AND status = $${params.length}`; }
      if (startDate) { params.push(startDate);  where += ` AND denial_date >= $${params.length}`; }
      if (endDate)   { params.push(endDate);    where += ` AND denial_date <= $${params.length}`; }

      const countRes = await db.query(`SELECT COUNT(*) FROM denials ${where}`, params);
      const total = parseInt(countRes.rows[0].count);

      params.push(lim, off);
      const dataRes = await db.query(
        `SELECT * FROM denials ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({
        success: true,
        data: dataRes.rows.map(rowToApi),
        pagination: { total, limit: lim, offset: off, hasMore: off + lim < total },
      });
    }

    // In-memory fallback
    let list = Array.from(denialStore.values()).filter(inMemoryFilter(req));
    if (reason)    { list = list.filter((d) => d.denialReason === reason); }
    if (payer)     { list = list.filter((d) => d.payerId === payer); }
    if (status)    { list = list.filter((d) => d.status === status); }
    if (startDate) { list = list.filter((d) => new Date(d.denialDate) >= new Date(startDate)); }
    if (endDate)   { list = list.filter((d) => new Date(d.denialDate) <= new Date(endDate)); }

    const total = list.length;
    res.json({
      success: true,
      data: list.slice(off, off + lim),
      pagination: { total, limit: lim, offset: off, hasMore: off + lim < total },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list denials', code: 'LIST_ERROR', details: err.message });
  }
});

// ── GET /analytics/summary ────────────────────────────────────────────────────
router.get('/analytics/summary', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, async (req, res) => {
  try {
    let list;

    if (db.isConnected()) {
      const scope  = buildScopeClause(req);
      const params = [...scope.params];
      const where  = `WHERE 1=1${scope.clause}`;
      const result = await db.query(`SELECT * FROM denials ${where}`, params);
      list = result.rows.map(rowToApi);
    } else {
      list = Array.from(denialStore.values()).filter(inMemoryFilter(req));
    }

    const totalDenials = list.length;
    const totalDeniedAmount = list.reduce((sum, d) => sum + (d.deniedAmount || 0), 0);

    const byPayer = {};
    list.forEach((d) => {
      if (!byPayer[d.payerId]) { byPayer[d.payerId] = { count: 0, amount: 0, appealCount: 0, successCount: 0 }; }
      byPayer[d.payerId].count += 1;
      byPayer[d.payerId].amount += d.deniedAmount || 0;
      if (d.appeals && d.appeals.length > 0) { byPayer[d.payerId].appealCount += 1; }
      if (d.status === 'won') { byPayer[d.payerId].successCount += 1; }
    });

    const byReason = {};
    list.forEach((d) => {
      if (!byReason[d.denialReason]) { byReason[d.denialReason] = { count: 0, amount: 0 }; }
      byReason[d.denialReason].count += 1;
      byReason[d.denialReason].amount += d.deniedAmount || 0;
    });

    const appealed = list.filter((d) => d.appeals && d.appeals.length > 0);
    const successfulAppeals = list.filter((d) => d.status === 'won');
    const appealSuccessRate = appealed.length > 0
      ? ((successfulAppeals.length / appealed.length) * 100).toFixed(2)
      : '0.00';

    res.json({
      success: true,
      analytics: {
        totalDenials,
        totalDeniedAmount,
        byPayer,
        byReason,
        appeals: {
          totalAppealed: appealed.length,
          totalSuccessful: successfulAppeals.length,
          successRate: appealSuccessRate + '%',
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve analytics', code: 'ANALYTICS_ERROR', details: err.message });
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), apiLimiter, async (req, res) => {
  try {
    let denial;

    if (db.isConnected()) {
      const result = await db.query('SELECT * FROM denials WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
      }
      denial = rowToApi(result.rows[0]);
    } else {
      denial = denialStore.get(req.params.id);
      if (!denial) {
        return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
      }
    }

    if (!canAccessResource(req, denial)) {
      // 404 instead of 403 to avoid leaking the existence of cross-tenant records.
      return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
    }

    res.json({ success: true, denial: addCarcInfo(denial) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve denial', code: 'GET_ERROR', details: err.message });
  }
});

// ── POST /:id/appeal ──────────────────────────────────────────────────────────
router.post('/:id/appeal', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), async (req, res) => {
  try {
    const validation = appealSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid appeal data', code: 'VALIDATION_ERROR', details: validation.error.errors });
    }

    let denial;

    if (db.isConnected()) {
      const result = await db.query('SELECT * FROM denials WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
      }
      denial = rowToApi(result.rows[0]);
    } else {
      denial = denialStore.get(req.params.id);
      if (!denial) {
        return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
      }
    }

    if (!canAccessResource(req, denial)) {
      // 404 instead of 403 to avoid leaking the existence of cross-tenant records.
      return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
    }

    const carcInfo = carcCodes[denial.denialReason];
    if (!carcInfo?.appealable) {
      return res.status(400).json({ error: 'This denial reason is not appealable', code: 'NOT_APPEALABLE', denialReason: denial.denialReason });
    }

    if (denial.appealDeadline && new Date() > new Date(denial.appealDeadline)) {
      return res.status(400).json({ error: 'Appeal deadline has passed', code: 'DEADLINE_EXCEEDED', appealDeadline: denial.appealDeadline });
    }

    const appeal = {
      id: uuidv4(),
      submittedDate: new Date().toISOString(),
      letter: validation.data.letter,
      supportingDocs: validation.data.supportingDocs,
      status: 'submitted',
      submittedBy: req.user.id,
    };

    const appeals = [...(denial.appeals || []), appeal];

    if (db.isConnected()) {
      await db.query(
        `UPDATE denials SET appeals = $1, status = 'appealing', updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(appeals), req.params.id]
      );
      const updated = await db.query('SELECT * FROM denials WHERE id = $1', [req.params.id]);
      denial = rowToApi(updated.rows[0]);
    } else {
      denial.appeals = appeals;
      denial.status = 'appealing';
      denial.updatedAt = new Date().toISOString();
      denialStore.set(req.params.id, denial);
    }

    res.status(201).json({ success: true, appeal, denial });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit appeal', code: 'APPEAL_ERROR', details: err.message });
  }
});

// ── PUT /:id/status ───────────────────────────────────────────────────────────
router.put('/:id/status', authenticate, authorize(ROLES.PROVIDER_STAFF, ROLES.PRACTICE_ADMIN), async (req, res) => {
  try {
    const validation = statusUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid status', code: 'VALIDATION_ERROR', details: validation.error.errors });
    }

    let denial;

    if (db.isConnected()) {
      const result = await db.query('SELECT * FROM denials WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
      }
      denial = rowToApi(result.rows[0]);
    } else {
      denial = denialStore.get(req.params.id);
      if (!denial) {
        return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
      }
    }

    if (!canAccessResource(req, denial)) {
      // 404 instead of 403 to avoid leaking the existence of cross-tenant records.
      return res.status(404).json({ error: 'Denial not found', code: 'NOT_FOUND' });
    }

    const historyEntry = {
      previousStatus: denial.status,
      newStatus: validation.data.status,
      changedAt: new Date().toISOString(),
      changedBy: req.user.id,
    };
    const statusHistory = [...(denial.statusHistory || []), historyEntry];

    if (db.isConnected()) {
      await db.query(
        `UPDATE denials SET status = $1, status_history = $2, updated_at = NOW() WHERE id = $3`,
        [validation.data.status, JSON.stringify(statusHistory), req.params.id]
      );
      const updated = await db.query('SELECT * FROM denials WHERE id = $1', [req.params.id]);
      denial = rowToApi(updated.rows[0]);
    } else {
      denial.status = validation.data.status;
      denial.statusHistory = statusHistory;
      denial.updatedAt = new Date().toISOString();
      denialStore.set(req.params.id, denial);
    }

    res.json({ success: true, denial, auditLog: statusHistory });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status', code: 'UPDATE_ERROR', details: err.message });
  }
});

module.exports = router;
