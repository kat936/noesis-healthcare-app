/**
 * Noesis.io Health  - Role & Plan Configuration
 * © 2026 Athena Core Technologies, Inc.
 *
 * Three-tier hybrid pricing:
 *   Solo          $299/mo   - up to 3 providers, 500 claims included
 *   Group         $799/mo   - up to 20 providers, 2,000 claims included
 *   Enterprise    Custom    - unlimited providers, unlimited claims, white-label
 *
 * Hybrid overage (Solo + Group only):
 *   Solo:  $0.45/claim above 500
 *   Group: $0.30/claim above 2,000
 */

// ── Roles ─────────────────────────────────────────────────────────────────────
const ROLES = {
  PROVIDER_STAFF:  'provider_staff',
  PRACTICE_ADMIN:  'practice_admin',
  INSURANCE_REP:   'insurance_rep',
  SUPER_ADMIN:     'super_admin',       // Athena Core internal
};

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = {
  SOLO:       'solo',
  GROUP:      'group',
  ENTERPRISE: 'enterprise',
};

// ── Pricing ───────────────────────────────────────────────────────────────────
const PLAN_PRICING = {
  [PLANS.SOLO]: {
    displayName:      'Solo',
    monthlyPrice:     299,
    annualPrice:      2990,           // 2 months free
    currency:         'USD',
    description:      'For solo practitioners and small clinics',
    tagline:          'Everything you need to submit, track, and get paid',
    contactSales:     false,
    trialDays:        14,
    includedClaims:   500,
    overagePricePer:  0.45,           // per claim over 500
    includedProviders: 3,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_SOLO_MONTHLY   || 'price_solo_monthly',
    stripeAnnualPriceId:  process.env.STRIPE_PRICE_SOLO_ANNUAL    || 'price_solo_annual',
    stripeOveragePriceId: process.env.STRIPE_PRICE_SOLO_OVERAGE   || 'price_solo_overage',
  },
  [PLANS.GROUP]: {
    displayName:      'Group Practice',
    monthlyPrice:     799,
    annualPrice:      7990,           // 2 months free
    currency:         'USD',
    description:      'For multi-provider practices and specialty groups',
    tagline:          'Advanced analytics, authorizations, and denial management',
    contactSales:     false,
    mostPopular:      true,
    trialDays:        14,
    includedClaims:   2000,
    overagePricePer:  0.30,           // per claim over 2,000
    includedProviders: 20,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_GROUP_MONTHLY  || 'price_group_monthly',
    stripeAnnualPriceId:  process.env.STRIPE_PRICE_GROUP_ANNUAL   || 'price_group_annual',
    stripeOveragePriceId: process.env.STRIPE_PRICE_GROUP_OVERAGE  || 'price_group_overage',
  },
  [PLANS.ENTERPRISE]: {
    displayName:      'Enterprise',
    monthlyPrice:     null,
    annualPrice:      null,
    currency:         'USD',
    description:      'For health systems, MSOs, and large group practices',
    tagline:          'Unlimited scale, white-label, custom integrations, dedicated CSM',
    contactSales:     true,
    includedClaims:   'unlimited',
    overagePricePer:  0,
    includedProviders: 'unlimited',
    stripeMonthlyPriceId: null,
    stripeAnnualPriceId:  null,
    stripeOveragePriceId: null,
  },
};

// ── Permissions ────────────────────────────────────────────────────────────────
const PERMISSIONS = {
  [ROLES.PROVIDER_STAFF]: {
    claims:         ['read', 'create', 'update'],
    authorizations: ['read', 'create'],
    messaging:      ['read', 'create'],
    eligibility:    ['read', 'verify'],
    denials:        ['read', 'appeal'],
    contracts:      [],
    analytics:      [],
    guardrails:     ['read'],
    security:       [],
    growth:         [],
    billing:        [],
  },
  [ROLES.PRACTICE_ADMIN]: {
    claims:         ['read', 'create', 'update', 'delete', 'export'],
    authorizations: ['read', 'create', 'update', 'approve'],
    messaging:      ['read', 'create'],
    eligibility:    ['read', 'verify'],
    denials:        ['read', 'appeal', 'update', 'export'],
    contracts:      ['read', 'create', 'update'],
    analytics:      ['read', 'export'],
    guardrails:     ['read', 'configure'],
    security:       ['read', 'configure'],
    growth:         ['read', 'configure'],
    billing:        ['read', 'manage'],
  },
  [ROLES.INSURANCE_REP]: {
    claims:         ['read', 'review', 'adjudicate'],
    authorizations: ['read', 'review', 'approve', 'deny'],
    messaging:      ['read', 'create'],
    eligibility:    ['read'],
    denials:        ['read'],
    contracts:      ['read'],
    analytics:      [],
    guardrails:     ['read'],
    security:       [],
    growth:         [],
    billing:        [],
  },
  [ROLES.SUPER_ADMIN]: {
    claims:         ['read', 'create', 'update', 'delete', 'export'],
    authorizations: ['read', 'create', 'update', 'approve', 'deny'],
    messaging:      ['read', 'create', 'delete'],
    eligibility:    ['read', 'verify'],
    denials:        ['read', 'appeal', 'update', 'export'],
    contracts:      ['read', 'create', 'update', 'delete'],
    analytics:      ['read', 'export'],
    guardrails:     ['read', 'configure'],
    security:       ['read', 'configure'],
    growth:         ['read', 'configure'],
    billing:        ['read', 'manage', 'override'],
  },
};

