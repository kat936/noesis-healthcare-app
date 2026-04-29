# Noesis.io Health — Security & Privacy Policies

**Owner:** Athena Core Technologies, Inc.
**Document version:** 1.0 (2026-04-29)
**Review cadence:** Annual or upon material change.
**Approver:** Chief Information Security Officer (CISO)

This document is the unified policy set for the Noesis.io Health platform.
Each section is independently citable from `HIPAA-COMPLIANCE.md` and the
Vanta control mapping. Sections are short on purpose — operational detail
lives in runbooks; policy states intent and enforceable rules.

---

## 1. Information Security Policy (master)

Athena Core Technologies, Inc. is committed to protecting the
confidentiality, integrity, and availability of all information assets,
including Protected Health Information (PHI), used in delivering the
Noesis.io Health platform. We maintain administrative, physical, and
technical safeguards aligned with the HIPAA Security Rule (45 CFR
§§164.302–318), the HITECH Act, and applicable state law.

This master policy authorizes and supersedes the topical policies that
follow. Any conflict between this policy and a topical policy is resolved
in favor of the stricter standard.

**Enforcement:** Violations are addressed under the Acceptable Use Policy
and may result in disciplinary action up to termination, civil action, or
referral to law enforcement.

---

## 2. Security Officer Designation (§164.308(a)(2))

The Security Officer is the named individual responsible for the
development and implementation of the policies and procedures required by
the HIPAA Security Rule. The Privacy Officer holds the corresponding
responsibility for the Privacy Rule.

Both designations are recorded in Vanta and reviewed annually. Contact
addresses:

- Security Officer: security@athenacore.com
- Privacy Officer: privacy@athenacore.com

---

## 3. Access Control Policy (§164.308(a)(3), §164.312(a))

**Principle:** least privilege. Workforce members receive only the access
required for their role.

- Access is granted by the workforce member's manager and approved by
  the Security Officer (or delegate). Approvals are recorded in Vanta.
- Production systems require MFA via the company SSO (Okta or Google
  Workspace) and are not directly password-accessible.
- Application-level RBAC is enforced server-side in
  `server/middleware/auth.js` using roles defined in
  `server/config/roles.js`. Frontend role checks are convenience UX only.
- Service accounts have unique credentials, are scoped to the minimum
  required permissions, and are rotated quarterly.
- Access is reviewed monthly; stale access is revoked within 5 business
  days of identification.
- Emergency / break-glass accounts (`super_admin`) are sealed,
  audit-alerted on every use, and reviewed quarterly.

---

## 4. Acceptable Use Policy

Workforce members will:

- Not use Noesis.io Health systems for personal commercial activity.
- Not access PHI except as required for assigned duties.
- Not share authentication credentials or session tokens.
- Use only company-managed devices for any access to PHI.
- Report any suspected security incident immediately to
  security@athenacore.com.

Violations may result in disciplinary action, account suspension, and
termination. Knowing or willful violations involving PHI may be referred
to law enforcement and reported to HHS Office for Civil Rights as
required by HIPAA Breach Notification Rule.

---

## 5. Asset Management Policy

All hardware and software assets that store, process, or transmit
PHI are inventoried in Vanta and tagged with owner, classification, and
data residency. Asset onboarding requires Security Officer approval;
asset retirement requires verified data destruction (Section 13).

---

## 6. Business Associate Agreement (BAA) Policy (§164.314(a), §164.308(b))

A signed Business Associate Agreement is executed with every
subprocessor that creates, receives, maintains, or transmits PHI on
behalf of Athena Core Technologies. The BAA register is maintained in
Vanta. Master subprocessor list as of this version:

| Subprocessor | Service | PHI in scope | BAA status |
|--------------|---------|--------------|-----------|
| Amazon Web Services | Hosting (EC2, RDS, S3, KMS) | Yes | Executed |
| Postgres host (RDS or equivalent) | Primary DB | Yes | Inherited via AWS BAA |
| Redis host | Session / rate-limit store | No PHI by design | Best-effort BAA |
| Stripe | Billing | No (only billing email + plan tier — non-PHI) | Standard DPA, no BAA required |
| Sentry | Error monitoring | No (PHI scrubber required before send) | Executed (PII scrubbing enabled) |
| Vanta | Compliance automation | No (system metadata only) | Executed |

