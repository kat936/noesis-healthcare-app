# Noesis.io Health — Bug & Security Audit Report

**Date:** April 12, 2026  
**Auditor:** Athena Core Technologies Security  
**Scope:** Full codebase — React prototype + Express.js server  
**Status:** PRE-PRODUCTION — Critical issues identified

## Executive Summary

**35 total issues: 8 CRITICAL, 12 HIGH, 9 MEDIUM, 6 LOW**

This audit covers the complete Noesis.io Health prototype stack. While the architecture is fundamentally sound, several implementation-stage security gaps must be addressed before any production deployment involving real Protected Health Information (PHI).

---

## CRITICAL Issues (8)

### 1. JWT Secret Hardcoded
**File:** `middleware/auth.js:3`  
**Severity:** CRITICAL  
**Description:** Secret is hardcoded as `'CHANGE_ME_IN_PRODUCTION'`. Complete authentication bypass possible.  
**Fix:** Force startup error if `JWT_SECRET` environment variable not set and enforced.

### 2. Hardcoded Test Password
**File:** `routes/auth.js:29`  
**Severity:** CRITICAL  
**Description:** Password `'Test123456!'` allows anyone to login without credentials.  
**Fix:** Implement bcrypt hashing + migrate to real user database with strong password policies.

### 3. CORS Accepts All Origins
**File:** `index.js:11`  
**Severity:** CRITICAL  
**Description:** `Access-Control-Allow-Origin: *` permits any website to make API calls on behalf of authenticated users.  
**Fix:** Restrict to `process.env.ALLOWED_ORIGINS` whitelist.

### 4. Unvalidated PUT /authorizations/:id
**File:** `routes/authorizations.js:140`  
**Severity:** CRITICAL  
**Description:** Request body not validated. Attacker can modify authorization scope, status, or expiry.  
**Fix:** Add Zod schema validation for all authorization mutations.

### 5. POST /fda/devices No Validation
**File:** `routes/integrations.js:130`  
**Severity:** CRITICAL  
**Description:** FDA API query string not sanitized. Injection possible.  
**Fix:** Add `deviceSearchSchema` Zod validation.

### 6. In-Memory Race Conditions
**File:** `routes/claims.js:13-14`  
**Severity:** CRITICAL  
**Description:** Concurrent writes to shared in-memory state corrupt data. Multiple simultaneous claim updates lose writes.  
**Fix:** Migrate to PostgreSQL with ACID transactions (production roadmap requirement).

### 7. Helmet Default Config
**File:** `index.js:10`  
**Severity:** CRITICAL  
**Description:** Missing explicit Content-Security-Policy, HSTS, X-Frame-Options headers.  
**Fix:** Configure all security headers explicitly.

### 8. No Encryption at Rest
**File:** Throughout codebase  
**Severity:** CRITICAL  
**Description:** PHI stored unencrypted in memory. At-rest encryption not implemented.  
**Fix:** Implement field-level encryption for all PHI before production. In-memory storage is acceptable for prototype; production requires encrypted persistence.

---

## HIGH Issues (12)

| # | Issue | File | Risk |
|---|-------|------|------|
| 1 | Messaging claims "encrypted: true" but stores plaintext | `routes/messages.js:55` | Confidentiality breach if data persisted |
| 2 | Conversation access control bypass via organizationId manipulation | `routes/conversations.js:88` | Unauthorized access to other orgs' conversations |
| 3 | Strategy Engine rule overrides not audited | `routes/strategyEngine.js:200` | No trace of who changed claim decisions |
| 4 | Error handler exposes stack traces in dev mode | `middleware/errorHandler.js:15` | Information disclosure (paths, dependencies) |
| 5 | `/health` endpoint unauthenticated | `routes/health.js:5` | Service status/availability info disclosure |
| 6 | No CSRF protection on state-changing endpoints | `index.js` (middleware) | CSRF attacks possible on forms |
| 7 | No PHI audit logging implementation | `Throughout` | Cannot detect unauthorized access/modifications |
| 8 | `/eligibility/batch` no size limit | `routes/eligibility.js:180` | Denial of Service (memory exhaustion) |
| 9 | Token expiry not enforced if claim missing | `middleware/auth.js:45` | Expired tokens accepted if exp field absent |
| 10 | No rate limiting on rule overrides | `routes/strategyEngine.js:195` | Brute-force enumeration of rules |
| 11 | NPI API lookup URL exposed in responses | `routes/providers.js:120` | Leaks external API infrastructure |
| 12 | Plan validation trusts JWT, not database state | `routes/claims.js:90` | Stale/revoked plans accepted if JWT not refreshed |

---

## MEDIUM Issues (9)

