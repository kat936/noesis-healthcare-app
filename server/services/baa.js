/**
 * Noesis.io Health - Business Associate Agreement (BAA) registry
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Tracks BAAs executed with customer organizations, EHR vendors,
 * clearinghouses, payers, and downstream subcontractors. The healthEhr and
 * healthEdi status endpoints query this module to surface a "BAA required"
 * notice to customers before they can activate live PHI flows.
 *
 * Public surface (admin):
 *   - recordBAA(input)                  - insert a new BAA row
 *   - updateBAA(id, patch)              - amend an existing BAA
 *   - revokeBAA(id, reason)             - soft-revoke (sets status=revoked)
 *   - listBAAs(filters)                 - paginated catalog
 *   - getBAA(id)                        - single record
 *
 * Public surface (customer-facing):
 *   - getOrgBAAStatus(orgId)            - "do we have an active BAA with
 *                                          this customer?" -> shape used by
 *                                          EHR/EDI status endpoints.
 *   - getVendorBAAStatus(vendorId)      - "do we have an active BAA with
 *                                          this EHR vendor?"
 *
 * Storage falls back to an in-memory map when DATABASE_URL is unset, so the
 * scaffold renders in demo mode. Encryption is not applied here - BAA
 * metadata is not PHI; the signed PDF itself lives at executed_document_url
 * (DocuSign envelope / S3 / Drive) and is out of scope for this module.
 */

'use strict';

const db = require('../db');

const COUNTERPARTY_TYPES = Object.freeze([
  'customer_org',
  'ehr_vendor',
  'clearinghouse',
  'payer',
  'subcontractor',
]);

const STATUSES = Object.freeze([
  'draft',
  'pending_signature',
  'active',
  'expired',
  'revoked',
]);

// In-memory fallback when DB is not configured.
const _mem = new Map();

async function ensureSchema() {
  if (!db.isConnected()) { return; }
  await db.query(`
    CREATE TABLE IF NOT EXISTS business_associate_agreements (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      counterparty_type        TEXT NOT NULL,
      org_id                   UUID,
      party_name               TEXT NOT NULL,
      party_identifier         TEXT,
      executed_at              DATE,
      effective_at             DATE,
      expires_at               DATE,
      scope                    TEXT NOT NULL DEFAULT 'phi_handling',
      scope_notes              TEXT,
      executed_document_url    TEXT,
      executed_document_hash   TEXT,
      status                   TEXT NOT NULL DEFAULT 'active',
      notes                    TEXT,
      recorded_by              UUID,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_baas_org_status
      ON business_associate_agreements(org_id, status)
      WHERE counterparty_type = 'customer_org'
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_baas_counterparty
      ON business_associate_agreements(counterparty_type, party_identifier, status)
  `).catch(() => {});
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_baas_expires_at
      ON business_associate_agreements(expires_at)
      WHERE status = 'active' AND expires_at IS NOT NULL
  `).catch(() => {});
}

function _validate(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('recordBAA: input required');
  }
  if (!COUNTERPARTY_TYPES.includes(input.counterpartyType)) {
    throw new Error(
      'recordBAA: counterpartyType must be one of ' + COUNTERPARTY_TYPES.join(', ')
    );
  }
  if (!input.partyName || typeof input.partyName !== 'string') {
    throw new Error('recordBAA: partyName required');
  }
  if (input.counterpartyType === 'customer_org' && !input.orgId) {
    throw new Error('recordBAA: orgId required for counterpartyType=customer_org');
  }
  if (input.status && !STATUSES.includes(input.status)) {
    throw new Error('recordBAA: status must be one of ' + STATUSES.join(', '));
  }
}

function _rowToBAA(row) {
  return {
    id:                   row.id,
    counterpartyType:     row.counterparty_type,
    orgId:                row.org_id || null,
    partyName:            row.party_name,
    partyIdentifier:      row.party_identifier || null,
    executedAt:           row.executed_at || null,
    effectiveAt:          row.effective_at || null,
    expiresAt:            row.expires_at || null,
    scope:                row.scope,
    scopeNotes:           row.scope_notes || null,
    executedDocumentUrl:  row.executed_document_url || null,
    executedDocumentHash: row.executed_document_hash || null,
    status:               row.status,
    notes:                row.notes || null,
    recordedBy:           row.recorded_by || null,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  };
}

async function recordBAA(input) {
  _validate(input);
  await ensureSchema();
  const now = new Date().toISOString();
  if (db.isConnected()) {
    const res = await db.query(
      `INSERT INTO business_associate_agreements
        (counterparty_type, org_id, party_name, party_identifier,
         executed_at, effective_at, expires_at,
         scope, scope_notes, executed_document_url, executed_document_hash,
         status, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        input.counterpartyType,
        input.orgId || null,
        input.partyName,
        input.partyIdentifier || null,
        input.executedAt   || null,
        input.effectiveAt  || null,
        input.expiresAt    || null,
        input.scope        || 'phi_handling',
        input.scopeNotes   || null,
        input.executedDocumentUrl  || null,
        input.executedDocumentHash || null,
        input.status       || 'active',
        input.notes        || null,
        input.recordedBy   || null,
      ]
    );
    return _rowToBAA(res.rows[0]);
  }
  // in-memory fallback
  const id = require('crypto').randomUUID();
  const row = {
    id,
    counterparty_type:     input.counterpartyType,
    org_id:                input.orgId || null,
    party_name:            input.partyName,
    party_identifier:      input.partyIdentifier || null,
    executed_at:           input.executedAt   || null,
    effective_at:          input.effectiveAt  || null,
    expires_at:            input.expiresAt    || null,
    scope:                 input.scope        || 'phi_handling',
    scope_notes:           input.scopeNotes   || null,
    executed_document_url:  input.executedDocumentUrl  || null,
    executed_document_hash: input.executedDocumentHash || null,
    status:                input.status       || 'active',
    notes:                 input.notes        || null,
    recorded_by:           input.recordedBy   || null,
    created_at:            now,
    updated_at:            now,
  };
  _mem.set(id, row);
  return _rowToBAA(row);
}