Any new subprocessor that may handle PHI requires Security Officer
review and a signed BAA before integration.

---

## 7. Business Continuity & Disaster Recovery Policy (§164.308(a)(7))

**RTO** (recovery time objective): 4 hours for the API tier; 24 hours
for non-critical analytics.
**RPO** (recovery point objective): 15 minutes for the primary database.

- Primary Postgres has automated point-in-time recovery enabled.
- Encrypted snapshot backups are retained 90 days; long-term archives
  retained 7 years per data retention policy.
- Tabletop disaster-recovery drills are conducted quarterly; results
  recorded in Vanta.
- Emergency-mode operating procedure: read-only fallback API runs in a
  separate AWS region; users see a maintenance banner; PHI is never
  written during emergency mode.

---

## 8. Change Management Policy

All production code changes flow through pull request, peer review, and
CI checks (lint, build, test, security audit). Direct commits to `main`
are prohibited and enforced by branch protection.

- Every PR cites the change risk (`low | medium | high`) and rollback
  plan.
- High-risk changes require a second approver from a different team.
- Database migrations are reviewed by an engineer with DBA designation;
  destructive migrations require Security Officer approval.

---

## 9. Cryptography Policy (§164.312(a)(2)(iv), §164.312(e))

| Use | Algorithm | Notes |
|-----|-----------|-------|
| Data at rest (PHI) | AES-256-GCM | `server/utils/encryption.js`. Key fingerprint logged. |
| Data at rest (DB volumes) | AES-256 (provider-managed) | AWS RDS / EBS encryption. |
| Data in transit | TLS 1.2+ | HSTS preloaded. TLS 1.0/1.1 disabled. |
| Password storage | bcrypt (cost 12+) | `bcryptjs`. Never logged. |
| JWT signing | HS256 (dev) / RS256 (prod) | Secret/private key stored in AWS Secrets Manager. |
| Key derivation | scrypt (dev only) | Production keys are randomly generated. |

**Key management:** PHI encryption keys are 256-bit random values held
in AWS Secrets Manager. Keys rotate annually or on suspected
compromise. Old keys are retained for 7 years to support audit
decryption requests, then cryptographically erased.

---

## 10. Data Classification Policy

| Tier | Examples | Handling |
|------|----------|----------|
| **Restricted** | PHI, password hashes, JWT secrets, encryption keys | Encrypted at rest + in transit. Access logged. Subject to BAA. |
| **Confidential** | Internal business data, non-PHI billing info, audit logs | Encrypted at rest + in transit. Access logged. |
| **Internal** | Source code, runbooks | Access controlled via SSO. |
| **Public** | Marketing site, open-source contributions | No restriction. |

Workforce members must default to the most restrictive classification
when uncertain.

---

## 11. Data Retention Policy

| Data | Minimum retention | Maximum retention |
|------|-------------------|-------------------|
| Audit logs (HIPAA §164.316(b)) | 6 years | 7 years |
| PHI (claim data) | 6 years from last use | 7 years from last use |
| Backups containing PHI | 6 years | 7 years |
| Application logs (no PHI) | 90 days | 1 year |
| Marketing analytics | None (no PHI) | 13 months |

Customer-initiated deletion: PHI is purged within 30 days of a verified
customer deletion request, except where retention is required by law.

---

## 12. Endpoint & Workstation Policy (§164.310(b)–(c))

- Workforce devices are MDM-managed (Jamf for macOS, Intune for Windows).
- Full-disk encryption (FileVault / BitLocker) is mandatory and
  attested by Vanta.
- Screen lock at 5 minutes idle.
- OS auto-update enforced.
- USB mass storage to / from the device is blocked except where
  business-necessary and Security Officer approved.
- Antivirus / EDR (CrowdStrike or equivalent) installed on all
  workstations.

---

## 13. Media Disposal Policy (§164.310(d))

Cloud volumes are cryptographically erased on retirement (key
destruction). Physical media (rare — e.g., laptop SSDs) is wiped using
NIST SP 800-88 Purge methods or physically destroyed; certificate of
destruction retained.

---

## 14. Incident Response Policy (§164.308(a)(6))

