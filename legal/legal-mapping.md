# Noesis.io Health — Legal Section Mapping

**Effective Date:** April 12, 2026  
**Version:** 1.0  
**Purpose:** Audit document showing which legal disclosures apply to which platform features and why

---

## Document Index

This directory contains the following legal documents:

1. **terms-of-service.md** — User agreement and terms for platform use
2. **privacy-policy.md** — Data collection and privacy practices
3. **disclaimer.md** — Healthcare and platform limitation disclaimers
4. **trademark-notice.md** — Brand and trademark protection
5. **consent-language.md** — Consent modals and acknowledgment language
6. **legal-mapping.md** — This file (mapping of features to legal disclosures)

---

## Sections INCLUDED in Legal Documents

### Why These Sections Are Required

| Feature | Legal Section | Document | Reason |
|---------|---------------|----------|--------|
| **Account Registration & Login** | Account Terms, Consent | ToS, Consent | Users must accept Terms and acknowledge disclaimers before using platform |
| **Claims Management** | Claims Processing Limitations, Strategy Engine Disclaimer, Healthcare Disclaimers | ToS, Disclaimer, Consent | Claims scoring is advisory only; not actual adjudication; requires user acknowledgment |
| **Prior Authorization Workflows** | Service Description, Healthcare Disclaimers | ToS, Disclaimer | Authorization tracking is administrative; not clinical decision-making |
| **Eligibility Verification** | Service Description, Third-Party APIs, Disclaimer | ToS, Privacy, Disclaimer | Mock payer data; must disclose this is not real payer API; data not persistent |
| **Provider-Payer Messaging** | Data Collection, User Responsibility | Privacy, ToS | Messages are not encrypted; not HIPAA-compliant without BAA |
| **NPI Registry Lookups** | Third-Party Integrations, NPI Registry Data, Privacy | ToS, Privacy, Disclaimer | Real API calls to CMS; user queries sent to external service; data may be inaccurate |
| **OpenFDA Drug/Device Search** | Third-Party Integrations, OpenFDA Disclaimer, Privacy | ToS, Privacy, Disclaimer | Real API calls to FDA; search terms sent to FDA servers; data is informational only |
| **Compliance Scoring** | Compliance Limitations, Healthcare Disclaimers | Disclaimer, Consent | Not a professional audit; not HIPAA certification; informational only |
| **Analytics Dashboard** | Analytics and Reporting, Sample Data, No Warranty | Disclaimer, ToS | Display sample/demo data only; not real metrics; for demonstration purposes |
| **File Uploads** | Data Retention, Data Loss | Privacy, ToS | Files accepted but not persisted; lost on server restart |
| **Authentication (JWT)** | Data Security, Account Security | Privacy, ToS | Mock credentials in dev mode; session-based authentication |
| **Rate Limiting** | Security Measures | Privacy | Implemented to prevent abuse; disclosed in Privacy Policy |
| **Intellectual Property** | IP Rights, Anti-Copy Protection | ToS, Trademark | Strategy Engine and platform code are proprietary; reverse engineering prohibited |
| **Stripe Billing** | Billing Integration Disclaimer, No Payments | ToS, Privacy | Stripe configured but not operational; no real payments processed |

---

## Sections EXCLUDED From Legal Documents

### Why These Sections Are NOT Included

| Section | Why Not Included | Real Status |
|---------|------------------|------------|
| **Billing/Subscription Terms** | No live payment processing system | Stripe is configured but in test mode only; no real charges to users |
| **Refund Policy** | No payments being collected | No refunds to issue; no billing infrastructure active |
| **File Upload/Storage Terms** | Files not persisted to storage | Upload UI exists but files stored in memory only; lost on server restart |
| **Persistent Data Backup** | No persistent database | All data is in-memory; no backup or recovery mechanism |
| **Data Export/Portability** | No persistent data to export | Data lost on server restart; cannot export historical records |
| **HIPAA/BAA Language** | No HIPAA compliance or certification | No Business Associate Agreement in place; no verified PHI handling |
| **EDI 837/835 Integration** | Not implemented | Architecture planned but not built; no EDI gateway operational |
| **HL7 FHIR Integration** | Not implemented | Architecture planned but not built; no FHIR endpoints operational |
| **Real Payer API Integration** | Not implemented | Eligibility responses are mocked; not calling real payer APIs |
| **Data Retention Policies** | No persistent data store | Data retention policy is: "lost immediately on server restart" |
| **SLA Commitments** | No SLA infrastructure | No uptime monitoring, no SLA guarantees, no guaranteed response times |
| **Enterprise Security Audit** | No audit completed | Not HIPAA-certified; no SOC 2 audit; no professional security assessment |
| **GDPR Compliance** | Not applicable | No EU operations; no GDPR data processing |
| **State Medical Board Licensing** | Not required | Software tool, not medical practice; licensing not applicable |
| **AI/ML Disclosures** | Strategy Engine is rules-based, not ML | Strategy Engine uses deterministic rules; no machine learning |
| **Cookie Consent Banner** | Only session cookies used | No tracking, advertising, or third-party cookies requiring consent |
| **Audit Log Retention** | Logs not persisted | Audit logs displayed in UI but not saved to persistent storage |
| **Free Trial Terms** | No trial system implemented | No trial signup flow; no trial period management |
| **Enterprise Integration Framework** | Not implemented | No enterprise connector infrastructure; planned for future |

