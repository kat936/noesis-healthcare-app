# Noesis.io Health — Consent Language and Modals

**Effective Date:** April 12, 2026  
**Version:** 1.0

This document defines consent language and acknowledgments users must accept when using the Noesis.io Health platform.

---

## 1. Login / Account Acceptance Modal

**Display:** On first login after account creation

**Title:** Account Terms and Acknowledgments

**Content:**

```
By continuing to use Noesis.io Health, you acknowledge:

□ I have read and agree to the Noesis.io Health Terms of Service
□ I have read and agree to the Noesis.io Health Privacy Policy
□ I acknowledge this is a healthcare administration platform, not medical advice
□ I understand all my data will be deleted when the platform restarts or my session expires
□ I confirm I am authorized to use this Service on behalf of my organization

[All checkboxes must be checked to proceed]

[Continue] [Decline & Logout]
```

**User-Friendly Note:** "Server restart" means the application is restarted — all data you entered (claims, messages, etc.) will be permanently deleted. This typically happens during platform updates or unexpected outages.

**Functional Requirements:**
- User must check all 5 checkboxes before clicking "Continue"
- Clicking "Decline & Logout" terminates the session
- Display only once per user account (track via in-memory or session flag)
- Log acceptance with timestamp and user ID

---

## 2. Healthcare Disclaimer Acknowledgment

**Display:** On first login (after Terms acceptance)

**Title:** Important Healthcare Disclaimers

**Content:**

```
IMPORTANT: Please read and acknowledge the following disclaimers:

This Service is NOT:
• Medical advice, diagnosis, or treatment recommendations
• An emergency medical service
• A substitute for licensed physicians or healthcare professionals
• A guarantee that claims will be approved or denied
• NOT HIPAA-certified or secure for Protected Health Information (PHI)

The Strategy Engine (claims scoring) is:
• Rules-based, not artificial intelligence
• Analytical / informational decision-support only
• NOT a guarantee of claim outcomes
• NOT a replacement for professional claims management

I acknowledge and understand these limitations:

□ I have read these disclaimers and understand this is administrative software only
□ I will not rely solely on this Service for medical, claims, or compliance decisions
□ I will not use this Service for production healthcare operations without persistence

[Checkboxes must both be checked to proceed]

[I Understand] [Decline & Logout]
```

**Functional Requirements:**
- User must check both checkboxes before clicking "I Understand"
- Clicking "Decline & Logout" terminates the session
- Display only once per user account
- Log acceptance with timestamp, user ID, and version number

---

## 3. Claims Submission Acknowledgment

**Display:** Before user can submit a claim through the API or UI

**Title:** Claims Submission Acknowledgment

**Content:**

```
Before you submit a claim, please acknowledge:

□ I confirm that all information in this claim is accurate and complete
□ I understand the Strategy Engine score is decision-support only and does NOT guarantee approval
□ I will independently verify all claim data before submission to a payer
□ I acknowledge this platform does not have persistent storage

[Continue with Submission] [Cancel]
```

**Functional Requirements:**
- Display in modal dialog or form step
- User must check all 3 checkboxes
- Log submission acknowledgment with timestamp, user ID, and claim ID
- Include in API response: `submissionAcknowledgedAt`, `submissionAcknowledgedBy`

---

## 4. NPI Lookup Disclaimer

**Display:** Before or after NPI Registry lookup

**Title:** NPI Registry Data Disclaimer

**Content:**

```
The National Provider Index (NPI) data displayed below comes from the 
Centers for Medicare & Medicaid Services (CMS). This data:

• May be outdated or incomplete
• Should be independently verified before use
• Does not confirm current licensing or practice status
• Does not confirm payer participation

IMPORTANT: Always verify provider credentials directly with:
- State licensing boards
- Professional credentialing services
- Payer directories
- The provider's office directly

This data is informational only and should not be the sole source for 
credentialing or network decisions.
```

**Functional Requirements:**
- Display as an alert/banner above NPI search results
- No checkbox required (informational notice)
- Dismissible by user (clicking X hides notice for session)

---

## 5. FDA Drug/Device Search Disclaimer

**Display:** Before or after OpenFDA drug or device search

**Title:** OpenFDA Data Disclaimer

**Content:**

```
The drug and device information displayed below comes from the FDA's 
OpenFDA public database. This data:

• May not reflect current drug labeling or device information
• May contain incomplete adverse event reporting
• Is informational only and NOT approved medical guidance
• Should NOT be used as the sole source for clinical decisions

For clinical decision-making, consult:
- Current FDA-approved prescribing information
- Licensed pharmacists or prescribers
- Clinical pharmacology resources (Micromedex, UpToDate, etc.)
- Current clinical practice guidelines

This data is for informational and compliance review purposes only.
```

**Functional Requirements:**
- Display as an alert/banner above FDA search results
- No checkbox required (informational notice)
- Dismissible by user (clicking X hides notice for session)

---

## 6. Compliance Scoring Disclaimer

**Display:** On compliance assessment feature

**Title:** Compliance Scoring Limitations

**Content:**

```
IMPORTANT: This compliance assessment is informational only and is NOT:
• A professional compliance audit
• A HIPAA certification
• A guarantee that your organization is compliant
• A substitute for professional compliance consulting
• Sufficient for regulatory agency submission

This assessment is based on controls you report to this platform. 
Your organization remains solely responsible for actual compliance with:
- HIPAA Security Rule requirements
- HIPAA Privacy Rule requirements
- Applicable state and federal healthcare laws
- Industry standards and best practices

Use this assessment for internal guidance only. 
Consult a healthcare compliance professional for authoritative assessment.
```

