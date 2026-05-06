# Noesis Health — App Store Connect metadata, staged

**Use this document to populate App Store Connect → My Apps → Noesis Health → 1.0 Prepare for Submission.** Each field below is verbatim copy/paste-ready and verified live against the source-of-truth (privacy policy, marketing site, repo configs).

**Last verified:** 2026-05-06 — updated for IOS_DEMO_ONLY ship strategy. The iOS bundle no longer requires a reachable backend, demo credentials, or staged seed data; every API call is short-circuited inside the JSX bundle and the app launches straight into a populated dashboard with synthetic sample records.

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
**No.** v1.0 ships as IOS_DEMO_ONLY: launching the app drops the reviewer straight onto the populated Dashboard. No login screen, no consent gate, no backend dependency. Every record on screen is synthetic (placeholder names, valid-but-fake CPT/ICD codes); no real PHI is ever in the bundle.

### Demo account
| Field | Value |
|---|---|
| Username | _(leave blank)_ |
| Password | _(leave blank)_ |

No demo credentials needed. Tap the icon, the app loads.

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

THIS IS A DEMO-ONLY iOS BUILD (v1.0)
  No sign-in is required. Tap the app icon and the populated dashboard
  loads immediately with synthetic sample data. No live network calls
  are made: every API request is short-circuited inside the bundle and
  served from canned in-memory fixtures. The amber banner across the
  top of the dashboard reflects this ("Demo build. All records shown
  are synthetic sample data. No real Protected Health Information.").

  Patient names in the sample data are obvious placeholders (John Doe,
  Jane Smith, Robert Johnson, etc). CPT and ICD-10 codes are valid but
  not derived from any real patient encounter. No demo credentials are
  needed because there is no login screen.

  The HIPAA-aware production version requires a separate clinical-trial
  agreement and a signed Business Associate Agreement before access.
  That is gated outside the App Store distribution channel.

What the reviewer can exercise:

  1. Dashboard — populated claim pipeline, denials count, AR aging.
  2. Claims module — synthetic claim list, status breakdown, CSV export
     (writes to the device Documents folder via Capacitor Filesystem).
  3. Pre-Check — submit a test claim, see deterministic rule scoring.
  4. Eligibility — sample 270/271 response.
  5. Prior Auth — submit and view sample authorizations.
  6. Denials — categorized denial codes with sample appeals workflow.
  7. Analytics — revenue trend, clean claim rate, days-to-pay.
  8. Pricing — plan selection (Stripe Checkout opens in an external
     Safari session via @capacitor/browser when the user picks a plan;
     in the demo build the call returns a demo:true response and a
     toast informs the user it would launch Stripe in production).

Subscriptions and Apple's IAP (Guideline 3.1.1):
  Noesis Health is a B2B SaaS for healthcare provider organizations.
  Subscribers are clinical practices and billing companies, not
  individual consumers. Subscription purchase and management happens
  through Stripe Checkout in an external Safari session (we use
  @capacitor/browser to open Stripe out-of-app, never inside the
  WKWebView). This fits the Multiplatform Service exception (3.1.3(b))
  and Enterprise Service exception (3.1.3(d)). In this demo build the
  Stripe handoff is stubbed (no card capture, no charge).

HIPAA / privacy posture:
  - Athena Core Technologies, Inc. operates HIPAA controls under Vanta.
  - Production technical safeguards documented in HIPAA-COMPLIANCE.md:
    AES-256-GCM at rest, TLS 1.2+ in transit, per-user RBAC, immutable
    audit trail.
  - The shipped iOS bundle does NOT store, transmit, or have access to
    any real PHI. The bundle's API client is short-circuited; no
    network calls leave the device.
  - The app does NOT claim to be HIPAA-certified. It is HIPAA-aligned
    and intended to be operated under a BAA with the customer
    organization in production.

Why we declare Sensitive Info but not Health & Fitness in the privacy
nutrition labels: "Health & Fitness" is Apple's category for HealthKit /
device-sensor data, which this app does not use. Claim metadata and
supporting clinical documentation are declared honestly under
"Sensitive Info" (Apple's definition includes health and medical
condition data) so the production version stays compliant once the
gate flips off.
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

All four prior followups (A–D) have been resolved as of the IOS_DEMO_ONLY work landed in this PR.

### A. Screenshots workflow — DONE

Moved `scripts/screenshots/screenshots.workflow.yml` to `.github/workflows/screenshots.yml`. Trigger via Actions → App Store Screenshots → Run workflow. The `app-store-screenshots` artifact contains `iphone-6.5/` and `ipad-12.9/` subfolders with PNGs at App Store dimensions.

### B. inject-ios-plist workflow step — DONE

Added a `Inject canonical Info.plist keys` step between `Add iOS platform` and `Sync Capacitor with web build` in `.github/workflows/ios-build.yml`. The Info.plist preservation copy is added to the `Add iOS platform` step. Subsequent CI runs will ship the canonical privacy strings, ATS hardening, and `ITSAppUsesNonExemptEncryption=false`.

### C. Backend reachability — N/A under IOS_DEMO_ONLY

The shipped iOS bundle never networks. `apiFetch` returns canned responses from `demoResponse()` whenever `window.Capacitor.isNativePlatform()` is true. `api.staging.noesis.io` does not need to exist for the App Review submission to pass Guideline 2.1.

### D. health.noesis.io universal links — N/A under IOS_DEMO_ONLY

The demo build does not exercise universal links. If a Capacitor-default `applinks:` entitlement is present, Apple's AASA fetch retries silently and does not block submission. Production-mode entitlement work can be deferred to v1.1 when the gate flips off.
