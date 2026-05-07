/**
 * Noesis.io Health  - EDI Trading Partner registry
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Persistent registry of trading partners (clearinghouses + payers reachable
 * via direct EDI). Each row holds the connection envelope identifiers,
 * supported transaction sets, and the (encrypted) credentials Noesis uses
 * to submit / poll EDI.
 *
 * Why a registry: enrolling with a clearinghouse is paperwork-heavy
 * (W-9, BAA, payer enrollment matrix). The registry lets ops onboard a
 * partner once and drive every 837/276/835 transaction off the same
 * sender/receiver id pair.
 *
 * HIPAA notes:
 *   - api_secret_enc / sftp_password_enc are encrypted with PHI_ENCRYPTION_KEY
 *     even though they are not strictly PHI; access to the partner gives
 *     access to PHI in flight, so they sit at the same protection level.
 *   - Audit events written to audit_logs (action TRADING_PARTNER_*).
 *
 * Falls back to in-memory storage (Map) when DATABASE_URL is unset.
 * Production callers MUST have a real DB.
 */

'use strict';

const crypto = require('crypto');

const db = require('../../db');
const { encryptPHI, decryptPHI } = require('../../utils/encryption');

const _memStore = new Map();

const TRANSPORT_TYPES = Object.freeze(['rest', 'sftp', 'as2', 'soap', 'manual']);
const SUPPORTED_SETS  = Object.freeze(['837P', '837I', '270', '271', '276', '277', '835']);

// ── Schema management ────────────────────────────────────────────────────────

async function ensureSchema() {
  if (!db.isConnected()) { return; }
  await db.query(`
    CREATE TABLE IF NOT EXISTS edi_trading_partners (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id             UUID NOT NULL,
      partner_code       TEXT NOT NULL,
      partner_name       TEXT NOT NULL,
      partner_type       TEXT NOT NULL DEFAULT 'clearinghouse',
      sender_id          TEXT NOT NULL,
      receiver_id        TEXT NOT NULL,
      sender_qualifier   TEXT NOT NULL DEFAULT 'ZZ',
      receiver_qualifier TEXT NOT NULL DEFAULT 'ZZ',
      transport          TEXT NOT NULL DEFAULT 'rest',
      endpoint_url       TEXT,
      api_key            TEXT,
      api_secret_enc     TEXT,
      sftp_host          TEXT,
      sftp_user          TEXT,
      sftp_password_enc  TEXT,
      supported_sets     TEXT[] NOT NULL DEFAULT '{}',
      usage_indicator    TEXT NOT NULL DEFAULT 'T',
      status             TEXT NOT NULL DEFAULT 'enrolling',
      enrollment_notes   TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(org_id, partner_code)
    )
  `).catch(() => {});
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_edi_trading_partners_org ON edi_trading_partners(org_id)`
  ).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS edi_claim_submissions (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id              UUID NOT NULL,
      partner_id          UUID,
      claim_id            TEXT NOT NULL,
      transaction_set     TEXT NOT NULL,
      version_id          TEXT NOT NULL,
      isa_control         TEXT,
      gs_control          TEXT,
      st_control          TEXT,
      total_amount        NUMERIC(12, 2),
      status              TEXT NOT NULL DEFAULT 'submitted',
      tracking_id         TEXT,
      response_status     TEXT,
      response_message    TEXT,
      response_payload    JSONB,
      submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finalized_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_edi_submissions_claim ON edi_claim_submissions(org_id, claim_id)`
  ).catch(() => {});
}

async function _writeAudit({ action, orgId, statusCode = 200, partner, error }) {
  if (!db.isConnected()) { return; }
  try {
    await db.query(
      `INSERT INTO audit_logs
         (timestamp, user_id, user_role, action, method, path, status_code,
          ip_address, user_agent, organization_id)
       VALUES (NOW(), 'system', 'system', $1, 'INTERNAL',
               $2, $3, 'system', 'noesis-health-edi', $4)`,
      [
        action,
        'edi:partner:' + (partner || 'unknown') + (error ? ':error' : ''),
        statusCode,
        orgId || null,
      ]
    );
  } catch (_err) {
    process.stderr.write('[edi.audit] write failed: ' + _err.message + '\n');
  }
}

// ── Trading partner CRUD ─────────────────────────────────────────────────────

/**
 * Register or update a trading partner.
 *
 * @param {object} input
 */
