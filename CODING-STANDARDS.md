# Noesis.io Health — Coding Standards

**Owner:** Athena Core Technologies, Inc.
**Status:** Living document. Every CI gate documented below has a corresponding step in `.github/workflows/ci.yml` so the rules cannot regress unnoticed.

The intent of this document is narrow: capture the rules that the cross-repo bug sweep encoded into CI, so a future contributor can see at a glance why a check is firing and what the right fix is. It is not a style guide; it does not replace ESLint defaults; it does not catalog every convention. Each section names the rule, the failure mode it prevents, the CI gate that enforces it, and the canonical fix.

---

## 1. Currency goes through `utils/money.toCents()`

**Rule.** No `parseFloat()` in currency-bearing surfaces. Money flows through `server/utils/money.js`.

**Why.** `parseFloat("100.10") + parseFloat("200.20")` returns `300.29999999999995` in IEEE-754. On 835 ERA reconciliation that fails an exact match against the payer-reported total, flagging the claim for manual review. On a deductible 30/70 split, the two halves do not always sum back to the total in the cent. `toFixed(2)` on a `parseFloat` result is non-deterministic across Node versions because of round-half-to-even quirks, undermining HIPAA §164.312(c)(1) reproducibility.

**Canonical fix.** Use `toCents(value)` for serialization and `d(value)`, `mul`, `sub`, `sum` from `utils/money` for intermediate arithmetic. The deductible 30/70 split lives in `server/services/payerEligibility.js` as the reference example: `total`, `met = mul(total, 0.3)`, `remaining = sub(total, met)` — `met + remaining === total` to the cent.

**CI gate.** `Block parseFloat in currency surfaces` (in `guardrails` job). Files covered: `server/routes/claims.js`, `server/routes/denials.js`, `server/routes/billing.js`, `server/services/clearinghouse.js`, `server/services/payerEligibility.js`. `server/test/security/currency-precision.test.js` covers source-level + arithmetic regression.

---

## 2. Tenant scoping goes through `utils/tenantScope`

**Rule.** Every list, detail, and mutation handler for `claims`, `denials`, and `authorizations` uses `buildScopeClause()` (SQL) and `canAccessResource()` (resource gate) from `server/utils/tenantScope.js`. Cross-tenant access returns 404, not 403.

**Why.** HIPAA §164.502(a) limits PHI uses and disclosures. Pre-fix, list endpoints filtered by `provider_id` only when the caller was `provider_staff`; `practice_admin` had no organization filter at all and could read or mutate any tenant's records by ID. 404 (not 403) is used because 403 leaks the existence of records the caller has no right to know exist.

**Canonical fix.** Import the helper, use `buildScopeClause(req)` in WHERE-builders, use `canAccessResource(req, resource)` after a `SELECT * WHERE id=$1`. For in-memory fallbacks use `inMemoryFilter(req)`.

**CI gate.** `Confirm tenant-scope helper used in claims/denials/authorizations` (in `guardrails` job). Source-level test in `server/test/security/tenant-scoping.test.js` also enforces.

---

## 3. No plain-text PHI in application logs

**Rule.** `console.log` / `console.info` / `console.debug` with `req.body` or any of `patientName`, `patientDob`, `patientSsn`, `memberId`, `memberID`, `diagnosis`, `mrn` is forbidden.

**Why.** Log sinks (CloudWatch, Sentry, stdout in container logs) are downstream PHI exposure surfaces. Sentry as configured does not have a BAA on the free tier; CloudWatch requires explicit AWS BAA scope. HIPAA §164.312(b) requires audit controls, but those controls live in `server/middleware/auditLog.js` which sanitizes path segments. Application-level `console.log` of request bodies bypasses the sanitization.

**Canonical fix.** Log the resource ID (UUID) and outcome only. If you need to debug a request, use `req.user.id` plus a sanitized path. Audit-bearing events go through `auditLogMiddleware`, not `console`.

**CI gate.** `Block plain-text PHI logging` (in `guardrails` job). Tests are excluded by path filter so the regression suite can still inspect strings.

---

## 4. No empty catch blocks in `server/`

**Rule.** `catch (e) {}` or `catch {}` with no body is forbidden in the server tier.

**Why.** Empty catches hide the failure modes that should page someone: DB connection loss, auth bypass attempts, Stripe webhook signature mismatches. Existing `catch { /* fall through */ }` blocks in `server/middleware/auth.js` against transient Redis are deliberate and annotated.

**Canonical fix.** Either rethrow, write to `process.stderr`, or annotate with a one-line comment explaining why silent absorption is correct (e.g. `/* fall through to in-memory fallback when Redis is unavailable */`). The CI gate matches truly empty bodies — annotated catches pass.

**CI gate.** `Block empty catch blocks in server/` (in `guardrails` job).

---

## 5. Don't fabricate HIPAA compliance

**Rule.** Never assert "HIPAA-certified" or "HIPAA-compliant" in user-facing copy without explicit negation.

**Why.** HIPAA does not have a certification scheme; the Office for Civil Rights does not certify covered entities. "Compliance" is continuous, not point-in-time, and depends on executed BAAs with each vendor and customer. A claim of compliance without that evidence is a regulatory and reputational risk.

**Canonical fix.** State the posture accurately: `"BAA-ready architecture; production HIPAA compliance requires BAA execution with each vendor and customer."` The new BAA endpoint in `server/routes/hipaaCompliance.js` returns this exact posture string in its response payload, and the test asserts it.

**CI gate.** `Block "HIPAA-certified" claims` and `Block "HIPAA-compliant" claims without negation` (both in `guardrails` job). The negation patterns recognized: `not HIPAA-compliant`, `NOT HIPAA-compliant`, `HIPAA-compliant out of the box, requires …`, `requires BAA`.

---

## 6. Engines emit canonical `auditTrail` and `ruleVersion`

**Rule.** Decision-support engines (`strategyEngine.js`, `complianceEngine.js`, `precheck.js`) emit `auditTrail` and `ruleVersion` on every output.

**Why.** HIPAA §164.312(c)(1) requires integrity controls; clinical-and-claims decision support requires reproducibility for audit. `auditTrail` enumerates the rules fired; `ruleVersion` pins the rule pack so a re-run on the same input is byte-identical.

**Canonical fix.** Existing — see the engines for the shape.

**CI gate.** `Confirm engines emit canonical auditTrail` (pre-existing, kept).

---

## App Review surface (do not touch)

These files protect the iOS Build 13 demo path that is in App Review. Do not modify them as part of any backend or compliance change.

- `noesis-health-app.jsx`
- `.github/workflows/ios-build.yml`
- `server/routes/integrations.js`
- All `IOS_DEMO_ONLY` guards across the codebase

If a refactor genuinely needs to touch these, raise a separate PR scoped to that change with explicit App Review impact analysis in the description, and confirm Build N+1 still archives cleanly before merging.

---

## Process

- One PR per bug class. Bundle all instances of the same root cause; do not split a single fix across multiple PRs.
- Squash-merge to `main`. CI green before merge. Smoke-test the demo path after every merge by confirming `IOS_DEMO_ONLY` references in `noesis-health-app.jsx` are intact and the iOS build workflow has not been touched.
- No force-push to `main`.
- Tests for any new bug class go under `server/test/security/` so they live next to the security regression suite.
