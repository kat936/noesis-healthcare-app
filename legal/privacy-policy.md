# Noesis.io Health — Privacy Policy

**Effective Date:** April 12, 2026  
**Version:** 1.0  
**Operator:** Athena Core Technologies

---

## 1. Overview

This Privacy Policy describes how Noesis.io Health (the "Service," "Platform," or "Application") collects, uses, and handles your information. We are committed to transparency about our data practices.

**CRITICAL NOTICE:** This Service stores all data in application memory only. Data is not persisted between server restarts. Do not expect data to be retained.

---

## 2. Information We Collect

### 2.1 Information You Provide

When you register and use the Service, we collect:

- **Account Information**: Full name, business email address, organization name and type, job title and role
- **Claims Data**: Any claims information you enter into the system, including procedure codes (CPT), diagnostic codes (ICD-10), member identifiers, claim amounts, provider information, and related billing data
- **Authorization Requests**: Prior authorization request data you create
- **Messages**: Text of any messages you send through the Service's messaging feature
- **Eligibility Queries**: Patient eligibility queries you submit (member names, dates of birth, member IDs, payer IDs)
- **NPI Lookups**: Provider names and NPI numbers you search for
- **FDA Searches**: Drug names, device names, and search terms you query
- **Contract Data**: Payer contract terms you upload or create
- **Compliance Data**: Any compliance-related configuration or assessment data you create

### 2.2 Information Collected Automatically

When you use the Service, we automatically collect:

- **Session Information**: Your session ID, authentication token, login timestamp, and logout timestamp
- **IP Address**: Your Internet Protocol (IP) address
- **Browser Information**: Browser type, version, and user agent string
- **Timestamps**: Dates and times of your activities
- **Usage Data**: Which features you access, endpoints you call, and actions you perform

### 2.3 Cookies

The Service uses session cookies only:
- **Session Authentication Cookie**: Required to maintain your login session
- These cookies are not advertising, tracking, or third-party cookies
- You can manage cookie preferences in your browser settings

We do NOT use:
- Tracking cookies
- Analytics cookies
- Advertising cookies
- Third-party cookies

---

## 3. How We Use Your Information

We use collected information to:

- **Operate the Service**: Authenticate your sessions, process your requests, and deliver requested features
- **Process NPI Lookups**: Send your NPI search queries to the National Provider Index (CMS) API to retrieve provider information
- **Process FDA Searches**: Send your drug/device search terms to the OpenFDA API to retrieve drug and device information
- **Service Improvement**: Understand feature usage and identify bugs or performance issues
- **Compliance**: Comply with legal obligations and enforce our Terms of Service
- **Analytics**: Generate usage reports and analytics (using sample/demo data)

We do NOT use your information to:
- Build profiles for targeting or discrimination
- Sell or share your personal information with advertisers
- Create medical or clinical profiles
- Make automated decisions about your healthcare claims
- Track you across websites or applications

---

## 4. Third-Party Data Sharing

### 4.1 Required Disclosures

When you use certain features, data is transmitted to third parties:

**National Provider Index (NPI Registry)**
- When you perform NPI lookups, your search query (provider names, NPI numbers) is sent to the CMS NPI Registry API at https://npiregistry.cms.hhs.gov/api/
- This is governed by CMS's privacy policy and terms of service
- CMS may retain this data per their records retention policies

**OpenFDA**
- When you search for drugs or devices, your search terms are sent to the FDA's OpenFDA API at https://api.fda.gov/
- This is governed by FDA's privacy policy and terms of service
- The FDA may retain query logs per their policies

### 4.2 No Other Sharing

**We do NOT share, sell, or disclose your information to:**
- Advertising networks or data brokers
- Analytics services or marketing platforms
- Any third parties beyond NPI Registry and OpenFDA (required for function)
- Stripe (billing service configured but not operational)
- Any other external services

### 4.3 Disclaimer on Third-Party Practices

We are not responsible for the privacy practices of CMS (NPI Registry) or FDA (OpenFDA). Their collection, use, and retention of your data is governed by their respective privacy policies and federal data handling requirements. Review their policies before using these lookup features.

---

## 5. Data Security

The Service implements reasonable security measures appropriate for a prototype platform:

### 5.1 In-Transit Security

- TLS 1.2+ encryption for all communications between your browser/client and the Service
- Secure HTTPS connections required for all API calls
- Helmet.js security headers for browser protection

### 5.2 Authentication and Access Control

- JWT (JSON Web Token) authentication for all API endpoints
- Session-based authentication (mock credentials in development mode)
- Role-based access control (RBAC) to limit user permissions by role
- Rate limiting to prevent unauthorized access attempts

### 5.3 Data Validation

- Strict input validation using Zod schemas on all inputs
- Whitelist-based validation for procedure codes, diagnostic codes, and other structured data
- MIME type validation for file uploads
- SQL injection and XSS prevention through parameterized queries and output encoding

### 5.4 Limitations

**We implement reasonable security for a prototype platform, but:**
- We do NOT guarantee absolute security or protection from all attack vectors
- This Service has NOT undergone a professional security audit
- This Service is NOT HIPAA-certified and NOT subject to HIPAA Security Rule requirements
- No security system is perfect; use at your own risk

### 5.5 No Data Breach Insurance

