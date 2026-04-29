/**
 * Noesis.io Health  - Eligibility Route
 * © 2026 Athena Core Technologies, Inc.
 *
 * Real-time insurance eligibility verification via payer APIs.
 * Routes through payerEligibility service → Availity (2,800+ payers) → demo fallback.
 * All checks logged to eligibility_checks table for audit trail.
 */

const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { eligibilitySchema } = require('../schemas/validation');
const payerEligibility = require('../services/payerEligibility');
const db = require('../db');

const router = express.Router();

// ── Persist eligibility check to audit trail ──────────────────────────────────
async function logEligibilityCheck(req, result, payerId) {
  if (!db.isConnected()) { return; }
  try {
    await db.query(
      `INSERT INTO eligibility_checks
         (provider_id, organization_id, member_id, patient_name, payer_id, payer_name, service_type, is_eligible, plan_name, result, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        req.user.id,
        req.user.organizationId || null,
        result.memberId         || null,
        result.subscriberName   || null,
        payerId                 || null,
        result.payerName        || null,
        result.serviceType      || 'medical',
        result.eligible         ?? null,
        result.planName         || null,
        JSON.stringify(result),
        result.source           || 'demo',
      ]
    );
  } catch { /* audit failure never blocks the request */ }
}

// ── POST /verify  - single patient eligibility check ───────────────────────────
router.post(
  '/verify',
  authenticate,
  requirePlan('solo', 'group', 'enterprise'),
  apiLimiter,
  validate(eligibilitySchema),
  async (req, res) => {
    try {
      const { patientName, dateOfBirth, memberId, payerId, serviceType } = req.validated;

      // Split patient name into first/last for the service
      const nameParts  = (patientName || '').trim().split(/\s+/);
      const firstName  = nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
      const lastName   = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

      const result = await payerEligibility.checkEligibility({
        patient: {
          firstName,
          lastName,
          dateOfBirth: dateOfBirth || null,
          memberId:    memberId    || null,
        },
        provider: {
          npi:              req.user.npi              || null,
          organizationName: req.user.organizationName || 'Provider Practice',
        },
        payer: {
          payerId: payerId || null,
          name:    payerId || null,
        },
        serviceType: serviceType || '30',
      });

      await logEligibilityCheck(req, result, payerId);

      // Shape response to match original contract so existing frontend keeps working
      res.json({
        success: true,
        source:  result.source,
        eligibility: {
          memberId:             result.memberId,
          patientName:          result.subscriberName || patientName,
          payerId,
          serviceType:          serviceType || 'medical',
          isEligible:           result.eligible,
          eligibilityStartDate: result.effectiveDate,
          eligibilityEndDate:   result.terminationDate,
          groupNumber:          result.groupNumber,
          plan: {
            name:           result.planName,
            type:           result.planType || 'PPO',
            deductible:     result.deductible?.total     || 0,
            deductibleMet:  result.deductible?.met       || 0,
            outOfPocketMax: result.outOfPocket?.total    || 0,
            outOfPocketMet: result.outOfPocket?.met      || 0,
            copay: {
              officeVisit: result.copays?.primaryCare || 30,
              specialist:  result.copays?.specialist  || 60,
              emergency:   result.copays?.emergency   || 350,
              urgent:      result.copays?.urgent      || 90,
            },
            coinsurance: result.coinsurance || 0.20,
            coverage:    result.coverages   || {},
          },
          priorAuthRequired: result.priorAuthRequired || [],
          verifiedAt:  new Date().toISOString(),
          expiresAt:   new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          demo:        result.demo || false,
        },
      });
    } catch (err) {
      res.status(500).json({
        error:   'Eligibility verification failed',
        code:    'VERIFY_ERROR',
        details: err.message,
      });
    }
  }
);

// ── GET /history/:memberId  - eligibility check history ────────────────────────
router.get(
  '/history/:memberId',
  authenticate,
  requirePlan('group', 'enterprise'),
  apiLimiter,
  async (req, res) => {
    try {
      const { memberId } = req.params;

      if (db.isConnected()) {
        const result = await db.query(
          `SELECT * FROM eligibility_checks
           WHERE provider_id = $1 AND member_id = $2
           ORDER BY checked_at DESC LIMIT 20`,
          [req.user.id, memberId]
        );
        return res.json({
          success: true,
          memberId,
          total:   result.rows.length,
          history: result.rows.map((r) => ({
            id:          r.id,
            payerId:     r.payer_id,
            payerName:   r.payer_name,
            isEligible:  r.is_eligible,
            planName:    r.plan_name,
            source:      r.source,
            checkedAt:   r.checked_at,
          })),
        });
      }

      // Fallback
      res.json({ success: true, memberId, total: 0, history: [], demo: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve eligibility history', code: 'HISTORY_ERROR' });
    }
  }
);

// ── POST /batch  - multiple patients at once ────────────────────────────────────
router.post(
  '/batch',
  authenticate,
  requirePlan('group', 'enterprise'),
  submissionLimiter,
  async (req, res) => {
    try {
      const { patients, payerId } = req.body;
      if (!Array.isArray(patients) || patients.length === 0) {
        return res.status(400).json({ error: 'patients array required', code: 'VALIDATION_ERROR' });
      }
      if (patients.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 patients per batch', code: 'BATCH_TOO_LARGE' });
      }

      const requests = patients.map((p) => ({
        patient: {
          memberId:    p.memberId,
          firstName:   p.firstName || (p.name || '').split(' ')[0],
          lastName:    p.lastName  || (p.name || '').split(' ').slice(1).join(' '),
          dateOfBirth: p.dateOfBirth,
        },
        provider: { npi: req.user.npi, organizationName: req.user.organizationName },
        payer:    { payerId: payerId || p.payerId },
      }));

      const results = await payerEligibility.checkEligibilityBatch(requests);

      // Log all checks
      await Promise.allSettled(
        results.filter((r) => r.success).map((r) => logEligibilityCheck(req, r.result, payerId))
      );

      res.json({
        success:  true,
        payerId,
        total:    results.length,
        eligible: results.filter((r) => r.success && r.result?.eligible).length,
        results:  results.map((r, i) => ({
          memberId:    patients[i]?.memberId,
          name:        patients[i]?.name || `${patients[i]?.firstName} ${patients[i]?.lastName}`.trim(),
          isEligible:  r.success ? r.result?.eligible : null,
          planName:    r.success ? r.result?.planName : null,
          error:       r.error   || null,
          verifiedAt:  new Date().toISOString(),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'Batch verification failed', code: 'BATCH_ERROR', details: err.message });
    }
  }
);

// ── GET /payers  - connected payer catalog ─────────────────────────────────────
router.get('/payers', authenticate, requirePlan('solo', 'group', 'enterprise'), apiLimiter, (req, res) => {
  const { PAYER_CATALOG } = require('../services/payerEligibility');
  const status = require('../services/payerEligibility').getStatus();

  const payers = Object.entries(PAYER_CATALOG).map(([id, p]) => ({
    payerId:   p.payerId,
    id,
    name:      p.name,
    hub:       p.hub,
    status:    status.configured ? 'connected' : 'demo',
    method:    'EDI 270/271 via Availity',
  }));

  res.json({
    success:   true,
    configured: status.configured,
    hub:       status.availity,
    payers,
    connected: payers.length,
    total:     payers.length,
  });
});

module.exports = router;
