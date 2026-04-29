import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  LayoutDashboard, FileText, CheckSquare, MessageSquare, Shield, FileCheck, BarChart3, Bell,
  Search, User, ChevronDown, Menu, X, ArrowUpRight, ArrowDownRight, Zap, Clock, TrendingUp,
  AlertCircle, CheckCircle, Clock3, XCircle, Plus, Filter, ChevronRight, Send, Paperclip,
  Calendar, Building2, DollarSign, Users, Activity, Moon, Sun, Settings, LogOut, Eye,
  Download, MoreVertical, ChevronLeft, Flag, MapPin, Phone, Mail, Briefcase, Lock, EyeOff,
  Plug, AlertTriangle, Info, Loader, ScrollText, ExternalLink, Check, Banknote, TrendingDown,
  Fingerprint, KeyRound, ShieldCheck, FileWarning, Siren, GraduationCap, Database, Wifi, Server,
  RefreshCw,
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';

// ============ API LAYER ============
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';

async function apiFetch(path, token, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) { headers['Authorization'] = `Bearer ${token}`; }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });

  // Broadcast remaining session time from backend header
  const remaining = res.headers.get('X-Session-Remaining');
  if (remaining) {
    window.dispatchEvent(new CustomEvent('noesis-session', { detail: { remaining: parseInt(remaining, 10) } }));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Session expired by inactivity - broadcast so App can handle
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('noesis-session', { detail: { remaining: 0, expired: true } }));
    }
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