**Functional Requirements:**
- Display prominently on compliance dashboard
- Required acknowledgment before saving assessment:
  ```
  □ I understand this is informational assessment only
  □ I acknowledge my organization is responsible for actual compliance
  
  [Save Compliance Assessment] [Cancel]
  ```
- Log acknowledgment with timestamp and user ID

---

## 7. Data Persistence Disclaimer

**Display:** On dashboard or home page (persistent banner)

**Title:** Important: Data Persistence

**Content:**

```
⚠ IMPORTANT NOTICE ⚠

This platform stores all data in memory ONLY.
All data (claims, messages, contracts, etc.) is DELETED when the 
server restarts.

DO NOT use this for:
- Production claims processing
- Critical business workflows
- Mission-critical data that must be preserved
- Regulatory compliance documentation

This is a prototype platform. Data recovery is NOT possible.
```

**Functional Requirements:**
- Display as a permanent alert/banner at top of dashboard
- Not dismissible (users can minimize but not permanently close)
- Color: Red or orange background to indicate importance
- Update banner if platform gains persistence features
- Font size: Larger than body text (16px minimum) for visibility
- Icon: Warning icon (⚠) or exclamation mark for emphasis

---

## 8. Email Verification Disclaimer

**Display:** During account registration (if email verification is implemented)

**Title:** Email Verification

**Content:**

```
We will send a verification link to the email address you provided.

Please note:
□ Check your spam/junk folder if you don't see the email
□ Verification links expire after 24 hours
□ You can request a new verification link
□ Your account will not be activated until email is verified
```

**Functional Requirements:**
- Display after user enters email
- Informational (no checkboxes required)
- Send verification email with token and expiration

---

## 9. Password Reset Disclaimer

**Display:** During password reset flow

**Title:** Password Reset

**Content:**

```
A password reset link has been sent to [user email].

For security:
• This link expires in 24 hours
• Do not share this link with others
• If you did not request a password reset, ignore this email
• If you continue to have issues, contact support at [email]
```

**Functional Requirements:**
- Informational notice
- Display confirmation message after reset email sent
- Log password reset request with timestamp and user ID

---

## 10. Session Timeout Warning

**Display:** After user has been inactive for N minutes (recommend 20 min) or before session expires (recommend 5 minute warning)

**Title:** Session Timeout Warning

**Content:**

```
⚠ Your session will expire in 5 minutes due to inactivity.

Important: Any unsaved work will be lost when your session expires.

To continue working:
[Stay Logged In] [Save & Logout Now]

For security, idle sessions are automatically closed.
```

**Functional Requirements:**
- Display modal dialog (cannot be dismissed without action)
- "Stay Logged In" button resets the session timeout and returns to work
- "Save & Logout Now" button allows user to save/export data before session ends
- Auto-logout after 5 minute warning (do NOT show another warning)
- Log session timeout events with timestamp and user ID
- Make modal keyboard accessible (Tab key to navigate buttons)

---

## Consent Tracking and Logging

### What to Log

For each consent acknowledgment, log:
- Consent type (e.g., "TERMS_ACCEPTANCE", "HEALTHCARE_DISCLAIMER", "CLAIMS_SUBMISSION")
- User ID (or session ID if user ID unavailable)
- Timestamp (ISO 8601 format)
- IP address (optional but recommended)
- User agent / browser info (optional)
- Consent version number (if multiple versions exist)

### Storage Mechanism

Currently: Log to console and in-memory store (lost on restart)
Future: Log to persistent database for audit trail

### Example Log Entry

```json
{
  "consentType": "HEALTHCARE_DISCLAIMER",
  "userId": "user-12345",
  "timestamp": "2026-04-12T14:30:00Z",
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "version": "1.0",
  "checkboxes": ["checkbox_1", "checkbox_2"],
  "allChecked": true
}
```

---

## Consent Expiration and Renewal

### When Consent Expires

- **Session-based:** Consent expires when user logs out or session expires
- **Account-based:** Consent is per-account and does not expire unless:
  - User logs out and back in (must re-acknowledge on next login)
  - Consent language is updated/versioned (require re-acknowledgment)
  - User account is deleted and recreated

### Version Control

If this consent language is updated:
1. Assign a new version number (e.g., "1.0" → "1.1")
2. Require all users to re-acknowledge updated consent
3. Log which version each user acknowledged
4. Never accept consent to older versions as acceptance of new version

### Example Versioning

```
Consent Language History:
- v1.0 (April 12, 2026) — Initial release
- v1.1 (May 15, 2026) — Added Stripe disclaimer
- v2.0 (June 1, 2026) — Major update to compliance language
```

---

## Accessibility and Compliance

### Requirements for Consent Modals

- [ ] Text is readable (WCAG AA contrast standards)
- [ ] Checkboxes are keyboard accessible
- [ ] Modals are screen-reader compatible
- [ ] Mobile-responsive on phones and tablets
- [ ] No time limits to read and accept consent
- [ ] Users can scroll to see all content before accepting
- [ ] Clear language (avoid legal jargon where possible)

---

## Legal Notes

### Enforceability

These consents are intended to:
- Provide clear notice of important disclaimers and limitations
- Create documented user acknowledgment of risks
- Reduce liability in event of claims or disputes
- Demonstrate good-faith disclosure of platform limitations

### Limitations

- Consent does NOT protect Athena Core Technologies from all liability
- Users may still have rights even after acknowledging limitations
- Courts may reject or modify consent language based on context
- Professional guidance from legal counsel is recommended before deployment

---

**© 2026 Athena Core Technologies. All rights reserved.**
