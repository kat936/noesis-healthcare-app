# Noesis Health — App Store Connect metadata, staged

**Use this document to populate App Store Connect → My Apps → Noesis Health → 1.0 Prepare for Submission.** Each field below is verbatim copy/paste-ready and verified live against the source-of-truth (privacy policy, marketing site, repo configs).

**Last verified:** 2026-05-05 by SAFE-MODE pre-submission audit.

---

## 1 · App Information

| ASC field | Value |
|---|---|
| Name | `Noesis Health` |
| Subtitle | `Healthcare RCM, Simplified` |
| Privacy Policy URL | `https://noesis-io.us/legal/privacy/health` ✅ live (HIPAA notice, BAA, 7-yr retention, AES-256-GCM) |
| Subscription Privacy Policy URL | same as above |
| Category — Primary | `Medical` |
| Category — Secondary | `Business` |
| Bundle ID | `com.athenacore.noesishealth` |
| SKU | `NOESIS-HEALTH-IOS-001` |
| User Access | Full Access (no Sign in with Apple required — email/password only is exempt) |

## 2 · Pricing & Availability

| ASC field | Value |
|---|---|
| Price | Free (with in-app subscriptions handled via Stripe Checkout — B2B exception, see "App Review Information" below) |
| Availability | United States (initial launch) |
| Pre-Order | No |

## 3 · Age Rating

Answer the questionnaire so the resulting rating is **17+**:

| Apple question | Answer |
|---|---|
| Unrestricted Web Access | No |
| Gambling | No |
| Contests | No |
| Medical / Treatment Information — Frequent / Intense | **Yes** |
| Mature / Suggestive Themes | No |
| Horror / Fear Themes | No |
| Profanity / Crude Humor | No |
| Sexual Content / Nudity | No |
| Violence — Cartoon / Fantasy | No |
| Violence — Realistic | No |
| Alcohol, Tobacco, Drug Use | No |

Resulting rating: **17+ — Frequent/Intense Medical or Treatment Information.**

## 4 · App Privacy (Nutrition Labels)

### Data Linked to User
| Data Type | Collected? | Purpose | Tracking? |
|---|---|---|---|
| Email Address | Yes | App Functionality, Customer Support | No |
| Name | Yes | App Functionality | No |
| User ID | Yes | App Functionality, Analytics | No |
| Sensitive Info (PHI: claim metadata, supporting clinical docs) | **Yes** | App Functionality | No |
| Other Financial Info (billing email, plan tier, claim amounts) | Yes | App Functionality | No |
| Other User Content (claim documents) | Yes | App Functionality | No |

### Data Not Linked to User
| Data Type | Collected? | Purpose |
|---|---|---|
| Crash Data | Yes | App Functionality |
| Performance Data | Yes | App Functionality |
| Other Diagnostic Data | Yes | App Functionality |
| Product Interaction (anonymized usage events) | Yes | Analytics |

### Not Collected
- Precise / Coarse Location
- Audio / Photos / Video / Contacts / Search History / Browsing History
- Payment Info (Stripe is the data processor — we never see card data)
- **Health & Fitness data — we do NOT use HealthKit** (claim metadata is declared under Sensitive Info, not Health & Fitness)
- Identifiers — Device ID, Advertising ID

### Tracking
**No.** App does NOT track users across other companies' apps and websites. No `NSUserTrackingUsageDescription` declared in Info.plist (intentionally — declaring without using triggers Guideline 5.1.2).

## 5 · App Review Information

### Sign-in required
**Yes.**