async function upsertTradingPartner(input) {
  if (!input || !input.orgId || !input.partnerCode || !input.partnerName) {
    throw new Error('upsertTradingPartner: orgId, partnerCode, partnerName required');
  }
  if (!input.senderId || !input.receiverId) {
    throw new Error('upsertTradingPartner: senderId and receiverId required');
  }
  const transport = input.transport || 'rest';
  if (!TRANSPORT_TYPES.includes(transport)) {
    throw new Error('upsertTradingPartner: transport must be one of ' + TRANSPORT_TYPES.join(', '));
  }
  for (const s of (input.supportedSets || [])) {
    if (!SUPPORTED_SETS.includes(s)) {
      throw new Error('upsertTradingPartner: supportedSet "' + s + '" not in ' + SUPPORTED_SETS.join(', '));
    }
  }

  const apiSecretEnc    = input.apiSecret    ? encryptPHI(input.apiSecret)    : null;
  const sftpPasswordEnc = input.sftpPassword ? encryptPHI(input.sftpPassword) : null;

  const record = {
    id: null,
    orgId:             input.orgId,
    partnerCode:       input.partnerCode.toUpperCase(),
    partnerName:       input.partnerName,
    partnerType:       input.partnerType || 'clearinghouse',
    senderId:          input.senderId,
    receiverId:        input.receiverId,
    senderQualifier:   input.senderQualifier   || 'ZZ',
    receiverQualifier: input.receiverQualifier || 'ZZ',
    transport,
    endpointUrl:       input.endpointUrl || null,
    apiKey:            input.apiKey || null,
    sftpHost:          input.sftpHost || null,
    sftpUser:          input.sftpUser || null,
    supportedSets:     input.supportedSets || [],
    usageIndicator:    input.usageIndicator || 'T',
    status:            input.status || 'enrolling',
    enrollmentNotes:   input.enrollmentNotes || null,
  };

  if (db.isConnected()) {
    const res = await db.query(
      `INSERT INTO edi_trading_partners
         (org_id, partner_code, partner_name, partner_type,
          sender_id, receiver_id, sender_qualifier, receiver_qualifier,
          transport, endpoint_url, api_key, api_secret_enc,
          sftp_host, sftp_user, sftp_password_enc,
          supported_sets, usage_indicator, status, enrollment_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (org_id, partner_code) DO UPDATE SET
         partner_name       = EXCLUDED.partner_name,
         partner_type       = EXCLUDED.partner_type,
         sender_id          = EXCLUDED.sender_id,
         receiver_id        = EXCLUDED.receiver_id,
         sender_qualifier   = EXCLUDED.sender_qualifier,
         receiver_qualifier = EXCLUDED.receiver_qualifier,
         transport          = EXCLUDED.transport,
         endpoint_url       = EXCLUDED.endpoint_url,
         api_key            = EXCLUDED.api_key,
         api_secret_enc     = COALESCE(EXCLUDED.api_secret_enc, edi_trading_partners.api_secret_enc),
         sftp_host          = EXCLUDED.sftp_host,
         sftp_user          = EXCLUDED.sftp_user,
         sftp_password_enc  = COALESCE(EXCLUDED.sftp_password_enc, edi_trading_partners.sftp_password_enc),
         supported_sets     = EXCLUDED.supported_sets,
         usage_indicator    = EXCLUDED.usage_indicator,
         status             = EXCLUDED.status,
         enrollment_notes   = EXCLUDED.enrollment_notes,
         updated_at         = NOW()
       RETURNING id`,
      [record.orgId, record.partnerCode, record.partnerName, record.partnerType,
       record.senderId, record.receiverId, record.senderQualifier, record.receiverQualifier,
       record.transport, record.endpointUrl, record.apiKey, apiSecretEnc,
       record.sftpHost, record.sftpUser, sftpPasswordEnc,
       record.supportedSets, record.usageIndicator, record.status, record.enrollmentNotes]
    );
    record.id = res.rows[0].id;
  } else {
    record.id = crypto.randomUUID();
    _memStore.set(_partnerKey(record.orgId, record.partnerCode), {
      ...record,
      _apiSecretEnc:    apiSecretEnc,
      _sftpPasswordEnc: sftpPasswordEnc,
    });
  }

  await _writeAudit({
    action: 'TRADING_PARTNER_UPSERT',
    orgId:  record.orgId,
    partner: record.partnerCode,
  });

  return _safeSummary(record);
}

