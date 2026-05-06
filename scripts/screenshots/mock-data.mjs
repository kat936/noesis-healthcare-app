/**
 * Noesis.io Health — Screenshot mock data
 *
 * Canned API responses used by the Playwright screenshot capture flow.
 * No PHI, no real patient data — placeholder names ("John Doe", "Jane Smith")
 * that are visibly fake. Designed to make every dashboard tile, table, and
 * chart render with realistic but obviously-synthetic numbers so Apple
 * reviewers can see the product without medical/diagnosis claims.
 */

export const mockUser = {
  id: 'demo-user-1',
  email: 'demo@noesis.io',
  role: 'provider',
  plan: 'group',
  organization: 'Noesis Demo Clinic',
  npi: '1234567890',
};

export const mockToken = 'demo.jwt.token.not-real';

const mockClaims = [
  { id: 'CLM-2026-00142', patient: 'John Doe',     dob: '1980-04-12', cpt: '99213', icd10: 'Z00.00', amount:  185.00, status: 'Approved',  payer: 'Aetna',           submittedAt: '2026-04-22' },
  { id: 'CLM-2026-00143', patient: 'Jane Smith',   dob: '1975-09-03', cpt: '99214', icd10: 'I10',    amount:  245.00, status: 'Paid',      payer: 'BlueCross',       submittedAt: '2026-04-21' },
  { id: 'CLM-2026-00144', patient: 'Alex Patient', dob: '1992-11-30', cpt: '93000', icd10: 'R00.0',  amount:  142.00, status: 'In Review', payer: 'United',          submittedAt: '2026-04-20' },
  { id: 'CLM-2026-00145', patient: 'Maria Sample', dob: '1968-02-15', cpt: '99215', icd10: 'E11.9',  amount:  310.00, status: 'Approved',  payer: 'Cigna',           submittedAt: '2026-04-19' },
  { id: 'CLM-2026-00146', patient: 'Sam Tester',   dob: '1955-07-01', cpt: '90834', icd10: 'F33.1',  amount:  165.00, status: 'Submitted', payer: 'Humana',          submittedAt: '2026-04-19' },
  { id: 'CLM-2026-00147', patient: 'Pat Demo',     dob: '1988-06-22', cpt: '99213', icd10: 'M54.5',  amount:  185.00, status: 'Denied',    payer: 'Aetna',           submittedAt: '2026-04-18' },
  { id: 'CLM-2026-00148', patient: 'River Example',dob: '1970-12-08', cpt: '99396', icd10: 'Z00.00', amount:  220.00, status: 'Paid',      payer: 'Medicare',        submittedAt: '2026-04-17' },
  { id: 'CLM-2026-00149', patient: 'Drew Sample',  dob: '1995-03-19', cpt: '99203', icd10: 'J06.9',  amount:  198.00, status: 'In Review', payer: 'BlueCross',       submittedAt: '2026-04-16' },
];

const mockAnalytics = {
  approvalRate:    87.3,
  denialRate:       8.5,
  avgDaysToPayment: 18,
  totalSubmitted:  142,
  totalApproved:   124,
  totalDenied:      12,
  totalPaid:       108,
  monthlyRevenue:  47820,
  trend: [
    { month: 'Nov', approved: 102, denied: 14, paid: 88 },
    { month: 'Dec', approved: 118, denied: 11, paid: 102 },
    { month: 'Jan', approved: 109, denied: 13, paid: 95 },
    { month: 'Feb', approved: 121, denied:  9, paid: 108 },
    { month: 'Mar', approved: 128, denied:  8, paid: 115 },
    { month: 'Apr', approved: 124, denied: 12, paid: 108 },
  ],
};

const mockEra = [
  { id: 'ERA-2026-0042', payer: 'Aetna',     postedAt: '2026-04-22', amount: 1820.50, status: 'Posted'  },
  { id: 'ERA-2026-0041', payer: 'BlueCross', postedAt: '2026-04-21', amount: 2340.75, status: 'Posted'  },
  { id: 'ERA-2026-0040', payer: 'United',    postedAt: '2026-04-20', amount:  985.00, status: 'Pending' },
];

const mockAging = {
  total: 18420.50,
  buckets: {
    '0-30':    8420.00,
    '31-60':   5200.50,
    '61-90':   2900.00,
    '91-120':  1200.00,
    '120+':     700.00,
  },
};

