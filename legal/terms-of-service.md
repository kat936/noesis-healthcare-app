# Noesis.io Health — Terms of Service

**Effective Date:** April 12, 2026  
**Version:** 1.0  
**Operator:** Athena Core Technologies

---

## 1. Acceptance of Terms

By accessing, browsing, registering for, or otherwise using Noesis.io Health (the "Platform," "Service," "Application," or "Software"), you ("User," "You," or "Your") agree to be legally bound by these Terms of Service ("Terms"). These Terms, together with our Privacy Policy and all other policies incorporated by reference, constitute the entire agreement between you and Athena Core Technologies ("Company," "We," "Us," or "Our") regarding your use of the Service.

**If you do not agree to all provisions of these Terms, you must not access, download, install, register for, or use the Service in any manner.** Your use of the Service following any updates to these Terms constitutes your acceptance of such modifications.

You represent and warrant that:
- You have the legal authority to enter into this agreement
- If you are using this Service on behalf of an organization (healthcare provider, insurance company, billing service, or other business entity), you are authorized to bind such organization to these Terms
- You are at least 18 years of age and capable of entering into a binding contract
- All information you provide during registration is accurate, truthful, and complete
- You will comply with all applicable local, state, federal, and international laws

---

## 2. Description of Service

### 2.1 Platform Overview

Noesis.io Health is a healthcare administration and workflow management platform designed to assist healthcare organizations, medical practices, billing services, and compliance professionals with administrative tasks. The Service provides technology tools for:

- **Claims Management**: Claim tracking and status monitoring
- **Prior Authorization Workflows**: Authorization request management and tracking
- **Eligibility Verification**: Eligibility checking (mock data in current version)
- **Provider-Payer Communication**: Secure messaging and communication tools
- **Compliance Scoring**: Rules-based compliance assessment (informational only)
- **Analytics**: Claims analytics and reporting on sample/demo data
- **Data Integration**: Integration with National Provider Index (NPI Registry) and OpenFDA for drug/device lookups

### 2.2 Service Nature and Limitations

**The Service is an informational and workflow management platform.** It is NOT:

- A medical advice, diagnosis, or clinical decision support tool
- A healthcare provider, medical device, or diagnostic system regulated by FDA
- A substitute for licensed healthcare professionals, certified medical coders, healthcare compliance auditors, or legal counsel
- An emergency medical service or crisis resource
- A clinical care management or patient care system
- A real-time claims adjudication system (claims management is administrative workflow only)
- A real payer eligibility API (mock data for demonstration purposes)
- A HIPAA-certified platform (the platform implements HIPAA-aligned security measures but is NOT HIPAA-certified and no Business Associate Agreement is currently in place)

### 2.3 Data Processing and Persistence

**CRITICAL: This platform operates with in-memory data storage only.** All user data is stored in application memory and is lost when the server restarts. This includes:

- Claims data
- Authorization requests
- Messages
- Eligibility queries
- Contracts

**There is no persistent database.** Do not use this Service for production claims processing or any critical workflows where data preservation is required.

**Data is processed for administrative purposes only.** The Service collects and processes:
- Email addresses
- User role and organization information
- Claims data you enter (procedure codes, diagnostic codes, amounts, provider/member information)
- NPI lookup queries (sent to CMS)
- FDA drug/device search queries (sent to OpenFDA)
- Session metadata and IP addresses

**This Service does NOT process clinical patient health information (Protected Health Information/PHI per HIPAA) in any persistent manner.** If your use involves HIPAA-regulated PHI, a separate Business Associate Agreement must be in place. Such data received is not retained.

---

## 3. Account Registration and Security

### 3.1 Account Information

To use the Service, you must create an account by providing:
- Full name
- Business email address
- Organization name and type
- Job title and role

You represent and warrant that all information provided is true and accurate.

### 3.2 Account Responsibility

- You are solely responsible for maintaining the confidentiality of your login credentials
- You must use a strong password and change it regularly
- You must immediately notify us of any unauthorized access or security breach
- You are responsible for all activity under your account

### 3.3 Account Suspension and Termination

We reserve the right to suspend or terminate your account if:
- We detect suspicious or unauthorized activity
- You violate these Terms
- Your account is used for fraudulent, illegal, or harmful purposes
- We have reasonable grounds to believe the Service is being misused

---

## 4. Permitted Use

You may use the Service only for:
- Lawful healthcare administrative purposes
- Internal business use by authorized organization employees
- Demonstration and testing purposes

### 4.1 Prohibited Conduct

