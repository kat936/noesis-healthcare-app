# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in Noesis.io Health,
**do NOT open a public issue**. Email **security@athenacore.com** with:

- A description of the issue
- Steps to reproduce
- Impact assessment if you have one
- Your name / handle for credit (optional)

Expected response time: within 2 business days. Critical issues affecting
PHI confidentiality, integrity, or availability are triaged within
24 hours.

We follow coordinated disclosure: please give us 90 days to remediate
before public disclosure. Where the issue is being actively exploited,
that window may shrink — we'll coordinate.

## Scope

In scope:

- The Noesis.io Health web application (`noesis-health-app.jsx` and the
  Vite-built bundle)
- The Express API server (`server/`)
- The iOS Capacitor wrapper (`ios/App/`)
- Supply chain: npm dependencies, container base images, CI workflows

Out of scope:

- Third-party services we integrate with (CMS NPI Registry, OpenFDA,
  Stripe) — please report directly to the vendor
- Social engineering of Athena Core employees
- Physical attacks against Athena Core infrastructure

## What we commit to

- Acknowledge your report within 2 business days
- Provide a clear timeline for fix or rebuttal
- Credit you (with your permission) in release notes once the fix ships
- Never pursue legal action for good-faith research within the scope above

## What we ask

- No testing against production data
- No social engineering
- No DoS / load testing without prior coordination
- No automated scanning that generates noise in our audit logs without
  prior coordination

## Encryption & key management

PHI is encrypted at rest with AES-256-GCM (`server/utils/encryption.js`).
Keys are provisioned via `PHI_ENCRYPTION_KEY` (32-byte hex) at deploy
time, are never written to disk in plaintext, and rotate on a 12-month
cadence. The first 8 hex chars of `SHA-256(key)` are logged with each
ciphertext to enable migrations during rotation.

TLS 1.2+ is required in transit. HSTS is preloaded. Helmet enforces a
default-deny CSP.

## Audit logging

Every authenticated API request is recorded with user, role, action,
status code, IP, and user agent (`server/middleware/auditLog.js`). Path
segments that could contain PHI identifiers (UUIDs, MRNs, NPI) are
sanitized to `:id` / `:npi` tokens before persistence.

Engines additionally emit a canonical `auditTrail` block containing
`engineId`, `ruleVersion`, `computedAt`, and `inputsFingerprint` so
historical decisions can be replayed and verified.

---

© 2026 Athena Core Technologies, Inc.
