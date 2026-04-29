# Noesis Health — iOS App Store Submission Runbook

**Bundle ID:** `com.athenacore.noesishealth`
**Display Name:** Noesis Health
**Min iOS:** 16.0
**Devices:** iPhone + iPad (Universal)

This runbook covers the verified-clean steps from a fresh clone to a
TestFlight build, then to App Store review. Everything that requires
Apple Developer credentials is flagged.

---

## 0. Prerequisites (one-time, on the build Mac)

- Apple Developer Program enrollment ($99/year). Enroll under **Athena
  Core Technologies, Inc.** (organizational, D-U-N-S verified).
- Apple Developer account with the following roles:
  - Account Holder (Athena Core officer)
  - App Manager (engineering)
- App Store Connect record created for `com.athenacore.noesishealth`.
- App ID created in the Apple Developer portal with Push Notifications
  and Associated Domains capabilities enabled.
- Xcode 15.2+ installed on macOS 14.4+.
- CocoaPods installed (`brew install cocoapods`).
- `npm install` completed at the repo root and inside `server/`.

## 1. Build the web bundle

From the repo root:

```bash
npm install
npm run build          # outputs build/ — what Capacitor copies to ios/
```

Verify `build/` exists and contains `index.html` and an `assets/` folder.

## 2. Sync into the iOS project

```bash
npm run ios:sync       # runs `npm run build` then `npx cap sync ios`
```

`cap sync ios` will:

1. Copy `build/` → `ios/App/App/public/`
2. Update Capacitor plugins in the iOS project's Podfile
3. Run `pod install` in `ios/App/`

If this is the first time, `npx cap add ios` is run instead of `sync`.

## 3. Open in Xcode

```bash
npm run ios:open
```

Xcode opens `ios/App/App.xcworkspace` (always the workspace, never the
`.xcodeproj`).

## 4. Configure signing

In Xcode → App target → Signing & Capabilities:

- Team: Athena Core Technologies, Inc. (10-character team ID)
- Automatic signing: enabled for development; **disabled** for release
  (use App Store Connect-managed provisioning profile).
- Provisioning profile (release): `Noesis Health App Store`.
- Capabilities checked:
  - Push Notifications
  - Associated Domains: `applinks:noesis.io`, `applinks:health.noesis.io`
  - Keychain Sharing

## 5. App icons & launch screen

Replace placeholders:

- App Icon: `ios/App/App/Assets.xcassets/AppIcon.appiconset/` — supply
  the full set (20pt – 1024pt, @1x/@2x/@3x where applicable). The
  1024×1024 marketing icon must be opaque PNG (no alpha channel).
- Launch screen: `ios/App/App/Base.lproj/LaunchScreen.storyboard` uses
  `splash.png` from the assets catalog. Brand: dark (`#0f172a`) with
  the Noesis emblem centered.

A pre-flight script at `ios/App/scripts/verify-icons.sh` (run by Xcode
build phase) validates that all required icon sizes are present.

## 6. Verify the App Transport Security exception is gone in release

```bash
plutil -p ios/App/App/Info.plist | grep -A 5 NSExceptionDomains
```

For App Store builds, the `localhost` exception must be absent OR the
release `Info.plist` must use a build-config-driven variant (see
`ios/App/Build-Configurations.md` once added). Apple's automated
review will flag any non-HTTPS exception in production.

## 7. Encryption export compliance

`ITSAppUsesNonExemptEncryption=false` is set in `Info.plist`. This is
correct because Noesis Health uses only standard HTTPS / TLS, AES via
the system CryptoKit (`server/utils/encryption.js` runs on the server,
not the device), and SQLite default encryption (none). If a future
release adds end-to-end client-encrypted messaging, this flag and the
year-end annual self-classification report (ENC) must be revisited.

## 8. Privacy nutrition label (App Store Connect)

Declare in App Store Connect → App Privacy:

| Data type | Collected? | Linked to user? | Used for tracking? | Purpose |
|-----------|------------|-----------------|---------------------|---------|
| Health & fitness | No | — | — | — |
| Contact info (email) | Yes | Yes | No | Account, customer support |
| User content (claim documents) | Yes | Yes | No | App functionality |
| Identifiers (user ID) | Yes | Yes | No | App functionality, analytics |
| Diagnostics (crash, perf) | Yes | No | No | App functionality |
| Usage data | Yes | No | No | Analytics (no cross-app tracking) |

We do NOT collect: location, financial info beyond billing email + plan
tier, sensitive identifiers (SSN), or contacts.

## 9. Build & archive

In Xcode:

1. Product → Scheme → Edit Scheme: ensure Build Configuration is
   **Release** for Archive.
2. Product → Destination → Any iOS Device.
3. Product → Archive.
4. When the Organizer opens, validate the archive (Apple's static check)
   then **Distribute App** → **App Store Connect** → **Upload**.

## 10. TestFlight

After upload completes (typically 5–15 minutes for processing):

1. App Store Connect → TestFlight → select the build.
2. Provide test information:
   - Beta App Description: pulled from `marketing/app-description.md`
   - Beta App Review Information: contact email, demo credentials.
3. Add internal testers (up to 100) — no review required.
4. For external testers (up to 10,000), submit for **Beta App Review**.
5. Apple's beta review typically completes in 24 hours.

## 11. Submit for App Store review

When TestFlight feedback is positive and metrics confirm stability:

1. App Store Connect → App Store → Prepare for Submission.
2. Required assets (per locale):
   - Screenshots: 6.7" iPhone (1290×2796) — at least 3, up to 10.
   - Screenshots: 12.9" iPad — at least 3, up to 10.
   - App Preview videos (optional but recommended for healthcare apps).
   - App icon (1024×1024).
   - Marketing copy: name, subtitle, description, keywords, support
     URL, marketing URL, privacy policy URL.
3. Set Age Rating: Medical / Health (Frequent / Intense Medical or
   Treatment Information). Noesis Health is rated 17+ because it
   handles healthcare claims.
4. Set Content Rights: Athena Core owns or has rights to all content.
5. Set Distribution: Public.
6. Pricing & Availability: Free (with in-app subscription).
7. In-app purchases: configure subscription products to match
   `server/config/roles.js` (Solo / Group / Enterprise).
8. Submit for Review.

Apple's review SLA is typically 24–48 hours but can extend to 7 days
for healthcare apps that mention HIPAA. Be prepared to provide
documentation of HIPAA posture (refer to `HIPAA-COMPLIANCE.md`) if
asked.

---

## Common rejection reasons we've pre-addressed

| Reason | How we handle it |
|--------|------------------|
| ATS exceptions for non-HTTPS | localhost gated; production has none |
| Missing privacy strings | `Info.plist` includes camera, photos, FaceID, local network, ATT |
| Missing encryption export answer | `ITSAppUsesNonExemptEncryption=false` |
| Excess permissions | We request only what we use |
| HIPAA / health claims | We are explicit: HIPAA-aligned, not HIPAA-certified, no clinical decision-making |
| Non-functional placeholders | All UI flows work in TestFlight against the staging API |

---

## Useful CLI

```bash
# Validate Info.plist
plutil -lint ios/App/App/Info.plist

# Show entitlements
plutil -p ios/App/App.entitlements

# Inspect bundle identifier across the project
grep -r "PRODUCT_BUNDLE_IDENTIFIER" ios/App/App.xcodeproj/

# Check for any debug-only configurations leaking into release
grep -r "DEBUG" ios/App/App.xcodeproj/project.pbxproj
```

---

© 2026 Athena Core Technologies, Inc.
