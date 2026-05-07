/**
 * Noesis.io Health  - EHR connection store
 * (c) 2026 Athena Core Technologies, Inc.
 *
 * Persistent, encrypted-at-rest store for EHR vendor connections.
 *
 * What is stored, per (org, vendor) pair:
 *   - vendor + tenant id + FHIR base URL
 *   - access_token + refresh_token (encrypted with PHI_ENCRYPTION_KEY)
 *   - token_expires_at, scopes
 *   - status: connected | refresh_failed | disconnected
 *   - last_synced_at, last_error
 *
 * The store falls back to an in-memory Map when DATABASE_URL is not set so
 * tests and local dev still work without Postgres. Production callers MUST
 * have a real DB; the in-memory store is intentionally process-local and
 * not persistence-safe.
 *
 * HIPAA notes:
 *   - access_token + refresh_token treated as PHI (give access to PHI ->
 *     same protection requirements as PHI itself; encrypted with the
 *     existing PHI_ENCRYPTION_KEY pattern)
 *   - Audit-log writes are emitted via the standard logEvent() audit utility
 *     (see server/utils/audit.js). Errors here are non-fatal because losing
 *     the audit append must never block the OAuth flow itself; the audit
 *     middleware also captures the HTTP-level event.
 */

'use strict';

const crypto = require('crypto');

const db = require('../../db');
const { encryptPHI, decryptPHI } = require('../../utils/encryption');

const _memStore = new Map(); // key: org_id + ':' + vendor

function _key(orgId, vendorId) {
  return String(orgId) + ':' + String(vendorId).toLowerCase();
}

/**
 * Append an EHR domain event to the audit_logs table. The audit_logs schema
 * is HTTP-shaped (method/path/status); we encode the domain event by setting
 * action = the domain action and using path = "service:" + vendor identifier.
 * This keeps the existing audit query tooling working without a separate
 * domain-events table.
 */
async function _writeAudit({ action, orgId, vendor, statusCode, error }) {
  if (!db.isConnected()) { return; }
  try {
    await db.query(
      `INSERT INTO audit_logs
         (timestamp, user_id, user_role, action, method, path, status_code,
          ip_address, user_agent, organization_id)
       VALUES (NOW(), $1, $2, $3, $4, $5, $6, 'system', 'noesis-health-ehr', $7)`,
      [
        'system',
        'system',
        action,
        'INTERNAL',
        'ehr:' + (vendor || 'unknown') + (error ? ':error' : ''),
        statusCode || 200,
        orgId || null,
      ]
    );
  } catch (_err) {
    process.stderr.write('[ehr.audit] write failed: ' + _err.message + '\n');
  }
}

/**
 * Idempotent migration. Creates the ehr_connections table if missing.
 * Safe to call from server boot or per-request first use.
 *
 * @returns {Promise<void>}
 */
async function ensureSchema() {
  if (!db.isConnected()) { return; }
  await db.query(`
    CREATE TABLE IF NOT EXISTS ehr_connections (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id             UUID NOT NULL,
      vendor             TEXT NOT NULL,
      tenant_id          TEXT,
      fhir_base_url      TEXT NOT NULL,
      client_id          TEXT NOT NULL,
      access_token_enc   TEXT,
      refresh_token_enc  TEXT,
      token_type         TEXT,
      scope              TEXT,
      patient_fhir_id    TEXT,
      token_expires_at   TIMESTAMPTZ,
      status             TEXT NOT NULL DEFAULT 'connected',
      last_synced_at     TIMESTAMPTZ,
      last_error         TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(org_id, vendor)
    )
  `).catch(() => {});
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_ehr_connections_org_vendor
     ON ehr_connections(org_id, vendor)`
  ).catch(() => {});
  await db.query(`
    CREATE TABLE IF NOT EXISTS ehr_oauth_states (
      state              TEXT PRIMARY KEY,
      org_id             UUID NOT NULL,
      vendor             TEXT NOT NULL,
      code_verifier_enc  TEXT NOT NULL,
      tenant_id          TEXT,
      fhir_base_url      TEXT,
      redirect_uri       TEXT NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at        TIMESTAMPTZ
    )
  `).catch(() => {});
}

/**
 * Persist an OAuth state + PKCE verifier so the redirect callback can
 * complete the SMART exchange.
 *
 * @param {object} input - { state, orgId, vendor, codeVerifier, tenantId, fhirBaseUrl, redirectUri }
 * @returns {Promise<void>}
 */
async function saveOAuthState(input) {
  if (!input || !input.state || !input.orgId || !input.vendor || !input.codeVerifier) {
    throw new Error('saveOAuthState: state, orgId, vendor, codeVerifier required');
  }
  const enc = encryptPHI(input.codeVerifier);
  if (db.isConnected()) {
    await db.query(
      `INSERT INTO ehr_oauth_states
        (state, org_id, vendor, code_verifier_enc, tenant_id, fhir_base_url, redirect_uri)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [input.state, input.orgId, input.vendor.toLowerCase(), enc,
       input.tenantId || null, input.fhirBaseUrl || null, input.redirectUri]
    );
    return;
  }
  _memStore.set('state:' + input.state, {
    orgId:        input.orgId,
    vendor:       input.vendor.toLowerCase(),
    codeVerifier: input.codeVerifier,
    tenantId:     input.tenantId || null,
    fhirBaseUrl:  input.fhirBaseUrl || null,
    redirectUri:  input.redirectUri,
    createdAt:    new Date().toISOString(),
  });
}