const mockScrubbing = {
  totalChecked: 142,
  passed:       128,
  warnings:      11,
  errors:         3,
  topRules: [
    { rule: 'Modifier 25 with E/M code', flagged: 4 },
    { rule: 'Missing referring NPI',     flagged: 3 },
    { rule: 'Diagnosis-procedure match', flagged: 2 },
  ],
};

const mockEligibility = {
  member: 'John Doe',
  memberId: 'XJD-44182',
  payer: 'Aetna',
  plan: 'PPO Standard',
  status: 'Active',
  effectiveDate: '2026-01-01',
  copay: 25,
  deductible: 1500,
  deductibleMet: 425,
  oopMax: 5000,
  oopMet: 760,
  coverageNotes: 'Office visits and preventive care covered. Specialist visits require referral.',
};

const mockPriorAuths = [
  { id: 'PA-2026-0021', patient: 'John Doe',     procedure: 'MRI Lumbar Spine',          cpt: '72148', payer: 'Aetna',     status: 'Approved',     submittedAt: '2026-04-19' },
  { id: 'PA-2026-0022', patient: 'Jane Smith',   procedure: 'Physical Therapy (12 visits)',cpt: '97110', payer: 'BlueCross', status: 'Pending',     submittedAt: '2026-04-21' },
  { id: 'PA-2026-0023', patient: 'Alex Patient', procedure: 'CT Abdomen w/ Contrast',     cpt: '74160', payer: 'United',    status: 'In Review',   submittedAt: '2026-04-22' },
];

const mockDenials = [
  { id: 'CLM-2026-00147', patient: 'Pat Demo',    payer: 'Aetna',  reason: 'Missing modifier',          amount: 185.00, denialDate: '2026-04-23', status: 'New'        },
  { id: 'CLM-2026-00131', patient: 'Lou Example', payer: 'United', reason: 'Service not covered',       amount: 320.00, denialDate: '2026-04-15', status: 'Appealing'  },
  { id: 'CLM-2026-00118', patient: 'Sky Demo',    payer: 'Cigna',  reason: 'Medical necessity required',amount: 410.00, denialDate: '2026-04-08', status: 'Appealing'  },
];

const mockPrecheckHistory = [
  { id: 'PC-2026-0341', cpt: '99214', icd10: 'I10',    payer: 'Aetna',     score: 94, riskLevel: 'low',    runAt: '2026-04-23T10:14:00Z' },
  { id: 'PC-2026-0340', cpt: '72148', icd10: 'M54.5',  payer: 'BlueCross', score: 71, riskLevel: 'medium', runAt: '2026-04-23T09:50:00Z' },
  { id: 'PC-2026-0339', cpt: '99396', icd10: 'Z00.00', payer: 'Medicare',  score: 98, riskLevel: 'low',    runAt: '2026-04-22T16:33:00Z' },
];

const mockPrecheckResult = {
  score: 92,
  riskLevel: 'low',
  riskFactors: [
    { factor: 'CPT/ICD-10 alignment',     status: 'pass', detail: 'Diagnosis supports procedure'      },
    { factor: 'Modifier completeness',    status: 'pass', detail: 'No required modifiers missing'     },
    { factor: 'Payer policy alignment',   status: 'pass', detail: 'Within Aetna PPO standard policy'  },
    { factor: 'Frequency limits',         status: 'pass', detail: 'Within annual frequency cap'       },
    { factor: 'Documentation completeness',status: 'warn',detail: 'Recommend chart note attached'     },
  ],
  recommendations: [
    'Attach office visit chart note before submission.',
    'Include referring provider NPI if specialist consult.',
  ],
  estimatedApprovalDays: 14,
  estimatedReimbursement: 175.50,
};

const mockFeeSchedule = {
  cpt: '99214',
  description: 'Office/outpatient visit, established patient — moderate complexity',
  averageAllowed: 175.42,
  payers: [
    { payer: 'Aetna',     allowed: 178.20 },
    { payer: 'BlueCross', allowed: 182.50 },
    { payer: 'United',    allowed: 169.00 },
    { payer: 'Cigna',     allowed: 175.00 },
    { payer: 'Medicare',  allowed: 172.40 },
  ],
};

