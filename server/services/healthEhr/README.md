# Health EHR / FHIR connector

Production-grade scaffolding for connecting Noesis to the three target EHRs
(Epic, athenahealth, Oracle Health / Cerner) via SMART App Launch v2 and
HL7 FHIR R4.

## Standards referenced

| Concern                    | Spec                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| Resource shapes            | HL7 FHIR R4: https://hl7.org/fhir/R4/                               |
| Profiles                   | US Core 5.0: https://hl7.org/fhir/us/core/                          |
| OAuth + PKCE               | SMART App Launch v2: https://hl7.org/fhir/smart-app-launch/STU2/    |
| PKCE                       | RFC 7636                                                            |
| Bulk system access         | SMART Backend Services (client_credentials)                         |

Vendor-specific implementation guides:

- Epic (FHIR R4): https://fhir.epic.com/Documentation
- athenahealth (FHIR R4): https://docs.athenahealth.com/api/fhir
- Oracle Health / Cerner Code Console: https://fhir.cerner.com/

## Module layout

```
healthEhr/
  vendorProfiles.js   - per-vendor SMART config + scopes (frozen, no I/O)
  smartAuth.js        - PKCE, authorize URL, token exchange, refresh
  fhirClient.js       - authenticated FHIR R4 client w/ pagination + 401 retry
  fhirResources.js    - normalize/build R4 Patient, Coverage, Encounter,
                         Observation, Claim
  connectionStore.js  - persist (org, vendor) connections; encrypt tokens
                         at rest using PHI_ENCRYPTION_KEY (AES-256-GCM)
  index.js            - public facade (used by routes/healthEhr.js)
  README.md           - this file
```

## Required environment variables

Per-vendor (vendor codes: `EPIC`, `ATHENA`, `CERNER`):

```
EHR_<VENDOR>_CLIENT_ID         SMART app client id
EHR_<VENDOR>_CLIENT_SECRET     confidential client secret (omit for public clients)
EHR_<VENDOR>_REDIRECT_URI      OAuth redirect URI registered in vendor portal
EHR_<VENDOR>_FHIR_BASE_URL     tenant FHIR R4 base (overrides sandbox default)
EHR_<VENDOR>_TENANT_ID         vendor-specific tenant id (Athena practice id, Cerner tenant)
```

Always required:

```
PHI_ENCRYPTION_KEY             32-byte hex key for AES-256-GCM (see utils/encryption.js)
```

## Synthetic data only

Tests and dev seed paths use synthetic patients. The unit tests under
`server/test/healthEhr.*.test.js` use clearly fake names (e.g. "Maria
Vasquez at 742 Evergreen Terrace") and fake SSN-shaped strings. For richer
synthetic patients use HL7 Synthea (https://github.com/synthetichealth/synthea).

Real PHI must never be committed to this repo.

## Production deployment checklist

This module ships only the technical implementation. Before connecting to
live patient data the following non-code work is required:

1. Execute a Business Associate Agreement (BAA) with each EHR vendor.
2. Complete vendor certification:
   - Epic App Orchard / Build Apps for Epic
   - athenahealth Marketplace / More Disruption Please
   - Oracle Health / Cerner Code Console
3. Provision per-tenant client ids and redirect URIs from each vendor portal.
4. Source `PHI_ENCRYPTION_KEY` from AWS Secrets Manager (or equivalent),
   never from a committed `.env` file. See `HIPAA-COMPLIANCE.md`.
5. Confirm the production audit-log retention policy meets HIPAA
   164.312(b) requirements.