/**
 * Consume (atomically delete) a saved OAuth state. Returns null if state is
 * unknown or already consumed.
 *
 * @param {string} state
 * @returns {Promise<object|null>}
 */
async function consumeOAuthState(state) {
  if (!state) { return null; }
  if (db.isConnected()) {
    const res = await db.query(
      `DELETE FROM ehr_oauth_states WHERE state = $1
       RETURNING org_id, vendor, code_verifier_enc, tenant_id, fhir_base_url, redirect_uri`,
      [state]
    );
    if (!res.rows.length) { return null; }
    const row = res.rows[0];
    return {
      orgId:        row.org_id,
      vendor:       row.vendor,
      codeVerifier: decryptPHI(row.code_verifier_enc),
      tenantId:     row.tenant_id,
      fhirBaseUrl:  row.fhir_base_url,
      redirectUri:  row.redirect_uri,
    };
  }
  const k = 'state:' + state;
  const v = _memStore.get(k);
  if (!v) { return null; }
  _memStore.delete(k);
  return v;
}

/**
 * Insert or update a connection record after a successful OAuth exchange.
 *
 * @param {object} input
 * @returns {Promise<object>} the persisted connection (encrypted form not returned)
 */
async function upsertConnection(input) {
  if (!input || !input.orgId || !input.vendor || !input.tokens || !input.tokens.accessToken) {
    throw new Error('upsertConnection: orgId, vendor, tokens.accessToken required');
  }
  const vendor = input.vendor.toLowerCase();
  const accessEnc  = encryptPHI(input.tokens.accessToken);
  const refreshEnc = input.tokens.refreshToken ? encryptPHI(input.tokens.refreshToken) : null;
  const expiresAt  = input.tokens.expiresAt
    ? new Date(input.tokens.expiresAt).toISOString()
    : new Date(Date.now() + (input.tokens.expiresInSec || 3600) * 1000).toISOString();

  const record = {
    id:              null,
    orgId:           input.orgId,
    vendor,
    tenantId:        input.tenantId || null,
    fhirBaseUrl:     input.fhirBaseUrl,
    clientId:        input.clientId || null,
    tokenType:       input.tokens.tokenType || 'Bearer',
    scope:           input.tokens.scope || null,
    patientFhirId:   input.tokens.patientFhirId || null,
    tokenExpiresAt:  expiresAt,
    status:          'connected',
    lastSyncedAt:    null,
    lastError:       null,
  };

  if (db.isConnected()) {
    const res = await db.query(
      `INSERT INTO ehr_connections
         (org_id, vendor, tenant_id, fhir_base_url, client_id,
          access_token_enc, refresh_token_enc, token_type, scope, patient_fhir_id,
          token_expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'connected')
       ON CONFLICT (org_id, vendor) DO UPDATE SET
         tenant_id         = EXCLUDED.tenant_id,
         fhir_base_url     = EXCLUDED.fhir_base_url,
         client_id         = EXCLUDED.client_id,
         access_token_enc  = EXCLUDED.access_token_enc,
         refresh_token_enc = EXCLUDED.refresh_token_enc,
         token_type        = EXCLUDED.token_type,
         scope             = EXCLUDED.scope,
         patient_fhir_id   = EXCLUDED.patient_fhir_id,
         token_expires_at  = EXCLUDED.token_expires_at,
         status            = 'connected',
         last_error        = NULL,
         updated_at        = NOW()
       RETURNING id`,
      [record.orgId, vendor, record.tenantId, record.fhirBaseUrl, record.clientId,
       accessEnc, refreshEnc, record.tokenType, record.scope, record.patientFhirId,
       record.tokenExpiresAt]
    );
    record.id = res.rows[0].id;
  } else {
    record.id = crypto.randomUUID();
    _memStore.set(_key(record.orgId, vendor), {
      ...record,
      _accessTokenEnc:  accessEnc,
      _refreshTokenEnc: refreshEnc,
    });
  }

  await _writeAudit({
    action: 'EHR_CONNECTION_UPSERT',
    orgId:  record.orgId,
    vendor,
  });

  return record;
}