You must NOT:
- Use automated scripts, bots, scrapers, or any mechanism to extract or copy data or functionality from the Service
- Reverse engineer, decompile, or attempt to discover the proprietary strategy engine or compliance scoring algorithms
- Copy, reproduce, adapt, translate, modify, or create derivative works based on the Service
- Attempt to circumvent security, authentication, or rate limiting
- Use the Service for competitive benchmarking or to develop a competing product
- Sell, resell, rent, lease, or provide access to the Service to third parties without authorization
- Remove or obscure any proprietary notices, trademarks, or copyright attributions
- Use the Service to transmit malware, viruses, or harmful code
- Use the Service to harass, threaten, or abuse others
- Use the Service for any illegal or fraudulent purpose
- Access or search the Service using any automated mechanism not authorized by us

---

## 5. Intellectual Property Rights

### 5.1 Ownership

**All intellectual property rights in the Service, including the platform code, strategy engine, compliance algorithms, user interface, documentation, and all other materials, are the exclusive property of Athena Core Technologies.** This includes:

- Noesis.io Health software and platform (© 2026 Athena Core Technologies)
- Strategy Engine (proprietary claims scoring rules and logic)
- Compliance Engine (proprietary compliance scoring)
- UI/UX design and layout
- Content, copy, graphics, logos, and all brand materials

### 5.2 License to Use

We grant you a limited, non-exclusive, non-transferable, revocable license to use the Service solely for the permitted purposes set out in Section 4, subject to these Terms. This license does not include the right to:
- Reproduce the Service
- Create derivative works
- Reverse engineer or access source code
- Sublicense to others
- Use the Service for competing purposes

### 5.3 User Content

You retain ownership of content you create and upload (claims data, messages, etc.) but grant us a worldwide, royalty-free license to use such content to operate the Service and improve our systems.

---

## 6. Third-Party Integrations

### 6.1 External APIs

The Service makes real API calls to:

- **National Provider Index (NPI Registry)** (operated by Centers for Medicare & Medicaid Services): When you perform NPI lookups, your search queries (provider names, NPI numbers) are transmitted to CMS servers at https://npiregistry.cms.hhs.gov/api/. These calls are subject to CMS terms and privacy policies.

- **OpenFDA** (operated by FDA): When you search for drugs or devices, your search terms are transmitted to FDA servers at https://api.fda.gov/. These calls are subject to FDA terms and privacy policies.

### 6.2 Disclaimer on Third-Party Data

We are not responsible for the accuracy, completeness, or timeliness of data returned by third-party APIs. NPI Registry data may be outdated. OpenFDA drug and device data is informational and may not reflect current labeling. You are responsible for independently verifying all third-party data before relying on it.

### 6.3 Stripe Integration (Billing)

Stripe integration is configured but is currently in test/demo mode only. No real payments are processed through this Service at this time.

---

## 7. Healthcare Disclaimers

### 7.1 Not Medical Advice

**The Service does not provide medical advice, diagnosis, or treatment recommendations.** The Service is for healthcare administrative purposes only. It should never be used as a substitute for:
- Licensed physicians or healthcare providers
- Clinical decision-making or clinical trial protocols
- Medical coding by certified coders
- Legal advice from healthcare attorneys
- Emergency medical services

### 7.2 Not Emergency Service

**The Service is NOT an emergency medical service.** If you or anyone else is experiencing a medical emergency, call 911 or your local emergency number immediately. Do not use this Service to report or manage emergencies.

### 7.3 Strategy Engine Limitations

The Strategy Engine is a **deterministic rules-based system**, not an artificial intelligence or machine learning system. Its claims scoring is informational and advisory only:

- Scores do NOT guarantee claims will be approved or denied by payers
- Scores do NOT represent actual claim adjudication
- Scores are based on generic rules and may not account for contract-specific terms
- Scores should never be the sole basis for claims decisions
- Claim denial rates, approval predictions, and payment estimates are not guaranteed

### 7.4 Compliance Scoring Limitations

Compliance scoring is **informational assessment only**, not:
- A compliance audit
- A HIPAA certification
- Legal advice
- A guarantee of regulatory compliance
- A substitute for professional compliance consulting

Your organization remains solely responsible for HIPAA compliance, regulatory compliance, and security.

### 7.5 No Professional Relationship

Your use of the Service does not create a physician-patient relationship, attorney-client relationship, fiduciary relationship, or professional relationship of any kind. Athena Core Technologies is not your healthcare provider, legal advisor, or compliance consultant.

---

## 8. Data Security

The Service implements reasonable security measures appropriate for a prototype platform:

- TLS/SSL encryption for data in transit
- Rate limiting to prevent abuse
- Input validation (Zod schemas)
- JWT authentication (mock credentials in development)
- MIME type validation for file uploads
- Helmet.js security headers

