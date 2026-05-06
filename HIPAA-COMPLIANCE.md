# HIPAA Compliance Posture — Noesis.io Health

**Owner:** Athena Core Technologies, Inc.
**Status:** Pre-certification. Vanta automated controls audit in progress.
**Last reviewed:** 2026-04-29

---

## Scope

This document maps the Noesis.io Health platform's technical controls to the
HIPAA Security Rule (45 CFR §164.302–§164.318). It is the authoritative
mapping that the Vanta auditor reviews against the live codebase. Where a
control is met by code, the file path is referenced; where a control is met
by operational policy, the policy doc is referenced.

This document does **not** itself assert HIPAA certification. Certification
is rendered by the qualified third-party auditor (Vanta). HIPAA "compliance"
is also continuous, not a point-in-time achievement — see the operational
review cadence at the end.

---

## §164.308 — Administrative Safeguards

| HIPAA citation | Control | Implementation |
|----------------|---------|----------------|
| §164.308(a)(1)(i) | Security management process | `security/policies/security-management-policy.md` |
| §164.308(a)(1)(ii)(A) | Risk analysis | Vanta automated risk assessment + annual manual review |
| §164.308(a)(1)(ii)(B) | Risk management | `security/policies/risk-management-policy.md` |
| §164.308(a)(1)(ii)(C) | Sanction policy | `security/policies/acceptable-use-policy.md` |
| §164.308(a)(1)(ii)(D) | Information system activity review | `server/middleware/auditLog.js` + Vanta log monitoring |
| §164.308(a)(2) | Assigned security responsibility | `security/policies/security-officer.md` (Security Officer designated) |
| §164.308(a)(3) | Workforce security | `security/policies/access-control-policy.md` |
| §164.308(a)(3)(ii)(A) | Authorization / supervision | RBAC enforced server-side: `server/config/roles.js`, `server/middleware/auth.js` |
| §164.308(a)(3)(ii)(B) | Workforce clearance | Background checks per `security/policies/onboarding-policy.md` |
| §164.308(a)(3)(ii)(C) | Termination procedures | `security/policies/offboarding-policy.md` |
| §164.308(a)(4) | Information access management | RBAC + plan-gating: `server/middleware/auth.js` |
| §164.308(a)(5) | Security awareness & training | Annual training tracked in Vanta |
| §164.308(a)(6) | Security incident procedures | `security/policies/incident-response-policy.md` |
| §164.308(a)(7) | Contingency plan | `security/policies/business-continuity-policy.md` |
| §164.308(a)(7)(ii)(A) | Data backup plan | Postgres point-in-time recovery + S3 backups (configured per environment) |
| §164.308(a)(7)(ii)(B) | Disaster recovery plan | `security/policies/disaster-recovery-policy.md` |
| §164.308(a)(7)(ii)(C) | Emergency-mode operation | `security/policies/business-continuity-policy.md` §4 |
| §164.308(a)(8) | Evaluation | Annual Vanta-driven control review |
| §164.308(b)(1) | Business associate contracts | `security/policies/baa-policy.md` + executed BAAs with subprocessors |

---

## §164.310 — Physical Safeguards

| HIPAA citation | Control | Implementation |
|----------------|---------|----------------|
| §164.310(a)(1) | Facility access controls | Cloud-hosted only; no on-prem PHI. AWS / hosting provider attests under their BAA. |
| §164.310(a)(2)(ii) | Facility security plan | Inherited from hosting provider's SOC 2 / HITRUST. |
| §164.310(b) | Workstation use | `security/policies/workstation-policy.md` |
| §164.310(c) | Workstation security | Disk encryption, screen lock, MDM. `security/policies/endpoint-policy.md` |
| §164.310(d)(1) | Device & media controls | `security/policies/media-disposal-policy.md` |
| §164.310(d)(2)(i) | Disposal | Cryptographic erasure on cloud volumes. |
| §164.310(d)(2)(ii) | Media re-use | Same as disposal. |
| §164.310(d)(2)(iii) | Accountability | Asset inventory in Vanta. |
| §164.310(d)(2)(iv) | Data backup & storage | Encrypted snapshots; same key custody as primary. |

---

## §164.312 — Technical Safeguards (the big one for code)

