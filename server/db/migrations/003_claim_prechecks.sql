-- Noesis.io Health - Migration 003: Claim Pre-Check Results Table
-- © 2026 Athena Core Technologies, Inc.
--
-- Stores results of the denial prevention pre-check engine.
-- HIPAA Note: NO PHI is stored in this table.
--   - No patient name, DOB, or SSN
--   - No member ID
--   - Only codes, scores, and flags
--
-- Run: psql $DATABASE_URL -f 003_claim_prechecks.sql

CREATE TABLE IF NOT EXISTS claim_prechecks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL,                         -- Organization that ran the check
  provider_id           UUID NOT NULL,                         -- User who ran the check
  cpt_codes             JSONB NOT NULL DEFAULT '[]',           -- Array of CPT codes checked
  icd10_codes           JSONB NOT NULL DEFAULT '[]',           -- Array of ICD-10 codes checked
  payer_name            VARCHAR(200) NOT NULL,                 -- Payer name (free text)
  risk_score            SMALLINT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level            VARCHAR(10) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  flags_count           SMALLINT NOT NULL DEFAULT 0,           -- Total number of flags raised
  critical_flags        SMALLINT NOT NULL DEFAULT 0,           -- Number of critical flags
  claim_id              UUID,                                  -- Optional: associated claim if linked
  auth_number_provided  BOOLEAN NOT NULL DEFAULT FALSE,        -- Whether a PA number was supplied
  eligibility_verified  BOOLEAN NOT NULL DEFAULT FALSE,        -- Whether eligibility was verified
  date_of_service       DATE,                                  -- Date of service being checked
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_claim_prechecks_org     ON claim_prechecks (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_prechecks_claim   ON claim_prechecks (claim_id) WHERE claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claim_prechecks_risk    ON claim_prechecks (risk_level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_prechecks_score   ON claim_prechecks (risk_score, created_at DESC);

-- Comments for documentation
COMMENT ON TABLE claim_prechecks IS 'Stores denial prevention pre-check results. No PHI stored per HIPAA minimum necessary standard.';
COMMENT ON COLUMN claim_prechecks.risk_score IS '0-100. Higher = lower denial risk. 85+ = low, 65-84 = medium, 0-64 = high.';
COMMENT ON COLUMN claim_prechecks.cpt_codes IS 'JSON array of procedure codes analyzed. Example: ["99214", "93000"]';
COMMENT ON COLUMN claim_prechecks.icd10_codes IS 'JSON array of diagnosis codes analyzed. Example: ["I10", "E11.9"]';