We do not maintain cyber liability insurance or breach notification coverage. In the event of a data breach, we will notify affected users in accordance with applicable state laws, but our liability is limited per Section 10 of the Terms of Service.

---

## 6. Data Retention and Deletion

### 6.1 Storage Architecture

**CRITICAL: All data is stored in application memory only.** This means:

- Data is held in RAM while the application is running
- Data is NOT written to a persistent database
- Data is NOT backed up or replicated
- Data is lost immediately when the server restarts
- No data recovery is possible

### 6.2 Automatic Deletion

All of your data (claims, messages, authorizations, contracts, etc.) is automatically deleted when:
- The application server restarts
- The hosting environment is reset
- Your session expires (typically 24 hours)
- The deployment is updated

### 6.3 No Data Retention Policies

Because data is not persistent, we do not maintain:
- Long-term retention policies
- Data backup procedures
- Data archival processes
- Data export capabilities
- Historical data for compliance audits

### 6.4 User-Initiated Deletion

Users cannot request data deletion because data is automatically lost on server restart. There is no persistent data store to delete from.

---

## 7. Data Subject Rights

### 7.1 Your Rights

You have the right to:
- Request information about what data we collect about you (email contact below)
- Understand how your data is used
- Know if your data is shared with third parties

### 7.2 Limitations Due to Architecture

Because we do not maintain persistent data:
- We cannot provide a copy of your historical data (it doesn't exist after server restart)
- We cannot delete data (it's automatically deleted on restart)
- We cannot provide a portable copy of data for export to another service
- We cannot confirm long-term retention or provide retention periods

---

## 8. Cookies and Tracking

### 8.1 Cookies We Use

**Session Authentication Cookie**
- Purpose: Maintain your login session
- Lifetime: Until browser close or session timeout
- Required for Service functionality
- No third-party cookies involved

### 8.2 Cookies We Do NOT Use

We do NOT use:
- Google Analytics or other web analytics cookies
- Advertising or retargeting cookies
- Social media tracking pixels
- Third-party tracking services
- Heat maps or session recording tools

### 8.3 Managing Cookies

You can manage cookies in your browser settings. However, disabling session cookies will prevent you from using the Service.

---

## 9. Children Under 18

The Service is not directed to individuals under 18 years of age. We do not knowingly collect personal information from children under 18. If we become aware that a child under 18 has provided us with personal information, we will delete such information and terminate the child's account.

---

## 10. Changes to This Privacy Policy

We may update this Privacy Policy at any time. Changes become effective when posted to the Service. Your continued use of the Service after changes constitutes acceptance of the updated policy.

We will notify users of material changes through:
- Email notification
- Posting a notice on the Service
- Requiring re-acceptance of updated Terms

---

## 11. Contact Us

For questions or concerns about this Privacy Policy or our data practices, contact:

**Athena Core Technologies**
- Email: [**contact email to be provided**]
- Address: [**business address to be provided**]

For concerns about specific data handling practices, please include:
- Your account email address
- Description of your concern
- Specific data or features involved
- Your preferred resolution

---

## 12. Legal Compliance Notice

### 12.1 HIPAA Compliance

**CRITICAL: This Service is NOT HIPAA-compliant and does NOT have a Business Associate Agreement (BAA) in place.**

**If you handle Protected Health Information (PHI) as defined by HIPAA (45 CFR § 160.103):**

- **DO NOT use this Service unless a BAA is executed FIRST**
- **You MUST contact Athena Core Technologies and execute a Business Associate Agreement BEFORE transmitting any PHI**
- **PHI transmitted without a BAA in place violates HIPAA Privacy and Security Rules**
- **You remain liable for HIPAA violations even if caused by unauthorized use of this Service**

**This Service is NOT appropriate for:**
- HIPAA Covered Entities (healthcare providers, health plans, healthcare clearinghouses)
- HIPAA Business Associates handling PHI
- Any use involving Protected Health Information

**If you need HIPAA-compliant healthcare software, you must use a service with an executed BAA. Contact Athena Core Technologies to discuss BAA requirements and timelines for HIPAA compliance implementation.**

### 12.2 State Privacy Laws

**As a prototype platform with in-memory data storage and limited functionality, our compliance with state privacy laws is LIMITED.**

**For California Residents (CCPA/CPRA):**
- You have rights to access, delete, and opt-out of data sales under CCPA
- We do not sell personal information to third parties
- Your data is deleted when the server restarts (no persistent deletion needed)
- To exercise access or deletion rights, contact [**email to be provided**]
- Due to in-memory architecture, we cannot provide historical data exports or guarantee data retention for CCPA compliance purposes

**For Colorado, Connecticut, Virginia, and Utah Residents:**
- We implement privacy-by-design principles
- We do not use your data for discriminatory targeting
- You may request access to your data (limited by our in-memory storage)
- We do not share data with advertisers or data brokers

**LIMITATION:** As a prototype platform, we cannot fully support all consumer rights required by these laws (particularly data portability and long-term retention verification). Users in regulated states should understand these limitations before providing personal information.

**GDPR (if expanded to EU):**
- Currently NOT applicable (US-only platform)
- If expanding to EU, significant architecture changes and legal compliance will be required

### 12.3 Data Processing Location

All data processing occurs in [**geographic location to be determined**]. Data is not transferred internationally unless required for third-party API calls (NPI Registry and OpenFDA).

---

**© 2026 Athena Core Technologies. All rights reserved.**