| HIPAA citation | Control | Implementation |
|----------------|---------|----------------|
| §164.312(a)(1) | Access control | JWT + RBAC: `server/middleware/auth.js` (lines covering `authenticate`, `requireRole`, `requirePlan`) |
| §164.312(a)(2)(i) | Unique user identification | UUID per user; never recycled. `server/db/migrations/`. |
| §164.312(a)(2)(ii) | Emergency access | Break-glass admin role with elevated audit logging (`super_admin` in `server/config/roles.js`); use is alerted on. |
| §164.312(a)(2)(iii) | Automatic logoff | Session timeout enforced inside `authenticate()`; configurable via `SESSION_TIMEOUT_MS`. See `server/middleware/auth.js` and `server/middleware/sessionTimeout.js`. |
| §164.312(a)(2)(iv) | Encryption at rest | AES-256-GCM per `server/utils/encryption.js`. PHI fields enumerated in `CLAIM_PHI_FIELDS` and `USER_PHI_FIELDS`. Key fingerprint logged with each ciphertext for rotation traceability. **Production key custody:** `PHI_ENCRYPTION_KEY` MUST be provisioned from AWS Secrets Manager (or an equivalent FIPS 140-2 validated secrets store) — never committed to `.env` or container images. Set `AWS_SECRETS_MANAGER_KEY_ARN` in the deploy environment so the boot-time check in `server/utils/encryption.js#getKey` does not log a custody warning. Local dev may use the `.env` fallback only. |
| §164.312(b) | Audit controls | `server/middleware/auditLog.js` writes every API request to in-memory + Postgres, with PHI-safe path sanitization. Engines emit canonical `auditTrail` blocks: `server/utils/audit.js`. |
| §164.312(c)(1) | Integrity | TLS in transit, AES-GCM auth tag at rest, deterministic engines with `inputsFingerprint` (replay-verifiable). |
| §164.312(c)(2) | Authenticate ePHI integrity | GCM auth tag rejects any tampering on decrypt. Engine outputs include `inputsFingerprint` to detect input-stream tampering. |
| §164.312(d) | Person or entity authentication | bcrypt password hashing (`bcryptjs`), JWT issuance with HS256/RS256, MFA hooks ready in `roles.js`. |
| §164.312(e)(1) | Transmission security | HTTPS only in production (HSTS via Helmet, `server/index.js`). CORS origin allowlist. |
| §164.312(e)(2)(i) | Integrity controls in transmission | TLS 1.2+ required; HSTS preload. |
| §164.312(e)(2)(ii) | Encryption in transit | TLS 1.2+ enforced; capacitor / iOS WebView ATS enforced (`ios/App/App/Info.plist`). |

---

## §164.314 — Organizational Requirements

| HIPAA citation | Control | Implementation |
|----------------|---------|----------------|
| §164.314(a) | BA contracts | BAA with every subprocessor that touches PHI. See `security/policies/baa-policy.md` for the master list (AWS, Postgres host, Redis host, Stripe — Stripe does not receive PHI; only billing email + plan tier). |
| §164.314(b) | Group health plan requirements | N/A — Noesis.io Health is not a group health plan. |

---

## §164.316 — Policies, Procedures, and Documentation

All policies are consolidated in `security/policies/SECURITY-POLICIES.md`.
The unified document contains 22 numbered sections covering every
required HIPAA Security Rule policy, plus operational privacy and
telework controls. Each section is independently citable from the
HIPAA control mapping above and tracked in Vanta for annual review.

| Policy | Section in SECURITY-POLICIES.md |
|--------|-------------------------------|
| Information Security Policy (master) | §1 |
| Security Officer Designation | §2 |
| Access Control Policy | §3 |
| Acceptable Use Policy | §4 |
| Asset Management Policy | §5 |
| BAA Policy | §6 |
| Business Continuity & Disaster Recovery Policy | §7 |
| Change Management Policy | §8 |
| Cryptography Policy | §9 |
| Data Classification Policy | §10 |
| Data Retention Policy | §11 |
| Endpoint & Workstation Policy | §12 |
| Media Disposal Policy | §13 |
| Incident Response Policy | §14 |
| Onboarding & Offboarding Policy | §15 |
| Risk Management Policy | §16 |
| Secure Software Development Lifecycle (SDLC) Policy | §17 |
| Security Management Process Policy | §18 |
| Vendor Management Policy | §19 |
| Vulnerability Management Policy | §20 |
| Privacy Policy (operational summary) | §21 |
| Telework / Remote Work Policy | §22 |

---

## What Noesis.io Health is NOT (yet)

To preserve trust and avoid hallucination — restated from
`HALLUCINATION-AUDIT-REPORT.md`:

- **Not HIPAA-certified.** "HIPAA-aligned" is the accurate term. Vanta-led
  certification is in progress; status will be updated here on completion.
- **No BAA in place with end-users** until certification completes. Until
  then, Noesis.io Health is to be used for non-PHI workflows only (de-
  identified codes, organization-level metrics, payer-side metadata).
- **Not a clinical decision-making system.** All engines are
  decision-support / informational only.

---

## Operational review cadence

| Cadence | Activity | Owner |
|---------|----------|-------|
| Continuous | Vanta automated control monitoring | Security Officer |
| Daily | Audit log review (anomaly thresholds) | On-call engineer |
| Weekly | Vulnerability scan triage (`npm audit`, Snyk, Dependabot) | Engineering |
| Monthly | Access review (RBAC + IAM) | Security Officer |
| Quarterly | Policy spot-check + tabletop incident drill | Security Officer |
| Annually | Full risk assessment + policy refresh | Security Officer + Counsel |

---

© 2026 Athena Core Technologies, Inc. CONFIDENTIAL.