// ── Features by Plan ──────────────────────────────────────────────────────────
const PLAN_FEATURES = {
  [PLANS.SOLO]: [
    'claims',
    'eligibility',
    'messaging',
    'denials',
    'npi_lookup',
    'claim_scrubbing',
    'era_processing',
    'patient_estimator',
  ],
  [PLANS.GROUP]: [
    'claims',
    'eligibility',
    'messaging',
    'denials',
    'npi_lookup',
    'claim_scrubbing',
    'era_processing',
    'patient_estimator',
    'authorizations',
    'analytics',
    'guardrails',
    'payer_eligibility_api',
    'edi_clearinghouse',
    'contract_management',
    'denial_analytics',
    'bulk_export',
  ],
  [PLANS.ENTERPRISE]: [
    'claims',
    'eligibility',
    'messaging',
    'denials',
    'npi_lookup',
    'claim_scrubbing',
    'era_processing',
    'patient_estimator',
    'authorizations',
    'analytics',
    'guardrails',
    'payer_eligibility_api',
    'edi_clearinghouse',
    'contract_management',
    'denial_analytics',
    'bulk_export',
    'ehr_integration',
    'fhir_api',
    'custom_rules',
    'white_label',
    'api_access',
    'sso',
    'dedicated_csm',
    'sla_99_9',
  ],
};

// ── Usage Limits by Plan ───────────────────────────────────────────────────────
const PLAN_LIMITS = {
  [PLANS.SOLO]: {
    claimsIncluded:        500,
    claimsOveragePer:      0.45,
    providersIncluded:     3,
    authorizationsPerMonth: 100,
    eligibilityChecksPerDay: 200,
    apiCallsPerDay:        5000,
    messagingThreads:      50,
    sessionTimeoutMinutes: 30,         // HIPAA auto-logoff
    auditRetentionDays:    2555,       // 7 years HIPAA minimum
  },
  [PLANS.GROUP]: {
    claimsIncluded:        2000,
    claimsOveragePer:      0.30,
    providersIncluded:     20,
    authorizationsPerMonth: 1000,
    eligibilityChecksPerDay: 2000,
    apiCallsPerDay:        50000,
    messagingThreads:      500,
    sessionTimeoutMinutes: 30,
    auditRetentionDays:    2555,
  },
  [PLANS.ENTERPRISE]: {
    claimsIncluded:        'unlimited',
    claimsOveragePer:      0,
    providersIncluded:     'unlimited',
    authorizationsPerMonth: 'unlimited',
    eligibilityChecksPerDay: 'unlimited',
    apiCallsPerDay:        'unlimited',
    messagingThreads:      'unlimited',
    sessionTimeoutMinutes: 30,
    auditRetentionDays:    2555,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function hasPermission(userRole, feature, action) {
  const rolePerms = PERMISSIONS[userRole];
  if (!rolePerms) { return false; }
  const featurePerms = rolePerms[feature];
  if (!featurePerms) { return false; }
  return featurePerms.includes(action);
}

function hasPlanFeature(plan, feature) {
  const features = PLAN_FEATURES[plan];
  if (!features) { return false; }
  return features.includes(feature);
}

function getRolePermissions(role) {
  return PERMISSIONS[role] || {};
}

function getPlanDetails(plan) {
  return {
    name:    plan,
    pricing: PLAN_PRICING[plan] || null,
    features: PLAN_FEATURES[plan] || [],
    limits:   PLAN_LIMITS[plan]  || {},
  };
}

function getPublicPlans() {
  return Object.values(PLANS).map((plan) => {
    const p = PLAN_PRICING[plan];
    return {
      id:              plan,
      displayName:     p.displayName,
      monthlyPrice:    p.monthlyPrice,
      annualPrice:     p.annualPrice,
      currency:        p.currency,
      description:     p.description,
      tagline:         p.tagline,
      contactSales:    p.contactSales,
      mostPopular:     p.mostPopular || false,
      trialDays:       p.trialDays   || 0,
      includedClaims:  p.includedClaims,
      includedProviders: p.includedProviders,
      features:        PLAN_FEATURES[plan],
      limits:          PLAN_LIMITS[plan],
    };
  });
}

// Map legacy plan names to new names (backwards compatibility)
const LEGACY_PLAN_MAP = {
  essentials:   PLANS.SOLO,
  professional: PLANS.GROUP,
  enterprise:   PLANS.ENTERPRISE,
};

function normalizePlan(plan) {
  return LEGACY_PLAN_MAP[plan] || plan;
}

module.exports = {
  ROLES,
  PLANS,
  PLAN_PRICING,
  PERMISSIONS,
  PLAN_FEATURES,
  PLAN_LIMITS,
  hasPermission,
  hasPlanFeature,
  getRolePermissions,
  getPlanDetails,
  getPublicPlans,
  normalizePlan,
  LEGACY_PLAN_MAP,
};