**Scope:** any event that compromises or appears to compromise the
confidentiality, integrity, or availability of PHI, or any event the
Security Officer determines warrants the response process.

**Phases:** Detect → Triage → Contain → Eradicate → Recover → Review.

**Notification timelines (HIPAA Breach Notification Rule):**

- Affected individuals: within 60 days of discovery.
- HHS Office for Civil Rights: within 60 days (≥500 individuals) or
  annually (<500).
- Media: within 60 days for breaches affecting ≥500 individuals in a
  state / jurisdiction.
- State attorneys general: per applicable state law.

A post-incident review is completed within 30 days of resolution and
records are retained in Vanta for 6 years.

24/7 contact: security@athenacore.com → on-call rotation in PagerDuty.

---

## 15. Onboarding & Offboarding Policy

Onboarding (Day 1):

- Background check completed.
- Acceptable Use Policy acknowledged.
- HIPAA awareness training completed; certificate stored in Vanta.
- SSO + MFA provisioned.
- Role-scoped access granted by manager + Security Officer.

Offboarding (≤24 hours from termination):

- SSO disabled.
- Sessions invalidated (JWT blacklist + session cookie revocation).
- MDM remote-wipe initiated for company-issued devices.
- Access review run to confirm orphaned access removed.
- Exit interview captures any retained data / IP transfer.

---

## 16. Risk Management Policy (§164.308(a)(1))

A formal risk assessment is performed annually and after any material
change in technology, organization, or threat landscape. Risks are
recorded in the Vanta risk register with likelihood / impact ratings
and treatment plans (mitigate / accept / transfer / avoid).

Continuous monitoring uses Vanta's automated control checks plus
weekly vulnerability scanning (Section 19).

---

## 17. Secure Software Development Lifecycle (SDLC) Policy

- All code changes go through peer review on GitHub.
- Static analysis (`eslint`, `npm audit`) gates CI.
- Secrets are never committed; `.env*` files are gitignored.
  `git-secrets` (or equivalent) runs pre-commit to block accidents.
- Dependency updates are reviewed and tested via Dependabot PRs.
- Penetration testing is conducted annually by a qualified third party.
- Production deploys are auditable and reversible (Section 8).
- Engines must include a canonical `auditTrail` block — see
  `server/utils/audit.js` and the engine implementations.

---

## 18. Security Management Process Policy

The Security Officer maintains the security program. Quarterly the
program is reviewed against the latest HHS guidance, OCR enforcement
trends, and Vanta's continuous control posture. A summary report is
delivered to executive leadership.

---

## 19. Vendor Management Policy

Vendors that may access Restricted or Confidential data undergo a
due-diligence review (SOC 2 / HITRUST certification, BAA willingness,
security questionnaire). Reviews are repeated annually for HIPAA-scope
vendors. Vanta tracks the vendor inventory and review status.

---

## 20. Vulnerability Management Policy

| Source | Cadence | SLA to remediate |
|--------|---------|------------------|
| `npm audit` (CI gate) | Every PR | Critical: 7 days; High: 30 days; Moderate: 90 days |
| Dependabot | Weekly | Same as above |
| Cloud provider security findings | Continuous | Critical: 7 days; High: 30 days |
| Annual penetration test | Annual | Per finding severity |
| Bug bounty / coordinated disclosure | As reported | Critical: 7 days; High: 30 days |

Critical findings affecting PHI integrity escalate immediately to the
Incident Response process (Section 14).

---

## 21. Privacy Policy (operational summary)

The customer-facing Privacy Policy lives at `legal/privacy-policy.md`.
This section covers operational privacy controls:

- PHI minimization: collect only what's needed for the documented
  purpose.
- Purpose limitation: PHI used only for the operations declared in the
  BAA.
- Subject rights: access, amendment, accounting of disclosures, and
  restriction requests are honored within HIPAA-mandated timelines.

---

## 22. Telework / Remote Work Policy

Workforce members may work remotely from any location that allows them
to comply with this policy set. Public Wi-Fi access to PHI is
prohibited; VPN is required when not on a company-trusted network.
Devices are subject to the same MDM and encryption requirements as
on-site devices.

---

© 2026 Athena Core Technologies, Inc. CONFIDENTIAL.
