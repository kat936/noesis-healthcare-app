-- Noesis.io Health - Migration 006: Business Associate Agreements (BAAs)
-- (c) 2026 Athena Core Technologies, Inc.
--
-- Tracks BAAs executed between Noesis.io Health (Athena Core Technologies)
-- and customer organizations, EHR vendors, clearinghouses, and payers.
-- Required by HIPAA 45 CFR 164.502(e) and 164.504(e) before any PHI flows
-- between covered entities and their business associates.
--
-- Scope:
--   - This table is the source of truth for "is org X cleared to activate
--     live EHR/EDI integration?" Used by the healthEhr and healthEdi status
--     endpoints to surface a "BAA required" notice to customers.
--   - One row per executed agreement. Counterparty type discriminates
--     between customer-facing BAAs (the org agreed to our BAA so we can
--     handle their PHI) and vendor-facing BAAs (we agreed to a vendor's
--     BAA so they can transmit PHI on our customers' behalf).
--
-- HIPAA notes:
--   - executed_document_url is a pointer to wherever the signed PDF lives
--     (DocuSign envelope, Drive, S3). Storing the PDF itself in Postgres
--     is intentionally out of scope here; documents are not PHI but should
--     be governed by the same retention controls.
--   - Audit events are written to audit_logs from server/services/baa.js
--     with actions BAA_RECORDED, BAA_UPDATED, BAA_REVOKED.
--
-- Run: psql $DATABASE_URL -f 006_business_associate_agreements.sql

CREATE TABLE IF NOT EXISTS business_associate_agreements (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Counterparty discriminator.
  --   'customer_org'  -> Noesis is the BA for the customer (covered entity).
  --                      org_id is the customer org id.
  --   'ehr_vendor'    -> Noesis ↔ Epic/Cerner/Athena/Veradigm. org_id NULL.
  --   'clearinghouse' -> Noesis ↔ Office Ally / Change Healthcare / Availity / etc.
  --   'payer'         -> Noesis ↔ direct payer EDI gateway.
  --   'subcontractor' -> Noesis ↔ any downstream subcontractor that touches PHI.
  counterparty_type        TEXT NOT NULL
                           CHECK (counterparty_type IN
                                  ('customer_org', 'ehr_vendor', 'clearinghouse',
                                   'payer', 'subcontractor')),

  org_id                   UUID,                                      -- nullable; only set for customer_org
  party_name               TEXT NOT NULL,                             -- e.g. "Epic Systems Corporation"
  party_identifier         TEXT,                                      -- e.g. EHR vendor id ('epic'), payer id

  executed_at              DATE,                                      -- date both parties signed
  effective_at             DATE,
  expires_at               DATE,                                      -- NULL for evergreen with no fixed term

  scope                    TEXT NOT NULL DEFAULT 'phi_handling',      -- short tag, e.g. 'phi_handling', 'edi_837p', 'fhir_r4'
  scope_notes              TEXT,                                      -- free-form description of what the BAA covers

  executed_document_url    TEXT,                                      -- pointer to signed PDF (DocuSign, S3, Drive)
  executed_document_hash   TEXT,                                      -- sha256 of the signed PDF (integrity check)

  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('draft', 'pending_signature',
                                             'active', 'expired', 'revoked')),

  notes                    TEXT,
  recorded_by              UUID,                                      -- user id of admin who recorded it
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer-org lookup: "does this org have an active BAA?" runs on every
-- EHR/EDI status check, so index the predicate path.
CREATE INDEX IF NOT EXISTS idx_baas_org_status
  ON business_associate_agreements(org_id, status)
  WHERE counterparty_type = 'customer_org';

-- Vendor lookup: "do we have an active BAA with vendor X?"
CREATE INDEX IF NOT EXISTS idx_baas_counterparty
  ON business_associate_agreements(counterparty_type, party_identifier, status);

-- Expiration scan: scheduled job will flag BAAs expiring within N days.
CREATE INDEX IF NOT EXISTS idx_baas_expires_at
  ON business_associate_agreements(expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;
