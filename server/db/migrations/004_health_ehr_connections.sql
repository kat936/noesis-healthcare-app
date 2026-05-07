-- Noesis.io Health - Migration 004: EHR Connections + OAuth State
-- (c) 2026 Athena Core Technologies, Inc.
--
-- Persistent store for SMART-on-FHIR vendor connections (Epic, Athena, Cerner)
-- and the transient PKCE state needed to complete the OAuth callback.
--
-- HIPAA notes:
--   - access_token_enc + refresh_token_enc + code_verifier_enc are encrypted
--     at rest using the PHI_ENCRYPTION_KEY (AES-256-GCM, see
--     server/utils/encryption.js).
--   - Each row is org-scoped; cross-org reads are blocked at the service
--     layer (server/services/healthEhr/connectionStore.js).
--   - Domain audit events are written to audit_logs from the service layer.
--
-- Run: psql $DATABASE_URL -f 004_health_ehr_connections.sql

CREATE TABLE IF NOT EXISTS ehr_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL,
  vendor             TEXT NOT NULL,                            -- 'epic' | 'athena' | 'cerner'
  tenant_id          TEXT,                                     -- vendor-specific tenant id
  fhir_base_url      TEXT NOT NULL,                            -- tenant FHIR R4 base
  client_id          TEXT NOT NULL,                            -- SMART app client id (not secret)
  access_token_enc   TEXT,                                     -- encrypted access_token
  refresh_token_enc  TEXT,                                     -- encrypted refresh_token
  token_type         TEXT,                                     -- usually 'Bearer'
  scope              TEXT,                                     -- granted scopes
  patient_fhir_id    TEXT,                                     -- SMART patient context, when present
  token_expires_at   TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'connected'
                     CHECK (status IN ('connected', 'refresh_failed', 'disconnected')),
  last_synced_at     TIMESTAMPTZ,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, vendor)
);

CREATE INDEX IF NOT EXISTS idx_ehr_connections_org_vendor
  ON ehr_connections(org_id, vendor);

CREATE INDEX IF NOT EXISTS idx_ehr_connections_status
  ON ehr_connections(status);

-- Transient OAuth state. Rows survive only the few minutes between the
-- authorize redirect and the callback; consumed atomically (DELETE
-- ... RETURNING) to prevent replay.
CREATE TABLE IF NOT EXISTS ehr_oauth_states (
  state              TEXT PRIMARY KEY,
  org_id             UUID NOT NULL,
  vendor             TEXT NOT NULL,
  code_verifier_enc  TEXT NOT NULL,                            -- encrypted PKCE verifier
  tenant_id          TEXT,
  fhir_base_url      TEXT,
  redirect_uri       TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at        TIMESTAMPTZ
);

-- Best-effort cleanup: drop OAuth state rows older than 30 minutes.
-- A scheduled job in production should call this; for now the index keeps
-- ad-hoc queries fast.
CREATE INDEX IF NOT EXISTS idx_ehr_oauth_states_created_at
  ON ehr_oauth_states(created_at);