---

## Feature-to-Document Mapping

### Claims Management

**Primary Disclosures:**
- Terms of Service § 2.2 (Service Limitations)
- Terms of Service § 7.1 (Healthcare Disclaimers)
- Disclaimer § Strategy Engine Disclaimer
- Consent § Claims Submission Acknowledgment

**User Acknowledgments Required:**
- ✓ Claims Submission Modal (before claim submission)
- ✓ Healthcare Disclaimer (on first login)

**Key Warnings:**
- Strategy Engine scoring is advisory only
- Scores do NOT guarantee claim approval/denial
- Rules-based system, not AI
- Not actual claims adjudication
- Not production-ready

---

### Provider-Payer Communication (Messaging)

**Primary Disclosures:**
- Privacy Policy § 2.1 (Information You Provide)
- Privacy Policy § 8 (Data Security)
- Terms of Service § 3.2 (Account Responsibility)

**Key Warnings:**
- Messages are not encrypted
- Messages are in-memory only; lost on restart
- Not HIPAA-compliant without BAA
- Users responsible for sensitive data they share

**No Consent Required:** Messages accepted as part of general Terms acceptance

---

### Eligibility Verification

**Primary Disclosures:**
- Terms of Service § 2.2 (Service Limitations — "Not real payer")
- Terms of Service § 6 (Third-Party Integrations)
- Disclaimer § No Warranty (mock data)
- Privacy Policy § 4.1 (Eligible Query Data to Third Parties)

**Key Warnings:**
- Eligibility responses are MOCKED
- NOT calling real payer APIs
- Data displayed is for demonstration only
- Do NOT rely on eligibility data for patient care decisions

**No Consent Required:** Covered by Terms acceptance

---

### NPI Registry Lookup

**Primary Disclosures:**
- Terms of Service § 6 (Third-Party Integrations)
- Privacy Policy § 4.1 (NPI Registry API disclosure)
- Privacy Policy § 4.3 (CMS data handling practices)
- Disclaimer § NPI Registry Data Disclaimer

**User Acknowledgments Required:**
- ✓ NPI Lookup Disclaimer (before/after lookup)

**Key Warnings:**
- REAL API calls to CMS
- Your search queries sent to external server
- Data may be outdated
- Must independently verify provider credentials
- CMS may retain query logs

---

### OpenFDA Drug/Device Search

**Primary Disclosures:**
- Terms of Service § 6 (Third-Party Integrations)
- Privacy Policy § 4.1 (OpenFDA API disclosure)
- Privacy Policy § 4.3 (FDA data handling)
- Disclaimer § OpenFDA Data Disclaimer

**User Acknowledgments Required:**
- ✓ FDA Drug/Device Search Disclaimer (before/after search)

**Key Warnings:**
- REAL API calls to FDA
- Your search terms sent to FDA servers
- Data may be incomplete
- Not medical guidance
- Informational purposes only

---

### Compliance Scoring

**Primary Disclosures:**
- Terms of Service § 2.2 (Service Limitations — "not a compliance audit")
- Disclaimer § Compliance Scoring Disclaimer
- Consent § Compliance Scoring Disclaimer

**User Acknowledgments Required:**
- ✓ Compliance Scoring Disclaimer (before saving assessment)

**Key Warnings:**
- Informational assessment only
- NOT a professional audit
- NOT HIPAA certification
- NOT a guarantee of compliance
- Organizations responsible for actual compliance

---

### Analytics Dashboard

**Primary Disclosures:**
- Terms of Service § 2.1 (Platform Overview — "demo data")
- Disclaimer § Analytics and Reporting Disclaimer
- Terms of Service § 9.1 (AS-IS Service)