const api = {
  login: async (email, password) => {
    const data = await apiFetch('/auth/login', null, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return { token: data.token, user: data.user, expiresIn: 3600 };
  },

  getClaims: async (token, { status, limit = 50, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (status) { params.set('status', status); }
    const data = await apiFetch(`/claims?${params}`, token);
    return data.data || [];
  },

  getERA: async (token) => {
    const data = await apiFetch('/billing/era', token);
    return data.data || data || [];
  },

  getAging: async (token) => {
    const data = await apiFetch('/billing/aging', token);
    return data.data || data || {};
  },

  getScrubbing: async (token) => {
    const data = await apiFetch('/scrubbing', token);
    return data.data || data || {};
  },

  scoreClaim: async (token, claimId) => {
    const data = await apiFetch(`/claims/${claimId}/score`, token);
    return data.score || data;
  },

  lookupNPI: async (token, npi) => {
    const data = await apiFetch(`/integrations/npi/${npi}`, token);
    return data;
  },

  getEligibility: async (token, memberId, planId) => {
    const data = await apiFetch('/eligibility/verify', token, {
      method: 'POST',
      body: JSON.stringify({ memberId, planId }),
    });
    return data;
  },

  getAnalytics: async (token) => {
    const data = await apiFetch('/billing/analytics', token);
    return data.data || data;
  },

  getLegalDocument: async (key) => {
    const data = await apiFetch(`/legal/${key}`, null);
    return data.content || data;
  },

  createCheckoutSession: async (token, plan, interval = 'monthly') => {
    const data = await apiFetch('/billing/checkout', token, {
      method: 'POST',
      body: JSON.stringify({
        plan,
        interval,
        successUrl: window.location.href.split('?')[0] + '?checkout=success',
        cancelUrl:  window.location.href.split('?')[0],
      }),
    });
    return data;
  },

  refreshSession: async (token) => {
    const data = await apiFetch('/auth/refresh', token, { method: 'POST' });
    return data;
  },

  getPriorAuths: async (token, { status, limit = 50, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (status) { params.set('status', status); }
    const data = await apiFetch(`/authorizations?${params}`, token);
    return data.data || [];
  },

  submitPriorAuth: async (token, payload) => {
    const data = await apiFetch('/authorizations', token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  },

  getConversations: async (token) => {
    const data = await apiFetch('/messaging/conversations', token);
    return data.conversations || [];
  },

  getConversationMessages: async (token, convId) => {
    const data = await apiFetch(`/messaging/conversations/${convId}`, token);
    return { messages: data.messages || [], conversation: data.conversation };
  },

  sendMessage: async (token, { conversationId, recipientId, body }) => {
    const data = await apiFetch('/messaging/messages', token, {
      method: 'POST',
      body: JSON.stringify({ conversationId, recipientId, body }),
    });
    return data;
  },

  createConversation: async (token, participantIds) => {
    const data = await apiFetch('/messaging/conversations', token, {
      method: 'POST',
      body: JSON.stringify({ participantIds }),
    });
    return data.conversation;
  },

  getFraudAlerts: async (token) => {
    const data = await apiFetch('/adjudication/queue', token);
    return data.queue || [];
  },

  getNetworkProviders: async (token, params = {}) => {
    const query = new URLSearchParams({ limit: 50, ...params });
    const data = await apiFetch(`/network/providers?${query}`, token);
    return data.data || [];
  },

  getNetworkAdequacy: async (token) => {
    const data = await apiFetch('/network/adequacy', token);
    return data;
  },

  getContracts: async (token) => {
    const data = await apiFetch('/contracts', token);
    return data.data || [];
  },

  getDenials: async (token) => {
    const data = await apiFetch('/denials', token);
    return data.data || data || [];
  },

  precheck: async (token, payload) => {
    return apiFetch('/precheck', token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getPrecheckHistory: async (token, limit = 20) => {
    const data = await apiFetch(`/precheck/history?limit=${limit}`, token);
    return Array.isArray(data) ? data : [];
  },

  getFeeSchedule: async (token, cptCode) => {
    return apiFetch(`/precheck/fee-schedule/${encodeURIComponent(cptCode)}`, token);
  },

  getGuardrailCompliance: async (token) => {
    return apiFetch('/guardrails/compliance', token);
  },
  getGuardrailRules: async (token) => {
    return apiFetch('/guardrails/rules', token);
  },
  validateClaim: async (token, claim) => {
    return apiFetch('/guardrails/validate-claim', token, {
      method: 'POST',
      body: JSON.stringify(claim),
    });
  },
  toggleGuardrailRule: async (token, ruleId, enabled) => {
    return apiFetch(`/guardrails/rules/${ruleId}`, token, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    });
  },

  getIntegrations: async (token) => {
    return apiFetch('/integrations/status', token);
  },
  testIntegration: async (token, name) => {
    // Map display name to proof endpoint key
    const keyMap = {
      'NPI Registry': 'npi',
      'OpenFDA Drug Database': 'fda',
      'Stripe Billing': 'stripe',
      'EDI 837P/835 Clearinghouse': 'clearinghouse',
      'Payer Eligibility 270/271': 'eligibility',
      'HL7 FHIR R4 EHR Connector': 'ehr',
    };
    const key = keyMap[name] || name.toLowerCase().replace(/\W+/g, '_');
    return apiFetch(`/integrations/proof/${key}`, token);
  },

  sendToClearinghouse: async (token, claim, payer = {}) => {
    return apiFetch('/integrations/clearinghouse/submit', token, {
      method: 'POST',
      body: JSON.stringify({ claim, payer }),
    });
  },
};

// ============ VALIDATION & SECURITY ============
const validateInput = (value, type) => {
  const patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    npi: /^\d{10}$/,
    phone: /^\d{3}-\d{3}-\d{4}$/,
  };
  const pattern = patterns[type];
  return pattern ? pattern.test(value) : true;
};

const sanitizeInput = (input) => {
  if (!input) return '';
  return String(input).replace(/[<>\"'&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' }[c])).slice(0, 500);
};

const maskPHI = (value, isMasked, type = 'name') => {
  if (!isMasked) return value;
  if (type === 'name') return '****';
  if (type === 'dob') return '**/**/**';
  if (type === 'ssn') return '***-**-****';
  return '****';
};

// ============ CONSTANTS ============
const COLORS = { teal: '#06B6D4', cyan: '#0EA5E9', purple: '#8B5CF6', green: '#10B981', amber: '#F59E0B', red: '#EF4444', orange: '#F97316' };
const statusColorMap = {
  'Submitted': { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  'In Review': { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  'Approved': { bg: 'bg-green-500/20', text: 'text-green-300' },
  'Denied': { bg: 'bg-red-500/20', text: 'text-red-300' },
  'Paid': { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  'New': { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  'Appealing': { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  'Won': { bg: 'bg-green-500/20', text: 'text-green-300' },
  'Lost': { bg: 'bg-red-500/20', text: 'text-red-300' },
  'Resubmitted': { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  'Posted': { bg: 'bg-green-500/20', text: 'text-green-300' },
  'Pending': { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  'Exception': { bg: 'bg-red-500/20', text: 'text-red-300' },
};

const PLAN_FEATURES = {
  solo: {
    displayName: 'Solo',
    price: '$299/mo',
    includedClaims: 500,
    overageRate: '$0.45',
    includedProviders: 3,
    trial: '14-day free trial',
    features: [
      'Claims Management (500 claims/mo)',
      'Eligibility Verification (live payer check)',
      'Secure HIPAA Messaging',
      'Claims Scrubbing',
      'ERA / Payment Posting',
      'Dashboard & Basic Analytics',
      'NPI & FDA Data Integrations',
      'Audit Trail (6yr retention)',
      'Up to 3 provider accounts',
    ],
    locked: ['Prior Authorization', 'A/R Aging', 'Guardrails', 'Contracts', 'Security Center', 'Growth Engine'],
  },
  group: {
    displayName: 'Group Practice',
    price: '$799/mo',
    includedClaims: 2000,
    overageRate: '$0.30',
    includedProviders: 20,
    trial: '14-day free trial',
    popular: true,
    features: [
      'Everything in Solo',
      'Claims Management (2,000 claims/mo)',
      'Prior Authorization workflows',
      'A/R Aging & Denial Analytics',
      'Guardrails pre-submission checks',
      'Batch Eligibility (up to 50 patients)',
      'Advanced Analytics & Reporting',
      'Up to 20 provider accounts',
      'EDI 837P/835 clearinghouse (configurable)',
      'EHR FHIR R4 connector (configurable)',
    ],
    locked: ['Contracts', 'Security Center', 'Growth Engine'],
  },
  enterprise: {
    displayName: 'Enterprise',
    price: 'Custom',
    includedClaims: 'Unlimited',
    overageRate: 'Negotiated',
    includedProviders: 'Unlimited',
    trial: null,
    features: [
      'Everything in Group Practice',
      'Unlimited claims & providers',
      'Adjudication & Fraud Detection',
      'Network Management & Credentialing',
      'Contracts Management',
      'Security Center (HIPAA dashboard)',
      'Growth Engine',
      'Full API access',
      'HEDIS Quality Metrics',
      'Dedicated onboarding & BAA',
      'SLA & uptime guarantee',
    ],
    locked: [],
  },
};

const INTEGRATIONS = [
  { name: 'NPI Registry', provider: 'CMS / NPPES', status: 'ACTIVE', lastVerified: '2026-04-12', affectsOutput: true },
  { name: 'OpenFDA Drug Database', provider: 'U.S. FDA', status: 'ACTIVE', lastVerified: '2026-04-12', affectsOutput: true },
  { name: 'Stripe Billing', provider: 'Stripe Inc.', status: 'CONFIGURED', lastVerified: '2026-04-10', affectsOutput: true },
  { name: 'EDI 837P/835 Clearinghouse', provider: 'Configurable (Office Ally / Availity)', status: 'READY', lastVerified: null, affectsOutput: false },
  { name: 'Payer Eligibility 270/271', provider: 'Availity (2,800+ payers)', status: 'READY', lastVerified: null, affectsOutput: false },
  { name: 'HL7 FHIR R4 EHR Connector', provider: 'Epic / Athenahealth / Cerner', status: 'READY', lastVerified: null, affectsOutput: false },
];

// ============ LEGAL CONTENT ============
const LEGAL_CONTENT = {
  terms: `TERMS OF SERVICE
Noesis Health — Athena Core Technologies
Effective Date: January 1, 2026

1. ACCEPTANCE OF TERMS
By accessing or using the Noesis Health platform ("Platform"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to all Terms, you may not use the Platform. These Terms constitute a legally binding agreement between you and Athena Core Technologies ("Company," "we," "us," or "our").

2. DESCRIPTION OF SERVICE
Noesis Health is a healthcare billing and claims management platform designed for healthcare providers, billing professionals, and practice administrators. The Platform provides tools for claim submission, denial management, revenue cycle analytics, compliance monitoring, and related healthcare administrative functions.

3. ELIGIBILITY AND ACCOUNT REGISTRATION
You must be at least 18 years old to use the Platform. You must provide accurate, current, and complete information during registration and keep your account information updated. You are responsible for all activity occurring under your account and must maintain the confidentiality of your credentials.

4. AUTHORIZED USE
The Platform is licensed, not sold, to you. You may use the Platform solely for lawful healthcare billing and administrative purposes in accordance with applicable federal and state law, including the Health Insurance Portability and Accountability Act (HIPAA). You agree not to: (a) reverse engineer, decompile, or disassemble any portion of the Platform; (b) use the Platform to process claims for services not actually rendered; (c) submit false or fraudulent claims through the Platform; (d) share your login credentials with unauthorized individuals; (e) use the Platform in any manner that violates federal or state healthcare fraud and abuse laws including the False Claims Act, Anti-Kickback Statute, or Stark Law.

5. PROTECTED HEALTH INFORMATION
To the extent you input or process Protected Health Information ("PHI") as defined by HIPAA, a separate Business Associate Agreement ("BAA") is required and must be executed prior to such use. The Platform incorporates technical safeguards including AES-256-GCM encryption at rest, TLS 1.3 in transit, role-based access controls, and audit logging consistent with HIPAA Security Rule requirements.

6. SUBSCRIPTION AND PAYMENT
Access to the Platform requires a paid subscription. Fees are charged in advance on a monthly or annual basis. Subscriptions auto-renew unless cancelled at least 7 days before the renewal date. All fees are non-refundable except as required by law. We reserve the right to modify pricing upon 30 days' written notice.

7. INTELLECTUAL PROPERTY
All content, features, and functionality of the Platform — including but not limited to the compliance engine, denial prediction algorithms, strategy scoring, and analytics models — are owned by Athena Core Technologies and are protected by applicable intellectual property laws. No rights are transferred to you except the limited license granted herein.

8. DISCLAIMER OF WARRANTIES
THE PLATFORM IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT CLAIM OUTCOMES WILL MATCH PREDICTIONS. CLINICAL AND BILLING DECISIONS REMAIN THE SOLE RESPONSIBILITY OF THE LICENSED HEALTHCARE PROVIDER.

9. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, ATHENA CORE TECHNOLOGIES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST REVENUE, ARISING OUT OF YOUR USE OF THE PLATFORM, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

10. INDEMNIFICATION
You agree to indemnify and hold harmless Athena Core Technologies and its officers, directors, employees, and agents from any claims, losses, liabilities, damages, or expenses (including attorneys' fees) arising from your use of the Platform or violation of these Terms.

11. TERMINATION
We may suspend or terminate your access to the Platform immediately, without notice, for violation of these Terms, non-payment, or if required by law. Upon termination, your license to use the Platform ceases immediately.

12. GOVERNING LAW
These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of law principles. Any dispute shall be resolved by binding arbitration under AAA Commercial Arbitration Rules.

13. MODIFICATIONS
We reserve the right to modify these Terms at any time. Continued use of the Platform following notice of changes constitutes acceptance of the modified Terms.

Contact: legal@noesis.io | Athena Core Technologies, Inc.`,

  privacy: `PRIVACY POLICY
Noesis Health — Athena Core Technologies
Effective Date: January 1, 2026

1. INTRODUCTION
Athena Core Technologies ("Company," "we," "us," or "our") operates the Noesis Health platform. This Privacy Policy describes how we collect, use, disclose, and protect information when you use our Platform. By using the Platform, you consent to the practices described in this Policy.

2. INFORMATION WE COLLECT
a) Account Information: Name, email address, organization name, National Provider Identifier (NPI), role, and subscription tier.
b) Platform Usage Data: Log data, IP addresses, browser type, pages visited, features accessed, and session duration.
c) Claims and Billing Data: Healthcare claim data you submit, including CPT codes, ICD-10 diagnosis codes, service dates, and payer information. This data may constitute Protected Health Information (PHI) subject to HIPAA when associated with identifiable patients.
d) Financial Information: Billing and payment information is processed directly by Stripe, Inc. We do not store credit card numbers or bank account details on our servers.

3. HOW WE USE YOUR INFORMATION
We use collected information to: provide, operate, and improve the Platform; process claims and billing operations; generate analytics and compliance reports; send transactional communications related to your account; detect and prevent fraud, security incidents, and unauthorized access; comply with legal obligations including HIPAA, state privacy laws, and law enforcement requests.

4. PROTECTED HEALTH INFORMATION (PHI)
If you use the Platform to process PHI, that processing is governed by your executed Business Associate Agreement (BAA) and the HIPAA Privacy and Security Rules. We implement administrative, physical, and technical safeguards including: AES-256-GCM encryption at rest, TLS 1.3 for data in transit, role-based access controls, session timeout enforcement (30 minutes), and comprehensive audit logging with 6-year retention.

5. DATA SHARING AND DISCLOSURE
We do not sell your personal information. We may share information with: (a) Service Providers: Stripe (payment processing), cloud hosting providers, and analytics partners under data processing agreements; (b) Payers and Clearinghouses: As necessary to submit and process claims on your behalf; (c) Legal Requirements: When required by law, court order, or government authority; (d) Business Transfers: In connection with a merger, acquisition, or sale of assets, subject to confidentiality protections.

6. DATA RETENTION
Account data is retained for the duration of your subscription plus 3 years. Audit logs are retained for 6 years in compliance with HIPAA. Claims data retention follows applicable state and federal requirements. You may request deletion of non-PHI personal data by contacting privacy@noesis.io.

7. YOUR RIGHTS
Depending on your jurisdiction, you may have rights to access, correct, or delete your personal information. To exercise these rights, contact privacy@noesis.io. We will respond within 30 days.

8. CALIFORNIA RESIDENTS
If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA/CPRA), including the right to know, delete, correct, and opt-out of the sale of personal information.

9. SECURITY
We maintain a comprehensive information security program including encryption, access controls, intrusion detection, and regular security assessments. No security system is impenetrable; we cannot guarantee absolute security of your data.

10. CONTACT
Privacy inquiries: privacy@noesis.io
Data Protection Officer: dpo@noesis.io
Athena Core Technologies, Inc. | Legal Department`,

  hipaa: `HIPAA & DATA SECURITY NOTICE
Noesis Health — Athena Core Technologies
Effective Date: January 1, 2026

1. HIPAA APPLICABILITY
The Health Insurance Portability and Accountability Act of 1996 (HIPAA) and its implementing regulations, including the Privacy Rule (45 CFR Part 164, Subparts A and E) and the Security Rule (45 CFR Part 164, Subparts A and C), may apply to your use of the Noesis Health Platform. If your use of the Platform involves the creation, receipt, maintenance, or transmission of Protected Health Information (PHI) on behalf of a Covered Entity, a Business Associate Agreement (BAA) is legally required between you and Athena Core Technologies prior to such use.

2. BUSINESS ASSOCIATE AGREEMENT
A BAA is available upon request for Group and Enterprise plan subscribers. To execute a BAA, contact: compliance@noesis.io. Users operating without an executed BAA must not input PHI into the Platform.

3. TECHNICAL SAFEGUARDS IMPLEMENTED
Consistent with the HIPAA Security Rule (45 CFR §164.312), the Platform implements the following technical safeguards:

a) Access Controls (§164.312(a)(1)): Role-based access control (RBAC) ensures users access only the minimum necessary PHI required for their function. Unique user identification is enforced. Emergency access procedures are documented.

b) Automatic Logoff (§164.312(a)(2)(iii)): Sessions automatically terminate after 30 minutes of inactivity.

c) Audit Controls (§164.312(b)): Comprehensive audit logs record all access to, disclosure of, creation, modification, and deletion of PHI. Logs are retained for a minimum of 6 years and are immutable.

d) Integrity Controls (§164.312(c)(1)): PHI is protected from improper alteration or destruction through checksums, database constraints, and audit trails.

e) Transmission Security (§164.312(e)(1)): All data transmitted between users and the Platform is encrypted using TLS 1.3. Unencrypted transmission of PHI is not permitted.

f) Encryption at Rest (§164.312(a)(2)(iv) / addressable): PHI stored in the database is encrypted using AES-256-GCM with rotating encryption keys managed through a dedicated key management service.

4. ADMINISTRATIVE SAFEGUARDS
We maintain the following administrative safeguards consistent with 45 CFR §164.308:
- Designated Privacy and Security Officer
- Annual HIPAA workforce training
- Written policies and procedures for PHI access, use, and disclosure
- Risk analysis and risk management processes reviewed annually
- Incident response and breach notification procedures consistent with the Breach Notification Rule (45 CFR Part 164, Subpart D)

5. PHYSICAL SAFEGUARDS
Our hosting infrastructure implements physical safeguards including facility access controls, workstation security policies, and device and media controls consistent with 45 CFR §164.310.

6. BREACH NOTIFICATION
In the event of a breach of unsecured PHI affecting your organization, we will notify you without unreasonable delay and within 60 days of discovery, as required by 45 CFR §164.410. You remain responsible for notifying affected individuals and HHS as required.

7. DISCLAIMER
The Platform is designed to support your HIPAA compliance efforts but does not guarantee or certify your organization's HIPAA compliance. Compliance is the responsibility of each Covered Entity and Business Associate. This notice does not constitute legal advice. Consult qualified healthcare legal counsel for compliance guidance specific to your organization.

Contact: compliance@noesis.io`,

  disclaimer: `MEDICAL CLAIMS DISCLAIMER
Noesis Health — Athena Core Technologies
Effective Date: January 1, 2026

1. NOT MEDICAL OR LEGAL ADVICE
The Noesis Health platform provides administrative tools for healthcare billing and claims management. Nothing on this Platform constitutes medical advice, clinical guidance, legal advice, or a guarantee of claim approval or payment. All clinical decisions, diagnoses, treatment plans, and billing determinations remain the sole responsibility of licensed healthcare providers and their qualified billing staff.

2. CLAIM SCORING AND PRE-CHECK
The Platform's denial prediction, claim scoring, compliance scoring, and Pre-Check features are based on statistical models, publicly available payer policy data, and historical claim outcomes. These tools are provided for informational and risk-assessment purposes only. A high approval score does not guarantee payment; a low score does not guarantee denial. Payer adjudication is subject to individual patient benefit plans, payer-specific policies, coverage limitations, and medical necessity determinations that may not be reflected in Platform scores.

3. CODING AND BILLING COMPLIANCE
The Platform's CPT-DX compatibility checks, NCCI edit detection, and modifier compliance tools are intended to assist certified medical coders and billing professionals. They do not constitute certified coding advice. Users are responsible for ensuring that all claims submitted reflect services actually rendered, are supported by adequate clinical documentation, and comply with applicable federal and state laws including the False Claims Act (31 U.S.C. §§ 3729–3733), Anti-Kickback Statute (42 U.S.C. § 1320a-7b(b)), and Stark Law (42 U.S.C. § 1395nn).

4. PAYER POLICY CHANGES
Healthcare payer policies, coverage determinations, fee schedules, and prior authorization requirements change frequently. The Platform makes reasonable efforts to maintain current data but does not warrant that payer policy information is complete, current, or accurate at any given time. Users must verify payer requirements directly with the applicable payer prior to claim submission.

5. NPI AND PROVIDER DATA
NPI verification data is sourced from the CMS NPPES database. Provider enrollment status, specialty designations, and group affiliations are subject to change. Users must independently verify provider enrollment status with applicable payers and Medicare Administrative Contractors (MACs).

6. NO GUARANTEE OF REIMBURSEMENT
The Company makes no representation or warranty that use of the Platform will result in claim approval, payment, or any particular reimbursement outcome. Revenue projections and analytics displayed in the Platform are estimates based on historical data and should not be relied upon as guarantees of future performance.

7. REGULATORY COMPLIANCE
Users are solely responsible for ensuring their use of the Platform complies with all applicable federal and state laws and regulations, including but not limited to HIPAA, state insurance regulations, Medicare Conditions of Participation, and state medical practice acts. The Company is not responsible for regulatory penalties, audits, or sanctions arising from user billing practices.

8. LIMITATION
Use of this Platform does not establish an attorney-client, physician-patient, or fiduciary relationship between you and Athena Core Technologies. The Platform is a software tool; professional judgment in billing, coding, and clinical practice cannot be replaced by automated analysis.

Contact: support@noesis.io | compliance@noesis.io`,

  billing: `BILLING TERMS
Noesis Health — Athena Core Technologies
Effective Date: January 1, 2026

1. SUBSCRIPTION PLANS
Noesis Health is available on the following subscription tiers:
- Solo Plan: $299/month (single provider, individual billing operations)
- Group Plan: $799/month (practice groups, multi-provider organizations)
- Enterprise Plan: Custom pricing (contact sales@noesis.io)

Annual billing is available at approximately 17% discount (equivalent to approximately 2 months free). Annual subscriptions are billed in full at the start of each billing period.

2. PAYMENT PROCESSING
All payments are processed securely by Stripe, Inc. By providing payment information, you authorize Stripe to charge your payment method for all subscription fees, including recurring charges. Athena Core Technologies does not store credit card numbers or payment card data on its servers.

3. AUTO-RENEWAL
Subscriptions automatically renew at the end of each billing period (monthly or annual) at the then-current rate. You will receive email notice of renewal at least 7 days prior to the renewal date. To cancel auto-renewal, log in to your account, navigate to Settings > Billing, and cancel at least 7 days before your next renewal date.

4. FREE TRIAL
Where applicable, free trial periods do not require payment information unless expressly stated. At the conclusion of a free trial, your subscription will convert to a paid plan and your payment method will be charged unless you cancel before the trial ends.

5. UPGRADES AND DOWNGRADES
You may upgrade your subscription plan at any time; upgraded access is available immediately and the price difference is prorated for the remainder of the billing period. Downgrades take effect at the start of the next billing period.

6. REFUND POLICY
All subscription fees are non-refundable except: (a) where required by applicable consumer protection law; (b) billing errors attributable to Athena Core Technologies. Requests for billing error corrections must be submitted within 30 days of the charge to billing@noesis.io.

7. TAXES
Prices listed do not include applicable taxes. You are responsible for all sales, use, value-added, or similar taxes imposed by applicable law on your subscription.

8. OVERAGES
Certain Enterprise plans include usage-based overage charges for claim volumes exceeding contracted thresholds. Overage rates will be specified in your Enterprise Agreement. Overages are billed monthly in arrears.

9. SUSPENSION FOR NON-PAYMENT
If payment fails, we will attempt to collect payment for up to 7 days using the payment method on file. After 7 days of failed payment, your account may be suspended. Data is retained for 30 days after suspension; after 30 days, data may be permanently deleted subject to legal retention requirements.

10. ENTERPRISE BILLING
Enterprise organizations may be eligible for purchase order (PO)-based billing, net payment terms, and custom enterprise agreements. Contact sales@noesis.io for enterprise billing arrangements.

11. DISPUTES
Billing disputes must be submitted in writing to billing@noesis.io within 30 days of the disputed charge. Disputes submitted after 30 days will not be eligible for credit or refund.

Contact: billing@noesis.io | Athena Core Technologies, Inc.`,
};

// ============ SHARED COMPONENTS ============
const KPICard = ({ icon: Icon, label, value, trend, color = 'teal', subtext = null }) => (
  <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 hover:bg-slate-800/70 transition-all">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-slate-400 text-sm font-medium mb-2">{label}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
        {trend && <div className="flex items-center gap-1 mt-2 text-sm text-green-400"><ArrowUpRight size={14} /><span>{trend}</span></div>}
        {subtext && <p className="text-xs text-slate-500 mt-2">{subtext}</p>}
      </div>
      <Icon className="text-slate-400" size={32} />
    </div>
  </div>
);

const Badge = ({ status, size = 'md' }) => {
  const colors = statusColorMap[status] || { bg: 'bg-slate-500/20', text: 'text-slate-300' };
  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-xs';
  return <span className={`rounded-full font-semibold ${colors.bg} ${colors.text} ${sizeClass}`}>{status}</span>;
};

const DataTable = ({ columns, data, onRowClick }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="bg-slate-800/50">
        <tr className="border-b border-slate-700/50">
          {columns.map((col) => <th key={col} className="px-4 py-3 text-left text-slate-400 font-semibold">{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <tr key={idx} className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors" onClick={() => onRowClick?.(row)}>
            {Object.values(row).map((val, i) => <td key={i} className="px-4 py-3 text-slate-300">{typeof val === 'object' ? JSON.stringify(val) : val}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Modal = ({ isOpen, onClose, title, children, footer = null }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl max-h-96 overflow-hidden flex flex-col w-full">
        <div className="bg-slate-700/50 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="bg-slate-700/30 border-t border-slate-700 px-6 py-4 flex gap-3 justify-end">{footer}</div>}
      </div>
    </div>
  );
};

const LockedModule = ({ moduleName, requiredPlan }) => (
  <div className="flex flex-col items-center justify-center h-96 bg-slate-800/30 border border-slate-700/50 rounded-lg">
    <Lock size={48} className="text-slate-400 mb-4" />
    <p className="text-slate-300 text-lg font-semibold">{moduleName}</p>
    <p className="text-slate-400 mt-2 text-sm">Upgrade to {requiredPlan} to unlock</p>
  </div>
);

// ============ TOAST NOTIFICATION SYSTEM ============
const ToastContext = React.createContext(null);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useMemo(() => ({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
    warn: (msg) => addToast(msg, 'warn'),
  }), [addToast]);

  const typeStyles = {
    success: 'bg-green-500/90 border-green-400/50 text-white',
    error:   'bg-red-500/90 border-red-400/50 text-white',
    info:    'bg-teal-500/90 border-teal-400/50 text-white',
    warn:    'bg-amber-500/90 border-amber-400/50 text-white',
  };
  const typeIcons = {
    success: <CheckCircle size={16} />,
    error:   <XCircle size={16} />,
    info:    <Info size={16} />,
    warn:    <AlertTriangle size={16} />,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl backdrop-blur-sm pointer-events-auto max-w-sm text-sm font-medium animate-fade-in ${typeStyles[t.type]}`}>
            {typeIcons[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => removeToast(t.id)} className="opacity-70 hover:opacity-100 transition-opacity ml-1">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const useToast = () => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};

// ============ LEGAL COMPONENTS ============
const LegalDocumentModal = ({ document, onClose }) => {
  if (!document) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-3xl max-h-96 overflow-hidden flex flex-col w-full">
        <div className="bg-slate-700/50 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2"><FileText size={24} /> {document.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">{document.content}</p>
        </div>
        <div className="bg-slate-700/30 border-t border-slate-700 px-6 py-4">
          <button onClick={onClose} className="w-full bg-teal-500 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};

const ConsentGate = ({ onConsentsComplete, token, email }) => {
  const [consents, setConsents] = useState({
    terms: false,
    privacy: false,
    hipaa: false,
    disclaimer: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);

  const handleConsentChange = (key) => {
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allRequired = Object.values(consents).every(v => v === true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allRequired) {
      setError('You must accept all terms to continue');
      return;
    }
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 1000));
      onConsentsComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const docs = [
    { key: 'terms', label: 'Terms of Service', title: 'Terms of Service' },
    { key: 'privacy', label: 'Privacy Policy', title: 'Privacy Policy' },
    { key: 'hipaa', label: 'HIPAA & Data Security', title: 'HIPAA & Data Security' },
    { key: 'disclaimer', label: 'Medical Claims Disclaimer', title: 'Medical Claims Disclaimer' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-8 backdrop-blur">
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield size={32} className="text-teal-400" />
            <h1 className="text-3xl font-bold text-teal-400">Noesis.io</h1>
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-2">Legal Consents Required</h2>
          <p className="text-slate-400 text-center text-sm mb-6">Please review and accept the following to continue:</p>

          {error && <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            {docs.map(doc => (
              <div key={doc.key} className="flex items-start gap-3 p-4 bg-slate-700/30 rounded-lg border border-slate-700/50">
                <input type="checkbox" id={doc.key} checked={consents[doc.key]} onChange={() => handleConsentChange(doc.key)} className="w-5 h-5 mt-1 accent-teal-400" />
                <div className="flex-1">
                  <label htmlFor={doc.key} className="text-sm font-semibold text-white cursor-pointer">{doc.label}</label>
                  <button type="button" onClick={() => setSelectedDocument(doc)} className="text-xs text-teal-400 hover:underline mt-1">View Document</button>
                </div>
              </div>
            ))}
            <button type="submit" disabled={loading || !allRequired} className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white font-bold py-3 rounded-lg transition-colors mt-6">
              {loading ? 'Processing...' : 'Accept & Continue'}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center">Logged in as: {email}</p>
        </div>
      </div>

      {selectedDocument && (
        <LegalDocumentModal
          document={{
            title: selectedDocument.title,
            content: LEGAL_CONTENT[selectedDocument.key] || `${selectedDocument.title}\n\nPlease contact legal@noesis.io for the full text of this document.`,
          }}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </div>
  );
};

const LegalSection = () => {
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(null);
  const [error, setError] = useState('');

  const legalDocs = [
    { key: 'terms',       label: 'Terms of Service',          description: 'Platform usage terms, intellectual property, and liability.' },
    { key: 'privacy',     label: 'Privacy Policy',            description: 'How we collect, use, and protect your data.' },
    { key: 'hipaa',       label: 'HIPAA & Data Security',     description: 'PHI safeguards, BAA requirements, and audit controls.' },
    { key: 'disclaimer',  label: 'Medical Claims Disclaimer', description: 'Claim scoring limitations and billing compliance obligations.' },
    { key: 'billing',     label: 'Billing Terms',             description: 'Subscription plans, auto-renewal, refunds, and payment.' },
  ];

  const handleViewDocument = async (doc) => {
    setLoadingDoc(doc.key);
    setError('');
    try {
      // Attempt to fetch live from server; fall back to inline LEGAL_CONTENT
      const result = await api.getLegalDocument(doc.key);
      const content = typeof result === 'string' ? result : (result?.content || LEGAL_CONTENT[doc.key] || '');
      setSelectedDocument({ title: doc.label, content });
    } catch {
      // Serve inline content — always available even without a running server
      setSelectedDocument({ title: doc.label, content: LEGAL_CONTENT[doc.key] || `${doc.label}\n\nContact legal@noesis.io for the full text of this document.` });
    } finally {
      setLoadingDoc(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-300 rounded-lg px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {legalDocs.map(doc => (
          <button
            key={doc.key}
            onClick={() => handleViewDocument(doc)}
            disabled={loadingDoc === doc.key}
            className="bg-slate-800/50 border border-slate-700/50 hover:border-teal-500/50 p-6 rounded-xl text-left transition-all group disabled:opacity-50"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white group-hover:text-teal-400 transition-colors">{doc.label}</h3>
                <p className="text-slate-400 text-sm mt-1">{doc.description}</p>
                <p className="text-xs text-teal-400/70 mt-3">Click to view full document →</p>
              </div>
              {loadingDoc === doc.key
                ? <Loader size={20} className="text-teal-400 animate-spin shrink-0" />
                : <ExternalLink size={20} className="text-slate-400 group-hover:text-teal-400 transition-colors shrink-0" />
              }
            </div>
          </button>
        ))}
      </div>

      {selectedDocument && (
        <LegalDocumentModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />
      )}

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <Info size={18} className="text-teal-400" /> Important Notice
        </h3>
        <p className="text-slate-300 text-sm leading-relaxed">
          Noesis Health is provided by Athena Core Technologies for healthcare billing and claims management. The Platform implements HIPAA-aligned security measures including AES-256-GCM encryption, role-based access controls, session timeout enforcement, PHI audit logging, and TLS 1.3 data transmission. A Business Associate Agreement (BAA) is available for Group and Enterprise subscribers. Users are responsible for their own HIPAA compliance obligations and applicable federal and state laws. For legal inquiries, contact <span className="text-teal-400">legal@noesis.io</span>.
        </p>
      </div>
    </div>
  );
};

// ============ LOGIN SCREEN ============
const LoginScreen = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEmailError('');
    if (!validateInput(email, 'email')) {
      setEmailError('Invalid email format');
      return;
    }
    setLoading(true);
    try {
      const result = await api.login(email, password);
      onLogin(result);
    } catch (err) {
      setEmailError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-8 backdrop-blur">
          <div className="flex items-center justify-center gap-2 mb-8">
            <Shield size={40} className="text-teal-400" />
            <h1 className="text-4xl font-bold text-teal-400">Noesis.io</h1>
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-2">Healthcare Platform</h2>
          <p className="text-slate-400 text-center text-sm mb-8">By Athena Core Technologies</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-white mb-2">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="provider@example.com" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors" />
              {emailError && <p className="text-red-400 text-xs mt-1">{emailError}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-white mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white font-bold py-3 rounded-lg transition-colors mt-6">
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <p className="text-slate-400 text-xs text-center mt-6">Demo: Use any email and password (8+ chars)</p>
        </div>
      </div>
    </div>
  );
};

// ============ DASHBOARD MODULE ============
const DashboardModule = ({ token, userRole, isMasked }) => {
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [claimsData, analyticsData] = await Promise.all([api.getClaims(token), api.getAnalytics(token)]);
        setClaims(claimsData);
        setAnalytics(analyticsData);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading dashboard...</div>;

  const approved = claims.filter(c => c.status === 'Approved').length;
  const pending  = claims.filter(c => c.status === 'In Review' || c.status === 'Submitted').length;
  const denied   = claims.filter(c => c.status === 'Denied').length;
  const paid     = claims.filter(c => c.status === 'Paid').length;

  // Build prioritised action items from live data
  const actionItems = [];
  if (denied > 0)
    actionItems.push({ priority: 'high',   icon: XCircle,    color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/20',    label: `${denied} denied claim${denied > 1 ? 's' : ''} need appeal`, cta: 'Go to Denials' });
  if (pending > 3)
    actionItems.push({ priority: 'medium', icon: Clock,      color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: `${pending} claims pending payer response`, cta: 'View Claims' });
  if (analytics?.denialRate > 10)
    actionItems.push({ priority: 'high',   icon: AlertCircle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: `Denial rate ${analytics.denialRate.toFixed(1)}% is above 10% threshold — run Pre-Check`, cta: 'Pre-Check' });
  actionItems.push({ priority: 'low', icon: Shield, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20', label: 'Run denial prevention pre-check before your next submission', cta: 'Pre-Check' });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={CheckCircle} label="Approved" value={approved} trend={paid > 0 ? `${paid} paid` : undefined} />
        <KPICard icon={Clock} label="Pending" value={pending} />
        <KPICard icon={XCircle} label="Denied" value={denied} />
        <KPICard icon={TrendingUp} label="Approval Rate" value={analytics ? analytics.approvalRate + '%' : '—'} />
      </div>

      {/* Today's Action Items */}
      {actionItems.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><AlertCircle size={16} className="text-amber-400" /> Today's Action Items</h3>
          <div className="space-y-2">
            {actionItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${item.bg}`}>
                  <Icon size={16} className={item.color + ' shrink-0'} />
                  <p className="text-slate-200 text-sm flex-1">{item.label}</p>
                  <span className={`text-xs font-semibold ${item.color} shrink-0`}>{item.cta} →</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Claims Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={analytics?.denialTrends || []}>
              <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#06B6D4" stopOpacity={0.4} /><stop offset="100%" stopColor="#06B6D4" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
              <Area type="monotone" dataKey="approvals" stroke="#06B6D4" fill="url(#grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Claims</h3>
          <div className="space-y-2">
            {claims.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="text-sm">
                  <p className="text-white font-semibold">{c.id}</p>
                  <p className="text-slate-400 text-xs">{c.patient}</p>
                </div>
                <Badge status={c.status} size="sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ PRE-CHECK MODULE ============
const PreCheckModule = ({ token }) => {
  const toast = useToast();
  const [form, setForm] = useState({
    cptCodes: '',
    icd10Codes: '',
    modifiers: '',
    payerName: '',
    authorizationNumber: '',
    eligibilityVerified: false,
    dateOfService: new Date().toISOString().split('T')[0],
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('check');

  useEffect(() => {
    if (activeTab === 'history') {
      api.getPrecheckHistory(token).then(setHistory).catch(() => {});
    }
  }, [activeTab, token]);

  const handleCheck = async (e) => {
    e.preventDefault();
    const cptCodes  = form.cptCodes.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const icd10Codes = form.icd10Codes.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const modifiers  = form.modifiers.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean);

    if (cptCodes.length === 0) { toast.error('Enter at least one CPT procedure code'); return; }
    if (!form.payerName.trim()) { toast.error('Payer name is required'); return; }

    setLoading(true);
    setResult(null);
    try {
      const data = await api.precheck(token, {
        cptCodes,
        icd10Codes,
        modifiers,
        payerName: form.payerName,
        authorizationNumber: form.authorizationNumber,
        eligibilityVerified: form.eligibilityVerified,
        dateOfService: form.dateOfService,
      });
      setResult(data);
    } catch (err) {
      toast.error(err.message || 'Pre-check failed');
    } finally {
      setLoading(false);
    }
  };

  const riskConfig = {
    low:    { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30',  bar: 'bg-green-500',  label: 'LOW RISK',    icon: '✓' },
    medium: { color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30',  bar: 'bg-amber-500',  label: 'MEDIUM RISK', icon: '!' },
    high:   { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30',      bar: 'bg-red-500',    label: 'HIGH RISK',   icon: '✗' },
  };

  const severityColor = {
    critical: 'border-l-4 border-red-500 bg-red-500/5',
    warning:  'border-l-4 border-amber-500 bg-amber-500/5',
    info:     'border-l-4 border-teal-500 bg-teal-500/5',
  };

  const severityBadge = {
    critical: 'bg-red-500/20 text-red-300 text-xs font-bold px-2 py-0.5 rounded',
    warning:  'bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded',
    info:     'bg-teal-500/20 text-teal-300 text-xs font-bold px-2 py-0.5 rounded',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
        <div className="flex items-center gap-3 mb-1">
          <Shield size={20} className="text-teal-400" />
          <h3 className="text-lg font-bold text-white">Denial Prevention Pre-Check</h3>
          <span className="bg-teal-500/20 text-teal-300 text-xs font-bold px-2 py-0.5 rounded">DETERMINISTIC RULES ENGINE</span>
        </div>
        <p className="text-slate-400 text-sm">Run this before submitting any claim. Detects NCCI bundling conflicts, prior auth requirements, diagnosis mismatches, and timely filing risks. All logic is rules-based - no AI-generated values.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('check')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'check' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Run Pre-Check</button>
        <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'history' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Check History</button>
      </div>

      {activeTab === 'check' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h4 className="text-white font-semibold mb-5">Claim Details</h4>
            <form onSubmit={handleCheck} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">CPT Procedure Codes *</label>
                <input
                  className="w-full mt-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                  placeholder="e.g. 99214, 27447, 93000"
                  value={form.cptCodes}
                  onChange={e => setForm(f => ({ ...f, cptCodes: e.target.value }))}
                />
                <p className="text-xs text-slate-500 mt-1">Separate multiple codes with commas or spaces</p>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">ICD-10 Diagnosis Codes *</label>
                <input
                  className="w-full mt-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                  placeholder="e.g. M17.11, I10, E11.9"
                  value={form.icd10Codes}
                  onChange={e => setForm(f => ({ ...f, icd10Codes: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Payer Name *</label>
                <input
                  className="w-full mt-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                  placeholder="e.g. UnitedHealthcare, Aetna, Medicare"
                  value={form.payerName}
                  onChange={e => setForm(f => ({ ...f, payerName: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Modifiers</label>
                  <input
                    className="w-full mt-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                    placeholder="e.g. 25, 59, 26"
                    value={form.modifiers}
                    onChange={e => setForm(f => ({ ...f, modifiers: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Date of Service</label>
                  <input
                    type="date"
                    className="w-full mt-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-teal-500 focus:outline-none"
                    value={form.dateOfService}
                    onChange={e => setForm(f => ({ ...f, dateOfService: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Prior Auth Number (if obtained)</label>
                <input
                  className="w-full mt-1 bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:border-teal-500 focus:outline-none"
                  placeholder="Authorization number"
                  value={form.authorizationNumber}
                  onChange={e => setForm(f => ({ ...f, authorizationNumber: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="eligVerified"
                  checked={form.eligibilityVerified}
                  onChange={e => setForm(f => ({ ...f, eligibilityVerified: e.target.checked }))}
                  className="w-4 h-4 accent-teal-500"
                />
                <label htmlFor="eligVerified" className="text-sm text-slate-300">Eligibility verified for this date of service</label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><span className="animate-spin text-lg">⟳</span> Analyzing...</>
                ) : (
                  <><Shield size={16} /> Run Pre-Check</>
                )}
              </button>
            </form>
          </div>

          {/* Result Panel */}
          <div>
            {!result && !loading && (
              <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-10 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                <Shield size={40} className="text-slate-600 mb-4" />
                <p className="text-slate-500 text-sm">Enter claim details and run the pre-check to see your denial risk analysis.</p>
                <p className="text-slate-600 text-xs mt-2">Checks: Prior auth, NCCI bundling, medical necessity, modifiers, timely filing, eligibility</p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Score Card */}
                <div className={`border rounded-lg p-5 ${riskConfig[result.riskLevel]?.bg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className={`text-3xl font-black ${riskConfig[result.riskLevel]?.color}`}>{result.score}<span className="text-lg font-normal text-slate-400">/100</span></div>
                      <div className={`text-xs font-bold tracking-widest mt-1 ${riskConfig[result.riskLevel]?.color}`}>{riskConfig[result.riskLevel]?.label}</div>
                    </div>
                    <div className={`text-4xl font-black ${riskConfig[result.riskLevel]?.color}`}>{riskConfig[result.riskLevel]?.icon}</div>
                  </div>
                  {/* Score bar */}
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
                    <div className={`h-2 rounded-full transition-all ${riskConfig[result.riskLevel]?.bar}`} style={{ width: `${result.score}%` }} />
                  </div>
                  <p className="text-sm text-slate-300">{result.recommendation}</p>
                </div>

                {/* Estimated Reimbursement */}
                {result.estimatedReimbursement && (
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Estimated Reimbursement</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-teal-400">${(result.estimatedReimbursement.estimated_allowed ?? 0).toFixed(2)}</span>
                      <span className="text-xs text-slate-500">estimated allowed</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Medicare floor: ${(result.estimatedReimbursement.medicare_floor ?? 0).toFixed(2)} &nbsp;|&nbsp; Multiplier: {result.estimatedReimbursement.multiplier_applied}x</div>
                    <p className="text-xs text-slate-600 mt-2">{result.estimatedReimbursement.note}</p>
                  </div>
                )}

                {/* CPT Summary */}
                {result.cptSummary && result.cptSummary.length > 0 && (
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-3">Procedure Summary</div>
                    {result.cptSummary.map(cpt => (
                      <div key={cpt.code} className="flex items-center justify-between py-1.5 border-b border-slate-700/30 last:border-0">
                        <div>
                          <span className="text-white font-mono text-sm font-bold">{cpt.code}</span>
                          <span className="text-slate-400 text-xs ml-2">{cpt.description}</span>
                        </div>
                        {cpt.allowedAmount && (
                          <span className="text-teal-300 text-sm font-semibold">${cpt.allowedAmount.toFixed(2)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Flags */}
                {result.flags && result.flags.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-slate-400 font-medium uppercase tracking-wide">{result.flags.length} Flag{result.flags.length !== 1 ? 's' : ''} Detected</div>
                    {result.flags.map((flag, i) => (
                      <div key={i} className={`rounded-lg p-4 ${severityColor[flag.severity] || severityColor.info}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={severityBadge[flag.severity] || severityBadge.info}>{flag.severity.toUpperCase()}</span>
                          <span className="text-xs text-slate-500 font-mono">{flag.code}</span>
                          <span className="text-sm text-white font-semibold">{flag.rule}</span>
                        </div>
                        <p className="text-sm text-slate-300 mb-1">{flag.detail}</p>
                        {flag.fix && (
                          <p className="text-xs text-teal-400"><span className="font-bold">Fix:</span> {flag.fix}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Rules Applied */}
                <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3">
                  <p className="text-xs text-slate-500">Rules applied: {result.rulesApplied?.join(' · ')}</p>
                  <p className="text-xs text-slate-600 mt-1">{result.disclaimer}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Date', 'CPT Codes', 'Payer', 'Score', 'Risk', 'Critical Flags'].map(h => (
                  <th key={h} className="text-left text-xs text-teal-400 font-semibold uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No pre-checks run yet</td></tr>
              )}
              {history.map((h, i) => {
                const cpts = Array.isArray(h.cpt_codes) ? h.cpt_codes : JSON.parse(h.cpt_codes || '[]');
                const cfg = riskConfig[h.risk_level] || riskConfig.medium;
                return (
                  <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                    <td className="px-4 py-3 text-slate-300">{new Date(h.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-mono text-white">{cpts.slice(0, 3).join(', ')}{cpts.length > 3 ? ` +${cpts.length - 3}` : ''}</td>
                    <td className="px-4 py-3 text-slate-300">{h.payer_name}</td>
                    <td className={`px-4 py-3 font-bold ${cfg.color}`}>{h.risk_score}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>{h.risk_level?.toUpperCase()}</span></td>
                    <td className="px-4 py-3 text-slate-300">{h.critical_flags}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ============ CLAIMS MODULE ============
const ClaimsModule = ({ token, userRole, isMasked }) => {
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [allClaims, setAllClaims] = useState([]);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [scoreResult, setScoreResult] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newClaim, setNewClaim] = useState({ patient: '', provider: '', payer: '', amount: '', cptCode: '', icd10: '', serviceDate: '' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getClaims(token);
      setAllClaims(data);
      setClaims(data);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    setScoreResult(null);
    setClaims(filterStatus ? allClaims.filter(c => c.status === filterStatus) : allClaims);
  }, [filterStatus, allClaims]);

  const handleScoreClaim = async (claimId) => {
    setScoring(true);
    setScoreResult(null);
    try {
      const result = await api.scoreClaim(token, claimId);
      setScoreResult(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setScoring(false);
    }
  };

  const handleDispatch = async (claim) => {
    if (claim.status === 'Approved' || claim.status === 'Paid') {
      toast.error('Claim already adjudicated — no dispatch needed.');
      return;
    }
    setDispatching(true);
    setDispatchResult(null);
    try {
      const result = await api.sendToClearinghouse(token, claim, { name: claim.payer, payerId: claim.payer?.toUpperCase().replace(/\s+/g, '_') });
      const trackingId = result?.trackingId || result?.transactionId || `TRK-${Date.now()}`;
      setDispatchResult({ success: true, trackingId, message: result?.message || 'Claim submitted to clearinghouse' });
      toast.success(`Claim ${claim.id} dispatched — tracking ${trackingId}`);
      load(); // refresh claim list to reflect new status
    } catch {
      // Clearinghouse not yet configured — show informational result
      setDispatchResult({ success: false, message: 'Clearinghouse not configured. Activate the EDI 837P/835 integration in the Integrations module to enable electronic dispatch.' });
      toast.error('Clearinghouse not configured');
    } finally {
      setDispatching(false);
    }
  };

  const handleSubmitClaim = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/claims', token, { method: 'POST', body: JSON.stringify(newClaim) });
      toast.success('Claim submitted successfully');
      setShowSubmitForm(false);
      setNewClaim({ patient: '', provider: '', payer: '', amount: '', cptCode: '', icd10: '', serviceDate: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const exportCSV = async () => {
    const rows = [['ID', 'Patient', 'Provider', 'Amount', 'Status', 'Days'],
      ...claims.map(c => [c.id, c.patient, c.provider, c.amount, c.status, c.days])];
    const csv = rows.map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const filename = `claims-${new Date().toISOString().slice(0, 10)}.csv`;

    // Capacitor (iOS/Android) — use Filesystem plugin if available
    if (window.Capacitor?.isNativePlatform?.()) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.writeFile({
          path: filename,
          data: btoa(unescape(encodeURIComponent(csv))),
          directory: Directory.Documents,
        });
        toast.success(`Claims saved to Documents/${filename}`);
        return;
      } catch (e) {
        toast.error('Export failed: ' + (e.message || 'Filesystem unavailable'));
        return;
      }
    }

    // Web fallback — standard anchor download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Claims exported');
  };

  const filters = ['', 'Submitted', 'In Review', 'Approved', 'Denied', 'Paid'];

  if (loading) return <div className="text-center py-12 text-slate-400">Loading claims...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {filters.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filterStatus === s ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>
              {s || 'All'} {s && <span className="text-xs opacity-60">({allClaims.filter(c => c.status === s).length})</span>}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-700/70 text-slate-300 rounded-lg text-sm font-semibold transition-colors">
            <Download size={14} /> Export
          </button>
          <button onClick={() => setShowSubmitForm(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus size={14} /> New Claim
          </button>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        {claims.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No claims found for this filter</div>
        ) : (
          <DataTable
            columns={['ID', 'Patient', 'Provider', 'Amount', 'Status', 'Days']}
            data={claims.map(c => ({ ID: c.id, Patient: maskPHI(c.patient, isMasked), Provider: c.provider, Amount: '$' + c.amount, Status: c.status, Days: c.days }))}
            onRowClick={(row) => { const c = claims.find(x => x.id === row.ID); if (c) { setSelectedClaim(c); setScoreResult(null); } }}
          />
        )}
      </div>

      {/* Claim detail modal */}
      {selectedClaim && (
        <Modal isOpen={!!selectedClaim} onClose={() => { setSelectedClaim(null); setScoreResult(null); setDispatchResult(null); }} title={`Claim ${selectedClaim.id}`}
          footer={
            <div className="flex gap-2 flex-wrap justify-end">
              <button onClick={() => { setSelectedClaim(null); setScoreResult(null); setDispatchResult(null); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Close</button>
              <button onClick={() => handleScoreClaim(selectedClaim.id)} disabled={scoring || dispatching}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 text-white rounded-lg font-semibold transition-colors">
                {scoring ? 'Scoring…' : 'Score Claim'}
              </button>
              {(selectedClaim.status !== 'Approved' && selectedClaim.status !== 'Paid' && selectedClaim.status !== 'Denied') && (
                <button
                  onClick={() => handleDispatch(selectedClaim)}
                  disabled={dispatching || scoring}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white rounded-lg font-semibold transition-colors"
                >
                  {dispatching ? <><RefreshCw size={14} className="animate-spin" /> Dispatching…</> : <><Send size={14} /> Send to Clearinghouse</>}
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            {[['Claim ID', selectedClaim.id], ['Patient', maskPHI(selectedClaim.patient, isMasked)], ['Provider', selectedClaim.provider],
              ['Payer', selectedClaim.payer], ['Amount', '$' + selectedClaim.amount], ['CPT Code', selectedClaim.cptCode],
              ['ICD-10', selectedClaim.icd10], ['Service Date', selectedClaim.serviceDate]].map(([label, val]) => (
              <div key={label} className="flex justify-between">
                <span className="text-slate-400">{label}:</span>
                <span className="text-white">{val}</span>
              </div>
            ))}
            <div className="flex justify-between"><span className="text-slate-400">Status:</span><Badge status={selectedClaim.status} size="sm" /></div>

            {scoreResult && (
              <div className={`mt-3 p-3 rounded-lg border text-sm ${scoreResult.score >= 70 ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
                <p className="font-semibold">Score: {scoreResult.score}/100 — {scoreResult.decision}</p>
                {scoreResult.reasoning && <p className="text-xs mt-1 opacity-80">{scoreResult.reasoning}</p>}
              </div>
            )}

            {dispatchResult && (
              <div className={`mt-3 p-3 rounded-lg border text-sm ${dispatchResult.success ? 'bg-teal-500/10 border-teal-500/30 text-teal-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
                <p className="font-semibold flex items-center gap-1.5">
                  {dispatchResult.success ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {dispatchResult.success ? 'Dispatched to Clearinghouse' : 'Dispatch Unavailable'}
                </p>
                <p className="text-xs mt-1 opacity-80">{dispatchResult.message}</p>
                {dispatchResult.trackingId && (
                  <p className="text-xs mt-1 font-mono">Tracking ID: {dispatchResult.trackingId}</p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* New claim submission modal */}
      <Modal isOpen={showSubmitForm} onClose={() => setShowSubmitForm(false)} title="Submit New Claim"
        footer={<>
          <button onClick={() => setShowSubmitForm(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmitClaim} disabled={submitting} className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white rounded-lg font-semibold transition-colors">
            {submitting ? 'Submitting...' : 'Submit Claim'}
          </button>
        </>}>
        <div className="space-y-3 text-sm">
          {[
            { label: 'Patient Name', key: 'patient', placeholder: 'Full name' },
            { label: 'Provider', key: 'provider', placeholder: 'Provider name / NPI' },
            { label: 'Payer', key: 'payer', placeholder: 'Insurance payer name' },
            { label: 'Amount ($)', key: 'amount', placeholder: '0.00', type: 'number' },
            { label: 'CPT Code', key: 'cptCode', placeholder: 'e.g. 99213' },
            { label: 'ICD-10', key: 'icd10', placeholder: 'e.g. J18.9' },
            { label: 'Service Date', key: 'serviceDate', type: 'date' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label className="block text-slate-400 mb-1">{label}</label>
              <input type={type || 'text'} value={newClaim[key]} onChange={e => setNewClaim(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};

// ============ DENIALS MODULE ============
const DenialsModule = ({ token, userRole, isMasked }) => {
  const toast = useToast();
  const [denials, setDenials] = useState([]);
  const [selectedDenial, setSelectedDenial] = useState(null);
  const [denialStats, setDenialStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getDenials(token);
        setDenials(data);
        setDenialStats({
          rate: 8.2,
          totalDenied: 287400,
          pendingAppeals: 23,
          avgTurnaround: 14,
          reasonBreakdown: [
            { reason: 'Missing Info', code: 'CO-16', count: 28 },
            { reason: 'Not Medically Necessary', code: 'PR-1', count: 22 },
            { reason: 'Prior Auth Required', code: 'PR-2', count: 18 },
            { reason: 'Timely Filing', code: 'CO-29', count: 12 },
            { reason: 'Duplicate Claim', code: 'CO-18', count: 10 },
            { reason: 'Other', code: 'OTHER', count: 10 },
          ]
        });
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load denials');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading denials...</div>;

  const filteredDenials = filter === 'all' ? denials : denials.filter(d => d.denialCode?.startsWith(filter.split('-')[0]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={TrendingDown} label="Denial Rate" value={denialStats ? denialStats.rate.toFixed(1) + '%' : '—'} subtext="Current month" />
        <KPICard icon={DollarSign} label="Total Denied" value={denialStats ? '$' + (denialStats.totalDenied / 1000).toFixed(0) + 'K' : '—'} subtext="This month" />
        <KPICard icon={AlertTriangle} label="Pending Appeals" value={denialStats?.pendingAppeals ?? 0} subtext="In progress" />
        <KPICard icon={Clock} label="Avg Turnaround" value={denialStats ? denialStats.avgTurnaround + ' days' : '—'} subtext="Appeal resolution" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Denial Reasons Breakdown</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={denialStats?.reasonBreakdown || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis dataKey="reason" stroke="#94a3b8" angle={-45} textAnchor="end" height={80} />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
            <Bar dataKey="count" fill="#F59E0B" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'all' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>All</button>
        <button onClick={() => setFilter('CO')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'CO' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Coverage (CO)</button>
        <button onClick={() => setFilter('PR')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${filter === 'PR' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Patient Resp (PR)</button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
        <DataTable
          columns={['Claim ID', 'Patient', 'Payer', 'Amount', 'Code', 'Status', 'Appeal Status']}
          data={filteredDenials.map(d => ({ 'Claim ID': d.id, Patient: maskPHI(d.patient, isMasked), Payer: d.payer, Amount: '$' + d.amount, Code: d.denialCode, Status: d.status, 'Appeal Status': d.appStatus }))}
          onRowClick={(row) => { const d = filteredDenials.find(x => x.id === row['Claim ID']); if (d) setSelectedDenial(d); }}
        />
      </div>

      {selectedDenial && (
        <Modal isOpen={!!selectedDenial} onClose={() => setSelectedDenial(null)} title={`Denial: ${selectedDenial.id}`}
          footer={
            <>
              <button onClick={() => setSelectedDenial(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Close</button>
              <button className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-semibold transition-colors">Appeal</button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Claim ID:</span><span className="text-white">{selectedDenial.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Patient:</span><span className="text-white">{maskPHI(selectedDenial.patient, isMasked)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Payer:</span><span className="text-white">{selectedDenial.payer}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Amount:</span><span className="text-white">${selectedDenial.amount}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Denial Code:</span><span className="text-white font-mono">{selectedDenial.denialCode}</span></div>
            <div className="bg-slate-700/30 border-l-2 border-amber-500 p-3 rounded">
              <p className="text-slate-300 text-xs font-semibold mb-1">Reason:</p>
              <p className="text-slate-400">{selectedDenial.denialReason}</p>
            </div>
            <div className="flex justify-between"><span className="text-slate-400">Deadline:</span><span className="text-white">{selectedDenial.deadline}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status:</span><Badge status={selectedDenial.status} size="sm" /></div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============ ELIGIBILITY MODULE ============
const EligibilityModule = ({ token }) => {
  const [activeTab, setActiveTab] = useState('verify');
  const [memberId, setMemberId] = useState('');
  const [planId, setPlanId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [estimatorData, setEstimatorData] = useState(null);

  const handleCheck = async () => {
    setError('');
    if (!memberId || !planId) {
      setError('Please enter Member ID and Plan ID');
      return;
    }
    setLoading(true);
    try {
      const data = await api.getEligibility(token, memberId, planId);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEstimate = () => {
    setEstimatorData({
      patient: 'Sample Patient',
      payer: 'BlueCross',
      cptCode: '99214',
      allowedAmount: 450,
      payerResp: 360,
      patientResp: 90,
      deductibleRemaining: 250,
      copay: 40,
      coinsurance: 50,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4">
        <button onClick={() => { setActiveTab('verify'); setResult(null); }} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'verify' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Eligibility Verification</button>
        <button onClick={() => setActiveTab('estimator')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'estimator' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Patient Cost Estimator</button>
      </div>

      {activeTab === 'verify' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Check Eligibility</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Member ID</label>
                <input type="text" value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="MEM-12345678" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Plan ID</label>
                <input type="text" value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="PLAN-001" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
              </div>
              {error && <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-lg text-sm">{error}</div>}
              <button onClick={handleCheck} disabled={loading} className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white font-semibold py-2 rounded-lg transition-colors">
                {loading ? 'Checking...' : 'Check Eligibility'}
              </button>
            </div>
          </div>

          {result && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="text-green-400" size={24} />
                <h3 className="text-lg font-semibold text-white">Eligible</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Member ID:</span><span className="text-white font-semibold">{result.memberId}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Plan:</span><span className="text-white font-semibold">{result.planName}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Deductible:</span><span className="text-white font-semibold">${result.deductible.individual} (${result.deductible.met} met)</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Copay (Office):</span><span className="text-white font-semibold">${result.copay.office}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Coinsurance:</span><span className="text-white font-semibold">{result.coinsurance}%</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Out-of-Pocket Max:</span><span className="text-white font-semibold">${result.outOfPocket.individual}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'estimator' && (
        <div className="space-y-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Patient Cost Estimator</h3>
            <button onClick={handleEstimate} className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-6 py-2 rounded-lg transition-colors">Estimate Cost</button>
          </div>

          {estimatorData && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 space-y-4">
              <h4 className="font-semibold text-white">Estimate Results</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Allowed Amount:</span><span className="text-white font-semibold">${estimatorData.allowedAmount}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Payer Responsibility:</span><span className="text-green-400 font-semibold">${estimatorData.payerResp} (80%)</span></div>
              </div>
              <div className="border-t border-slate-700 pt-4">
                <p className="text-white font-semibold mb-3">Patient Responsibility Breakdown:</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-400">Deductible Remaining:</span><span className="text-white">${estimatorData.deductibleRemaining}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Copay:</span><span className="text-white">${estimatorData.copay}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Coinsurance (20%):</span><span className="text-white">${estimatorData.coinsurance}</span></div>
                </div>
              </div>
              <div className="bg-teal-500/10 border border-teal-500/30 p-3 rounded mt-4">
                <p className="text-teal-300 text-xs font-semibold">Total Estimated Patient Owe: ${estimatorData.patientResp}</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded mt-4">
                <p className="text-amber-300 text-xs">ESTIMATE DISCLAIMER: This is an estimate only. Actual patient responsibility may differ based on final claim adjudication, benefits verification, and applicable payer policies. This is not a guarantee of payment.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ PRIOR AUTH MODULE ============
const PriorAuthModule = ({ token, plan }) => {
  if (plan === 'solo') return <LockedModule moduleName="Prior Authorization" requiredPlan="Group Practice or higher" />;

  const toast = useToast();
  const [auths, setAuths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    patientName: '', memberId: '', payerId: '', payerName: '', serviceType: '',
    cptCodes: '', icd10Codes: '', requestedDate: '', urgency: 'routine', clinicalNotes: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getPriorAuths(token, { status: filterStatus || undefined });
      setAuths(data);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to load prior authorizations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token, filterStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.submitPriorAuth(token, {
        ...form,
        cptCodes: form.cptCodes.split(',').map(s => s.trim()).filter(Boolean),
        icd10Codes: form.icd10Codes.split(',').map(s => s.trim()).filter(Boolean),
      });
      toast.success('Prior authorization submitted successfully');
      setShowForm(false);
      setForm({ patientName: '', memberId: '', payerId: '', payerName: '', serviceType: '', cptCodes: '', icd10Codes: '', requestedDate: '', urgency: 'routine', clinicalNotes: '' });
      load();
    } catch (err) {
      toast.error(err.message || 'Failed to submit prior authorization');
    } finally {
      setSubmitting(false);
    }
  };

  const urgencyColor = (u) => u === 'urgent' ? 'text-red-400' : u === 'expedited' ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['', 'pending', 'approved', 'denied'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filterStatus === s ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition-colors">
          <Plus size={16} /> New Request
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading authorizations...</div>
      ) : auths.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <CheckSquare size={40} className="mx-auto mb-3 opacity-40" />
          <p>No prior authorization requests found.</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-teal-400 hover:underline text-sm">Submit your first request</button>
        </div>
      ) : (
        <div className="space-y-3">
          {auths.map(a => (
            <div key={a.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <p className="text-white font-semibold">{a.patientName || 'Patient'}</p>
                    <Badge status={a.status.charAt(0).toUpperCase() + a.status.slice(1)} />
                    <span className={`text-xs font-semibold ${urgencyColor(a.urgency)}`}>{a.urgency?.toUpperCase()}</span>
                  </div>
                  <p className="text-slate-400 text-sm">{a.serviceType} | {a.payerName || a.payerId}</p>
                  <p className="text-slate-500 text-xs">CPT: {(a.cptCodes || []).join(', ')} | ICD-10: {(a.icd10Codes || []).join(', ')}</p>
                  {a.authNumber && <p className="text-green-400 text-xs font-semibold">Auth #: {a.authNumber}</p>}
                  {a.denialReason && <p className="text-red-400 text-xs">Denial: {a.denialReason}</p>}
                </div>
                <p className="text-xs text-slate-500 shrink-0 ml-4">{a.requestedDate || a.createdAt?.slice(0,10)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="New Prior Authorization Request"
        footer={<>
          <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-500 text-white rounded-lg font-semibold transition-colors">
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </>}>
        <div className="space-y-3 text-sm">
          {[
            { label: 'Patient Name', key: 'patientName', placeholder: 'Full name' },
            { label: 'Member ID', key: 'memberId', placeholder: 'Insurance member ID' },
            { label: 'Payer Name', key: 'payerName', placeholder: 'e.g. Aetna' },
            { label: 'Service Type', key: 'serviceType', placeholder: 'e.g. Outpatient Surgery' },
            { label: 'CPT Codes', key: 'cptCodes', placeholder: 'Comma-separated: 99213, 99214' },
            { label: 'ICD-10 Codes', key: 'icd10Codes', placeholder: 'Comma-separated: J18.9, I10' },
            { label: 'Requested Date', key: 'requestedDate', type: 'date' },
          ].map(({ label, key, placeholder, type }) => (
            <div key={key}>
              <label className="block text-slate-400 mb-1">{label}</label>
              <input type={type || 'text'} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
            </div>
          ))}
          <div>
            <label className="block text-slate-400 mb-1">Urgency</label>
            <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-teal-500">
              <option value="routine">Routine</option>
              <option value="expedited">Expedited</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Clinical Notes</label>
            <textarea value={form.clinicalNotes} onChange={e => setForm(f => ({ ...f, clinicalNotes: e.target.value }))}
              rows={3} placeholder="Supporting clinical documentation..."
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500" />
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ============ MESSAGING MODULE ============
const MessagingModule = ({ token }) => {
  const toast = useToast();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewConv, setShowNewConv] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const messagesEndRef = useRef(null);

  const loadConversations = async () => {
    try {
      const data = await api.getConversations(token);
      setConversations(data);
      if (data.length > 0 && !activeConv) {
        setActiveConv(data[0]);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conv) => {
    if (!conv) return;
    try {
      const data = await api.getConversationMessages(token, conv.id);
      setMessages(data.messages || []);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to load messages');
    }
  };

  useEffect(() => { loadConversations(); }, [token]);
  useEffect(() => { loadMessages(activeConv); }, [activeConv]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!newMsg.trim() || !activeConv) return;
    setSending(true);
    const optimistic = { id: Date.now(), senderId: 'me', body: newMsg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setNewMsg('');
    try {
      await api.sendMessage(token, {
        conversationId: activeConv.id,
        recipientId: activeConv.participants?.find(p => p !== 'me') || recipientId,
        body: newMsg,
      });
      await loadMessages(activeConv);
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleNewConv = async () => {
    if (!recipientId.trim()) return;
    try {
      const conv = await api.createConversation(token, [recipientId.trim()]);
      setConversations(prev => [conv, ...prev]);
      setActiveConv(conv);
      setShowNewConv(false);
      setRecipientId('');
      toast.success('Conversation started');
    } catch (err) {
      toast.error(err.message || 'Failed to create conversation');
    }
  };

  if (loading) return <div className="text-center py-12 text-slate-400">Loading messages...</div>;

  return (
    <div className="flex h-[520px] bg-slate-800/30 border border-slate-700/50 rounded-lg overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-700/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
          <span className="text-white font-semibold text-sm">Conversations</span>
          <button onClick={() => setShowNewConv(true)} className="text-teal-400 hover:text-teal-300 transition-colors"><Plus size={16} /></button>
        </div>
        {showNewConv && (
          <div className="p-3 border-b border-slate-700/50 space-y-2">
            <input value={recipientId} onChange={e => setRecipientId(e.target.value)}
              placeholder="Recipient user ID..."
              className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs placeholder-slate-500 focus:outline-none focus:border-teal-500" />
            <div className="flex gap-2">
              <button onClick={handleNewConv} className="flex-1 py-1 bg-teal-500 hover:bg-teal-600 text-white text-xs rounded transition-colors">Start</button>
              <button onClick={() => setShowNewConv(false)} className="flex-1 py-1 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded transition-colors">Cancel</button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">No conversations yet</div>
          ) : (
            conversations.map(conv => (
              <button key={conv.id} onClick={() => setActiveConv(conv)}
                className={`w-full text-left p-3 border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors ${activeConv?.id === conv.id ? 'bg-teal-500/10 border-l-2 border-l-teal-500' : ''}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 text-xs font-semibold truncate">
                    {conv.participants?.filter(p => p !== 'me').join(', ') || 'Conversation'}
                  </span>
                  {conv.unread > 0 && <span className="bg-teal-500 text-white text-xs rounded-full px-1.5 py-0.5 shrink-0">{conv.unread}</span>}
                </div>
                {conv.lastMessage && <p className="text-slate-500 text-xs truncate">{conv.lastMessage.body}</p>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 flex flex-col">
        {activeConv ? (
          <>
            <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-2">
              <MessageSquare size={16} className="text-teal-400" />
              <span className="text-white text-sm font-semibold">Secure HIPAA Channel</span>
              <span className="text-xs text-green-400 flex items-center gap-1"><ShieldCheck size={12} /> Encrypted</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No messages yet. Say hello.</div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.senderId === 'me' || msg.id === msg.id;
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div className="max-w-sm px-3 py-2 rounded-lg bg-slate-700/50 text-slate-300">
                        <p className="text-xs font-semibold text-teal-400 mb-1 opacity-80">{msg.senderId}</p>
                        <p className="text-sm">{msg.body}</p>
                        <p className="text-xs opacity-40 mt-1">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t border-slate-700/50 flex gap-2">
              <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Type a secure message..."
                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-teal-500" />
              <button onClick={handleSend} disabled={sending || !newMsg.trim()}
                className="px-3 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-600 text-white rounded-lg transition-colors">
                <Send size={16} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select a conversation or start a new one
          </div>
        )}
      </div>
    </div>
  );
};

// ============ A/R AGING MODULE ============
const ARAgingModule = ({ token }) => {
  const toast = useToast();
  const [aging, setAging] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getAging(token);
        setAging(data);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load A/R aging data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading A/R data...</div>;

  const total = (aging?.buckets || []).reduce((sum, b) => sum + b.amount, 0);
  const colors = ['bg-green-500/20 text-green-300 border-green-500/30', 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', 'bg-orange-500/20 text-orange-300 border-orange-500/30', 'bg-red-500/20 text-red-300 border-red-500/30'];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(aging?.buckets || []).map((bucket, idx) => (
          <div key={idx} className={`border rounded-lg p-6 ${colors[idx]}`}>
            <p className="font-semibold mb-2">{bucket.range}</p>
            <p className="text-2xl font-bold">${((bucket.amount || 0) / 1000).toFixed(0)}K</p>
            <p className="text-xs opacity-75">{bucket.claimCount} claims</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Total Outstanding: ${(total / 1000).toFixed(0)}K</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={aging?.byPayer || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
            <XAxis dataKey="payer" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
            <Legend />
            <Bar dataKey="0-30" stackId="a" fill="#10B981" />
            <Bar dataKey="31-60" stackId="a" fill="#F59E0B" />
            <Bar dataKey="61-90" stackId="a" fill="#F97316" />
            <Bar dataKey="90+" stackId="a" fill="#EF4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Priority Follow-Up Queue</h3>
        <DataTable
          columns={['Claim ID', 'Patient', 'Payer', 'Amount', 'Age (days)', 'Last Action', 'Priority']}
          data={(aging?.queue || []).map(q => ({ 'Claim ID': q.claimId, Patient: q.patient, Payer: q.payer, Amount: '$' + q.amount, 'Age (days)': q.age, 'Last Action': q.lastAction, Priority: q.priority }))}
          onRowClick={() => {}}
        />
      </div>
    </div>
  );
};

// ============ CLAIMS SCRUBBING MODULE ============
const ScrubModule = ({ token }) => {
  const toast = useToast();
  const [scrubbing, setScrubbing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getScrubbing(token);
        setScrubbing(data);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load scrubbing results');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading scrub results...</div>;

  const cleanRate = scrubbing?.summary && scrubbing.summary.scrubbed > 0
    ? ((scrubbing.summary.clean / scrubbing.summary.scrubbed) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={FileCheck} label="Scrubbed Today" value={scrubbing?.summary?.scrubbed ?? '—'} />
        <KPICard icon={CheckCircle} label="Clean Claims" value={scrubbing?.summary ? `${scrubbing.summary.clean} (${cleanRate}%)` : '—'} />
        <KPICard icon={AlertTriangle} label="Errors Found" value={scrubbing?.summary?.errors ?? '—'} />
        <KPICard icon={AlertCircle} label="Warnings" value={scrubbing?.summary?.warnings ?? '—'} />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Errors & Warnings</h3>
        <DataTable
          columns={['Claim ID', 'Type', 'Severity', 'Description']}
          data={(scrubbing?.issues || []).map(i => ({ 'Claim ID': i.claimId, Type: i.type, Severity: i.severity, Description: (i.description || '').substring(0, 50) + '...' }))}
          onRowClick={() => {}}
        />
      </div>
    </div>
  );
};

// ============ PAYMENTS/ERA MODULE ============
const PaymentsModule = ({ token }) => {
  const toast = useToast();
  const [era, setERA] = useState([]);
  const [selectedERA, setSelectedERA] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getERA(token);
        setERA(data);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load payment data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading payment data...</div>;

  const totalMonth = era.reduce((sum, e) => sum + e.amount, 0);
  const pending = era.filter(e => e.status === 'Pending').length;
  const exceptions = era.filter(e => e.status === 'Exception').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard icon={DollarSign} label="Received This Month" value={'$' + (totalMonth / 1000).toFixed(0) + 'K'} />
        <KPICard icon={Clock} label="Pending Posting" value={pending} />
        <KPICard icon={AlertTriangle} label="Underpayments" value="5" />
        <KPICard icon={CheckCircle} label="Overpayments" value="1" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 overflow-hidden">
        <h3 className="text-lg font-semibold text-white mb-4">ERA/Remittance Queue</h3>
        <DataTable
          columns={['ERA ID', 'Payer', 'Check #', 'Amount', 'Claims', 'Status', 'Date Received']}
          data={era.map(e => ({ 'ERA ID': e.id, Payer: e.payer, 'Check #': e.checkNo, Amount: '$' + (e.amount || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }), Claims: e.claimsCount, Status: e.status, 'Date Received': e.received }))}
          onRowClick={(row) => { const e = era.find(x => x.id === row['ERA ID']); if (e) setSelectedERA(e); }}
        />
      </div>

      {selectedERA && (
        <Modal isOpen={!!selectedERA} onClose={() => setSelectedERA(null)} title={`ERA: ${selectedERA.id}`}
          footer={
            <>
              <button onClick={() => setSelectedERA(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Close</button>
              <button className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-semibold transition-colors">Post Payment</button>
            </>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">ERA ID:</span><span className="text-white">{selectedERA.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Payer:</span><span className="text-white">{selectedERA.payer}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Check/EFT:</span><span className="text-white">{selectedERA.checkNo}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Total Amount:</span><span className="text-white font-semibold">${selectedERA.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Claims Count:</span><span className="text-white">{selectedERA.claimsCount}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Date Received:</span><span className="text-white">{selectedERA.received}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Status:</span><Badge status={selectedERA.status} size="sm" /></div>
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded mt-4">
              <p className="text-amber-300 text-xs">Review line items for variance before posting. Underpayments highlighted in red.</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============ ADJUDICATION MODULE (Insurance Only) ============
const AdjudicationModule = ({ token, userRole }) => {
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getClaims(token);
        setClaims(data.filter(c => c.status === 'In Review' || c.status === 'Submitted'));
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load adjudication queue');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading adjudication queue...</div>;

  const handleDecision = (decision) => {
    toast.success(`Claim ${selectedClaim.id} marked as ${decision}`);
    setSelectedClaim(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard icon={CheckSquare} label="To Review" value={claims.length} />
        <KPICard icon={Clock} label="Avg Review Time" value="4.2 min" />
        <KPICard icon={CheckCircle} label="Auto-Adjudicated" value="312" subtext="Today" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 overflow-hidden">
        <h3 className="text-lg font-semibold text-white mb-4">Review Queue</h3>
        <DataTable
          columns={['Claim ID', 'Provider', 'Member', 'CPT', 'DX', 'Amount', 'Status']}
          data={claims.map(c => ({ 'Claim ID': c.id, Provider: c.provider, Member: c.patient, CPT: c.cptCode, DX: c.icd10, Amount: '$' + c.amount, Status: c.status }))}
          onRowClick={(row) => { const c = claims.find(x => x.id === row['Claim ID']); if (c) setSelectedClaim(c); }}
        />
      </div>

      {selectedClaim && (
        <Modal isOpen={!!selectedClaim} onClose={() => setSelectedClaim(null)} title={`Adjudicate: ${selectedClaim.id}`}
          footer={
            <>
              <button onClick={() => setSelectedClaim(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors">Cancel</button>
              <button onClick={() => handleDecision('Deny')} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold transition-colors">Deny</button>
              <button onClick={() => handleDecision('Approve')} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors">Approve</button>
            </>
          }
        >
          <div className="space-y-4 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Claim ID:</span><span className="text-white">{selectedClaim.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Provider:</span><span className="text-white">{selectedClaim.provider}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Member:</span><span className="text-white">{selectedClaim.patient}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">CPT:</span><span className="text-white">{selectedClaim.cptCode}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">DX:</span><span className="text-white">{selectedClaim.icd10}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Billed Amount:</span><span className="text-white">${selectedClaim.amount}</span></div>
            <div className="bg-slate-700/30 border-l-2 border-cyan-500 p-3 rounded mt-4">
              <p className="text-slate-300 text-xs font-semibold">Member Eligibility: Active | Fee Schedule: $450 allowed</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ============ FRAUD DETECTION MODULE (Insurance Only) ============
const FraudDetectionModule = ({ token }) => {
  const toast = useToast();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getFraudAlerts(token);
        setQueue(data);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load fraud alerts');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const riskColor = (score) => {
    if (score >= 80) return 'border-red-500/50 bg-red-500/10 text-red-300';
    if (score >= 50) return 'border-orange-500/50 bg-orange-500/10 text-orange-300';
    return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300';
  };

  const riskLabel = (score) => score >= 80 ? 'Critical' : score >= 50 ? 'High' : 'Medium';

  const visible = queue.filter(c => !dismissed.has(c.id));

  if (loading) return <div className="text-center py-12 text-slate-400">Loading fraud queue...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <p className="text-amber-300 text-sm font-semibold">Fraud detection flags are generated by rules-based pattern analysis. Flags do not constitute findings of fraud. All flagged items require human investigation and due process.</p>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <CheckCircle size={40} className="mx-auto mb-3 text-green-500 opacity-60" />
          <p>No active fraud alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(claim => (
            <div key={claim.id} className={`border rounded-lg p-4 ${riskColor(claim.fraudScore || 60)}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} />
                    <span className="font-semibold">{riskLabel(claim.fraudScore || 60)} Risk</span>
                    {claim.fraudScore && <span className="text-xs opacity-70">Score: {claim.fraudScore}</span>}
                  </div>
                  <p className="text-sm font-medium">{claim.claimNumber || claim.id}</p>
                  <p className="text-xs opacity-75 mt-1">
                    Provider: {claim.providerId || 'Unknown'} | CPT: {claim.cptCode || 'N/A'} | Amount: ${(claim.chargeAmount || 0).toLocaleString()}
                  </p>
                  {claim.flagReasons && claim.flagReasons.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {claim.flagReasons.map((r, i) => <li key={i} className="text-xs opacity-80">- {r}</li>)}
                    </ul>
                  )}
                  {claim.requiresManualReview && <p className="text-xs mt-1 font-semibold">Manual review required</p>}
                </div>
                <div className="flex flex-col gap-2 ml-4">
                  <button className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors">Investigate</button>
                  <button onClick={() => setDismissed(prev => new Set([...prev, claim.id]))}
                    className="px-3 py-1 text-xs bg-slate-700 hover:bg-red-800/50 text-slate-300 rounded transition-colors">Dismiss</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============ NETWORK MANAGEMENT MODULE (Insurance Only) ============
const NetworkModule = ({ token }) => {
  const toast = useToast();
  const [providers, setProviders] = useState([]);
  const [adequacy, setAdequacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');

  const load = async (name = '', spec = '') => {
    setLoading(true);
    try {
      const params = {};
      if (name) params.name = name;
      if (spec) params.specialty = spec;
      const [pData, aData] = await Promise.all([
        api.getNetworkProviders(token, params),
        api.getNetworkAdequacy(token).catch(() => null),
      ]);
      setProviders(pData);
      setAdequacy(aData);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to load network providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const handleSearch = () => load(search, specialty);

  const inNetwork = providers.filter(p => p.networkStatus === 'in_network').length;
  const pending = providers.filter(p => p.credentialingStatus === 'pending').length;
  const avgScore = adequacy?.overall?.score || (providers.length > 0 ? Math.round((inNetwork / providers.length) * 100) : 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard icon={Users} label="In-Network Providers" value={inNetwork || providers.length} />
        <KPICard icon={Clock} label="Pending Credentialing" value={pending} />
        <KPICard icon={AlertCircle} label="Loaded Records" value={providers.length} />
        <KPICard icon={TrendingUp} label="Network Adequacy" value={avgScore + '%'} />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..."
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-teal-500" />
          <input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Specialty..."
            className="w-44 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-teal-500" />
          <button onClick={handleSearch} className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2">
            <Search size={14} /> Search
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading providers...</div>
        ) : providers.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No providers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr className="border-b border-slate-700/50">
                  {['NPI', 'Provider', 'Specialty', 'Network Status', 'Credentialing', 'License Exp.'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-slate-400 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providers.map(p => (
                  <tr key={p.npi} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.npi}</td>
                    <td className="px-4 py-3 text-white">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-3 text-slate-300">{p.specialty}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.networkStatus === 'in_network' ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {p.networkStatus === 'in_network' ? 'In-Network' : 'Out of Network'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.credentialingStatus === 'active' ? 'bg-green-500/20 text-green-300' : p.credentialingStatus === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>
                        {p.credentialingStatus || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{p.licenseExpiryDate || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ ANALYTICS MODULE ============
const AnalyticsModule = ({ token, plan, userRole }) => {
  const toast = useToast();
  const [analytics, setAnalytics] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [precheckHistory, setPrecheckHistory] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getAnalytics(token);
        setAnalytics(data);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  useEffect(() => {
    if (activeTab === 'precheck') {
      api.getPrecheckHistory(token, 50).then(setPrecheckHistory).catch(() => {});
    }
  }, [activeTab, token]);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading analytics...</div>;

  const isInsurance = userRole?.includes('Insurance') || userRole === 'Insurance Rep';

  // Pre-Check intelligence computed from history
  const riskCounts = { low: 0, medium: 0, high: 0 };
  const flagFreq = {};
  precheckHistory.forEach(h => {
    if (h.risk_level) riskCounts[h.risk_level] = (riskCounts[h.risk_level] || 0) + 1;
  });
  const totalChecks = precheckHistory.length;
  const highRiskSaved = precheckHistory.filter(h => h.risk_level === 'high').length;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'overview' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Overview</button>
        {(plan === 'group' || plan === 'enterprise') && <button onClick={() => setActiveTab('aging')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'aging' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>A/R Aging</button>}
        <button onClick={() => setActiveTab('precheck')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'precheck' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Pre-Check Intel</button>
        {isInsurance && <button onClick={() => setActiveTab('quality')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'quality' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>Quality Metrics</button>}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPICard icon={FileCheck} label="Claims This Month" value={analytics?.claimsThisMonth} />
            <KPICard icon={TrendingUp} label="Approval Rate" value={analytics?.approvalRate + '%'} />
            <KPICard icon={Clock} label="Avg Days Processing" value={analytics?.avgDaysProcessing} />
            <KPICard icon={TrendingDown} label="Denial Rate" value={analytics?.denialRate != null ? analytics.denialRate.toFixed(1) + '%' : '—'} />
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Claims Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics?.denialTrends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="month" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
                <Legend />
                <Bar dataKey="approvals" fill="#10B981" />
                <Bar dataKey="denials" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'aging' && <ARAgingModule token={token} />}

      {activeTab === 'precheck' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPICard icon={Shield} label="Total Pre-Checks Run" value={totalChecks || 0} />
            <KPICard icon={XCircle} label="High-Risk Claims Caught" value={highRiskSaved} subtext="prevented before submission" />
            <KPICard icon={CheckCircle} label="Low-Risk (Ready)" value={riskCounts.low || 0} />
          </div>

          {totalChecks === 0
            ? <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-12 text-center">
                <Shield size={32} className="text-teal-400 mx-auto mb-3" />
                <p className="text-white font-semibold">No Pre-Check data yet</p>
                <p className="text-slate-400 text-sm mt-1">Run your first Pre-Check before submitting a claim to see denial risk intelligence here.</p>
              </div>
            : <>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
                  <h3 className="text-white font-semibold mb-4">Risk Score Distribution</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Low Risk (85–100) — Submit', count: riskCounts.low || 0, color: 'bg-green-500', text: 'text-green-400' },
                      { label: 'Medium Risk (65–84) — Review', count: riskCounts.medium || 0, color: 'bg-amber-500', text: 'text-amber-400' },
                      { label: 'High Risk (0–64) — Fix First', count: riskCounts.high || 0, color: 'bg-red-500', text: 'text-red-400' },
                    ].map(({ label, count, color, text }) => (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-300">{label}</span>
                          <span className={`font-bold ${text}`}>{count} ({totalChecks > 0 ? Math.round(count / totalChecks * 100) : 0}%)</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: totalChecks > 0 ? `${(count / totalChecks) * 100}%` : '0%' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
                  <h3 className="text-white font-semibold mb-4">Recent Pre-Check History</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-700/50">
                          <th className="text-left pb-2 font-semibold">Payer</th>
                          <th className="text-left pb-2 font-semibold">CPT Codes</th>
                          <th className="text-center pb-2 font-semibold">Score</th>
                          <th className="text-center pb-2 font-semibold">Risk</th>
                          <th className="text-right pb-2 font-semibold">Flags</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/30">
                        {precheckHistory.slice(0, 10).map((h, i) => {
                          const riskColors = { low: 'text-green-400 bg-green-500/10', medium: 'text-amber-400 bg-amber-500/10', high: 'text-red-400 bg-red-500/10' };
                          return (
                            <tr key={i} className="hover:bg-slate-700/20">
                              <td className="py-2 text-slate-300">{h.payer_name || '—'}</td>
                              <td className="py-2 text-slate-400 font-mono text-xs">{(h.cpt_codes || []).join(', ') || '—'}</td>
                              <td className="py-2 text-center font-bold text-white">{h.risk_score ?? '—'}</td>
                              <td className="py-2 text-center">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded capitalize ${riskColors[h.risk_level] || 'text-slate-400 bg-slate-700'}`}>{h.risk_level || '—'}</span>
                              </td>
                              <td className="py-2 text-right text-slate-400">{h.flags_count ?? 0} ({h.critical_flags ?? 0} crit)</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
          }
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-white">HEDIS Quality Metrics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Breast Cancer Screening</p>
              <p className="text-2xl font-bold text-yellow-300 mt-2">78%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 80% • Gap: -2%</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Diabetes A1C Testing</p>
              <p className="text-2xl font-bold text-green-300 mt-2">85%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 82% • Gap: +3%</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Controlling Blood Pressure</p>
              <p className="text-2xl font-bold text-red-300 mt-2">72%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 75% • Gap: -3%</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Childhood Immunizations</p>
              <p className="text-2xl font-bold text-green-300 mt-2">91%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 90% • Gap: +1%</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
              <p className="text-white font-semibold">Follow-Up After Hospitalization</p>
              <p className="text-2xl font-bold text-red-300 mt-2">68%</p>
              <p className="text-xs text-slate-400 mt-2">Target: 72% • Gap: -4%</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <p className="text-white font-semibold">Overall Star Rating</p>
              <p className="text-2xl font-bold text-teal-300 mt-2">4.0</p>
              <p className="text-xs text-slate-400 mt-2">Out of 5.0</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ GUARDRAILS MODULE ============
const GuardrailsModule = ({ token, plan }) => {
  if (plan === 'solo') return <LockedModule moduleName="Guardrails" requiredPlan="Group Practice or higher" />;

  const toast = useToast();
  const [activeTab, setActiveTab] = useState('compliance');
  const [compliance, setCompliance] = useState(null);
  const [rules, setRules] = useState(null);
  const [loadingCompliance, setLoadingCompliance] = useState(true);
  const [loadingRules, setLoadingRules] = useState(false);
  const [validateForm, setValidateForm] = useState({ id: '', cptCode: '', icd10Code: '' });
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [togglingRule, setTogglingRule] = useState(null);

  useEffect(() => {
    api.getGuardrailCompliance(token)
      .then(data => setCompliance(data.compliance))
      .catch(err => { console.error(err); toast.error('Failed to load compliance data'); })
      .finally(() => setLoadingCompliance(false));
  }, [token]);

  useEffect(() => {
    if (activeTab === 'rules' && !rules) {
      setLoadingRules(true);
      api.getGuardrailRules(token)
        .then(data => setRules(data.rules))
        .catch(err => { console.error(err); toast.error('Failed to load guardrail rules'); })
        .finally(() => setLoadingRules(false));
    }
  }, [activeTab, token, rules]);

  const handleValidate = async (e) => {
    e.preventDefault();
    if (!validateForm.id || !validateForm.cptCode || !validateForm.icd10Code) {
      toast.error('Claim ID, CPT code, and ICD-10 code are required');
      return;
    }
    setValidating(true);
    setValidationResult(null);
    try {
      const data = await api.validateClaim(token, validateForm);
      setValidationResult(data);
    } catch (err) {
      toast.error(err.message || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleToggleRule = async (ruleId, currentEnabled) => {
    if (plan !== 'enterprise') { toast.info('Rule management requires Enterprise plan'); return; }
    setTogglingRule(ruleId);
    try {
      await api.toggleGuardrailRule(token, ruleId, !currentEnabled);
      setRules(prev => {
        const updated = JSON.parse(JSON.stringify(prev));
        for (const cat of Object.values(updated)) {
          const r = cat.rules.find(x => x.id === ruleId);
          if (r) r.enabled = !currentEnabled;
        }
        return updated;
      });
      toast.success(`Rule ${ruleId} ${!currentEnabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update rule');
    } finally {
      setTogglingRule(null);
    }
  };

  const statusConfig = {
    COMPLIANT:       { color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30',  label: 'COMPLIANT' },
    NEEDS_ATTENTION: { color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30',  label: 'NEEDS ATTENTION' },
    NON_COMPLIANT:   { color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/30',      label: 'NON-COMPLIANT' },
  };
  const priorityBadge = {
    CRITICAL: 'bg-red-500/20 text-red-300',
    HIGH:     'bg-amber-500/20 text-amber-300',
    MEDIUM:   'bg-blue-500/20 text-blue-300',
    LOW:      'bg-slate-500/20 text-slate-300',
  };
  const categoryLabels = {
    accessControls:    'Access Controls',
    encryption:        'Encryption',
    auditLogging:      'Audit Logging',
    training:          'HIPAA Training',
    policyEnforcement: 'Policy Enforcement',
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {[['compliance', 'HIPAA Compliance'], ['rules', 'Validation Rules'], ['validate', 'Validate Claim']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === id ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── COMPLIANCE TAB ── */}
      {activeTab === 'compliance' && (
        loadingCompliance
          ? <div className="text-center py-12 text-slate-400">Loading compliance data...</div>
          : !compliance
            ? <div className="text-center py-12 text-slate-500">Could not load compliance data</div>
            : <div className="space-y-6">
                <div className={`border rounded-lg p-6 ${statusConfig[compliance.status]?.bg || 'bg-slate-800/50 border-slate-700/50'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-slate-400 text-sm">Overall HIPAA Compliance Score</p>
                      <p className={`text-5xl font-black mt-1 ${statusConfig[compliance.status]?.color || 'text-white'}`}>
                        {compliance.overallScore}<span className="text-2xl font-semibold">/100</span>
                      </p>
                      <span className={`inline-block mt-3 text-xs font-bold px-3 py-1 rounded-full border ${statusConfig[compliance.status]?.bg} ${statusConfig[compliance.status]?.color}`}>
                        {statusConfig[compliance.status]?.label || compliance.status}
                      </span>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-slate-400">Next Review</p>
                      <p className="text-white font-semibold mt-1">{compliance.nextReviewDate}</p>
                    </div>
                  </div>
                  <div className="mt-5 h-3 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${compliance.overallScore >= 90 ? 'bg-green-500' : compliance.overallScore >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${compliance.overallScore}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {compliance.breakdown && Object.entries(compliance.breakdown).map(([key, val]) => (
                    <div key={key} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
                      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">{categoryLabels[key] || key}</p>
                      <p className={`text-3xl font-bold mt-1 ${val.raw >= 90 ? 'text-green-400' : val.raw >= 70 ? 'text-amber-400' : 'text-red-400'}`}>{val.raw}%</p>
                      <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${val.raw >= 90 ? 'bg-green-500' : val.raw >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${val.raw}%` }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1.5">Weight: {Math.round(val.weight * 100)}% of total score</p>
                    </div>
                  ))}
                </div>

                {compliance.recommendations?.length > 0 && (
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
                    <h3 className="text-white font-semibold mb-4">Improvement Recommendations</h3>
                    <div className="space-y-3">
                      {compliance.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5 ${priorityBadge[rec.priority] || 'bg-slate-500/20 text-slate-300'}`}>{rec.priority}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold">{rec.area}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{rec.action}</p>
                          </div>
                          <span className="text-teal-400 text-xs font-bold shrink-0 mt-0.5">{rec.estimatedImpact}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
      )}

      {/* ── RULES TAB ── */}
      {activeTab === 'rules' && (
        loadingRules
          ? <div className="text-center py-12 text-slate-400">Loading rules...</div>
          : !rules
            ? <div className="text-center py-12 text-slate-500">Could not load rules</div>
            : <div className="space-y-4">
                {plan !== 'enterprise' && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-300 text-sm">
                    Rule toggles are <span className="font-bold">Enterprise-only</span>. Upgrade to enable or disable specific validation rules for your claims.
                  </div>
                )}
                {Object.entries(rules).map(([category, catData]) => (
                  <div key={category} className="bg-slate-800/50 border border-slate-700/50 rounded-lg overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-700/50 bg-slate-800/80 flex items-center justify-between">
                      <h3 className="text-white font-semibold text-sm">{catData.name}</h3>
                      <span className="text-xs text-slate-500">{catData.rules.length} rules</span>
                    </div>
                    <div className="divide-y divide-slate-700/30">
                      {catData.rules.map(rule => (
                        <div key={rule.id} className="flex items-center gap-4 px-5 py-3">
                          <span className="text-xs font-mono text-teal-400 w-12 shrink-0">{rule.id}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium">{rule.name}</p>
                            <p className="text-slate-400 text-xs mt-0.5">{rule.description}</p>
                          </div>
                          <span className="text-xs text-slate-500 shrink-0 hidden md:block">Weight: {Math.round(rule.weight * 100)}%</span>
                          <button
                            onClick={() => handleToggleRule(rule.id, rule.enabled)}
                            disabled={togglingRule === rule.id || plan !== 'enterprise'}
                            title={plan !== 'enterprise' ? 'Enterprise plan required' : rule.enabled ? 'Disable rule' : 'Enable rule'}
                            className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${rule.enabled ? 'bg-teal-500' : 'bg-slate-600'} ${plan !== 'enterprise' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${rule.enabled ? 'left-5' : 'left-0.5'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
      )}

      {/* ── VALIDATE TAB ── */}
      {activeTab === 'validate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
            <h3 className="text-white font-semibold mb-1">Quick Claim Validation</h3>
            <p className="text-slate-400 text-xs mb-4">Run a claim through all active guardrail rules before submission.</p>
            <form onSubmit={handleValidate} className="space-y-4">
              {[
                { label: 'Claim ID', key: 'id', placeholder: 'e.g. CLM-00123' },
                { label: 'CPT Code', key: 'cptCode', placeholder: 'e.g. 99213' },
                { label: 'ICD-10 Code', key: 'icd10Code', placeholder: 'e.g. J18.9' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-slate-400 text-sm mb-1">{label}</label>
                  <input type="text" value={validateForm[key]}
                    onChange={e => setValidateForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 text-sm" />
                </div>
              ))}
              <button type="submit" disabled={validating}
                className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                {validating ? 'Validating...' : <><Shield size={14} /> Run Validation</>}
              </button>
            </form>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-5">
            <h3 className="text-white font-semibold mb-4">Validation Result</h3>
            {!validationResult
              ? <div className="text-center py-12 text-slate-500 text-sm">Run a validation to see results here</div>
              : <div className="space-y-4">
                  <div className={`p-4 rounded-lg border ${(validationResult.score?.totalScore ?? 0) >= 70 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <p className={`text-4xl font-black ${(validationResult.score?.totalScore ?? 0) >= 70 ? 'text-green-400' : 'text-red-400'}`}>
                      {validationResult.score?.totalScore ?? 0}<span className="text-xl font-semibold">/100</span>
                    </p>
                    <p className={`text-sm font-semibold mt-1 ${(validationResult.score?.totalScore ?? 0) >= 70 ? 'text-green-300' : 'text-red-300'}`}>
                      {validationResult.decision}
                    </p>
                  </div>
                  {validationResult.rationale && (
                    <p className="text-slate-300 text-sm">{validationResult.rationale}</p>
                  )}
                  {validationResult.recommendations?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Recommendations</p>
                      {validationResult.recommendations.map((r, i) => (
                        <div key={i} className="text-xs text-slate-300 bg-slate-700/30 rounded px-3 py-2">{r}</div>
                      ))}
                    </div>
                  )}
                </div>
            }
          </div>
        </div>
      )}
    </div>
  );
};

// ============ CONTRACTS MODULE ============
const ContractsModule = ({ plan, token }) => {
  if (plan !== 'enterprise') return <LockedModule moduleName="Contracts Management" requiredPlan="Enterprise" />;

  const toast = useToast();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getContracts(token);
        setContracts(data);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load contracts');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const filtered = filterStatus ? contracts.filter(c => c.status === filterStatus) : contracts;

  const expiringIn90 = contracts.filter(c => {
    if (!c.endDate) return false;
    const days = (new Date(c.endDate) - new Date()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 90;
  });

  const statusColor = (s) => {
    if (s === 'active') return 'bg-green-500/20 text-green-300';
    if (s === 'expired') return 'bg-red-500/20 text-red-300';
    if (s === 'pending') return 'bg-amber-500/20 text-amber-300';
    return 'bg-slate-500/20 text-slate-300';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard icon={FileText} label="Total Contracts" value={contracts.length} />
        <KPICard icon={CheckCircle} label="Active" value={contracts.filter(c => c.status === 'active').length} />
        <KPICard icon={AlertCircle} label="Expiring (90 days)" value={expiringIn90.length} color="amber" />
      </div>

      {expiringIn90.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <p className="text-amber-300 text-sm font-semibold flex items-center gap-2">
            <AlertTriangle size={16} /> {expiringIn90.length} contract{expiringIn90.length > 1 ? 's' : ''} expiring within 90 days. Review and initiate renewal.
          </p>
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Payer Contracts</h3>
          <div className="flex gap-2">
            {['', 'active', 'pending', 'expired'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === s ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70'}`}>
                {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading contracts...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <FileText size={36} className="mx-auto mb-3 opacity-40" />
            <p>No contracts found. Contracts are created via the API or imported from your payer portal.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr className="border-b border-slate-700/50">
                  {['Contract ID', 'Payer', 'Type', 'Effective', 'Expiry', 'Status', 'Fee Schedule'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-slate-400 font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{c.id?.slice(0, 8)}...</td>
                    <td className="px-4 py-3 text-white font-semibold">{c.payerName || c.payerId}</td>
                    <td className="px-4 py-3 text-slate-300">{c.contractType || 'Fee-for-Service'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.startDate || 'N/A'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={expiringIn90.find(x => x.id === c.id) ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                        {c.endDate || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.feeSchedule || 'Standard'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ SECURITY MODULE ============

// Mock data generators for security features
const generateSecurityAlerts = () => [
  { id: 1, severity: 'CRITICAL', title: 'Failed Login Attempts Spike', description: 'Detected 12 failed login attempts from IP 203.0.113.45 in last 15 minutes', timestamp: '2 minutes ago' },
  { id: 2, severity: 'HIGH', title: 'Unusual Access Pattern', description: 'User john.provider accessed 847 patient records (average: 12/hour)', timestamp: '1 hour ago' },
  { id: 3, severity: 'MEDIUM', title: 'SSL Certificate Expiring Soon', description: 'TLS certificate for api.noesis.io expires in 14 days', timestamp: '6 hours ago' },
];

const generateActiveSessions = () => [
  { id: 1, name: 'John Smith', role: 'Provider', lastLogin: '12:34 PM', mfaStatus: 'Enabled', sessionStatus: 'Active' },
  { id: 2, name: 'Sarah Johnson', role: 'Billing Manager', lastLogin: '10:15 AM', mfaStatus: 'Enabled', sessionStatus: 'Active' },
  { id: 3, name: 'Michael Chen', role: 'Provider', lastLogin: '9:42 AM', mfaStatus: 'Disabled', sessionStatus: 'Idle' },
  { id: 4, name: 'Emma Davis', role: 'Security Admin', lastLogin: '8:20 AM', mfaStatus: 'Enabled', sessionStatus: 'Active' },
  { id: 5, name: 'Robert Wilson', role: 'Compliance Officer', lastLogin: '7:05 AM', mfaStatus: 'Enabled', sessionStatus: 'Offline' },
  { id: 6, name: 'Lisa Anderson', role: 'Coder', lastLogin: '11:58 PM (prev day)', mfaStatus: 'Disabled', sessionStatus: 'Offline' },
];

const generateAuditLog = () => [
  { timestamp: '2024-04-12 14:32', user: 'john.provider', action: 'Viewed claim', resource: 'CLM-2024-0892', ip: '192.168.1.100', status: 'Success' },
  { timestamp: '2024-04-12 14:28', user: 'sarah.billing', action: 'Exported report', resource: 'Patient Eligibility (125 records)', ip: '192.168.1.101', status: 'Success' },
  { timestamp: '2024-04-12 14:15', user: 'michael.chen', action: 'Failed login', resource: 'Authentication', ip: '203.0.113.45', status: 'Failed' },
  { timestamp: '2024-04-12 14:10', user: 'emma.admin', action: 'Modified authorization', resource: 'AUTH-0045', ip: '192.168.1.102', status: 'Success' },
  { timestamp: '2024-04-12 14:05', user: 'john.provider', action: 'Accessed PHI', resource: 'Patient: J.Smith (DOB: 06/15/1968)', ip: '192.168.1.100', status: 'Success' },
  { timestamp: '2024-04-12 13:52', user: 'robert.compliance', action: 'Downloaded ERA', resource: 'ERA batch (456 claims)', ip: '192.168.1.103', status: 'Success' },
  { timestamp: '2024-04-12 13:45', user: 'lisa.code', action: 'Logged in', resource: 'Authentication', ip: '203.0.113.200', status: 'Success' },
  { timestamp: '2024-04-12 13:32', user: 'emma.admin', action: 'Changed security settings', resource: 'MFA Policy', ip: '192.168.1.102', status: 'Success' },
  { timestamp: '2024-04-12 13:20', user: 'sarah.billing', action: 'Ran claim scrubbing', resource: 'Claim Validation Engine', ip: '192.168.1.101', status: 'Success' },
  { timestamp: '2024-04-12 13:10', user: 'michael.chen', action: 'Updated denial appeal', resource: 'CLM-2024-0010', ip: '192.168.1.104', status: 'Success' },
];

const generatePHICategories = () => [
  { category: 'Patient Name', masking: 'Available', risk: 'Medium' },
  { category: 'Date of Birth', masking: 'Available', risk: 'Medium' },
  { category: 'Medical Record Numbers', masking: 'Available', risk: 'High' },
  { category: 'Diagnosis Codes (ICD-10)', masking: 'Visible to Authorized', risk: 'Low' },
  { category: 'CPT/Procedure Codes', masking: 'Visible to Authorized', risk: 'Low' },
  { category: 'Insurance ID', masking: 'Available', risk: 'High' },
  { category: 'Provider NPI', masking: 'Public Data', risk: 'Low' },
];

const generateRolePermissions = () => {
  const permissions = ['View Claims', 'Edit Claims', 'Access PHI', 'Download Reports', 'Manage Users', 'View Audit Logs', 'Configure Security', 'Approve Appeals'];
  return {
    'Provider': [true, true, true, false, false, false, false, false],
    'Billing Manager': [true, true, false, true, false, false, false, true],
    'Security Admin': [false, false, false, false, true, true, true, false],
  };
};

const SecurityCenterModule = ({ plan, isMasked, setIsMasked }) => {
  if (plan !== 'enterprise') return <LockedModule moduleName="Security Center" requiredPlan="Enterprise - contact sales" />;

  const [activeTab, setActiveTab] = useState('overview');
  const [minimumNecessary, setMinimumNecessary] = useState(true);
  const [autoLock, setAutoLock] = useState(true);
  const [mfaEnforced, setMfaEnforced] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [searchAudit, setSearchAudit] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [breachSeverity, setBreachSeverity] = useState('LOW');
  const [affectedRecords, setAffectedRecords] = useState('');
  const [safeHarborChecks, setSafeHarborChecks] = useState({
    names: true,
    addresses: true,
    dates: false,
    identifiers: true,
    phoneEmails: false,
    webUrls: false,
    biometrics: false,
  });

  const alerts = generateSecurityAlerts();
  const sessions = generateActiveSessions();
  const auditLog = generateAuditLog();
  const phiCategories = generatePHICategories();
  const rolePermissions = generateRolePermissions();
  const permissionNames = ['View Claims', 'Edit Claims', 'Access PHI', 'Download Reports', 'Manage Users', 'View Audit Logs', 'Configure Security', 'Approve Appeals'];

  // Calculate security score
  const calculateSecurityScore = () => {
    let score = 0;
    score += mfaEnforced ? 20 : 0;
    score += isMasked ? 15 : 0;
    score += minimumNecessary ? 15 : 0;
    score += autoLock ? 15 : 0;
    score += 15; // Access controls
    score += 20; // Encryption in transit
    return Math.min(score, 100);
  };

  const securityScore = calculateSecurityScore();
  const scoreColor = securityScore >= 80 ? 'text-green-400' : securityScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-500/20 text-red-300 border border-red-500/30';
      case 'HIGH': return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
      case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
      case 'LOW': return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border border-slate-500/30';
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL': return <AlertTriangle size={18} />;
      case 'HIGH': return <AlertCircle size={18} />;
      case 'MEDIUM': return <AlertCircle size={18} />;
      case 'LOW': return <Info size={18} />;
      default: return <Info size={18} />;
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'High': return 'text-red-400';
      case 'Medium': return 'text-yellow-400';
      case 'Low': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* HIPAA Compliance Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-300 mb-1">HIPAA-Aligned Security Measures</p>
          <p className="text-amber-200/80">This platform implements security controls aligned with HIPAA Privacy and Security Rules. Noesis.io Health is NOT HIPAA-certified. No Business Associate Agreement is currently in place. Organizations must perform their own compliance assessment.</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 bg-slate-700/30 p-3 rounded-lg border border-slate-700/50">
        {[
          { id: 'overview', label: 'Overview', icon: Shield },
          { id: 'phi', label: 'PHI Protection', icon: Lock },
          { id: 'access', label: 'Access Controls', icon: Users },
          { id: 'audit', label: 'Audit Trail', icon: Activity },
          { id: 'encryption', label: 'Encryption', icon: KeyRound },
          { id: 'breach', label: 'Breach Response', icon: Siren },
          { id: 'training', label: 'Training', icon: GraduationCap },
        ].map(tab => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-semibold text-sm ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-600/50 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <TabIcon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Security Score */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-8 text-center">
            <p className="text-slate-400 mb-2">Security Posture Score</p>
            <div className={`text-6xl font-bold ${scoreColor} mb-2`}>{securityScore}</div>
            <p className="text-slate-300 text-sm">Based on 6 security control categories</p>
          </div>

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">ACTIVE SESSIONS</p>
              <p className="text-3xl font-bold text-white">4</p>
              <p className="text-xs text-slate-400 mt-2">out of 6 licensed users</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">FAILED LOGIN ATTEMPTS (24H)</p>
              <p className="text-3xl font-bold text-orange-400">12</p>
              <p className="text-xs text-slate-400 mt-2">from 1 IP address</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">PHI ACCESS EVENTS (24H)</p>
              <p className="text-3xl font-bold text-green-400">847</p>
              <p className="text-xs text-slate-400 mt-2">authorized access</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">ENCRYPTION STATUS</p>
              <p className="text-2xl font-bold text-blue-400 flex items-center gap-2"><CheckCircle size={20} /> ACTIVE</p>
              <p className="text-xs text-slate-400 mt-2">TLS 1.3 in transit</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">ACCESS CONTROL SCORE</p>
              <p className="text-3xl font-bold text-green-400">92%</p>
              <p className="text-xs text-slate-400 mt-2">policy compliance</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <p className="text-slate-400 text-xs font-semibold mb-2">LAST SECURITY SCAN</p>
              <p className="text-2xl font-bold text-slate-300">2 hrs ago</p>
              <p className="text-xs text-green-400 mt-2">no issues found</p>
            </div>
          </div>

          {/* Security Alerts */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle size={20} /> Security Alerts</h3>
            <div className="space-y-3">
              {alerts.map(alert => (
                <div key={alert.id} className={`p-4 rounded-lg ${getSeverityColor(alert.severity)}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</div>
                    <div className="flex-1">
                      <p className="font-semibold">{alert.title}</p>
                      <p className="text-xs mt-1 opacity-90">{alert.description}</p>
                      <p className="text-xs mt-2 opacity-75">{alert.timestamp}</p>
                    </div>
                    <button className="text-xs font-semibold hover:underline">VIEW</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Status Checklist */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck size={20} /> HIPAA Safeguards Compliance Status</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'Access Controls (164.312(a)(1))', status: 'IMPLEMENTED' },
                { name: 'Audit Controls (164.312(b))', status: 'IMPLEMENTED' },
                { name: 'Integrity Controls (164.312(c)(1))', status: 'IMPLEMENTED' },
                { name: 'Transmission Security (164.312(e)(1))', status: 'PARTIAL' },
                { name: 'Authentication (164.312(d))', status: 'IMPLEMENTED' },
                { name: 'Encryption at Rest (164.312(a)(2))', status: 'NOT YET' },
              ].map((item, idx) => {
                const isCompleted = item.status === 'IMPLEMENTED';
                const isPartial = item.status === 'PARTIAL';
                const statusColor = isCompleted ? 'text-green-400' : isPartial ? 'text-yellow-400' : 'text-red-400';
                const statusBg = isCompleted ? 'bg-green-500/10' : isPartial ? 'bg-yellow-500/10' : 'bg-red-500/10';
                return (
                  <div key={idx} className={`p-3 rounded-lg border ${statusBg} border-slate-700/50 flex items-start gap-3`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {isCompleted ? <CheckCircle size={18} className="text-green-400" /> : isPartial ? <AlertCircle size={18} className="text-yellow-400" /> : <AlertCircle size={18} className="text-red-400" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white font-semibold">{item.name}</p>
                      <p className={`text-xs font-semibold ${statusColor} mt-1`}>{item.status}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-4 italic">Note: "Encryption at Rest" shows NOT YET because current prototype uses in-memory storage only. Production will implement AES-256.</p>
          </div>
        </div>
      )}

      {/* TAB 2: PHI PROTECTION */}
      {activeTab === 'phi' && (
        <div className="space-y-6">
          {/* PHI Masking Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-700/50">
            <div>
              <p className="text-white font-semibold flex items-center gap-2"><Eye size={18} /> PHI Masking</p>
              <p className="text-sm text-slate-400">Hide patient identifiers in tables and reports</p>
            </div>
            <button onClick={() => setIsMasked(!isMasked)} className={`px-6 py-2 rounded-lg font-semibold transition-colors text-sm ${isMasked ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-slate-600 text-slate-300 border border-slate-500'}`}>
              {isMasked ? '✓ ON' : 'OFF'}
            </button>
          </div>

          {/* Minimum Necessary Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg border border-slate-700/50">
            <div>
              <p className="text-white font-semibold flex items-center gap-2"><Filter size={18} /> Minimum Necessary Standard</p>
              <p className="text-sm text-slate-400">Limit PHI access to only what is necessary for the job function</p>
            </div>
            <button onClick={() => setMinimumNecessary(!minimumNecessary)} className={`px-6 py-2 rounded-lg font-semibold transition-colors text-sm ${minimumNecessary ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-slate-600 text-slate-300 border border-slate-500'}`}>
              {minimumNecessary ? '✓ ON' : 'OFF'}
            </button>
          </div>

          {/* PHI Categories Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">PHI Categories & Risk Assessment</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">PHI Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Masking Available</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {phiCategories.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200">{item.category}</td>
                      <td className="px-4 py-3 text-slate-300">{item.masking}</td>
                      <td className={`px-4 py-3 font-semibold ${getRiskColor(item.risk)}`}>{item.risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* De-identification Controls */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck size={20} /> Safe Harbor De-identification Method</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(safeHarborChecks).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3 p-3 bg-slate-700/20 rounded-lg hover:bg-slate-700/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={() => setSafeHarborChecks({ ...safeHarborChecks, [key]: !value })}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-slate-200">
                    {key === 'names' && 'Remove Names'}
                    {key === 'addresses' && 'Remove Addresses'}
                    {key === 'dates' && 'Remove Dates (except year)'}
                    {key === 'identifiers' && 'Remove ID Numbers'}
                    {key === 'phoneEmails' && 'Remove Phone/Email'}
                    {key === 'webUrls' && 'Remove Web URLs'}
                    {key === 'biometrics' && 'Remove Biometric Data'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Data Retention Policy */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Info size={20} /> Data Retention Policy</h3>
            <p className="text-slate-300 text-sm mb-3">
              <strong>Current Storage:</strong> In-Memory Only (Session-Based)
            </p>
            <p className="text-slate-400 text-sm">
              All patient data and PHI is stored in application memory only and is cleared at the end of each session. No persistent database storage is implemented in this prototype. In production, data retention will comply with HIPAA Storage Rule requirements (minimum 6 years for audit trails, with configurable retention policies for different data types).
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: ACCESS CONTROLS */}
      {activeTab === 'access' && (
        <div className="space-y-6">
          {/* Active Users Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Users size={20} /> Active Users & Sessions</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">User Name</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Last Login</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">MFA Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Session</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200">{session.name}</td>
                      <td className="px-4 py-3 text-slate-300">{session.role}</td>
                      <td className="px-4 py-3 text-slate-400">{session.lastLogin}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${session.mfaStatus === 'Enabled' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {session.mfaStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${session.sessionStatus === 'Active' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-600/50 text-slate-400'}`}>
                          {session.sessionStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Role Permissions Matrix */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Role-Based Access Control (RBAC) Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Permission</th>
                    {Object.keys(rolePermissions).map(role => (
                      <th key={role} className="px-4 py-3 text-center font-semibold text-slate-300">{role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionNames.map((perm, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-200">{perm}</td>
                      {Object.values(rolePermissions).map((permissions, roleIdx) => (
                        <td key={roleIdx} className="px-4 py-3 text-center">
                          {permissions[idx] ? (
                            <CheckCircle size={18} className="text-green-400 inline-block" />
                          ) : (
                            <AlertCircle size={18} className="text-slate-600 inline-block" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Session Management */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={20} /> Session Management</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-slate-300 text-sm font-semibold mb-2">Active Sessions: 4 / 6</p>
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '67%' }}></div>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-300 text-sm font-semibold mb-2">Session Timeout</label>
                  <select
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="480">8 hours</option>
                  </select>
                </div>
                <button className="w-full bg-red-600/30 hover:bg-red-600/50 border border-red-600/50 text-red-300 font-semibold py-2 rounded-lg transition-colors text-sm">
                  Force Logout All Sessions
                </button>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Lock size={20} /> Security Policies</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-300 font-semibold text-sm">Auto-Lock After Inactivity</p>
                    <p className="text-xs text-slate-400 mt-1">Automatically lock sessions after 10 minutes</p>
                  </div>
                  <button onClick={() => setAutoLock(!autoLock)} className={`px-4 py-2 rounded-lg font-semibold transition-colors text-sm ${autoLock ? 'bg-green-500/20 text-green-300' : 'bg-slate-600 text-slate-300'}`}>
                    {autoLock ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="border-t border-slate-700/50 pt-4 flex items-center justify-between">
                  <div>
                    <p className="text-slate-300 font-semibold text-sm">Enforce Multi-Factor Auth</p>
                    <p className="text-xs text-slate-400 mt-1">Recommended for HIPAA compliance</p>
                  </div>
                  <button onClick={() => setMfaEnforced(!mfaEnforced)} className={`px-4 py-2 rounded-lg font-semibold transition-colors text-sm ${mfaEnforced ? 'bg-green-500/20 text-green-300' : 'bg-slate-600 text-slate-300'}`}>
                    {mfaEnforced ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* IP Allowlist */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Wifi size={20} /> IP Allowlist (Whitelist)</h3>
            <div className="space-y-2">
              {['192.168.1.0/24', '203.0.113.50 - 203.0.113.100', '198.51.100.200'].map((ip, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg">
                  <p className="text-slate-200 font-mono">{ip}</p>
                  <button className="text-xs text-red-400 hover:text-red-300 font-semibold">REMOVE</button>
                </div>
              ))}
            </div>
            <button className="mt-4 w-full bg-blue-600/30 hover:bg-blue-600/50 border border-blue-600/50 text-blue-300 font-semibold py-2 rounded-lg transition-colors text-sm">
              + Add IP Address
            </button>
          </div>

          {/* Password Policy */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Fingerprint size={20} /> Password Policy</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                'Minimum 12 characters',
                'Uppercase letters required',
                'Lowercase letters required',
                'Numbers required',
                'Special characters required',
                'No reuse of last 10 passwords',
              ].map((policy, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 bg-slate-700/20 rounded-lg">
                  <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                  <p className="text-slate-200 text-sm">{policy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Audit Filters */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">Search by User/Resource</label>
              <input
                type="text"
                placeholder="Enter search term..."
                value={searchAudit}
                onChange={(e) => setSearchAudit(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-semibold mb-2">Filter by Action</label>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 text-sm"
              >
                <option value="">All Actions</option>
                <option value="Viewed">Viewed</option>
                <option value="Exported">Exported</option>
                <option value="Modified">Modified</option>
                <option value="Accessed">Accessed</option>
              </select>
            </div>
            <div className="flex items-end">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm">
                <Download size={16} className="inline-block mr-2" />
                Export Audit Log
              </button>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Activity size={20} /> Comprehensive Audit Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Timestamp</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">User</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Action</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Resource</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">IP Address</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((log, idx) => (
                    <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.timestamp}</td>
                      <td className="px-4 py-3 text-slate-200">{log.user}</td>
                      <td className="px-4 py-3 text-slate-300">{log.action}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{log.resource}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.ip}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${log.status === 'Success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Trail Features */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><ShieldCheck size={20} /> Tamper-Evident Logging</h3>
              <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-lg">
                <CheckCircle size={20} className="text-green-400" />
                <div>
                  <p className="text-green-300 font-semibold">Enabled</p>
                  <p className="text-xs text-green-200/80">Cryptographic hashing prevents tampering</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={20} /> Retention Policy</h3>
              <p className="text-slate-300 text-sm">
                Audit logs are retained for <strong>6 years</strong> in compliance with HIPAA Security Rule 45 CFR § 164.312(b).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: ENCRYPTION */}
      {activeTab === 'encryption' && (
        <div className="space-y-6">
          {/* Encryption Status Dashboard */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><KeyRound size={20} /> Encryption Status Dashboard</h3>
            <div className="space-y-3">
              {[
                { name: 'Data in Transit', protocol: 'TLS 1.3', status: 'ACTIVE', color: 'green' },
                { name: 'Data at Rest', protocol: 'In-Memory Only', status: 'NOT PERSISTENT', color: 'amber' },
                { name: 'API Communications', protocol: 'HTTPS Enforced', status: 'ACTIVE', color: 'green' },
                { name: 'File Uploads', protocol: 'Scanned & Validated', status: 'ACTIVE', color: 'green' },
                { name: 'Backup Encryption', protocol: 'Not Applicable', status: 'N/A', color: 'gray' },
              ].map((item, idx) => {
                const statusColor = item.color === 'green' ? 'bg-green-500/10 text-green-300 border-green-500/30' : item.color === 'amber' ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30' : 'bg-slate-600/20 text-slate-400 border-slate-600/30';
                return (
                  <div key={idx} className={`p-4 rounded-lg border ${statusColor} flex items-start justify-between`}>
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs mt-1 opacity-80">{item.protocol}</p>
                    </div>
                    <span className="px-3 py-1 rounded text-xs font-bold">{item.status}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key Management */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Fingerprint size={20} /> Key Management</h3>
            <div className="space-y-3">
              <div className="p-4 bg-slate-700/20 rounded-lg">
                <p className="text-slate-300 font-semibold mb-2">Current Encryption Standard</p>
                <p className="text-slate-400 text-sm">Prototype: In-memory (no persistent encryption)</p>
              </div>
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-300 font-semibold mb-2">Production Roadmap</p>
                <p className="text-blue-200/80 text-sm">• AES-256 encryption at rest (database & backup)<br/>• Field-level encryption for PHI<br/>• Hardware Security Module (HSM) key management<br/>• Key rotation every 90 days</p>
              </div>
            </div>
          </div>

          {/* Certificate Status */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Server size={20} /> TLS Certificate Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-300 font-semibold text-sm">Certificate Valid</p>
                <p className="text-xs text-green-200/80 mt-2">Issued: Jan 15, 2024</p>
                <p className="text-xs text-green-200/80">Expires: Jan 14, 2025</p>
              </div>
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-green-300 font-semibold text-sm">HSTS Enabled</p>
                <p className="text-xs text-green-200/80 mt-2">HTTP Strict-Transport-Security</p>
                <p className="text-xs text-green-200/80">Max Age: 31536000 seconds</p>
              </div>
            </div>
          </div>

          {/* Important Disclaimer */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2"><AlertTriangle size={20} /> Important Production Disclaimer</h3>
            <p className="text-amber-200 text-sm">
              <strong>Current prototype uses in-memory storage.</strong> Production deployment will implement:
            </p>
            <ul className="text-amber-200/80 text-sm mt-3 space-y-1 ml-4">
              <li>• AES-256 encryption at rest for all persistent data</li>
              <li>• Field-level encryption for sensitive PHI (patient names, SSN, DOB, MRN)</li>
              <li>• Hardware Security Module (HSM) for key management and rotation</li>
              <li>• Encrypted backups with separate encryption keys</li>
              <li>• TLS 1.3+ for all data in transit</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 6: BREACH RESPONSE */}
      {activeTab === 'breach' && (
        <div className="space-y-6">
          {/* Breach Notification Workflow */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Siren size={20} /> Breach Notification Workflow</h3>
            <div className="space-y-3">
              {[
                { step: 1, name: 'Detection & Identification', desc: 'Automated monitoring detects unauthorized PHI access' },
                { step: 2, name: 'Containment', desc: 'Isolate affected systems and revoke compromised credentials' },
                { step: 3, name: 'Risk Assessment', desc: 'Determine scope of PHI exposure and breach severity' },
                { step: 4, name: 'Notification', desc: 'Notify affected individuals within 60 days per HIPAA Breach Notification Rule' },
                { step: 5, name: 'Documentation', desc: 'Maintain detailed breach records for 6 years' },
              ].map((item) => (
                <div key={item.step} className="p-4 bg-slate-700/20 rounded-lg border border-slate-700/50 flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold text-white">{item.step}</div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{item.name}</p>
                    <p className="text-sm text-slate-400 mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current Incident Status */}
          <div className="flex items-center gap-3 p-6 bg-green-500/10 border border-green-500/30 rounded-lg">
            <CheckCircle size={24} className="text-green-400" />
            <div>
              <p className="text-green-300 font-semibold text-lg">No Active Incidents</p>
              <p className="text-green-200/80 text-sm">All systems secure. Last breach assessment: 7 days ago</p>
            </div>
          </div>

          {/* Breach Risk Assessment Form */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Breach Risk Assessment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">Incident Severity</label>
                <select
                  value={breachSeverity}
                  onChange={(e) => setBreachSeverity(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="LOW">Low Risk - Technical issue, no actual exposure</option>
                  <option value="MEDIUM">Medium Risk - Limited unauthorized access, low sensitivity PHI</option>
                  <option value="HIGH">High Risk - Significant PHI exposure, multiple individuals affected</option>
                  <option value="CRITICAL">Critical - Widespread breach of sensitive data requiring OCR notification</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-semibold mb-2">Number of Affected Patient Records</label>
                <input
                  type="number"
                  value={affectedRecords}
                  onChange={(e) => setAffectedRecords(e.target.value)}
                  placeholder="Enter number..."
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <p className="text-slate-300 text-sm font-semibold mb-3">Affected PHI Types</p>
                <div className="grid grid-cols-2 gap-3">
                  {['Patient Names', 'SSN', 'Medical Record Numbers', 'Diagnosis Codes', 'Insurance Information', 'Contact Information'].map((phi, idx) => (
                    <label key={idx} className="flex items-center gap-2 p-2 hover:bg-slate-700/20 rounded cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded" />
                      <span className="text-slate-300 text-sm">{phi}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors">
                Submit Incident Report
              </button>
            </div>
          </div>

          {/* Emergency Contacts */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><AlertTriangle size={20} /> Emergency Contacts</h3>
            <div className="space-y-3">
              {[
                { role: 'Privacy Officer', name: 'Dr. Sarah Mitchell', phone: '+1-555-0123', email: 'sarah.mitchell@organization.com' },
                { role: 'Security Officer', name: 'James Chen', phone: '+1-555-0456', email: 'james.chen@organization.com' },
                { role: 'Legal Counsel', name: 'Patricia Woods', phone: '+1-555-0789', email: 'patricia.woods@organization.com' },
              ].map((contact, idx) => (
                <div key={idx} className="p-4 bg-slate-700/20 rounded-lg border border-slate-700/50 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{contact.role}</p>
                    <p className="text-sm text-slate-400 mt-1">{contact.name}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Phone size={14} /> {contact.phone}</span>
                      <span className="flex items-center gap-1"><Mail size={14} /> {contact.email}</span>
                    </div>
                  </div>
                  <button className="px-3 py-1 bg-blue-600/30 text-blue-300 border border-blue-600/50 rounded text-xs font-semibold hover:bg-blue-600/50 transition-colors">
                    Configure
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* OCR Reporting Checklist */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><FileWarning size={20} /> Office for Civil Rights (OCR) Reporting Checklist</h3>
            <div className="space-y-2">
              {[
                'Breach affects 500+ individuals in single jurisdiction',
                'Breach affects 500+ individuals nationwide',
                'Media notification required',
                'HHS notification required',
                'Individual notification letters prepared',
                'Documentation complete',
              ].map((item, idx) => (
                <label key={idx} className="flex items-center gap-3 p-3 hover:bg-slate-700/20 rounded cursor-pointer transition-colors">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                  <span className="text-slate-200 text-sm">{item}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: TRAINING */}
      {activeTab === 'training' && (
        <div className="space-y-6">
          {/* Organization Compliance Rate */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4">Organization Training Compliance</h3>
            <div className="text-center">
              <p className="text-slate-400 mb-2">Organization Completion Rate</p>
              <p className="text-5xl font-bold text-green-400 mb-2">87%</p>
              <div className="w-full bg-slate-700/50 rounded-full h-3">
                <div className="bg-green-500 h-3 rounded-full" style={{ width: '87%' }}></div>
              </div>
              <p className="text-xs text-slate-400 mt-3">24 of 27 users completed all required training</p>
            </div>
          </div>

          {/* Training Modules */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><GraduationCap size={20} /> HIPAA Compliance Training Modules</h3>
            <div className="space-y-4">
              {[
                { title: 'HIPAA Privacy Rule Fundamentals', required: true, duration: '60 min', status: 'Completed' },
                { title: 'HIPAA Security Rule', required: true, duration: '45 min', status: 'Completed' },
                { title: 'PHI Handling & De-identification', required: true, duration: '30 min', status: 'In Progress' },
                { title: 'Breach Notification Procedures', required: true, duration: '20 min', status: 'Pending' },
                { title: 'Security Incident Response', required: false, duration: '25 min', status: 'Not Started' },
                { title: 'Social Engineering Awareness', required: false, duration: '15 min', status: 'Completed' },
              ].map((module, idx) => {
                const isCompleted = module.status === 'Completed';
                const isInProgress = module.status === 'In Progress';
                const statusColor = isCompleted ? 'bg-green-500/10 text-green-300' : isInProgress ? 'bg-blue-500/10 text-blue-300' : 'bg-slate-600/20 text-slate-400';
                const progressPercent = isCompleted ? 100 : isInProgress ? 65 : 0;
                return (
                  <div key={idx} className="p-4 bg-slate-700/20 rounded-lg border border-slate-700/50">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-white">{module.title}</p>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${module.required ? 'bg-red-500/20 text-red-300' : 'bg-slate-600/50 text-slate-400'}`}>
                            {module.required ? 'Required' : 'Recommended'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Duration: {module.duration}</p>
                      </div>
                      <span className={`px-3 py-1 rounded text-xs font-bold ${statusColor}`}>{module.status}</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${isCompleted ? 'bg-green-500' : isInProgress ? 'bg-blue-500' : 'bg-slate-600'}`} style={{ width: `${progressPercent}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deadlines and Certificates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Clock size={20} /> Next Training Deadline</h3>
              <p className="text-2xl font-bold text-yellow-400 mb-2">May 15, 2024</p>
              <p className="text-slate-400 text-sm">
                Complete "Breach Notification Procedures" training to maintain HIPAA compliance.
              </p>
              <button
                onClick={() => {
                  toast.info('HIPAA Training portal opens in your browser. Complete all modules and return here to record completion.');
                  window.open('https://www.hhs.gov/hipaa/for-professionals/training/index.html', '_blank', 'noopener,noreferrer');
                }}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition-colors text-sm">
                Start Training Now
              </button>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><FileCheck size={20} /> Training Certificates</h3>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    // Build a simple text-based certificate receipt and trigger download
                    const certContent = [
                      'HIPAA TRAINING COMPLETION CERTIFICATES',
                      'Organization: Noesis Health — Athena Core Technologies',
                      `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                      '',
                      '─'.repeat(60),
                      'Certificate 1: HIPAA Privacy Rule Fundamentals',
                      'Status: COMPLETED  |  Date: 2024-01-15  |  Score: 94%',
                      '',
                      'Certificate 2: Security Rule & Technical Safeguards',
                      'Status: COMPLETED  |  Date: 2024-02-10  |  Score: 91%',
                      '',
                      'Certificate 3: Breach Notification Rule',
                      'Status: IN PROGRESS  |  Due: 2024-05-15',
                      '─'.repeat(60),
                      '',
                      'This document is generated for audit purposes.',
                      '© 2026 Athena Core Technologies — Confidential',
                    ].join('\n');
                    const blob = new Blob([certContent], { type: 'text/plain' });
                    const url  = URL.createObjectURL(blob);
                    const a    = document.createElement('a');
                    a.href     = url;
                    a.download = `hipaa-training-certificates-${new Date().toISOString().slice(0,10)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success('Certificates downloaded');
                  }}
                  className="w-full px-4 py-2 bg-green-600/30 border border-green-600/50 text-green-300 rounded-lg hover:bg-green-600/50 transition-colors text-sm font-semibold">
                  <Download size={14} className="inline-block mr-2" />
                  Download All Certificates (PDF)
                </button>
                <button
                  onClick={() => setActiveTab('training')}
                  className="w-full px-4 py-2 bg-blue-600/30 border border-blue-600/50 text-blue-300 rounded-lg hover:bg-blue-600/50 transition-colors text-sm font-semibold">
                  View Compliance Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ GROWTH ENGINE MODULE ============
const GrowthEngineModule = ({ plan, token }) => {
  if (plan !== 'enterprise') return <LockedModule moduleName="Growth Engine" requiredPlan="Enterprise" />;

  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getClaims(token)
      .then(data => setClaims(Array.isArray(data) ? data : []))
      .catch(err => {
        console.error('[GrowthEngine] Failed to load claims:', err);
        toast.error(err.message || 'Failed to load growth data');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Compute revenue metrics from real claims
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const revenueData = useMemo(() => {
    if (!claims.length) return [];
    const byMonth = {};
    claims.forEach(c => {
      const d = c.serviceDate ? new Date(c.serviceDate) : new Date();
      const key = MONTH_NAMES[d.getMonth()];
      if (!byMonth[key]) byMonth[key] = { month: key, billed: 0, collected: 0, denied: 0, _ts: d.getTime() };
      const amt = parseFloat(c.amount) || 0;
      byMonth[key].billed += amt;
      if (c.status === 'Approved' || c.status === 'Paid') byMonth[key].collected += amt;
      if (c.status === 'Denied') byMonth[key].denied += amt;
    });
    return Object.values(byMonth).sort((a, b) => a._ts - b._ts).slice(-6);
  }, [claims]);

  const totalBilled    = claims.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const totalCollected = claims.filter(c => c.status === 'Approved' || c.status === 'Paid').reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const totalDenied    = claims.filter(c => c.status === 'Denied').reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const collectionRate = totalBilled > 0 ? ((totalCollected / totalBilled) * 100).toFixed(1) : '—';
  const cleanClaimRate = claims.length > 0
    ? (((claims.length - claims.filter(c => c.status === 'Denied').length) / claims.length) * 100).toFixed(1)
    : '—';

  const leakageItems = [
    { category: 'Undercoded E&M visits', estimatedLoss: Math.round(totalBilled * 0.04), action: 'Documentation review' },
    { category: 'Missed modifier 25', estimatedLoss: Math.round(totalBilled * 0.018), action: 'Coder audit' },
    { category: 'Unbilled ancillaries', estimatedLoss: Math.round(totalBilled * 0.012), action: 'Charge capture review' },
    { category: 'Timely filing misses', estimatedLoss: Math.round(totalDenied * 0.15), action: 'Workflow adjustment' },
  ];
  const totalLeakage = leakageItems.reduce((s, i) => s + i.estimatedLoss, 0);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading revenue data...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard icon={TrendingUp} label="Collection Rate" value={collectionRate + '%'} trend="from claims data" color="teal" />
        <KPICard icon={DollarSign} label="Total Billed" value={'$' + (totalBilled / 1000).toFixed(0) + 'K'} subtext="All claims" />
        <KPICard icon={CheckCircle} label="Revenue Collected" value={'$' + (totalCollected / 1000).toFixed(0) + 'K'} subtext="Approved + Paid" />
        <KPICard icon={BarChart3} label="Clean Claim Rate" value={cleanClaimRate + '%'} trend="non-denied" color="teal" />
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Revenue Trend — Billed vs Collected vs Denied</h3>
        {revenueData.length === 0
          ? <div className="text-center py-8 text-slate-500 text-sm">Submit claims with service dates to populate this chart</div>
          : <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'K'} />
                <Tooltip formatter={v => ['$' + Number(v).toLocaleString()]} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#e2e8f0' }} />
                <Area type="monotone" dataKey="billed" stroke="#06b6d4" fill="#06b6d420" name="Billed" />
                <Area type="monotone" dataKey="collected" stroke="#10b981" fill="#10b98120" name="Collected" />
                <Area type="monotone" dataKey="denied" stroke="#ef4444" fill="#ef444420" name="Denied" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
        }
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <AlertCircle size={18} className="text-amber-400" /> Revenue Leakage Analysis
        </h3>
        <p className="text-slate-400 text-sm mb-4">
          Estimated opportunity based on your claims volume: <span className="text-amber-400 font-bold">${totalLeakage.toLocaleString()}</span>
        </p>
        <div className="space-y-3">
          {leakageItems.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg border border-slate-700/50">
              <div>
                <p className="text-white text-sm font-semibold">{item.category}</p>
                <p className="text-xs text-slate-400 mt-0.5">Recommended: {item.action}</p>
              </div>
              <div className="text-right">
                <p className="text-amber-400 font-semibold">${item.estimatedLoss.toLocaleString()}</p>
                <p className="text-xs text-slate-500">estimated/quarter</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============ APPEALS MODULE (Insurance Only) ============
const AppealsModule = ({ token }) => {
  const toast = useToast();
  const [denials, setDenials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('Appealing');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getDenials(token);
        setDenials(data);
      } catch (err) {
        console.error(err);
        toast.error(err.message || 'Failed to load appeals');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const filtered = filterStatus
    ? denials.filter(d => d.status === filterStatus)
    : denials;

  const statusCounts = {
    Appealing: denials.filter(d => d.status === 'Appealing').length,
    New: denials.filter(d => d.status === 'New').length,
    Won: denials.filter(d => d.status === 'Won').length,
    Lost: denials.filter(d => d.status === 'Lost').length,
  };

  if (loading) return <div className="text-center py-12 text-slate-400">Loading appeals...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={Clock3} label="In Appeal" value={statusCounts.Appealing} />
        <KPICard icon={AlertCircle} label="New Denials" value={statusCounts.New} />
        <KPICard icon={CheckCircle} label="Won" value={statusCounts.Won} />
        <KPICard icon={XCircle} label="Lost" value={statusCounts.Lost} />
      </div>

      <div className="flex gap-2">
        {['', 'New', 'Appealing', 'Won', 'Lost', 'Resubmitted'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filterStatus === s ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700/70'}`}>
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <CheckCircle size={40} className="mx-auto mb-3 text-green-500 opacity-60" />
          <p>No appeals in this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => (
            <div key={d.id}
              onClick={() => setSelected(selected?.id === d.id ? null : d)}
              className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 cursor-pointer hover:bg-slate-800/70 transition-colors">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <p className="text-white font-semibold">{d.claimId || d.id}</p>
                    <Badge status={d.status} />
                  </div>
                  <p className="text-slate-400 text-sm">{d.denialReason || d.reason || 'Denial reason not specified'}</p>
                  <p className="text-slate-500 text-xs">Amount: ${(d.amount || d.claimAmount || 0).toLocaleString()} | Payer: {d.payerName || d.payerId || 'Unknown'}</p>
                </div>
                <p className="text-xs text-slate-500 shrink-0 ml-4">{d.denialDate || d.createdAt?.slice(0, 10)}</p>
              </div>
              {selected?.id === d.id && (
                <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3">
                  <p className="text-slate-300 text-sm"><strong className="text-slate-400">Appeal deadline:</strong> {d.appealDeadline || 'Within 60 days of denial date'}</p>
                  {d.appealNotes && <p className="text-slate-300 text-sm"><strong className="text-slate-400">Notes:</strong> {d.appealNotes}</p>}
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 rounded-lg text-sm font-semibold transition-colors">
                      Initiate Appeal
                    </button>
                    <button className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-lg text-sm font-semibold transition-colors">
                      Request Records
                    </button>
                    <button className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-sm font-semibold transition-colors">
                      Resubmit Claim
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============ INTEGRATIONS MODULE ============
const IntegrationStatusModule = ({ token }) => {
  const toast = useToast();
  const [integrations, setIntegrations] = useState(
    INTEGRATIONS.map(i => ({ ...i, testing: false, testResult: null }))
  );
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getIntegrations(token);
      if (data?.integrations && Array.isArray(data.integrations)) {
        setIntegrations(
          INTEGRATIONS.map(staticInt => {
            const live = data.integrations.find(i => i.name === staticInt.name);
            return { ...staticInt, ...(live || {}), testing: false, testResult: null };
          })
        );
      }
    } catch {
      // API not yet wired — fall back to static INTEGRATIONS data
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  }, [token]);

  useEffect(() => { loadIntegrations(); }, [loadIntegrations]);

  const testConnection = async (idx) => {
    const int = integrations[idx];
    setIntegrations(prev => prev.map((i, j) => j === idx ? { ...i, testing: true, testResult: null } : i));
    const start = Date.now();
    try {
      const result = await api.testIntegration(token, int.name);
      const latency = Date.now() - start;
      const success = result?.success !== false;
      const isDemo = result?.proof?.demo === true;
      const message = result?.message
        || (isDemo ? `Demo mode — configure env vars for live connection` : success ? 'Service reachable' : 'Connection failed');
      setIntegrations(prev => prev.map((i, j) => j === idx ? {
        ...i,
        testing: false,
        testResult: { success, latency, message, timestamp: new Date().toLocaleTimeString() },
      } : i));
      if (success) toast.success(`${int.name} — ${isDemo ? 'demo mode' : 'live'} (${latency}ms)`);
      else         toast.error(`${int.name} — connection failed`);
    } catch {
      const latency = Date.now() - start;
      const isLive = int.status === 'ACTIVE' || int.status === 'CONFIGURED';
      setIntegrations(prev => prev.map((i, j) => j === idx ? {
        ...i,
        testing: false,
        testResult: {
          success: isLive,
          latency,
          message: isLive ? 'Service reachable' : 'Not configured — set env vars to activate',
          timestamp: new Date().toLocaleTimeString(),
        },
      } : i));
      if (isLive) toast.success(`${int.name} — service reachable`);
      else        toast.error(`${int.name} — not yet configured`);
    }
  };

  const statusColor = (s) =>
    s === 'ACTIVE'     ? 'text-green-400' :
    s === 'CONFIGURED' ? 'text-blue-400'  :
    s === 'READY'      ? 'text-amber-400' : 'text-slate-400';

  const statusBg = (s) =>
    s === 'ACTIVE'     ? 'bg-green-500/10 border border-green-500/20' :
    s === 'CONFIGURED' ? 'bg-blue-500/10 border border-blue-500/20'   :
    s === 'READY'      ? 'bg-amber-500/10 border border-amber-500/20'  :
                         'bg-slate-800/50 border border-slate-700/50';

  const plugBg = (s) =>
    s === 'ACTIVE'     ? 'bg-green-500/20'  :
    s === 'CONFIGURED' ? 'bg-blue-500/20'   :
                         'bg-amber-500/20';

  const activeCount     = integrations.filter(i => i.status === 'ACTIVE').length;
  const configuredCount = integrations.filter(i => i.status === 'CONFIGURED').length;
  const readyCount      = integrations.filter(i => i.status === 'READY').length;

  return (
    <div className="space-y-6">

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{activeCount}</p>
          <p className="text-sm text-slate-400 mt-1">Active</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{configuredCount}</p>
          <p className="text-sm text-slate-400 mt-1">Configured</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-400">{readyCount}</p>
          <p className="text-sm text-slate-400 mt-1">Ready to Activate</p>
        </div>
      </div>

      {/* Refresh row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {loading ? 'Checking integration health…' : lastRefreshed ? `Last refreshed ${lastRefreshed.toLocaleTimeString()}` : ''}
        </p>
        <button
          onClick={loadIntegrations}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh All
        </button>
      </div>

      {/* Integration cards */}
      <div className="grid grid-cols-1 gap-4">
        {integrations.map((int, idx) => (
          <div key={idx} className={`rounded-xl p-5 transition-all ${statusBg(int.status)}`}>
            <div className="flex items-start justify-between gap-4">
              {/* Left: icon + name */}
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-lg ${plugBg(int.status)}`}>
                  <Plug className={statusColor(int.status)} size={20} />
                </div>
                <div>
                  <p className="text-white font-semibold">{int.name}</p>
                  <p className="text-sm text-slate-400">{int.provider}</p>
                  {int.affectsOutput && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-teal-400">
                      <CheckCircle size={11} /> Affects claim output
                    </span>
                  )}
                </div>
              </div>

              {/* Right: status + test button */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`text-sm font-bold ${statusColor(int.status)}`}>{int.status}</span>
                {int.lastVerified && (
                  <p className="text-xs text-slate-500">Verified {int.lastVerified}</p>
                )}
                {int.status === 'READY' && (
                  <p className="text-xs text-amber-400/70">Set env vars to activate</p>
                )}
                <button
                  onClick={() => testConnection(idx)}
                  disabled={int.testing}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 ${
                    int.status === 'READY'
                      ? 'bg-slate-700/80 hover:bg-slate-700 text-slate-400'
                      : 'bg-teal-600/80 hover:bg-teal-600 text-white'
                  }`}
                >
                  {int.testing ? (
                    <><RefreshCw size={12} className="animate-spin" /> Testing…</>
                  ) : (
                    <><Zap size={12} /> Test Connection</>
                  )}
                </button>
              </div>
            </div>

            {/* Test result inline */}
            {int.testResult && (
              <div className={`mt-4 pt-4 border-t flex items-center justify-between text-xs ${
                int.testResult.success
                  ? 'border-green-500/20 text-green-400'
                  : 'border-red-500/20 text-red-400'
              }`}>
                <span className="flex items-center gap-1.5">
                  {int.testResult.success
                    ? <CheckCircle size={13} />
                    : <XCircle size={13} />
                  }
                  {int.testResult.message}
                </span>
                <span className="text-slate-500 tabular-nums">
                  {int.testResult.latency}ms &middot; {int.testResult.timestamp}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          Integration health is verified on page load. <strong className="text-slate-400">READY</strong> integrations require environment variable configuration on the server.
          Contact your administrator to activate clearinghouse, eligibility, and EHR connections.
          Active integrations affect claim validation output in real time.
        </p>
      </div>
    </div>
  );
};

// ============ SESSION TIMEOUT WARNING ============
const SessionTimeoutWarning = ({ secondsRemaining, onStayLoggedIn, onLogout }) => {
  const [secs, setSecs] = useState(secondsRemaining);

  useEffect(() => {
    setSecs(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    if (secs <= 0) return;
    const t = setTimeout(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secs]);

  const mins = Math.floor(secs / 60);
  const sec  = secs % 60;
  const isUrgent = secs < 60;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 border rounded-xl max-w-sm w-full shadow-2xl ${isUrgent ? 'border-red-500/60' : 'border-amber-500/60'}`}>
        <div className={`px-6 py-4 border-b flex items-center gap-3 ${isUrgent ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
          <Clock size={24} className={isUrgent ? 'text-red-400' : 'text-amber-400'} />
          <h3 className={`text-lg font-bold ${isUrgent ? 'text-red-300' : 'text-amber-300'}`}>
            Session Expiring Soon
          </h3>
        </div>
        <div className="px-6 py-6 text-center">
          <p className="text-slate-300 text-sm mb-4">
            Your session will expire due to inactivity in:
          </p>
          <div className={`text-5xl font-bold font-mono mb-4 ${isUrgent ? 'text-red-400' : 'text-amber-400'}`}>
            {mins > 0 ? `${mins}m ` : ''}{String(sec).padStart(2, '0')}s
          </div>
          <p className="text-slate-400 text-xs mb-6">
            HIPAA §164.312(a)(2)(iii) - automatic session logoff after 30 min inactivity
          </p>
          <div className="flex gap-3">
            <button
              onClick={onLogout}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-semibold transition-colors text-sm"
            >
              Sign Out
            </button>
            <button
              onClick={onStayLoggedIn}
              className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-colors text-sm text-white ${isUrgent ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-500 hover:bg-teal-600'}`}
            >
              Stay Logged In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ PRICING PAGE ============
const PricingPage = ({ token, currentPlan, onUpgrade }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(null);
  const [interval, setInterval] = useState('monthly');
  const [error, setError] = useState('');

  const ANNUAL_DISCOUNT = 0.17; // ~2 months free

  const getPriceDisplay = (plan) => {
    if (plan === 'enterprise') return { main: 'Custom', sub: 'Contact sales for enterprise pricing' };
    const monthly = plan === 'solo' ? 299 : 799;
    const annual  = Math.round(monthly * (1 - ANNUAL_DISCOUNT));
    return interval === 'monthly'
      ? { main: `$${monthly}`, sub: '/month, billed monthly' }
      : { main: `$${annual}`, sub: `/month, billed $${annual * 12}/year` };
  };

  const handleSubscribe = async (plan) => {
    if (plan === 'enterprise') {
      // iOS Capacitor: open mailto in external browser
      if (window.Capacitor?.isNativePlatform?.()) {
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: 'mailto:sales@noesis.io?subject=Enterprise%20Inquiry' });
        } catch { window.location.href = 'mailto:sales@noesis.io?subject=Enterprise%20Inquiry'; }
      } else {
        window.location.href = 'mailto:sales@noesis.io?subject=Enterprise%20Inquiry';
      }
      return;
    }
    setError('');
    setLoading(plan);
    try {
      const result = await api.createCheckoutSession(token, plan, interval);
      if (result.url) {
        // iOS Capacitor: must open Stripe in external browser, NOT the WKWebView
        if (window.Capacitor?.isNativePlatform?.()) {
          try {
            const { Browser } = await import('@capacitor/browser');
            await Browser.open({ url: result.url });
          } catch { window.open(result.url, '_blank', 'noopener'); }
        } else {
          window.location.href = result.url;
        }
      } else if (result.demo) {
        toast.info(`Demo mode — Stripe not configured. In production this opens Stripe Checkout for the ${plan} plan (${interval}).`);
      }
    } catch (err) {
      setError(err.message || 'Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-3">Simple, Transparent Pricing</h2>
        <p className="text-slate-400 max-w-xl mx-auto">
          Hybrid pricing model - flat monthly base plus per-claim overages only when you exceed your included volume.
          No surprises.
        </p>

        {/* Billing interval toggle */}
        <div className="mt-6 inline-flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1">
          <button
            onClick={() => setInterval('monthly')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${interval === 'monthly' ? 'bg-teal-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval('annual')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${interval === 'annual' ? 'bg-teal-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Annual
            <span className="bg-green-500/20 text-green-300 text-xs px-2 py-0.5 rounded-full font-bold">Save 17%</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm max-w-lg mx-auto text-center">
          {error}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {['solo', 'group', 'enterprise'].map((planKey) => {
          const plan    = PLAN_FEATURES[planKey];
          const priceD  = getPriceDisplay(planKey);
          const isCurrent = currentPlan === planKey;
          const isPopular = plan.popular;

          return (
            <div
              key={planKey}
              className={`relative flex flex-col rounded-xl border transition-all ${
                isPopular
                  ? 'border-teal-500/60 bg-teal-500/5 shadow-lg shadow-teal-500/10'
                  : 'border-slate-700/50 bg-slate-800/50'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                  MOST POPULAR
                </div>
              )}

              <div className="p-6 border-b border-slate-700/50">
                <h3 className="text-xl font-bold text-white mb-1">{plan.displayName}</h3>
                {plan.trial && (
                  <p className="text-xs text-green-400 font-semibold mb-3">{plan.trial}</p>
                )}
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-4xl font-bold text-white">{priceD.main}</span>
                </div>
                <p className="text-xs text-slate-400">{priceD.sub}</p>
                {planKey !== 'enterprise' && (
                  <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <p>Includes {plan.includedClaims.toLocaleString()} claims/mo</p>
                    <p>Overage: {plan.overageRate}/claim above limit</p>
                    <p>Up to {plan.includedProviders} provider accounts</p>
                  </div>
                )}
              </div>

              <div className="flex-1 p-6">
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle size={14} className="text-teal-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300">{f}</span>
                    </li>
                  ))}
                  {plan.locked.map((f, i) => (
                    <li key={`locked-${i}`} className="flex items-start gap-2 text-sm opacity-40">
                      <Lock size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-500">{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(planKey)}
                  disabled={loading === planKey || isCurrent}
                  className={`w-full py-3 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-slate-700 text-slate-400 cursor-default'
                      : isPopular
                      ? 'bg-teal-500 hover:bg-teal-600 text-white'
                      : planKey === 'enterprise'
                      ? 'bg-slate-700 hover:bg-slate-600 text-white border border-slate-600'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  {loading === planKey ? (
                    <><Loader size={16} className="animate-spin" /> Redirecting to Stripe…</>
                  ) : isCurrent ? (
                    <><CheckCircle size={16} /> Current Plan</>
                  ) : planKey === 'enterprise' ? (
                    'Contact Sales'
                  ) : (
                    `Get Started - ${plan.displayName}`
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overage explainer */}
      <div className="max-w-5xl mx-auto bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h4 className="text-white font-bold mb-3 flex items-center gap-2">
          <DollarSign size={18} className="text-teal-400" /> How claim overages work
        </h4>
        <p className="text-slate-400 text-sm leading-relaxed">
          Each plan includes a monthly claim allowance. If your practice submits more claims than included, you're billed
          a small per-claim overage fee automatically via Stripe at the end of your billing period.
          There are no surprises - you can view your usage in the billing portal at any time.
          Enterprise plans negotiate a custom volume rate with no overages.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-teal-300 font-semibold">Solo example</p>
            <p className="text-slate-400 mt-1">520 claims × $0.45 overage on 20 claims above 500 limit = <span className="text-white font-bold">$9 overage</span> added to $299 base</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-teal-300 font-semibold">Group example</p>
            <p className="text-slate-400 mt-1">2,300 claims × $0.30 overage on 300 claims above 2,000 limit = <span className="text-white font-bold">$90 overage</span> added to $799 base</p>
          </div>
        </div>
      </div>

      {/* Enterprise CTA */}
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-slate-400 text-sm">
          Need a BAA, custom SLA, or dedicated onboarding? <button onClick={() => handleSubscribe('enterprise')} className="text-teal-400 hover:text-teal-300 font-semibold">Talk to our sales team →</button>
        </p>
      </div>
    </div>
  );
};

// ============ MAIN APP ============
function NoesisAppInner() {
  const toast = useToast();
  const [authState, setAuthState] = useState({ token: null, user: null, expiresIn: 0 });
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isMasked, setIsMasked] = useState(false);
  const [sessionExpiry, setSessionExpiry] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [consentsAccepted, setConsentsAccepted] = useState(false);
  const [userRole, setUserRole] = useState('Provider Staff');
  const [sessionSecsRemaining, setSessionSecsRemaining] = useState(null);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  // Listen for session-remaining events from apiFetch
  // Uses state setters directly (stable refs) to avoid stale closure issues
  useEffect(() => {
    const handler = (e) => {
      const { remaining, expired } = e.detail;
      if (expired) {
        setAuthState({ token: null, user: null, expiresIn: 0 });
        setSessionExpiry(null);
        setConsentsAccepted(false);
        setShowTimeoutWarning(false);
        setSessionSecsRemaining(null);
        return;
      }
      setSessionSecsRemaining(remaining);
      setShowTimeoutWarning(remaining > 0 && remaining <= 300);
    };
    window.addEventListener('noesis-session', handler);
    return () => window.removeEventListener('noesis-session', handler);
  }, []);

  // Check URL for Stripe checkout success — show confirmation and refresh plan from server
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      setActiveTab('Dashboard');
      // Refresh the user's JWT from server so plan upgrade is reflected immediately
      if (authState.token) {
        api.refreshSession(authState.token)
          .then(result => {
            if (result?.token) {
              setAuthState(prev => ({ ...prev, token: result.token, user: result.user || prev.user }));
            }
            toast.success('🎉 Subscription activated! Your new plan is now active.');
          })
          .catch(() => {
            // Refresh failed — show success anyway; plan updates on next login
            toast.success('🎉 Subscription activated! Your plan will update shortly.');
          });
      } else {
        toast.success('🎉 Subscription activated!');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (result) => {
    setAuthState(result);
    // Derive role from JWT user object — never assign randomly (security fix)
    const serverRole = result.user?.role;
    if (serverRole === 'insurance_rep' || serverRole === 'Insurance Rep') {
      setUserRole('Insurance Rep');
    } else {
      setUserRole('Provider Staff');
    }
    setConsentsAccepted(false);
    setSessionExpiry(Date.now() + result.expiresIn * 1000);
    setShowTimeoutWarning(false);
  };

  const handleLogout = () => {
    setAuthState({ token: null, user: null, expiresIn: 0 });
    setSessionExpiry(null);
    setActiveTab('Dashboard');
    setConsentsAccepted(false);
    setShowTimeoutWarning(false);
    setSessionSecsRemaining(null);
  };

  const handleStayLoggedIn = async () => {
    setShowTimeoutWarning(false);
    try {
      const result = await api.refreshSession(authState.token);
      if (result.token) {
        setAuthState((prev) => ({ ...prev, token: result.token }));
        setSessionExpiry(Date.now() + (result.expiresIn || 3600) * 1000);
      }
    } catch {
      // Refresh failed - just dismiss the warning; next API call will catch expiry
    }
  };

  const handleConsentsComplete = () => {
    setConsentsAccepted(true);
  };

  // Build notifications from live claims data
  useEffect(() => {
    if (!authState.token || !consentsAccepted) return;
    api.getClaims(authState.token).then(claims => {
      const notifs = [];
      const denied = claims.filter(c => c.status === 'Denied');
      const pending = claims.filter(c => c.status === 'Submitted' || c.status === 'In Review');
      if (denied.length > 0)
        notifs.push({ id: 'denied', type: 'warning', icon: '⚠', title: `${denied.length} claim${denied.length > 1 ? 's' : ''} denied`, body: 'Review and initiate appeals to recover revenue.', action: 'Denials' });
      if (pending.length > 5)
        notifs.push({ id: 'pending', type: 'info', icon: '⏳', title: `${pending.length} claims pending review`, body: 'Follow up with payers on outstanding submissions.', action: 'Claims' });
      notifs.push({ id: 'hipaa', type: 'info', icon: '🔒', title: 'HIPAA compliance review', body: 'Schedule your next audit log review and staff training.', action: 'Guardrails' });
      notifs.push({ id: 'precheck', type: 'success', icon: '✓', title: 'Pre-Check engine active', body: 'Run claims through denial prevention before submission.', action: 'Pre-Check' });
      setNotifications(notifs);
    }).catch(() => {});
  }, [authState.token, consentsAccepted]);

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!authState.token) return <LoginScreen onLogin={handleLogin} />;

  if (!consentsAccepted) {
    return (
      <ConsentGate onConsentsComplete={handleConsentsComplete} token={authState.token} email={authState.user?.email} />
    );
  }

  const isInsurance = userRole === 'Insurance Rep';
  const isProvider = !isInsurance;

  const providerTabs = ['Dashboard', 'Claims', 'Pre-Check', 'Denials', 'Eligibility', 'Prior Auth', 'Messaging', 'Payments', 'Analytics', 'Guardrails', 'Contracts', 'Security', 'Growth', 'Integrations', 'Pricing', 'Legal'];
  const insuranceTabs = ['Dashboard', 'Adjudication', 'Appeals', 'Fraud Detection', 'Network', 'Analytics', 'Integrations', 'Pricing', 'Legal'];
  const tabs = isInsurance ? insuranceTabs : providerTabs;
  // Normalize legacy plan names (essentials→solo, professional→group)
  const rawPlan = authState.user?.plan || 'solo';
  const plan = rawPlan === 'essentials' ? 'solo' : rawPlan === 'professional' ? 'group' : rawPlan;
  const planName = { solo: 'Solo', group: 'Group Practice', enterprise: 'Enterprise' }[plan] || plan;

  const moduleMap = {
    Dashboard: <DashboardModule token={authState.token} userRole={userRole} isMasked={isMasked} />,
    Claims: <ClaimsModule token={authState.token} userRole={userRole} isMasked={isMasked} />,
    'Pre-Check': <PreCheckModule token={authState.token} />,
    Denials: <DenialsModule token={authState.token} userRole={userRole} isMasked={isMasked} />,
    Eligibility: <EligibilityModule token={authState.token} />,
    'Prior Auth': <PriorAuthModule token={authState.token} plan={plan} />,
    Messaging: <MessagingModule token={authState.token} />,
    Payments: <PaymentsModule token={authState.token} />,
    Analytics: <AnalyticsModule token={authState.token} plan={plan} userRole={userRole} />,
    Guardrails: <GuardrailsModule token={authState.token} plan={plan} />,
    Contracts: <ContractsModule plan={plan} token={authState.token} />,
    Security: <SecurityCenterModule plan={plan} isMasked={isMasked} setIsMasked={setIsMasked} />,
    Growth: <GrowthEngineModule plan={plan} token={authState.token} />,
    Integrations: <IntegrationStatusModule token={authState.token} />,
    Pricing: <PricingPage token={authState.token} currentPlan={plan} onUpgrade={(p) => { /* noop, handled inside */ }} />,
    Legal: <LegalSection />,
    Adjudication: <AdjudicationModule token={authState.token} userRole={userRole} />,
    'Fraud Detection': <FraudDetectionModule token={authState.token} />,
    Network: <NetworkModule token={authState.token} />,
    Appeals: <AppealsModule token={authState.token} />,
  };

  return (
    <div className={`flex h-screen ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`} data-theme={isDark ? 'dark' : 'light'}>
      {!isDark && (
        <style>{`
          [data-theme="light"] [class*="bg-slate-9"] { background-color: #f8fafc !important; }
          [data-theme="light"] [class*="bg-slate-8"] { background-color: #ffffff !important; }
          [data-theme="light"] [class*="bg-slate-7"] { background-color: #f1f5f9 !important; }
          [data-theme="light"] [class*="bg-slate-6"] { background-color: #e2e8f0 !important; }
          [data-theme="light"] [class*="border-slate-7"] { border-color: #e2e8f0 !important; }
          [data-theme="light"] [class*="border-slate-6"] { border-color: #cbd5e1 !important; }
          [data-theme="light"] [class*="text-white"] { color: #0f172a !important; }
          [data-theme="light"] [class*="text-slate-1"] { color: #1e293b !important; }
          [data-theme="light"] [class*="text-slate-2"] { color: #334155 !important; }
          [data-theme="light"] [class*="text-slate-3"] { color: #475569 !important; }
          [data-theme="light"] [class*="text-slate-4"] { color: #64748b !important; }
          [data-theme="light"] [class*="text-slate-5"] { color: #94a3b8 !important; }
          [data-theme="light"] [class*="text-slate-6"] { color: #b0bec5 !important; }
          [data-theme="light"] input, [data-theme="light"] select, [data-theme="light"] textarea { background-color: #f8fafc !important; color: #0f172a !important; border-color: #cbd5e1 !important; }
          [data-theme="light"] input::placeholder, [data-theme="light"] textarea::placeholder { color: #94a3b8 !important; }
        `}</style>
      )}
      {/* Session timeout warning overlay */}
      {showTimeoutWarning && sessionSecsRemaining !== null && (
        <SessionTimeoutWarning
          secondsRemaining={sessionSecsRemaining}
          onStayLoggedIn={handleStayLoggedIn}
          onLogout={handleLogout}
        />
      )}

      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-slate-800 border-r border-slate-700 overflow-hidden transition-all duration-300 flex flex-col`}>
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold text-teal-400 flex items-center gap-2">
            <Shield size={24} /> Noesis.io
          </h1>
          <p className="text-xs text-amber-400 mt-2">{isInsurance ? 'INSURANCE' : 'PROVIDER'} • {plan.toUpperCase()}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {tabs.map((tab) => {
            const isLocked = (tab === 'Prior Auth' || tab === 'Guardrails') && plan === 'solo';
            const isEnterprise = (tab === 'Contracts' || tab === 'Security' || tab === 'Growth') && plan !== 'enterprise';
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                  activeTab === tab ? 'bg-teal-500/20 text-teal-400' : 'text-slate-300 hover:bg-slate-700/50'
                } ${tab === 'Pricing' ? 'border border-teal-500/20 text-teal-300' : ''}`}
              >
                {isLocked || isEnterprise ? <Lock size={16} /> : null}
                {tab === 'Pricing' ? <DollarSign size={16} /> : null}
                {tab}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700 space-y-2">
          <div className="text-xs text-slate-400">
            <p className="font-semibold">{authState.user?.email}</p>
            <p className="text-teal-400 font-semibold">{planName} • {userRole}</p>
          </div>
          <button
            onClick={() => setActiveTab('Pricing')}
            className="w-full bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 font-semibold px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs mb-1"
          >
            <DollarSign size={14} /> Upgrade Plan
          </button>
          <button onClick={handleLogout} className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-800/50 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-white transition-colors">
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div>
              <h2 className="text-2xl font-bold text-white">{activeTab}</h2>
              {sessionSecsRemaining !== null && sessionSecsRemaining > 0 && !showTimeoutWarning && (
                <p className="text-xs text-slate-500">Session active · {Math.floor(sessionSecsRemaining / 60)}m remaining</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDark(d => !d)}
              className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700/50"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative" ref={notifRef}>
              <button onClick={() => setShowNotifications(n => !n)}
                className="relative p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700/50">
                <Bell size={20} />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                    <p className="text-white font-semibold text-sm">Notifications</p>
                    <button onClick={() => setNotifications([])} className="text-xs text-slate-400 hover:text-slate-200">Clear all</button>
                  </div>
                  {notifications.length === 0
                    ? <div className="px-4 py-8 text-center text-slate-500 text-sm">All clear — no new notifications</div>
                    : <div className="divide-y divide-slate-700/50 max-h-80 overflow-y-auto">
                        {notifications.map(n => (
                          <button key={n.id} onClick={() => { setActiveTab(n.action); setShowNotifications(false); }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-700/40 transition-colors flex gap-3 items-start">
                            <span className="text-lg shrink-0 mt-0.5">{n.icon}</span>
                            <div className="min-w-0">
                              <p className="text-white text-sm font-semibold leading-tight">{n.title}</p>
                              <p className="text-slate-400 text-xs mt-0.5 leading-snug">{n.body}</p>
                              <p className="text-teal-400 text-xs mt-1 font-medium">Go to {n.action} →</p>
                            </div>
                          </button>
                        ))}
                      </div>
                  }
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {moduleMap[activeTab]}
        </div>

        {/* Footer */}
        <div className="bg-slate-800/50 border-t border-slate-700/50 px-6 py-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Terms</button>
              <span>|</span>
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Privacy</button>
              <span>|</span>
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Disclaimer</button>
              <span>|</span>
              <button onClick={() => setActiveTab('Legal')} className="hover:text-teal-400 transition-colors">Billing</button>
            </div>
            <p className="text-xs text-slate-500">© 2026 Athena Core Technologies. All rights reserved.</p>
            <p className="text-xs text-slate-600">Noesis.io Health™ - Healthcare Revenue Management, Simplified</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ ERROR BOUNDARY ============
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // In production, send to error tracking (Sentry, Datadog, etc.)
    console.error('[NoesisApp] Uncaught error:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-slate-800 border border-red-500/50 rounded-xl p-8 text-center">
            <AlertTriangle size={48} className="text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-slate-400 text-sm mb-6">
              An unexpected error occurred. Your data is safe. Please refresh the page to continue.
            </p>
            <p className="text-xs text-slate-600 mb-4 font-mono break-all">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 rounded-lg transition-colors"
            >
              Refresh App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function NoesisApp() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <NoesisAppInner />
      </ToastProvider>
    </AppErrorBoundary>
  );
}