| # | Issue | File | Impact |
|---|-------|------|--------|
| 1 | `sanitizeInput()` not universally applied | `utils/sanitize.js` | Some endpoints vulnerable to injection |
| 2 | `Zod safeString` incomplete — needs DOMPurify | `validation/schemas.ts:45` | HTML injection possible in rich text fields |
| 3 | NPI lookup returns full PII without consent check | `routes/providers.js:100` | Privacy violation — full SSN/address exposed |
| 4 | Stripe webhook validation mocked | `routes/billing.js:140` | Cannot detect forged payment events |
| 5 | No organization data isolation | `routes/claims.js:30` | Database queries return all orgs' data |
| 6 | Compliance score weights hardcoded | `utils/compliance.js:50` | Cannot adjust scoring rules dynamically |
| 7 | No pagination bounds validation | `routes/claims.js:45` | Integer overflow possible with limit=999999999 |
| 8 | ICD-10 validation too permissive | `validation/schemas.ts:120` | Invalid diagnosis codes accepted |
| 9 | XSS via unsanitized user input in client | `components/ClaimDetail.jsx:85` | Stored XSS if claim notes edited |

---

## LOW Issues (6)

| # | Issue | File | Severity |
|---|-------|------|----------|
| 1 | `console.log()` instead of structured logging | `Throughout` | Difficult debugging in production |
| 2 | Unused imports and dead code | Multiple files | Code bloat, maintenance burden |
| 3 | Missing duplicate checks in arrays | `utils/arrays.js` | Duplicates cause business logic errors |
| 4 | Timezone handling issues | `utils/dates.js` | Claim dates may be off by hours |
| 5 | Documentation/implementation mismatch | `API_DOCS.md` | Developers misunderstand endpoints |
| 6 | Missing error boundaries in React | `components/App.jsx` | White-screen crashes on component errors |

---

## Bugs Requiring Fixes

- **Pagination parseInt() edge case:** `routes/claims.js:45` — `parseInt('0x10')` returns 16, not 0
- **Division by zero in ERA statistics:** `utils/eraStats.js:30` — If totalClaims = 0, crashes
- **Duplicate entries in message readBy array:** `routes/messages.js:95` — Same user added multiple times
- **Expired authorizations still returned:** `routes/authorizations.js:80` — Filter checks `>` instead of `>=`
- **Multiple appeals allowed per claim:** `routes/appeals.js:40` — No check for existing active appeal

---

## HIPAA Compliance Gaps

| Requirement | CFR Reference | Status | Notes |
|---|---|---|---|
| Audit Trail | 164.312(b) | NOT IMPLEMENTED | No logging of access/modifications to PHI |
| Encryption in Transit | 164.312(e)(2)(i) | PARTIAL | TLS configured, not enforced for all endpoints |
| Encryption at Rest | 164.312(a)(2) | NOT IMPLEMENTED | In-memory storage only; no field-level encryption |
| Access Controls | 164.312(a)(1) | PARTIAL | RBAC implemented, but no MFA or org isolation |
| Business Associate Agreement | 164.308(b)(1) | NOT IMPLEMENTED | Required before handling real PHI |
| Breach Notification | 164.408 | NOT IMPLEMENTED | No procedures for breach detection/reporting |
| Role-Based Access Control | 164.312(a)(1) | PARTIAL | Plan access checks trust JWT, not database |

---

## Remediation Roadmap

### Phase 1 (Week 1): Emergency Fixes
- Replace hardcoded secrets with environment variables
- Implement bcrypt authentication + database user table
- Restrict CORS to whitelist
- Add Zod validation to all PUT/POST endpoints
- Force HTTPS enforcement
- Add basic CSRF token middleware

### Phase 2 (Weeks 2-3): Security Foundation
- Migrate in-memory storage to PostgreSQL with transactions
- Implement structured audit logging for all PHI access
- Add organization data isolation at database level
- Implement field-level encryption for sensitive columns
- Add rate limiting and DDoS protection
- Configure Helmet security headers explicitly

### Phase 3 (Weeks 4-5): HIPAA Compliance
- Implement MFA for all user roles
- Add breach detection monitoring
- Prepare BAA framework for signing
- Implement role-based access control at database level
- Add encryption key rotation procedures
- Document security controls for compliance audit

### Phase 4 (Week 6+): Testing & Validation
- Penetration testing (external firm)
- Load testing with concurrent user scenarios
- Compliance audit against HIPAA Security Rule
- Insurance & liability review
- Production deployment readiness checklist

---

## Important Context

**This is a pre-production prototype.** The in-memory storage, test credentials, and mock data are expected for this development stage. The security audit identifies what **MUST** be addressed before any production deployment involving real PHI.

**The architecture is fundamentally sound.** The security gaps identified are implementation-stage issues, not design flaws. Developers have built a solid foundation; these are the standard hardening steps required before handling healthcare data at scale.

**Do not deploy to production without addressing all CRITICAL and HIGH severity items.** The compliance gaps can be addressed on the roadmap timeline, but authentication, CORS, validation, and encryption are non-negotiable prerequisites.

---

(c) 2026 Athena Core Technologies. All rights reserved. CONFIDENTIAL.