/**
 * Load the persisted connection (decrypts tokens for use, never returns
 * ciphertext to the caller).
 *
 * @param {string} orgId
 * @param {string} vendor
 * @returns {Promise<object|null>}
 */
async function getConnection(orgId, vendor) {
  if (!orgId || !vendor) { return null; }
  const v = vendor.toLowerCase();
  if (db.isConnected()) {
    const res = await db.query(
      `SELECT id, org_id, vendor, tenant_id, fhir_base_url, client_id,
              access_token_enc, refresh_token_enc, token_type, scope, patient_fhir_id,
              token_expires_at, status, last_synced_at, last_error,
              created_at, updated_at
         FROM ehr_connections
        WHERE org_id = $1 AND vendor = $2
        LIMIT 1`,
      [orgId, v]
    );
    if (!res.rows.length) { return null; }
    const row = res.rows[0];
    return _hydrateRow(row);
  }
  const m = _memStore.get(_key(orgId, v));
  if (!m) { return null; }
  return _hydrateMem(m);
}

function _hydrateRow(row) {
  return {
    id:             row.id,
    orgId:          row.org_id,
    vendor:         row.vendor,
    tenantId:       row.tenant_id,
    fhirBaseUrl:    row.fhir_base_url,
    clientId:       row.client_id,
    accessToken:    row.access_token_enc  ? decryptPHI(row.access_token_enc)  : null,
    refreshToken:   row.refresh_token_enc ? decryptPHI(row.refresh_token_enc) : null,
    tokenType:      row.token_type,
    scope:          row.scope,
    patientFhirId:  row.patient_fhir_id,
    tokenExpiresAt: row.token_expires_at,
    status:         row.status,
    lastSyncedAt:   row.last_synced_at,
    lastError:      row.last_error,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

function _hydrateMem(m) {
  return {
    id:             m.id,
    orgId:          m.orgId,
    vendor:         m.vendor,
    tenantId:       m.tenantId,
    fhirBaseUrl:    m.fhirBaseUrl,
    clientId:       m.clientId,
    accessToken:    m._accessTokenEnc  ? decryptPHI(m._accessTokenEnc)  : null,
    refreshToken:   m._refreshTokenEnc ? decryptPHI(m._refreshTokenEnc) : null,
    tokenType:      m.tokenType,
    scope:          m.scope,
    patientFhirId:  m.patientFhirId,
    tokenExpiresAt: m.tokenExpiresAt,
    status:         m.status,
    lastSyncedAt:   m.lastSyncedAt,
    lastError:      m.lastError,
  };
}

/**
 * Update only the access/refresh tokens (called after a transparent refresh).
 *
 * @param {object} input - { orgId, vendor, accessToken, refreshToken, expiresAt, scope, tokenType }
 */
async function updateTokens(input) {
  if (!input || !input.orgId || !input.vendor || !input.accessToken) {
    throw new Error('updateTokens: orgId, vendor, accessToken required');
  }
  const accessEnc  = encryptPHI(input.accessToken);
  const refreshEnc = input.refreshToken ? encryptPHI(input.refreshToken) : null;
  const expiresAt  = input.expiresAt
    ? new Date(input.expiresAt).toISOString()
    : new Date(Date.now() + (input.expiresInSec || 3600) * 1000).toISOString();

  if (db.isConnected()) {
    await db.query(
      `UPDATE ehr_connections SET
         access_token_enc  = $1,
         refresh_token_enc = COALESCE($2, refresh_token_enc),
         token_expires_at  = $3,
         scope             = COALESCE($4, scope),
         token_type        = COALESCE($5, token_type),
         status            = 'connected',
         last_error        = NULL,
         updated_at        = NOW()
       WHERE org_id = $6 AND vendor = $7`,
      [accessEnc, refreshEnc, expiresAt, input.scope || null, input.tokenType || null,
       input.orgId, input.vendor.toLowerCase()]
    );
  } else {
    const m = _memStore.get(_key(input.orgId, input.vendor.toLowerCase()));
    if (m) {
      m._accessTokenEnc  = accessEnc;
      if (refreshEnc) { m._refreshTokenEnc = refreshEnc; }
      m.tokenExpiresAt = expiresAt;
      m.status = 'connected';
      m.lastError = null;
    }
  }

  await _writeAudit({
    action: 'EHR_TOKEN_REFRESH',
    orgId:  input.orgId,
    vendor: input.vendor,
  });
}

/**
 * Mark a connection as failed (refresh expired, vendor disconnected, etc.).
 */
async function markFailed(orgId, vendor, error) {
  if (db.isConnected()) {
    await db.query(
      `UPDATE ehr_connections SET status = 'refresh_failed', last_error = $1, updated_at = NOW()
        WHERE org_id = $2 AND vendor = $3`,
      [String(error || 'unknown').slice(0, 500), orgId, vendor.toLowerCase()]
    );
  } else {
    const m = _memStore.get(_key(orgId, vendor.toLowerCase()));
    if (m) { m.status = 'refresh_failed'; m.lastError = String(error || ''); }
  }
  await _writeAudit({
    action: 'EHR_REFRESH_FAILED',
    orgId,
    vendor,
    statusCode: 401,
    error: String(error || ''),
  });
}

/**
 * Disconnect (soft delete by status; we keep the row for audit).
 */
async function disconnect(orgId, vendor) {
  if (db.isConnected()) {
    await db.query(
      `UPDATE ehr_connections SET status = 'disconnected',
              access_token_enc = NULL, refresh_token_enc = NULL, updated_at = NOW()
        WHERE org_id = $1 AND vendor = $2`,
      [orgId, vendor.toLowerCase()]
    );
  } else {
    const m = _memStore.get(_key(orgId, vendor.toLowerCase()));
    if (m) {
      m.status = 'disconnected';
      m._accessTokenEnc = null;
      m._refreshTokenEnc = null;
    }
  }
  await _writeAudit({
    action: 'EHR_DISCONNECT',
    orgId,
    vendor,
  });
}

/**
 * Mark a connection as having just synced.
 */
async function markSynced(orgId, vendor) {
  if (db.isConnected()) {
    await db.query(
      `UPDATE ehr_connections SET last_synced_at = NOW(), updated_at = NOW()
        WHERE org_id = $1 AND vendor = $2`,
      [orgId, vendor.toLowerCase()]
    );
  } else {
    const m = _memStore.get(_key(orgId, vendor.toLowerCase()));
    if (m) { m.lastSyncedAt = new Date().toISOString(); }
  }
}

/**
 * List all connections for an organization (no PHI returned).
 */
async function listConnections(orgId) {
  if (!orgId) { return []; }
  if (db.isConnected()) {
    const res = await db.query(
      `SELECT id, vendor, tenant_id, fhir_base_url, scope, status,
              token_expires_at, last_synced_at, last_error, created_at, updated_at
         FROM ehr_connections WHERE org_id = $1 ORDER BY vendor`,
      [orgId]
    );
    return res.rows.map((r) => ({
      id:             r.id,
      vendor:         r.vendor,
      tenantId:       r.tenant_id,
      fhirBaseUrl:    r.fhir_base_url,
      scope:          r.scope,
      status:         r.status,
      tokenExpiresAt: r.token_expires_at,
      lastSyncedAt:   r.last_synced_at,
      lastError:      r.last_error,
      createdAt:      r.created_at,
      updatedAt:      r.updated_at,
    }));
  }
  const out = [];
  for (const [k, v] of _memStore.entries()) {
    if (typeof k !== 'string' || k.startsWith('state:')) { continue; }
    if (v.orgId !== orgId) { continue; }
    out.push({
      id:             v.id,
      vendor:         v.vendor,
      tenantId:       v.tenantId,
      fhirBaseUrl:    v.fhirBaseUrl,
      scope:          v.scope,
      status:         v.status,
      tokenExpiresAt: v.tokenExpiresAt,
      lastSyncedAt:   v.lastSyncedAt,
      lastError:      v.lastError,
    });
  }
  return out;
}

/**
 * Test-only reset of the in-memory store. Production callers must not invoke.
 */
function _resetForTests() {
  _memStore.clear();
}

module.exports = {
  ensureSchema,
  saveOAuthState,
  consumeOAuthState,
  upsertConnection,
  getConnection,
  updateTokens,
  markFailed,
  markSynced,
  disconnect,
  listConnections,
  _resetForTests,
};