function _partnerKey(orgId, code) {
  return 'partner:' + orgId + ':' + String(code).toUpperCase();
}

/**
 * Fetch a trading partner by (org, code). Returns decrypted credentials.
 */
async function getTradingPartner(orgId, partnerCode) {
  if (!orgId || !partnerCode) { return null; }
  const code = String(partnerCode).toUpperCase();
  if (db.isConnected()) {
    const res = await db.query(
      `SELECT id, org_id, partner_code, partner_name, partner_type,
              sender_id, receiver_id, sender_qualifier, receiver_qualifier,
              transport, endpoint_url, api_key, api_secret_enc,
              sftp_host, sftp_user, sftp_password_enc,
              supported_sets, usage_indicator, status, enrollment_notes,
              created_at, updated_at
         FROM edi_trading_partners
        WHERE org_id = $1 AND partner_code = $2
        LIMIT 1`,
      [orgId, code]
    );
    if (!res.rows.length) { return null; }
    return _hydrateRow(res.rows[0]);
  }
  const m = _memStore.get(_partnerKey(orgId, code));
  if (!m) { return null; }
  return _hydrateMem(m);
}

function _hydrateRow(row) {
  return {
    id:                row.id,
    orgId:             row.org_id,
    partnerCode:       row.partner_code,
    partnerName:       row.partner_name,
    partnerType:       row.partner_type,
    senderId:          row.sender_id,
    receiverId:        row.receiver_id,
    senderQualifier:   row.sender_qualifier,
    receiverQualifier: row.receiver_qualifier,
    transport:         row.transport,
    endpointUrl:       row.endpoint_url,
    apiKey:            row.api_key,
    apiSecret:         row.api_secret_enc    ? decryptPHI(row.api_secret_enc)    : null,
    sftpHost:          row.sftp_host,
    sftpUser:          row.sftp_user,
    sftpPassword:      row.sftp_password_enc ? decryptPHI(row.sftp_password_enc) : null,
    supportedSets:     row.supported_sets || [],
    usageIndicator:    row.usage_indicator,
    status:            row.status,
    enrollmentNotes:   row.enrollment_notes,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}

function _hydrateMem(m) {
  return {
    ...m,
    apiSecret:    m._apiSecretEnc    ? decryptPHI(m._apiSecretEnc)    : null,
    sftpPassword: m._sftpPasswordEnc ? decryptPHI(m._sftpPasswordEnc) : null,
    _apiSecretEnc:    undefined,
    _sftpPasswordEnc: undefined,
  };
}

function _safeSummary(record) {
  return {
    id:              record.id,
    partnerCode:     record.partnerCode,
    partnerName:     record.partnerName,
    partnerType:     record.partnerType,
    senderId:        record.senderId,
    receiverId:      record.receiverId,
    transport:       record.transport,
    supportedSets:   record.supportedSets,
    usageIndicator:  record.usageIndicator,
    status:          record.status,
  };
}

/**
 * List trading partners for an org. Never returns credentials.
 */
async function listTradingPartners(orgId) {
  if (!orgId) { return []; }
  if (db.isConnected()) {
    const res = await db.query(
      `SELECT id, partner_code, partner_name, partner_type,
              sender_id, receiver_id, transport, supported_sets,
              usage_indicator, status, created_at, updated_at
         FROM edi_trading_partners WHERE org_id = $1 ORDER BY partner_code`,
      [orgId]
    );
    return res.rows.map((r) => ({
      id:             r.id,
      partnerCode:    r.partner_code,
      partnerName:    r.partner_name,
      partnerType:    r.partner_type,
      senderId:       r.sender_id,
      receiverId:     r.receiver_id,
      transport:      r.transport,
      supportedSets:  r.supported_sets || [],
      usageIndicator: r.usage_indicator,
      status:         r.status,
      createdAt:      r.created_at,
      updatedAt:      r.updated_at,
    }));
  }
  const out = [];
  for (const [k, v] of _memStore.entries()) {
    if (typeof k !== 'string' || !k.startsWith('partner:')) { continue; }
    if (v.orgId !== orgId) { continue; }
    out.push(_safeSummary(v));
  }
  return out;
}

/**
 * Soft-delete a trading partner (status=disabled, credentials cleared).
 */
async function deactivateTradingPartner(orgId, partnerCode) {
  const code = String(partnerCode).toUpperCase();
  if (db.isConnected()) {
    await db.query(
      `UPDATE edi_trading_partners SET status = 'disabled',
              api_secret_enc = NULL, sftp_password_enc = NULL, updated_at = NOW()
        WHERE org_id = $1 AND partner_code = $2`,
      [orgId, code]
    );
  } else {
    const m = _memStore.get(_partnerKey(orgId, code));
    if (m) { m.status = 'disabled'; m._apiSecretEnc = null; m._sftpPasswordEnc = null; }
  }
  await _writeAudit({ action: 'TRADING_PARTNER_DEACTIVATE', orgId, partner: code });
}

// ── Submission ledger ────────────────────────────────────────────────────────

/**
 * Record a claim submission (used by the EDI service after a successful
 * 837P build). Persists ISA/GS/ST control numbers so the corresponding
 * 277 / 835 can be reassociated.
 */
async function recordSubmission(input) {
  if (!input || !input.orgId || !input.claimId || !input.transactionSet || !input.versionId) {
    throw new Error('recordSubmission: orgId, claimId, transactionSet, versionId required');
  }
  const id = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  if (db.isConnected()) {
    const res = await db.query(
      `INSERT INTO edi_claim_submissions
         (org_id, partner_id, claim_id, transaction_set, version_id,
          isa_control, gs_control, st_control, total_amount,
          status, tracking_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, submitted_at`,
      [input.orgId, input.partnerId || null, input.claimId, input.transactionSet, input.versionId,
       input.controlNumbers && input.controlNumbers.isa,
       input.controlNumbers && input.controlNumbers.gs,
       input.controlNumbers && input.controlNumbers.st,
       Number.isFinite(input.totalAmount) ? input.totalAmount : null,
       input.status || 'submitted',
       input.trackingId || null]
    );
    return { id: res.rows[0].id, submittedAt: res.rows[0].submitted_at };
  }
  _memStore.set('submission:' + id, {
    id,
    orgId:           input.orgId,
    partnerId:       input.partnerId || null,
    claimId:         input.claimId,
    transactionSet:  input.transactionSet,
    versionId:       input.versionId,
    controlNumbers:  input.controlNumbers || {},
    totalAmount:     input.totalAmount || null,
    status:          input.status || 'submitted',
    trackingId:      input.trackingId || null,
    submittedAt,
  });
  return { id, submittedAt };
}

/**
 * List submissions for a claim. Used by the status route.
 */
async function listSubmissionsForClaim(orgId, claimId) {
  if (!orgId || !claimId) { return []; }
  if (db.isConnected()) {
    const res = await db.query(
      `SELECT id, partner_id, claim_id, transaction_set, version_id,
              isa_control, gs_control, st_control, total_amount,
              status, tracking_id, response_status, response_message,
              submitted_at, finalized_at
         FROM edi_claim_submissions
        WHERE org_id = $1 AND claim_id = $2
        ORDER BY submitted_at DESC`,
      [orgId, claimId]
    );
    return res.rows.map((r) => ({
      id: r.id, partnerId: r.partner_id, claimId: r.claim_id,
      transactionSet: r.transaction_set, versionId: r.version_id,
      controlNumbers: { isa: r.isa_control, gs: r.gs_control, st: r.st_control },
      totalAmount: r.total_amount ? Number(r.total_amount) : null,
      status: r.status, trackingId: r.tracking_id,
      responseStatus: r.response_status, responseMessage: r.response_message,
      submittedAt: r.submitted_at, finalizedAt: r.finalized_at,
    }));
  }
  const out = [];
  for (const [k, v] of _memStore.entries()) {
    if (!k.startsWith('submission:')) { continue; }
    if (v.orgId === orgId && v.claimId === claimId) { out.push(v); }
  }
  return out.sort((a, b) => (b.submittedAt > a.submittedAt ? 1 : -1));
}

function _resetForTests() {
  _memStore.clear();
}

module.exports = {
  TRANSPORT_TYPES,
  SUPPORTED_SETS,
  ensureSchema,
  upsertTradingPartner,
  getTradingPartner,
  listTradingPartners,
  deactivateTradingPartner,
  recordSubmission,
  listSubmissionsForClaim,
  _resetForTests,
};
