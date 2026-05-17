# EDI Integration Roadmap

_Status: 837P / 276-277 / 835 builders + parsers in place. 270/271 scaffold only. Production submission requires clearinghouse partnership + payer enrollment per partner. Last reviewed 2026-05-17._

## What ships today

| Transaction | Version | Builder | Parser | Maturity |
|---|---|---|---|---|
| 837P (Professional Claim) | 005010X222A1 | ✓ | ✓ | Technical |
| 276 (Claim Status Inquiry) | 005010X212 | ✓ | n/a | Technical |
| 277 (Claim Status Response) | 005010X212 | n/a | ✓ | Technical |
| 835 (Payment / Remittance) | 005010X221A1 | n/a | ✓ | Technical |
| 270 (Eligibility Inquiry) | 005010X279A1 | **stub** | n/a | Scaffold |
| 271 (Eligibility Response) | 005010X279A1 | n/a | **stub** | Scaffold |

Code paths:

- X12 envelope primitives: `server/services/healthEdi/x12Envelope.js`
- 837P: `server/services/healthEdi/edi837p.js`
- 276/277: `server/services/healthEdi/edi276277.js`
- 835: `server/services/healthEdi/edi835.js`
- 270/271 (scaffold): `server/services/healthEdi/edi270271.js`
- Trading-partner registry: `server/services/healthEdi/tradingPartner.js` (migration `005_health_edi_partners_submissions.sql`)
- HTTP surface: `server/routes/healthEdi.js` (mounted at `/api/v1/health/edi`)

The X12 modules emit ASC X12N 005010-conformant envelopes in isolation. They have **not** been certified with any clearinghouse or payer and **must not be used to submit live claims** until each checklist below is complete.

## Production submission requirements

EDI submission is a parallel partnership + enrollment track that the code alone cannot satisfy. There are two paths:

### Path A — Clearinghouse (recommended for v1)

Submit through a CAQH-certified clearinghouse that fans out to every payer. Sequence per clearinghouse:

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | Sign up + sandbox credentials | partnership | Office Ally, Change Healthcare (now Optum), Availity, Waystar |
| 2 | BAA executed with clearinghouse | legal | Required before live PHI flows |
| 3 | EDI registration packet (envelope IDs, ISA/GS) | partnership | Sender/receiver qualifiers |
| 4 | Test transactions (837P submit + 277 receive) | engineering | Clearinghouse conformance tests |
| 5 | Production credentials issued | partnership | |
| 6 | Per-payer enrollment matrix | partnership | Some payers require separate enrollment even via a clearinghouse |
| 7 | 835 (ERA) enrollment per payer | provider ops | ERA EFT/EDI enrollment is per-tax-ID |

Typical timeline per clearinghouse: **3–6 months** including BAA + payer enrollment matrix.

### Path B — Direct payer EDI (for high-volume payers)

Bypass the clearinghouse for one or two strategic payers (typically Medicare, large state Medicaids).

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | Payer EDI enrollment | partnership | EDI enrollment forms vary per payer |
| 2 | Trading-partner agreement | legal | |
| 3 | Transport (AS2, SFTP, payer REST) | engineering | Most direct EDI is SFTP or AS2 |
| 4 | Conformance / TA1 + 999 + 277CA acks | engineering | All three ack types must be wired |
| 5 | 270/271 eligibility (separate enrollment) | partnership | Medicare 270/271 is a separate gateway |
| 6 | Production cutover | partnership | |

Typical timeline per direct payer: **6–12 months**.

## Cross-cutting requirements

1. **BAA registry** - Every clearinghouse and direct-payer trading partner BAA must be recorded in `business_associate_agreements` (migration 006). Customer-facing UI surfaces `baa.baaOnFile` from `/api/v1/health/edi/status` and blocks 837P submission until `active`.
2. **PHI encryption at rest** - `PHI_ENCRYPTION_KEY` is required for `tradingPartner` to persist API secrets / SFTP passwords. Without it, the server logs a startup warning.
3. **Audit logging** - `audit_logs.action` includes `TRADING_PARTNER_*` and `EDI_SUBMIT_*` events. HIPAA §164.312(b) requires this; verify the middleware is in front of every 837P submit path.
4. **Re-association** - 837P submissions must be persisted with ISA/GS/ST control numbers (already done in `edi_claim_submissions`) so that downstream 277/835 acks can be matched back. Do not delete submission rows after status finalizes; this is the audit trail.
5. **Test partners** - Office Ally publishes a public test endpoint that accepts 837P and returns canned 277 responses. Use it for CI / staging conformance tests; do not point at it for production traffic.

## 270/271 work plan (when prioritized)

The 270/271 stub (`edi270271.js`) is intentionally throw-on-call so that callers fail fast. The path to production:

1. Implement `build270` mirroring the existing 276 builder (HL hierarchies + NM1/DMG/INS/EQ segments).
2. Implement `parse271` returning normalized `{ coverage, benefits[] }` keyed by service type (EB qualifiers).
3. Wire HTTP endpoints `POST /api/v1/health/edi/270` and `POST /api/v1/health/edi/271/parse` mirroring the 276/277 pair.
4. Per-payer enrollment for real-time eligibility (separate from claim EDI enrollment).
5. Until step 4 lands, the existing REST eligibility path (`server/services/payerEligibility.js`) continues to be the production path.

Estimated effort: **2–4 weeks engineering** + payer enrollment time.

## Estimated end-to-end timeline

- 837P sandbox submission via Office Ally test endpoint: ~1 week from when partnership credentials land.
- Clearinghouse production + first payer ERA: **3–6 months**.
- Direct payer EDI (Medicare or state Medicaid): **6–12 months**.
- Native 270/271 production: **2–4 months** including payer enrollment.

## Where this fits

EDI submission is **not** on the critical path for the App Store / pitch deck cycle. The 837P / 276-277 / 835 surface is investor-visible (it demonstrates that the X12 plumbing exists and is structurally correct) while production submission is gated on partnership work. Until then, the existing REST clearinghouse integration (`server/services/clearinghouse.js`) handles the customer-visible submission path.