**However, the Service does NOT guarantee absolute security.** No security system is perfect. You use the Service at your own risk.

---

## 9. Disclaimers and Limitations

### 9.1 AS-IS Service

**THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. THIS DISCLAIMER IS CONSPICUOUS AND BINDING UNDER THE UNIFORM COMMERCIAL CODE (UCC).**

We disclaim all warranties, including:
- Fitness for a particular purpose
- Merchantability
- Non-infringement
- Title
- Accuracy or completeness
- Absence of defects or errors
- Uninterrupted or error-free operation

### 9.2 No SLA or Uptime Guarantees

We do NOT guarantee:
- Continuous availability or uptime
- Service response times
- Data persistence or backup
- Recovery time from failures
- Feature availability

### 9.3 Data Loss Disclaimer

**All data in the Service is stored in application memory and is lost when the server restarts.** We are not responsible for:
- Data loss
- Data corruption
- Delayed data processing
- Inability to retrieve data

### 9.4 No Liability for Third-Party Data

We are not liable for:
- Errors in NPI Registry data
- Errors in OpenFDA data
- Delayed or unavailable third-party APIs
- Data disclosed to third-party services
- Third-party terms of service violations

---

## 10. Limitation of Liability

**TO THE MAXIMUM EXTENT PERMITTED BY LAW, ATHENA CORE TECHNOLOGIES SHALL NOT BE LIABLE FOR:**

- **Any indirect, incidental, special, consequential, punitive, or exemplary damages (including loss of profits, revenue, data, use, or goodwill)**
- **Damages exceeding the total fees paid by you in the past 12 months (or ONE HUNDRED DOLLARS ($100.00), whichever is greater)**
- **Any claims arising from healthcare decisions, patient outcomes, claim denials, regulatory violations, or HIPAA breaches**
- **Any claims arising from third-party data, APIs, or integrations**
- **Any claims arising from data loss, corruption, or unavailability**
- **Any claims arising from security breaches or unauthorized access**

**THIS LIMITATION OF LIABILITY IS BINDING AND APPLIES EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. THIS DISCLAIMER IS CONSPICUOUS UNDER APPLICABLE LAW.**

---

## 11. Indemnification

You agree to indemnify, defend, and hold harmless Athena Core Technologies, its officers, directors, employees, agents, and affiliates from any and all claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising from:

- Your use or misuse of the Service
- Your violation of these Terms
- Your violation of applicable laws
- Healthcare decisions made based on Service output
- Claims data you submit or authorize
- Your breach of your representations and warranties

---

## 12. Termination

We may terminate your access to the Service immediately, with or without cause, by:
- Disabling your account
- Revoking your access credentials
- Sending written notice

Upon termination:
- Your right to use the Service ceases immediately
- All data stored in your account is deleted (note: data is lost on server restart anyway)
- Sections 5, 6, 7, 9, 10, 11, and 13 survive termination

---

## 13. General Provisions

### 13.1 Governing Law

These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law principles. The parties agree that Delaware law governs all disputes, regardless of any conflict of law rules.

### 13.2 Arbitration, Class Action Waiver, and Dispute Resolution

#### 13.2.1 Binding Arbitration

**EXCEPT AS PROVIDED BELOW, ANY AND ALL DISPUTES, CLAIMS, OR CONTROVERSIES ARISING OUT OF OR RELATING TO THESE TERMS, THE SERVICE, OR YOUR USE OF THE SERVICE SHALL BE FINALLY RESOLVED BY BINDING ARBITRATION ADMINISTERED BY JAMS (JUDICIAL ARBITRATION AND MEDIATION SERVICES) IN ACCORDANCE WITH ITS COMPREHENSIVE ARBITRATION RULES AND PROCEDURES.**

#### 13.2.2 Arbitration Procedures

- **Governing Rules:** The arbitration shall be conducted under JAMS Comprehensive Arbitration Rules & Procedures (as modified by this section)
- **Arbitrator:** A single neutral arbitrator selected by JAMS
- **Location:** The arbitration shall take place in [**State to be determined**], or such other location as mutually agreed by the parties
- **Costs:** Athena Core Technologies shall bear all JAMS administration and arbitrator fees; you are responsible only for your attorney's fees (if applicable)
- **Discovery:** Discovery shall be limited as specified by JAMS rules; parties may request expanded discovery for good cause
- **Award:** The arbitrator shall issue a written decision with findings of fact and conclusions of law. Judgment on the award may be entered in any court of competent jurisdiction.
- **Confidentiality:** The arbitration proceeding and award shall be confidential, except as required by law

