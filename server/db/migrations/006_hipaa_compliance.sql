-- Noesis.io Health - Migration 006: HIPAA Compliance Surfaces
-- (c) 2026 Athena Core Technologies, Inc.
--
-- Persistent stores for the three HIPAA workflows surfaced in
-- server/routes/hipaaCompliance.js:
--
--   business_associates  - §164.308(b)(1) BAA tracking per vendor
--   phi_disclosures      - §164.528 accounting of non-TPO disclosures
--                          (six-year retention per §164.316(b)(2)(i))
--   phi_access_requests  - §164.524 right-of-access request lifecycle
--                          (30-day fulfillment SLA, one 30-day extension)
--
-- The route layer falls back to in-memory Maps when the DB is not
-- connected (dev / unit tests). In production these tables are the
-- system of record.
--
-- Run: psql $DATABASE_URL -f 006_hipaa_compliance.sql

-- ── §164.308(b)(1) BAA tracking ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_associates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor             TEXT NOT NULL,
  category           TEXT NOT NULL,                              -- 'cloud_infrastructure', 'edi_clearinghouse', etc.
  status             TEXT NOT NULL DEFAULT 'pending'             -- pending | signed | expired | terminated
                     CHECK (status IN ('pending', 'signed', 'expired', 'terminated')),
  signed_at          TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  document_reference TEXT,                                       -- pointer to BAA doc in DMS
  notes              TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID,
  updated_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_business_associates_vendor   ON business_associates (vendor);
CREATE INDEX IF NOT EXISTS idx_business_associates_status   ON business_associates (status);
CREATE INDEX IF NOT EXISTS idx_business_associates_expires  ON business_associates (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── §164.528 accounting of disclosures ─────────────────────────────────────
-- Patient identifier is stored; patient name / DOB are NOT stored here in
-- plaintext (those live encrypted in the claims / authorizations tables).
-- Retention: six years from disclosure date.
CREATE TABLE IF NOT EXISTS phi_disclosures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  patient_id      TEXT NOT NULL,
  disclosed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient       TEXT NOT NULL,
  recipient_type  TEXT NOT NULL                                  -- public_health_authority | court_order | ...
                  CHECK (recipient_type IN (
                    'public_health_authority', 'court_order', 'subpoena',
                    'law_enforcement', 'health_oversight', 'medical_examiner',
                    'organ_donation', 'research', 'workers_compensation',
                    'patient_directed', 'other_non_tpo'
                  )),
  description     TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  legal_basis     TEXT NOT NULL,
  recorded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phi_disclosures_patient_id ON phi_disclosures (patient_id);
CREATE INDEX IF NOT EXISTS idx_phi_disclosures_org_id    ON phi_disclosures (organization_id);
CREATE INDEX IF NOT EXISTS idx_phi_disclosures_disclosed_at ON phi_disclosures (disclosed_at);

-- ── §164.524 right of access ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS phi_access_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID,
  patient_id          TEXT NOT NULL,
  patient_email       TEXT NOT NULL,
  scope               TEXT NOT NULL,                             -- what the patient is requesting
  format              TEXT NOT NULL DEFAULT 'electronic'
                      CHECK (format IN ('electronic', 'paper', 'cd', 'other')),
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'extended', 'fulfilled', 'denied')),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at        TIMESTAMPTZ,
  fulfilled_by        UUID,
  document_reference  TEXT,                                      -- pointer to fulfillment artifact in DMS
  fulfillment_notes   TEXT,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phi_access_requests_patient_id ON phi_access_requests (patient_id);
CREATE INDEX IF NOT EXISTS idx_phi_access_requests_org_id     ON phi_access_requests (organization_id);
CREATE INDEX IF NOT EXISTS idx_phi_access_requests_status     ON phi_access_requests (status);
CREATE INDEX IF NOT EXISTS idx_phi_access_requests_requested  ON phi_access_requests (requested_at);
