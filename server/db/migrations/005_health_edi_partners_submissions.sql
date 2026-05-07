-- Noesis.io Health - Migration 005: EDI Trading Partners + Claim Submissions
-- (c) 2026 Athena Core Technologies, Inc.
--
-- Persistent storage for X12 EDI infrastructure:
--   - edi_trading_partners:  one row per (org, partner_code). Holds EDI
--                            envelope identifiers, supported transaction sets,
--                            and (encrypted) credentials.
--   - edi_claim_submissions: ledger of every 837P built/submitted, used for
--                            re-association with downstream 277 / 835.
--
-- HIPAA notes:
--   - api_secret_enc + sftp_password_enc are AES-256-GCM encrypted with
--     PHI_ENCRYPTION_KEY (server/utils/encryption.js). Decryption never
--     leaves the service layer.
--   - Submission rows do NOT contain PHI: the X12 payload is not stored
--     here; only control numbers and the claim id (which is provider-side
--     and not on the HIPAA Safe Harbor identifier list).
--   - Audit events are written to audit_logs from the service layer
--     (action: TRADING_PARTNER_*).
--
-- Run: psql $DATABASE_URL -f 005_health_edi_partners_submissions.sql

CREATE TABLE IF NOT EXISTS edi_trading_partners (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL,
  partner_code       TEXT NOT NULL,                            -- short code e.g. 'OFFICEALLY', 'CHC', 'AVAILITY'
  partner_name       TEXT NOT NULL,                            -- human-readable name
  partner_type       TEXT NOT NULL DEFAULT 'clearinghouse'
                     CHECK (partner_type IN ('clearinghouse', 'payer_direct', 'state_medicaid', 'cms')),
  sender_id          TEXT NOT NULL,                            -- ISA06 (sender id)
  receiver_id        TEXT NOT NULL,                            -- ISA08 (receiver id)
  sender_qualifier   TEXT NOT NULL DEFAULT 'ZZ',
  receiver_qualifier TEXT NOT NULL DEFAULT 'ZZ',
  transport          TEXT NOT NULL DEFAULT 'rest'
                     CHECK (transport IN ('rest', 'sftp', 'as2', 'soap', 'manual')),
  endpoint_url       TEXT,
  api_key            TEXT,
  api_secret_enc     TEXT,                                     -- AES-256-GCM
  sftp_host          TEXT,
  sftp_user          TEXT,
  sftp_password_enc  TEXT,                                     -- AES-256-GCM
  supported_sets     TEXT[] NOT NULL DEFAULT '{}',             -- e.g. ARRAY['837P','276','835']
  usage_indicator    TEXT NOT NULL DEFAULT 'T'
                     CHECK (usage_indicator IN ('T', 'P')),    -- T test, P production
  status             TEXT NOT NULL DEFAULT 'enrolling'
                     CHECK (status IN ('enrolling', 'active', 'suspended', 'disabled')),
  enrollment_notes   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, partner_code)
);

CREATE INDEX IF NOT EXISTS idx_edi_trading_partners_org
  ON edi_trading_partners(org_id);

CREATE INDEX IF NOT EXISTS idx_edi_trading_partners_status
  ON edi_trading_partners(status);

CREATE TABLE IF NOT EXISTS edi_claim_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL,
  partner_id          UUID,                                    -- FK candidate (no enforced FK to allow soft deletes)
  claim_id            TEXT NOT NULL,                           -- provider-side claim id
  transaction_set     TEXT NOT NULL,                           -- '837P', '276', etc.
  version_id          TEXT NOT NULL,                           -- '005010X222A1', etc.
  isa_control         TEXT,
  gs_control          TEXT,
  st_control          TEXT,
  total_amount        NUMERIC(12, 2),
  status              TEXT NOT NULL DEFAULT 'submitted'
                     CHECK (status IN ('submitted', 'accepted', 'rejected', 'paid',
                                       'denied', 'partial_payment', 'reversal', 'pending')),
  tracking_id         TEXT,                                    -- usually ISA control number
  response_status     TEXT,
  response_message    TEXT,
  response_payload    JSONB,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edi_submissions_claim
  ON edi_claim_submissions(org_id, claim_id);

CREATE INDEX IF NOT EXISTS idx_edi_submissions_partner
  ON edi_claim_submissions(partner_id);

CREATE INDEX IF NOT EXISTS idx_edi_submissions_isa
  ON edi_claim_submissions(isa_control);