### Demo account
| Field | Value |
|---|---|
| Username | `reviewer@noesis.io` |
| Password | _(set the staging server's `DEV_PASSWORD` env var to a fresh strong value before submitting; paste it here in ASC, NOT in this repo)_ |

⚠ **BLOCKER**: The staging environment expected at `https://api.staging.noesis.io/api/v1` is currently NOT reachable (DNS NXDOMAIN). Reviewer login will fail. Either:
- (a) Bring up `api.staging.noesis.io` with synthetic-only data and the demo account seeded, OR
- (b) Repoint the iOS build's `REACT_APP_API_URL` to a different reachable backend and update this field to match.

The TestFlight build cannot be submitted without one of these. See infra section in the final SAFE-MODE report.

### Contact information
| Field | Value |
|---|---|
| First name | Kat |
| Last name | _(Kat to fill — currently `[fill in]` in repo docs)_ |
| Phone | _(Kat to fill — currently `[fill in]` in repo docs)_ |
| Email | `kat@athenallcconsulting.com` |

### Notes for the reviewer
Paste this verbatim into ASC's "Notes" field:

```
Noesis Health is a healthcare revenue cycle management (RCM) platform for
medical providers and billing staff. It is NOT a consumer health app and
does not connect to HealthKit, Apple Health, or any device sensor. Users
are clinical and billing staff at provider organizations, not patients.

Functionality the reviewer will see after sign-in with the supplied demo
credentials:

  1. Dashboard showing claim pipeline, denials, and AR aging — all on
     synthetic test data (every record labeled [TEST]).
  2. Claim Pre-Check workflow — submit a test claim, receive deterministic
     rule-based scoring, decide approve / hold / review.
  3. Provider verification — uses the public CMS NPI Registry
     (https://npiregistry.cms.hhs.gov/api/) for live lookups.
  4. Drug / device validation — uses public OpenFDA endpoints
     (https://api.fda.gov/).
  5. Stripe-backed subscription management (Stripe TEST MODE only in the
     staging environment exposed to App Review).

Subscriptions and Apple's IAP (Guideline 3.1.1):
  Noesis Health is a B2B SaaS for healthcare provider organizations.
  Subscribers are clinical practices and billing companies, not individual
  consumers. Subscription purchase and management happens through Stripe
  Checkout in an external Safari session (we use @capacitor/browser to
  open Stripe out-of-app, never inside the WKWebView). This fits the
  Multiplatform Service exception (3.1.3(b)) and Enterprise Service
  exception (3.1.3(d)) — no in-app purchase flow exists for the consumer
  to encounter.

HIPAA / privacy posture:
  - Athena Core Technologies, Inc. operates under Vanta for continuous
    compliance monitoring and HIPAA controls administration.
  - All technical safeguards (45 CFR §164.312) are documented in
    HIPAA-COMPLIANCE.md in the source repo: AES-256-GCM encryption at
    rest with key custody via AWS Secrets Manager, TLS 1.2+ in transit,
    per-user RBAC with plan gating, full audit trail with SHA-256 input
    fingerprints.
  - The app does NOT claim to be HIPAA-certified (no such certification
    exists). It is HIPAA-aligned and intended to be operated under a
    Business Associate Agreement with the customer organization.
  - The staging environment exposed to App Review contains zero real
    PHI. Synthetic patients, claims, and providers only.
  - The app does NOT store PHI on the device; PHI lives on the backend
    (Athena Core Technologies, Inc. as the data processor under our
    customers' BAAs). The iOS client is a thin Capacitor WebView over
    the Express API.

Why we declare Sensitive Info but not Health & Fitness in the privacy
nutrition labels: "Health & Fitness" is Apple's category for HealthKit /
device-sensor data, which this app does not use. Claim metadata and
supporting clinical documentation are declared honestly under
"Sensitive Info" (which Apple defines to include health and medical
condition data).
```

### Attachments (optional)
- `HIPAA-COMPLIANCE.md` from the source repo — supply if reviewer asks for documentation of HIPAA technical safeguards. Apple usually does not require it, but Medical-category reviewers sometimes ask.

## 6 · Marketing Assets

| Asset | Required? | Status / Source |
|---|---|---|
| App Icon 1024×1024 (opaque PNG) | Yes | ✅ `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` (regenerated by CI from `noesis-emblem-source.png`) |
| iPhone 6.7" / 6.5" screenshots (1290×2796 or 1284×2778), 3–10 | Yes | 🔧 Generated by `screenshots` workflow → `app-store-screenshots` artifact (see followup section) |
| iPad 12.9" screenshots (2048×2732), 3–10 | Yes (Universal binary) | 🔧 Generated by `screenshots` workflow → `app-store-screenshots` artifact |
| App Preview videos | Optional | Skip for v1.0 |
| Promotional Text (170 char) | Optional | `Streamline claims pre-check, denials, and AR aging. Built for medical providers under HIPAA-aligned controls. B2B subscription via secure web checkout.` |
| Description (4000 char) | Yes | See "Description" block below |
| Keywords (100 char) | Yes | `medical billing,RCM,claims,denials,AR aging,HIPAA,provider,revenue cycle,healthcare,prior auth` |
| Support URL | Yes | `https://noesis-io.us/support` ✅ live (or `https://noesis.io/support` as fallback) |
| Marketing URL | Optional | `https://noesis-io.us` ✅ live |
| Copyright | Yes | `© 2026 Athena Core Technologies, Inc.` |

### Description block (paste into ASC)

```
Noesis Health is the all-in-one revenue cycle management platform for
medical providers and billing teams. Reduce denials, accelerate AR
collection, and stay HIPAA-aligned without juggling six tools.

WHAT YOU CAN DO
  • Pre-Check every claim with rule-based scrubbing before it leaves
    your office, with deterministic explanations of every flag.
  • Verify patient eligibility with live payer data and capture the
    benefit details that prevent surprise denials.
  • Submit and track Prior Authorizations through one inbox — see
    pending, approved, and denied PAs in a single status board.
  • Triage Denials with categorized reason codes and one-click appeals
    workflows that keep your team focused on recoverable revenue.
  • Watch AR Aging in real time with a 30 / 60 / 90+ day dashboard
    that surfaces accounts before they hit collections.
  • Verify Provider NPIs against the live CMS NPI Registry.
  • Validate drugs and devices against OpenFDA — never submit a
    claim with a recalled or unapproved code.

BUILT FOR HEALTHCARE
  • HIPAA-aligned technical safeguards: AES-256-GCM at rest, TLS 1.2+
    in transit, per-user RBAC with plan gating, full audit trail with
    SHA-256 input fingerprints, inactivity session timeout.
  • Business Associate Agreement available for Group and Enterprise
    subscribers — contact compliance@noesis.io to execute.
  • Audit logs retained for the HIPAA minimum (7 years from most
    recent access).
  • Zero PHI on device — your data lives encrypted on the backend, not
    in the app's local storage.

PRICING
  Solo:      $299/month, includes 500 claims, up to 3 providers
  Group:     $799/month, includes 2,000 claims, up to 20 provider seats
  Enterprise: Custom — contact sales@noesis.io for volume pricing

Subscriptions are billed through Stripe in a secure external browser
session and managed in your account billing portal. Cancel anytime
from your account.

This app is intended for use by clinical and billing staff at
healthcare provider organizations. It does NOT provide medical
advice, treatment recommendations, or clinical diagnosis. It does NOT
connect to Apple Health or read device-sensor data.

Operated by Athena Core Technologies, Inc.
Privacy: https://noesis-io.us/legal/privacy/health
Support: https://noesis-io.us/support
```

**Description compliance check (Guideline 5.1.1 / 1.4 risk):**
- ✅ No medical advice claims
- ✅ No diagnosis claims
- ✅ No treatment recommendations
- ✅ No "FDA-approved" / "FDA-cleared" claims
- ✅ No "HIPAA-certified" claim (correctly says "HIPAA-aligned")
- ✅ B2B context made explicit
- ✅ Stripe external-browser flow disclosed up front

## 7 · Build Selection & Encryption Export

| ASC field | Value |
|---|---|
| Build | Selected from latest TestFlight upload (run number == `CFBundleVersion`) |
| Encryption Export Compliance | **No** — `ITSAppUsesNonExemptEncryption=false` in Info.plist (standard HTTPS/TLS only, ENC exempt under ECCN 5D992); ASC will skip the questionnaire |

## 8 · Final Submission Gate Checklist

Tick every box before clicking **Add for Review**:

- [ ] Apple Developer Program enrollment is **active** under Athena Core Technologies, Inc.
- [ ] Build appears in App Store Connect → TestFlight, processing complete
- [ ] Build attached to the `1.0` version
- [ ] Privacy Policy URL = `https://noesis-io.us/legal/privacy/health` (NOT `noesis.io/privacy`)
- [ ] Marketing URL = `https://noesis-io.us`
- [ ] Support URL = `https://noesis-io.us/support`
- [ ] Copyright = `© 2026 Athena Core Technologies, Inc.`
- [ ] Age Rating = **17+** (Medical/Treatment Information Frequent/Intense)
- [ ] Privacy Nutrition labels filled per section 4 above (Sensitive Info = Yes; Health & Fitness = No; Tracking = No)
- [ ] Encryption Export Compliance answered (or auto-skipped because of Info.plist key)
- [ ] App Review Notes pasted from section 5 above
- [ ] Demo account exists in staging DB with the password ASC field shows
- [ ] **Backend is reachable** — `api.staging.noesis.io` (or whatever you point to) returns 200 to `POST /auth/login` with valid creds
- [ ] At least 3 iPhone 6.5" screenshots uploaded (1284×2778)
- [ ] At least 3 iPad 12.9" screenshots uploaded (2048×2732)
- [ ] All Contact fields filled (last name, phone)
- [ ] Submitted for Review

---

## Followup actions Kat must do (workflow-scope blockers)

These are blocked by the OAuth token used in this session lacking GitHub `workflow` scope. Each takes <2 minutes through the GitHub web UI.

### A. Activate the screenshots workflow

1. Open https://github.com/kat936/noesis-healthcare-app/tree/feat/app-store-screenshots-tooling
2. Navigate to `.github/workflows/`
3. **Add file → Create new file**, name it `screenshots.yml`
4. Paste the contents of `scripts/screenshots/screenshots.workflow.yml` from the same branch
5. Commit directly to `feat/app-store-screenshots-tooling`
6. The push trigger fires automatically — watch **Actions → App Store Screenshots**
7. When green, download the `app-store-screenshots` artifact and upload the PNGs in `iphone-6.5/` and `ipad-12.9/` to ASC

### B. Add the inject-ios-plist workflow step

The script `scripts/inject-ios-plist.mjs` is committed and ready. The workflow step that calls it is the only thing missing.

1. Open https://github.com/kat936/noesis-healthcare-app/blob/feat/app-store-screenshots-tooling/.github/workflows/ios-build.yml
2. Click the pencil (edit) icon
3. In the **`Add iOS platform`** step's bash block, add this line right after the `mkdir -p /tmp/ios-preserve` line:

   ```bash
   [ -f "ios/App/App/Info.plist" ] && cp "ios/App/App/Info.plist" /tmp/ios-preserve/Info.plist || true
   ```

4. Insert this new step between **`Add iOS platform`** and **`Sync Capacitor with web build`**:

   ```yaml
         - name: Inject canonical Info.plist keys (privacy strings, ATS, encryption-export)
           run: node scripts/inject-ios-plist.mjs
   ```

5. Commit directly to `feat/app-store-screenshots-tooling` with message `ci(ios): inject canonical Info.plist keys after cap add`
6. Re-trigger the iOS build via **Actions → Build & Submit iOS App → Run workflow** on the feat branch

### C. Bring up `api.staging.noesis.io` (or repoint)

Without a reachable backend, the reviewer login fails and the submission gets rejected on Guideline 2.1 within 24h.

Two paths:
- (Preferred) Deploy the `server/` Express app to a reachable host with synthetic-only seed data. DNS `api.staging.noesis.io` → that host. Seed `reviewer@noesis.io` with `DEV_PASSWORD`.
- (Faster) Point `REACT_APP_API_URL` (build env var) at an existing reachable backend that serves the same `/api/v1/*` endpoints. Update the ASC notes to match the new demo URL.

### D. Resolve `health.noesis.io` (universal links)

Either bring `health.noesis.io` up with a valid `apple-app-site-association` file, or remove `applinks:health.noesis.io` from `ios/App/App.entitlements`. Apple's automated AASA fetch will retry but a 24-48h delay is possible if it's missing.