**Key Warnings:**
- Analytics show SAMPLE/DEMO DATA only
- NOT real production metrics
- Do NOT submit to regulators or payers
- For internal guidance only
- Accuracy depends on user data entry

**No Consent Required:** Covered by Terms acceptance

---

### Account Management

**Primary Disclosures:**
- Terms of Service § 3 (Account Registration and Security)
- Privacy Policy § 2.1 (Account Information)
- Terms of Service § 4 (Permitted Use)

**User Acknowledgments Required:**
- ✓ Account Terms Acceptance (on first login)

**Key Responsibilities:**
- User responsible for protecting login credentials
- User responsible for all account activity
- Account termination permitted for Terms violations

---

### Data Privacy and Security

**Primary Disclosures:**
- Privacy Policy § 2 (Information We Collect)
- Privacy Policy § 3 (How We Use Information)
- Privacy Policy § 4 (Third-Party Data Sharing)
- Privacy Policy § 5 (Data Security)
- Privacy Policy § 6 (Data Retention and Deletion)

**Key Disclosures:**
- Data stored in memory only
- Lost on server restart
- Session cookies for auth only
- No tracking cookies
- Real API calls to CMS (NPI) and FDA

---

### Intellectual Property

**Primary Disclosures:**
- Terms of Service § 5 (Intellectual Property Rights)
- Trademark Notice § All sections

**Key Protections:**
- Platform code owned by Athena Core Technologies
- Strategy Engine algorithms proprietary
- Reverse engineering prohibited
- Noesis.io trademark protected
- Unauthorized use prohibited

---

### Medical/Healthcare Guarantees

**Primary Disclosures:**
- Terms of Service § 7 (Healthcare Disclaimers)
- Disclaimer § All sections
- Consent § Healthcare Disclaimer Acknowledgment

**Key Disclaimers:**
- ✗ NOT medical advice
- ✗ NOT clinical decision support
- ✗ NOT diagnosis/treatment
- ✗ NOT emergency service
- ✗ NOT substitute for licensed providers

**User Acknowledgments Required:**
- ✓ Healthcare Disclaimer (on first login)

---

## Open Questions for Legal Counsel

The following items require legal guidance from Athena Core Technologies counsel:

### Jurisdiction and Governing Law

**Issue:** Terms of Service § 13.1 currently says "[State to be determined]"

**Recommendation:** Consult counsel to select:
- Governing law state (recommend Delaware or New York)
- Jurisdiction and venue (consider arbitration clause)
- Arbitration provider (JAMS, AAA, etc.)

**Timeline:** Before production launch

---

### Trademark Registration

**Issue:** Noesis.io and Noesis.io Health are not yet registered with USPTO

**Recommendation:** File federal trademark applications with USPTO in:
- **Class 42:** Software as a Service (SaaS) for healthcare
- **Class 44:** Healthcare provider information services
- Consider international protection (Madrid Protocol) if planning expansion

**Timeline:** As soon as possible; protects mark back to filing date

---

### BAA Template and HIPAA Compliance

**Issue:** Currently no Business Associate Agreement (BAA) in place

**Recommendation:** When HIPAA-compliant features are built, work with counsel to:
- Develop BAA template compliant with 45 CFR §§ 164.502, 164.504
- Implement HIPAA-compliant architecture (encryption, audit logs, breach notification)
- Pursue HIPAA compliance certification
- Implement Business Associate onboarding and BAA execution process

**Timeline:** Before accepting PHI from Covered Entities

---

### Professional Liability and E&O Insurance

**Issue:** No professional liability (E&O) or cyber liability coverage mentioned

**Recommendation:** Before production launch:
- Obtain professional liability insurance (E&O) for healthcare tech
- Obtain cyber liability and data breach insurance
- Obtain general liability insurance
- Ensure coverage includes regulatory penalties and defense costs

**Timeline:** Before production launch

---

### State Licensing and Regulatory Compliance

**Issue:** Unclear whether state licensing is required for healthcare software

**Recommendation:** Consult regulatory counsel regarding:
- State medical board licensing requirements (if any) for healthcare administration software
- State insurance commissioner requirements (if providing insurance-related services)
- State health department requirements (if applicable)
- CMS Medicare compliance requirements

**Timeline:** Before production launch

---

### Data Residency and Hosting

**Issue:** Privacy Policy mentions "[geographic location to be determined]"

**Recommendation:** Determine:
- Server/hosting geographic location
- Data center location (US, EU, other)
- Data residency requirements for any covered entities
- Cross-border data transfer compliance

**Timeline:** Before production deployment

---

### Dispute Resolution and Arbitration

**Issue:** Terms of Service § 13.2 says "[To be determined by counsel]"