#### 13.2.3 Class Action and Jury Trial Waiver

**YOU ACKNOWLEDGE AND AGREE THAT:**

1. **NO CLASS ACTIONS:** You may not assert or participate in any class action, collective action, representative action, or private attorney general action against Athena Core Technologies. All disputes must be resolved individually in arbitration.

2. **NO JURY TRIAL:** YOU WAIVE YOUR RIGHT TO TRIAL BY JURY. Any claim shall be resolved by binding arbitration before a single arbitrator, not by judge or jury.

3. **NO CONSOLIDATION:** Arbitration shall proceed on an individual basis only. You may not consolidate claims with other users, and the arbitrator may not consolidate multiple disputes.

4. **WAIVER ACKNOWLEDGMENT:** YOU UNDERSTAND THAT WAIVING CLASS ACTION AND JURY TRIAL RIGHTS IS A SIGNIFICANT CHANGE TO YOUR LEGAL RIGHTS AND THAT YOU ARE GIVING UP POTENTIALLY IMPORTANT RIGHTS.

#### 13.2.4 Exceptions to Arbitration

**The following are NOT subject to arbitration:**

- **Injunctive Relief:** Either party may seek preliminary or permanent injunctive relief in court to prevent irreparable harm, trademark infringement, breach of confidentiality, or misappropriation of trade secrets
- **Small Claims Court:** Either party may bring a claim in small claims court instead of arbitration if the claim is within that court's jurisdiction
- **Administrative Proceedings:** Government agency proceedings (not arbitration) regarding statutory claims that cannot be arbitrated

#### 13.2.5 Opt-Out Right

**YOU HAVE THE RIGHT TO OPT OUT OF THIS ARBITRATION AGREEMENT.** To opt out:

1. Send written notice to Athena Core Technologies within **30 days of first accepting these Terms**
2. Send notice by certified mail to: **Athena Core Technologies Legal Department, [Address to be provided]**
3. Include your name, email address, and account information
4. State clearly: "I opt out of the arbitration agreement in the Terms of Service"

**If you timely opt out, this arbitration agreement shall not apply to you, and any disputes shall be resolved in court under Section 13.2.6 below.**

#### 13.2.6 Governing Court (If Arbitration Waived or Inapplicable)

If arbitration does not apply, you and Athena Core Technologies agree to submit to the exclusive jurisdiction of the courts located in [**State to be determined**], and you consent to personal jurisdiction in such courts. You waive any objection to venue or inconvenient forum in such courts.

### 13.3 Entire Agreement

These Terms, together with the Privacy Policy and any incorporated policies, constitute the entire agreement between you and Athena Core Technologies regarding the Service and supersede all prior or contemporaneous agreements, understandings, and negotiations.

### 13.4 Severability

If any provision of these Terms is found to be invalid, illegal, or unenforceable by a court of competent jurisdiction:

- That provision shall be severed or modified to the minimum extent necessary to make it enforceable
- The remaining provisions shall remain in full force and effect
- The parties agree that if the provision cannot be salvaged, they will negotiate in good faith to replace it with a provision that achieves the original intent
- This severability clause shall not apply to the class action waiver (Section 13.2.3), which is material to this agreement

### 13.5 Waiver

No waiver of any provision of these Terms shall be effective unless in writing and signed by an authorized representative of the waiving party. Our failure to enforce any right does not constitute a waiver of that right, and we reserve the right to enforce such right at any time.

### 13.7 Force Majeure

Neither party shall be liable for any failure or delay in performing its obligations under these Terms if such failure or delay results from causes beyond the party's reasonable control, including but not limited to:

- Acts of God (earthquakes, floods, hurricanes, pandemics)
- War, terrorism, or hostile military action
- Government action or regulation
- Internet service provider failures or outages
- Third-party API failures (CMS NPI Registry, OpenFDA)
- Utility failures (power outages)

**Exception:** Force majeure shall NOT excuse payment obligations or data security requirements.

### 13.8 Assignment

You may not assign these Terms or your rights or obligations under these Terms without our prior written consent. We may assign these Terms to any successor entity without notice. Any assignment in violation of this section is void. If we assign these Terms to an entity that competes with your business, you have the right to terminate your account and receive a refund of any unused fees (if applicable).

### 13.9 Contact

For questions about these Terms or to exercise your opt-out right from arbitration, contact Athena Core Technologies at:

**Athena Core Technologies Legal Department**
- Email: [**legal@athenacoretech.com** — to be provided]
- Mailing Address: [**physical address to be provided**]

---

**© 2026 Athena Core Technologies. All rights reserved.**