async function updateBAA(id, patch) {
  if (!id) { throw new Error('updateBAA: id required'); }
  await ensureSchema();
  const fields = [];
  const values = [];
  const mapping = {
    partyName:            'party_name',
    partyIdentifier:      'party_identifier',
    executedAt:           'executed_at',
    effectiveAt:          'effective_at',
    expiresAt:            'expires_at',
    scope:                'scope',
    scopeNotes:           'scope_notes',
    executedDocumentUrl:  'executed_document_url',
    executedDocumentHash: 'executed_document_hash',
    status:               'status',
    notes:                'notes',
  };
  for (const k of Object.keys(patch || {})) {
    if (k in mapping) {
      if (k === 'status' && !STATUSES.includes(patch.status)) {
        throw new Error('updateBAA: invalid status');
      }
      fields.push(`${mapping[k]} = $${fields.length + 1}`);
      values.push(patch[k]);
    }
  }
  if (!fields.length) {
    const existing = await getBAA(id);
    return existing;
  }
  if (db.isConnected()) {
    values.push(id);
    const res = await db.query(
      `UPDATE business_associate_agreements
         SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    if (!res.rows.length) { return null; }
    return _rowToBAA(res.rows[0]);
  }
  const row = _mem.get(id);
  if (!row) { return null; }
  for (const k of Object.keys(patch || {})) {
    if (k in mapping) { row[mapping[k]] = patch[k]; }
  }
  row.updated_at = new Date().toISOString();
  _mem.set(id, row);
  return _rowToBAA(row);
}

async function revokeBAA(id, reason) {
  return updateBAA(id, {
    status: 'revoked',
    notes:  reason ? '[REVOKED] ' + reason : '[REVOKED]',
  });
}

async function getBAA(id) {
  if (!id) { return null; }
  if (db.isConnected()) {
    const res = await db.query(
      `SELECT * FROM business_associate_agreements WHERE id = $1`,
      [id]
    );
    return res.rows.length ? _rowToBAA(res.rows[0]) : null;
  }
  const row = _mem.get(id);
  return row ? _rowToBAA(row) : null;
}

async function listBAAs(filters = {}) {
  await ensureSchema();
  const where = [];
  const params = [];
  if (filters.counterpartyType) {
    params.push(filters.counterpartyType);
    where.push(`counterparty_type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  if (filters.orgId) {
    params.push(filters.orgId);
    where.push(`org_id = $${params.length}`);
  }
  if (filters.partyIdentifier) {
    params.push(filters.partyIdentifier);
    where.push(`party_identifier = $${params.length}`);
  }

  if (db.isConnected()) {
    const sql =
      `SELECT * FROM business_associate_agreements` +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ` ORDER BY created_at DESC LIMIT 200`;
    const res = await db.query(sql, params);
    return res.rows.map(_rowToBAA);
  }
  const rows = Array.from(_mem.values()).filter((r) => {
    if (filters.counterpartyType && r.counterparty_type !== filters.counterpartyType) { return false; }
    if (filters.status           && r.status            !== filters.status)           { return false; }
    if (filters.orgId            && r.org_id            !== filters.orgId)            { return false; }
    if (filters.partyIdentifier  && r.party_identifier  !== filters.partyIdentifier)  { return false; }
    return true;
  });
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return rows.slice(0, 200).map(_rowToBAA);
}

// ── Customer-facing helpers (used by EHR/EDI status endpoints) ──────────────

/**
 * Returns the BAA gating posture for a customer org.
 *
 * Shape:
 *   {
 *     baaRequired: true,                                  // always - this is HIPAA
 *     baaOnFile:   boolean,                               // active BAA exists?
 *     status:      'active' | 'not_on_file' | 'expired' | 'revoked' | 'pending_signature',
 *     executedAt:  string|null,
 *     expiresAt:   string|null,
 *     scope:       string|null,
 *     message:     string,                                // human-readable for UI
 *     requestUrl:  string                                 // where to request a BAA
 *   }
 */
async function getOrgBAAStatus(orgId) {
  if (!orgId) {
    return {
      baaRequired: true,
      baaOnFile:   false,
      status:      'not_on_file',
      executedAt:  null,
      expiresAt:   null,
      scope:       null,
      message:     'A signed Business Associate Agreement is required before EHR or EDI integrations can be activated.',
      requestUrl:  '/admin/baas/request',
    };
  }
  await ensureSchema();
  const rows = await listBAAs({ counterpartyType: 'customer_org', orgId });
  const active = rows.find((b) => b.status === 'active');
  if (active) {
    return {
      baaRequired: true,
      baaOnFile:   true,
      status:      'active',
      executedAt:  active.executedAt,
      expiresAt:   active.expiresAt,
      scope:       active.scope,
      message:     'BAA on file. EHR + EDI integrations may be activated subject to vendor enrollment.',
      requestUrl:  '/admin/baas/request',
    };
  }
  const latest = rows[0];
  return {
    baaRequired: true,
    baaOnFile:   false,
    status:      latest ? latest.status : 'not_on_file',
    executedAt:  latest ? latest.executedAt : null,
    expiresAt:   latest ? latest.expiresAt  : null,
    scope:       latest ? latest.scope      : null,
    message:     'A signed Business Associate Agreement is required before EHR or EDI integrations can be activated.',
    requestUrl:  '/admin/baas/request',
  };
}

/**
 * Returns the BAA posture for a specific EHR vendor (epic/cerner/athena/veradigm)
 * or clearinghouse (office_ally, change_healthcare, etc.) at the Noesis ↔
 * vendor level (not customer-specific).
 */
async function getVendorBAAStatus(vendorId, counterpartyType = 'ehr_vendor') {
  if (!vendorId) {
    return { baaOnFile: false, status: 'not_on_file', message: 'vendorId required' };
  }
  await ensureSchema();
  const rows = await listBAAs({ counterpartyType, partyIdentifier: vendorId });
  const active = rows.find((b) => b.status === 'active');
  return {
    counterpartyType,
    vendorId,
    baaOnFile:  !!active,
    status:     active ? 'active' : (rows[0] ? rows[0].status : 'not_on_file'),
    executedAt: active ? active.executedAt : null,
    expiresAt:  active ? active.expiresAt  : null,
    message:    active
      ? 'BAA on file with vendor.'
      : 'No active BAA with this vendor. Production wiring requires execution before live PHI flows.',
  };
}

module.exports = {
  COUNTERPARTY_TYPES,
  STATUSES,
  ensureSchema,
  recordBAA,
  updateBAA,
  revokeBAA,
  getBAA,
  listBAAs,
  getOrgBAAStatus,
  getVendorBAAStatus,
};