const mockGuardrailCompliance = {
  overallScore: 94,
  hipaaSafeguards: {
    accessControl:  'compliant',
    auditLog:       'compliant',
    encryption:     'compliant',
    sessionTimeout: 'compliant',
    transmission:   'compliant',
  },
  rulesActive: 28,
  rulesTotal:  28,
  lastReview:  '2026-04-15',
};

const mockMessagingConvs = [];

const mockIntegrationsStatus = {
  integrations: [
    { name: 'NPI Registry',                  provider: 'CMS / NPPES',                  status: 'ACTIVE',     lastVerified: '2026-04-23' },
    { name: 'OpenFDA Drug Database',         provider: 'U.S. FDA',                     status: 'ACTIVE',     lastVerified: '2026-04-23' },
    { name: 'Stripe Billing',                provider: 'Stripe Inc.',                  status: 'CONFIGURED', lastVerified: '2026-04-20' },
    { name: 'EDI 837P/835 Clearinghouse',    provider: 'Office Ally / Availity',       status: 'READY',      lastVerified: null         },
    { name: 'Payer Eligibility 270/271',     provider: 'Availity (2,800+ payers)',     status: 'READY',      lastVerified: null         },
    { name: 'HL7 FHIR R4 EHR Connector',     provider: 'Epic / Athenahealth / Cerner', status: 'READY',      lastVerified: null         },
  ],
};

/**
 * Resolve an API path (relative to /api/v1) to a canned response body.
 * Returns null if the path doesn't have a specific mock — caller falls
 * back to a safe default.
 */
export function resolveMock(method, path) {
  const m = (method || 'GET').toUpperCase();

  if (m === 'POST' && path === '/auth/login') {
    return { token: mockToken, user: mockUser };
  }
  if (m === 'POST' && path === '/auth/refresh') {
    return { token: mockToken, user: mockUser, expiresIn: 3600 };
  }
  if (m === 'GET' && path.startsWith('/claims') && !path.includes('/score')) {
    return { data: mockClaims };
  }
  if (m === 'GET' && /^\/claims\/[^/]+\/score$/.test(path)) {
    return { score: { approvalProbability: 0.92, riskLevel: 'low' } };
  }
  if (m === 'GET' && path === '/billing/analytics') {
    return { data: mockAnalytics };
  }
  if (m === 'GET' && path === '/billing/era') {
    return { data: mockEra };
  }
  if (m === 'GET' && path === '/billing/aging') {
    return { data: mockAging };
  }
  if (m === 'GET' && path === '/scrubbing') {
    return { data: mockScrubbing };
  }
  if (m === 'POST' && path === '/eligibility/verify') {
    return mockEligibility;
  }
  if (m === 'GET' && path.startsWith('/authorizations')) {
    return { data: mockPriorAuths };
  }
  if (m === 'POST' && path === '/authorizations') {
    return { id: 'PA-2026-0024', status: 'Submitted' };
  }
  if (m === 'GET' && path === '/denials') {
    return { data: mockDenials };
  }
  if (m === 'POST' && path === '/precheck') {
    return mockPrecheckResult;
  }
  if (m === 'GET' && path.startsWith('/precheck/history')) {
    return mockPrecheckHistory;
  }
  if (m === 'GET' && path.startsWith('/precheck/fee-schedule/')) {
    return mockFeeSchedule;
  }
  if (m === 'GET' && path === '/guardrails/compliance') {
    return mockGuardrailCompliance;
  }
  if (m === 'GET' && path === '/guardrails/rules') {
    return { rules: [] };
  }
  if (m === 'GET' && path === '/messaging/conversations') {
    return { conversations: mockMessagingConvs };
  }
  if (m === 'GET' && path === '/integrations/status') {
    return mockIntegrationsStatus;
  }
  if (m === 'GET' && path === '/adjudication/queue') {
    return { queue: [] };
  }
  if (m === 'GET' && path.startsWith('/network/')) {
    return { data: [] };
  }
  if (m === 'GET' && path === '/contracts') {
    return { data: [] };
  }
  if (m === 'GET' && path.startsWith('/legal/')) {
    return { content: '' };
  }

  return null;
}

/**
 * Default fallback response for any unmocked /api/v1/* call.
 * Returns an empty data envelope so client modules render their empty state
 * cleanly instead of throwing.
 */
export const defaultFallback = { data: [] };