**Recommendation:** Decide on:
- Binding arbitration clause (yes/no)
- Arbitration provider (JAMS, AAA, other)
- Arbitration scope and procedures
- Class action waiver
- Fee-shifting provisions

**Timeline:** Before final Terms of Service publication

---

### Third-Party API Terms and Compliance

**Issue:** NPI Registry and OpenFDA data are used via real API calls

**Recommendation:** Verify ongoing compliance with:
- CMS NPI Registry API terms of service and usage restrictions
- OpenFDA API terms and usage limits
- Rate limiting and caching requirements
- Proper attribution and disclaimer requirements
- Compliance monitoring

**Timeline:** Before production launch

---

### Cookie Policy and CCPA/State Privacy Law Compliance

**Issue:** Privacy Policy addresses cookies but not comprehensive CCPA compliance

**Recommendation:** As platform scales:
- Implement CCPA consumer rights (access, delete, opt-out, non-discrimination)
- Implement state privacy law compliance (CPRA, CPA, CTDPA, VCDPA, UCPA)
- Create comprehensive Cookie Policy
- Consider privacy-by-design architecture

**Timeline:** Before accepting California or other regulated-state users

---

### GDPR Compliance (if expanding to EU)

**Issue:** Currently not applicable; Privacy Policy notes no EU operations

**Recommendation:** If planning EU expansion:
- Engage GDPR-specialized counsel
- Implement Data Processing Agreement (DPA)
- Implement GDPR-compliant architecture (consent, data minimization, DPIA)
- Consider EU-based data hosting
- Implement individual data subject rights procedures

**Timeline:** Only if planning EU market

---

## Legal Document Versioning

### Current Version

- **Version:** 1.0
- **Effective Date:** April 12, 2026
- **Status:** Initial release

### Version Control Process

When updating legal documents:

1. **Increment Version Number**
   - Major changes (e.g., HIPAA compliance): 1.0 → 2.0
   - Medium changes (e.g., new feature disclaimers): 1.0 → 1.1
   - Minor changes (e.g., correcting contact info): 1.0 → 1.0.1

2. **Update Effective Date**
   - Effective Date is the date users must accept new version

3. **Notify Users**
   - Require re-acceptance of updated documents
   - Email notification of changes
   - Log which version each user accepted

4. **Archive Old Versions**
   - Keep copy of each version for audit trail
   - Store with user acceptance records

---

## Audit Trail

### What Should Be Logged

For each legal document acceptance:
- ✓ Document name and version
- ✓ User ID and email
- ✓ Acceptance timestamp
- ✓ User IP address
- ✓ User agent / browser
- ✓ Which checkboxes were checked
- ✓ Whether acceptance was required or optional

### Compliance Use

This audit trail documents:
- Proof of user notification of disclaimers
- Proof of user acknowledgment of limitations
- Evidence of good-faith disclosure
- Defensibility in litigation or regulatory inquiry

---

## Recommendations for Athena Core Technologies

### Immediate Actions (Before Production Launch)

1. [ ] Engage healthcare legal counsel
2. [ ] Select governing law and jurisdiction
3. [ ] Obtain professional liability insurance (E&O)
4. [ ] File federal trademark applications (USPTO)
5. [ ] Verify compliance with NPI Registry and OpenFDA API terms
6. [ ] Implement legal document acceptance logging
7. [ ] Set up audit trail for consent acceptance

### Short-term Actions (3-6 Months)

1. [ ] Implement HIPAA-compliant architecture if pursuing covered entity customers
2. [ ] Develop BAA template with counsel
3. [ ] Conduct security audit and implement findings
4. [ ] Implement state privacy law compliance (CCPA/CPRA minimum)
5. [ ] Update legal documents with jurisdiction and contact info

### Medium-term Actions (6-12 Months)

1. [ ] Pursue HIPAA compliance certification
2. [ ] Consider SOC 2 Type II audit
3. [ ] Develop enterprise BAA and DPA templates
4. [ ] Implement persistent data storage and retention policies
5. [ ] Update Privacy Policy and legal documents for new features

### Long-term Planning (12+ Months)

1. [ ] Consider GDPR compliance if expanding internationally
2. [ ] Implement comprehensive state privacy law framework
3. [ ] Develop customer data processing agreements
4. [ ] Consider industry certifications (HITRUST, other)
5. [ ] Revisit and update all legal documents annually

---

**© 2026 Athena Core Technologies. All rights reserved.**

**For questions about this legal mapping or to report discrepancies between legal documents and actual platform functionality, contact Athena Core Technologies legal counsel.**
