# EHR Integration Roadmap

_Status: Scaffold + technical OAuth/FHIR plumbing in place. Production wiring deferred per vendor — see checklist below. Last reviewed 2026-05-17._

## What ships today

| Vendor | Profile | OAuth + PKCE | FHIR R4 reads | Claim.write | Maturity |
|---|---|---|---|---|---|
| Epic Systems | `epic` | ✓ | ✓ | ✓ | Technical (uncertified) |
| athenahealth | `athena` | ✓ | ✓ | ✓ | Technical (uncertified) |
| Oracle Health (Cerner) | `cerner` | ✓ | ✓ | ✓ | Technical (uncertified) |
| Veradigm (Allscripts) | `veradigm` | scaffold | scaffold | scaffold | Scaffold |

Code paths:

- Vendor profiles: `server/services/healthEhr/vendorProfiles.js`
- SMART App Launch v2 (PKCE): `server/services/healthEhr/smartAuth.js`
- FHIR client + refresh: `server/services/healthEhr/fhirClient.js`
- Connection persistence (encrypted tokens): `server/services/healthEhr/connectionStore.js` (migration `004_health_ehr_connections.sql`)
- HTTP surface: `server/routes/healthEhr.js` (mounted at `/api/v1/health/ehr`)

The Noesis modules are SMART App Launch v2 + FHIR R4 compliant in isolation. They have not been certified by any vendor and **must not be pointed at live patient data** until each vendor checklist below is complete.

## Per-vendor production checklist

Each vendor requires its own parallel partnership track. Items marked `partnership` cannot be fabricated in code — they live in a vendor portal, contract, or marketplace listing.

### Epic Systems

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | App Orchard / "Build Apps for Epic" registration | partnership | https://fhir.epic.com/Developer/Apps |
| 2 | Tenant-specific FHIR base URL per customer org | customer ops | Epic "Hyperspace community" identifier |
| 3 | Production OAuth client id + JWKS | partnership | Generated in App Orchard |
| 4 | BAA executed with Epic | legal | Required before production data flows |
| 5 | App listing review (Epic Showroom) | partnership | 6–9 months typical |
| 6 | Customer go-live: Epic Hyperspace config | customer IT | Often gated on health system change control |

### athenahealth

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | More Disruption Please / Marketplace developer account | partnership | https://developer.athenahealth.com |
| 2 | Practice id per customer | customer ops | `X-Athena-Practice-Id` header is required |
| 3 | Marketplace listing approval | partnership | 3–6 months typical |
| 4 | BAA executed with athenahealth | legal | |
| 5 | Production OAuth client id + secret | partnership | |

### Oracle Health (Cerner)

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | Code Console developer account | partnership | https://code.cerner.com |
| 2 | Tenant guid per customer | customer ops | Cerner tenant id, in FHIR base path |
| 3 | SMART app listing / promotion to production | partnership | |
| 4 | BAA executed with Oracle Health | legal | |
| 5 | Production OAuth client id | partnership | |

### Veradigm (Allscripts)

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | Veradigm Developer Program enrollment | partnership | Currently scaffold-only |
| 2 | Sandbox + production FHIR R4 base URL per practice | customer ops | |
| 3 | OAuth registration | partnership | |
| 4 | BAA executed with Veradigm | legal | |
| 5 | Conformance + go-live | partnership | |

## Cross-cutting requirements (apply to every vendor)

1. **BAA registry** - Each vendor BAA must be recorded in `business_associate_agreements` (migration 006). Customer-facing UI surfaces `baa.baaOnFile` from `/api/v1/health/ehr/status` and blocks activation until `active`.
2. **Per-tenant configuration** - Environment variables per vendor:
   - `EHR_<VENDOR>_CLIENT_ID`
   - `EHR_<VENDOR>_CLIENT_SECRET` (when not a public client)
   - `EHR_<VENDOR>_REDIRECT_URI`
   - `EHR_<VENDOR>_FHIR_BASE_URL` (per-tenant override of vendor sandbox)
   - `EHR_<VENDOR>_TENANT_ID`
3. **PHI encryption at rest** - `PHI_ENCRYPTION_KEY` is required for `connectionStore` to persist access/refresh tokens. Without it, the server logs a startup warning and falls back to in-memory mode (not for production).
4. **FHIR conformance testing** - Each vendor publishes a CapabilityStatement at `<fhir-base>/metadata`. The Noesis FhirClient reads it on first use; integration tests should pin the resource types we depend on (Patient, Coverage, Encounter, Observation, Claim).
5. **Vendor certification track** - Epic App Orchard, athenahealth Marketplace, Oracle Code Console, and Veradigm Developer Program are each multi-month review processes. They run in parallel with code work.
6. **Customer go-live runbook** - For each customer: collect tenant id + FHIR base, set env vars, walk through the OAuth flow in sandbox, confirm token refresh, then flip to production credentials.

## Estimated timeline per vendor

- Sandbox-ready (technical only): _shipped_ for Epic / Athena / Cerner; ~1–2 weeks for Veradigm.
- Marketplace / partnership approval: **3–9 months** depending on vendor and listing scope.
- BAA execution: **2–8 weeks** legal review.
- First customer production go-live: **6–12 months** end-to-end including the above.

## Where this fits

The EHR integration surface is **not** on the critical path for the App Store / pitch deck cycle. It is groundwork so that when a customer or partner pulls us into a paid integration engagement, the structural plumbing (OAuth profiles, FHIR client, token storage, BAA gating) is already in place and the work narrows to vendor registration + customer-specific configuration.
