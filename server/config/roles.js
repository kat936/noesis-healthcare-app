/**
 * Role-Based Access Control Configuration
 * Defines roles, plans, permissions, and feature access
 */

const ROLES = {
  PROVIDER_STAFF: 'provider_staff',
  PRACTICE_ADMIN: 'practice_admin',
  INSURANCE_REP: 'insurance_rep'
};

const PLANS = {
  ESSENTIALS: 'essentials',
  PROFESSIONAL: 'professional',
  ENTERPRISE: 'enterprise'
};

/**
 * Permission Matrix
 * Maps roles to allowed actions per feature
 */
const PERMISSIONS = {
  [ROLES.PROVIDER_STAFF]: {
    claims: ['read', 'create', 'update'],
    authorizations: ['read', 'create'],
    messaging: ['read', 'create'],
    eligibility: ['read', 'verify'],
    contracts: [],
    analytics: [],
    guardrails: ['read'],
    security: [],
    growth: []
  },
  [ROLES.PRACTICE_ADMIN]: {
    claims: ['read', 'create', 'update', 'delete', 'export'],
    authorizations: ['read', 'create', 'update', 'approve'],
    messaging: ['read', 'create'],
    eligibility: ['read', 'verify'],
    contracts: ['read', 'create', 'update'],
    analytics: ['read', 'export'],
    guardrails: ['read', 'configure'],
    security: ['read', 'configure'],
    growth: ['read', 'configure']
  },
  [ROLES.INSURANCE_REP]: {
    claims: ['read', 'review', 'adjudicate'],
    authorizations: ['read', 'review', 'approve', 'deny'],
    messaging: ['read', 'create'],
    eligibility: ['read'],
    contracts: ['read'],
    analytics: [],
    guardrails: ['read'],
    security: [],
    growth: []
  }
};

/**
 * Plan Features
 * Maps subscription plans to available features
 */
const PLAN_FEATURES = {
  [PLANS.ESSENTIALS]: [
    'claims',
    'eligibility',
    'messaging'
  ],
  [PLANS.PROFESSIONAL]: [
    'claims',
    'eligibility',
    'messaging',
    'authorizations',
    'analytics',
    'guardrails'
  ],
  [PLANS.ENTERPRISE]: [
    'claims',
    'eligibility',
    'messaging',
    'authorizations',
    'analytics',
    'guardrails',
    'contracts',
    'security',
    'growth',
    'api_access',
    'custom_rules',
    'white_label'
  ]
};

/**
 * Feature Limits by Plan
 * API call limits, submission limits, etc.
 */
const PLAN_LIMITS = {
  [PLANS.ESSENTIALS]: {
    claimsPerMonth: 100,
    authorizationsPerMonth: 50,
    apiCallsPerDay: 1000,
    submissionsPerDay: 50
  },
  [PLANS.PROFESSIONAL]: {
    claimsPerMonth: 10000,
    authorizationsPerMonth: 5000,
    apiCallsPerDay: 50000,
    submissionsPerDay: 500
  },
  [PLANS.ENTERPRISE]: {
    claimsPerMonth: 'unlimited',
    authorizationsPerMonth: 'unlimited',
    apiCallsPerDay: 'unlimited',
    submissionsPerDay: 'unlimited'
  }
};

/**
 * Helper: Check if user has permission for action
 */
function hasPermission(userRole, feature, action) {
  const rolePerms = PERMISSIONS[userRole];
  if (!rolePerms) return false;
  const featurePerms = rolePerms[feature];
  if (!featurePerms) return false;
  return featurePerms.includes(action);
}

/**
 * Helper: Check if plan includes feature
 */
function hasPlanFeature(plan, feature) {
  const features = PLAN_FEATURES[plan];
  if (!features) return false;
  return features.includes(feature);
}

/**
 * Helper: Get all permissions for a role
 */
function getRolePermissions(role) {
  return PERMISSIONS[role] || {};
}

/**
 * Helper: Get plan details
 */
function getPlanDetails(plan) {
  return {
    name: plan,
    features: PLAN_FEATURES[plan] || [],
    limits: PLAN_LIMITS[plan] || {}
  };
}

module.exports = {
  ROLES,
  PLANS,
  PERMISSIONS,
  PLAN_FEATURES,
  PLAN_LIMITS,
  hasPermission,
  hasPlanFeature,
  getRolePermissions,
  getPlanDetails
};
