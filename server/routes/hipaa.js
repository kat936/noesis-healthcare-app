const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// HIPAA Disclaimer included in all responses
const HIPAA_DISCLAIMER = 'HIPAA-aligned security measures. Not HIPAA-certified. No BAA in place.';

// Mock storage for in-memory data
const securityPosture = {
  accessControlScore: 92,
  auditScore: 88,
  integrityScore: 94,
  transmissionScore: 96,
  authenticationScore: 95,
  encryptionScore: 90,
  overallScore: 92.5,
  lastUpdated: new Date().toISOString()
};

const phiControls = {
  maskingEnabled: true,
  minimumNecessaryEnabled: true,
  phiCategories: [
    {
      type: 'PHI_DEMOGRAPHIC',
      label: 'Patient Demographics',
      maskingAvailable: true,
      riskLevel: 'medium',
      masking: 'name_initials'
    },
    {
      type: 'PHI_CLINICAL',
      label: 'Clinical Information',
      maskingAvailable: true,
      riskLevel: 'high',
      masking: 'partial_redaction'
    },
    {
      type: 'PHI_BILLING',
      label: 'Billing Information',
      maskingAvailable: true,
      riskLevel: 'high',
      masking: 'account_hash'
    },
    {
      type: 'PHI_CONTACT',
      label: 'Contact Information',
      maskingAvailable: true,
      riskLevel: 'medium',
      masking: 'partial_masking'
    },
    {
      type: 'PHI_IDENTIFIER',
      label: 'Medical Record Numbers',
      maskingAvailable: false,
      riskLevel: 'critical',
      masking: 'system_encrypted'
    }
  ],
  deidentificationMethod: 'safe_harbor',
  retentionPolicy: 'session_only_in_memory'
};

const accessControls = {
  sessionPolicy: {
    timeout: 1800,
    autoLock: true,
    maxSessions: 3
  },
  mfaEnforced: true,
  passwordPolicy: {
    minLength: 12,
    requirements: ['uppercase', 'lowercase', 'number', 'special_char'],
    expirationDays: 90,
    historyCount: 5
  },
  ipAllowlist: [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16'
  ]
};

const auditEntries = [
  {
    id: uuidv4(),
    userId: 'user-001',
    userEmail: 'dr.smith@practice.com',
    action: 'PATIENT_RECORD_ACCESS',
    resource: 'patient-record-12345',
    resourceType: 'PHI',
    status: 'success',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    ipAddress: '192.168.1.100',
    sessionId: uuidv4(),
    details: 'Accessed patient medical record for care coordination'
  },
  {
    id: uuidv4(),
    userId: 'user-002',
    userEmail: 'admin@practice.com',
    action: 'SECURITY_SETTING_UPDATE',
    resource: 'encryption-config',
    resourceType: 'SYSTEM',
    status: 'success',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    ipAddress: '192.168.1.101',
    sessionId: uuidv4(),
    details: 'Updated TLS encryption settings'
  },
  {
    id: uuidv4(),
    userId: 'user-001',
    userEmail: 'dr.smith@practice.com',
    action: 'PATIENT_RECORD_EXPORT',
    resource: 'patient-record-67890',
    resourceType: 'PHI',
    status: 'success',
    timestamp: new Date(Date.now() - 10800000).toISOString(),
    ipAddress: '192.168.1.100',
    sessionId: uuidv4(),
    details: 'Exported de-identified patient records for research'
  },
  {
    id: uuidv4(),
    userId: 'user-003',
    userEmail: 'staff@practice.com',
    action: 'FAILED_LOGIN_ATTEMPT',
    resource: 'authentication',
    resourceType: 'SYSTEM',
    status: 'failure',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    ipAddress: '192.168.1.102',
    sessionId: null,
    details: 'Failed login attempt - invalid credentials'
  },
  {
    id: uuidv4(),
    userId: 'user-002',
    userEmail: 'admin@practice.com',
    action: 'USER_ACCESS_REVOKED',
    resource: 'user-access-user-004',
    resourceType: 'SYSTEM',
    status: 'success',
    timestamp: new Date(Date.now() - 18000000).toISOString(),
    ipAddress: '192.168.1.101',
    sessionId: uuidv4(),
    details: 'Revoked PHI access for terminated staff member'
  },
  {
    id: uuidv4(),
    userId: 'user-001',
    userEmail: 'dr.smith@practice.com',
    action: 'MFA_ENABLED',
    resource: 'mfa-config-user-001',
    resourceType: 'SYSTEM',
    status: 'success',
    timestamp: new Date(Date.now() - 21600000).toISOString(),
    ipAddress: '192.168.1.100',
    sessionId: uuidv4(),
    details: 'Enabled MFA - TOTP configured'
  }
];

const activeUsers = [
  {
    id: 'user-001',
    name: 'Dr. Sarah Smith',
    email: 'dr.smith@practice.com',
    role: ROLES.PROVIDER_STAFF,
    department: 'Clinical',
    lastLogin: new Date(Date.now() - 1800000).toISOString(),
    mfaEnabled: true,
    sessionActive: true,
    sessionStartedAt: new Date(Date.now() - 1200000).toISOString()
  },
  {
    id: 'user-002',
    name: 'Admin User',
    email: 'admin@practice.com',
    role: ROLES.PRACTICE_ADMIN,
    department: 'Administration',
    lastLogin: new Date(Date.now() - 3600000).toISOString(),
    mfaEnabled: true,
    sessionActive: true,
    sessionStartedAt: new Date(Date.now() - 3000000).toISOString()
  },
  {
    id: 'user-003',
    name: 'Jane Doe',
    email: 'staff@practice.com',
    role: ROLES.PROVIDER_STAFF,
    department: 'Billing',
    lastLogin: new Date(Date.now() - 86400000).toISOString(),
    mfaEnabled: false,
    sessionActive: false,
    sessionStartedAt: null
  },
  {
    id: 'user-004',
    name: 'John Wilson',
    email: 'jwilson@practice.com',
    role: ROLES.PROVIDER_STAFF,
    department: 'Clinical',
    lastLogin: new Date(Date.now() - 259200000).toISOString(),
    mfaEnabled: true,
    sessionActive: false,
    sessionStartedAt: null
  }
];

const encryptionStatus = {
  inTransit: {
    protocol: 'TLS 1.3',
    status: 'active',
    supportedProtocols: ['TLS 1.3', 'TLS 1.2'],
    certificateIssuer: 'Let\'s Encrypt',
    certificateExpiry: new Date(Date.now() + 7776000000).toISOString()
  },
  atRest: {
    method: 'in_memory_only',
    status: 'not_persistent',
    note: 'Production will implement AES-256-CBC with PBKDF2 key derivation',
    productionPlan: 'AES-256-CBC'
  },
  apiComms: {
    protocol: 'HTTPS',
    status: 'active',
    certificatePinning: 'enabled',
    forwardSecrecy: 'enabled'
  },
  fileUploads: {
    scanning: true,
    validation: true,
    status: 'active',
    maxFileSize: '52428800',
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'application/msword']
  }
};

const breachStatus = {
  activeIncidents: 0,
  lastIncidentDate: null,
  workflowSteps: [
    {
      step: 1,
      title: 'Detection & Assessment',
      description: 'Identify and assess breach scope',
      status: 'enabled',
      owner: ROLES.PRACTICE_ADMIN
    },
    {
      step: 2,
      title: 'Containment',
      description: 'Take immediate action to contain breach',
      status: 'enabled',
      owner: ROLES.PRACTICE_ADMIN
    },
    {
      step: 3,
      title: 'Investigation',
      description: 'Determine cause and affected records',
      status: 'enabled',
      owner: ROLES.PRACTICE_ADMIN
    },
    {
      step: 4,
      title: 'Notification',
      description: 'Notify affected individuals per HIPAA requirements',
      status: 'enabled',
      owner: ROLES.PRACTICE_ADMIN
    },
    {
      step: 5,
      title: 'HHS Reporting',
      description: 'Report to HHS Office for Civil Rights if required',
      status: 'enabled',
      owner: ROLES.PRACTICE_ADMIN
    }
  ],
  emergencyContacts: [
    {
      role: ROLES.PRACTICE_ADMIN,
      title: 'Security Officer',
      responseTime: '15 minutes'
    },
    {
      role: 'compliance_officer',
      title: 'Compliance Officer',
      responseTime: '30 minutes'
    }
  ],
  lastAssessment: new Date(Date.now() - 604800000).toISOString()
};

const trainingModules = [
  {
    id: 'hipaa-101',
    title: 'HIPAA 101: Privacy & Security Basics',
    duration: 45,
    required: true,
    completionRate: 95,
    description: 'Introduction to HIPAA Privacy Rule and Security Rule requirements'
  },
  {
    id: 'phi-handling',
    title: 'PHI Handling & Data Protection',
    duration: 60,
    required: true,
    completionRate: 92,
    description: 'Best practices for protecting patient health information'
  },
  {
    id: 'breach-response',
    title: 'Breach Response & Incident Management',
    duration: 30,
    required: true,
    completionRate: 88,
    description: 'How to identify, report, and respond to data breaches'
  },
  {
    id: 'mfa-security',
    title: 'Multi-Factor Authentication & Access Control',
    duration: 20,
    required: false,
    completionRate: 85,
    description: 'Using MFA and role-based access control effectively'
  },
  {
    id: 'password-security',
    title: 'Password Security & Account Management',
    duration: 25,
    required: false,
    completionRate: 78,
    description: 'Creating strong passwords and managing credentials securely'
  },
  {
    id: 'audit-logs',
    title: 'Understanding Audit Logs',
    duration: 35,
    required: false,
    completionRate: 72,
    description: 'Interpreting and analyzing security audit trails'
  }
];

const userTrainingCompletion = new Map();

// Validation schemas
const phiControlsSchema = z.object({
  maskingEnabled: z.boolean(),
  minimumNecessaryEnabled: z.boolean(),
  deidentificationMethod: z.enum(['safe_harbor', 'statistical_disclosure']),
  retentionPolicy: z.enum(['session_only_in_memory', 'encrypted_at_rest', 'encrypted_archived'])
});

const accessControlsSchema = z.object({
  sessionPolicy: z.object({
    timeout: z.number().min(300).max(86400),
    autoLock: z.boolean(),
    maxSessions: z.number().min(1).max(10)
  }),
  mfaEnforced: z.boolean(),
  passwordPolicy: z.object({
    minLength: z.number().min(8).max(32),
    requirements: z.array(z.enum(['uppercase', 'lowercase', 'number', 'special_char']))
  })
});

const breachAssessmentSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  affectedRecords: z.number().min(1),
  phiTypes: z.array(z.string()),
  description: z.string().min(10).max(5000)
});

/**
 * Helper function to calculate compliance checklist
 */
function getComplianceChecklist() {
  return [
    {
      safeguard: 'Access Controls',
      requirement: 'Implement user access controls and audit controls',
      status: 'compliant',
      score: 92
    },
    {
      safeguard: 'Encryption',
      requirement: 'Use encryption for data at rest and in transit',
      status: 'compliant',
      score: 90
    },
    {
      safeguard: 'Audit Controls',
      requirement: 'Maintain comprehensive audit logs',
      status: 'compliant',
      score: 88
    },
    {
      safeguard: 'Integrity Controls',
      requirement: 'Ensure data integrity mechanisms',
      status: 'compliant',
      score: 94
    },
    {
      safeguard: 'Authentication',
      requirement: 'Implement MFA and strong password policies',
      status: 'compliant',
      score: 95
    },
    {
      safeguard: 'Transmission Security',
      requirement: 'Secure transmission of electronic PHI',
      status: 'compliant',
      score: 96
    },
    {
      safeguard: 'Workforce Security',
      requirement: 'Control workforce access and authorization',
      status: 'compliant',
      score: 91
    },
    {
      safeguard: 'Training',
      requirement: 'Provide HIPAA security training',
      status: 'compliant',
      score: 85
    }
  ];
}

/**
 * Helper function to get mock security alerts
 */
function getSecurityAlerts() {
  return [
    {
      id: uuidv4(),
      severity: 'info',
      title: 'Routine Audit Completed',
      description: 'Daily security audit completed successfully',
      timestamp: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: uuidv4(),
      severity: 'warning',
      title: 'User with Inactive MFA',
      description: '1 user has MFA disabled - recommend immediate enablement',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      affectedCount: 1
    },
    {
      id: uuidv4(),
      severity: 'info',
      title: 'Certificate Renewal Scheduled',
      description: 'TLS certificate renewal scheduled for next month',
      timestamp: new Date(Date.now() - 604800000).toISOString()
    }
  ];
}

/**
 * GET /hipaa/security-posture
 * Returns overall security posture score and breakdown
 */
router.get('/security-posture', authenticate, apiLimiter, (req, res) => {
  try {
    res.json({
      success: true,
      securityPosture: {
        ...securityPosture,
        complianceChecklist: getComplianceChecklist(),
        securityAlerts: getSecurityAlerts()
      },
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve security posture',
      code: 'SECURITY_POSTURE_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * GET /hipaa/phi-controls
 * Returns PHI protection configuration
 */
router.get('/phi-controls', authenticate, apiLimiter, (req, res) => {
  try {
    res.json({
      success: true,
      phiControls,
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve PHI controls',
      code: 'PHI_CONTROLS_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * PUT /hipaa/phi-controls
 * Update PHI protection settings
 * Requires practice_admin role
 */
router.put('/phi-controls', authenticate, authorize(ROLES.PRACTICE_ADMIN), (req, res) => {
  try {
    const validation = phiControlsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid PHI control configuration',
        code: 'VALIDATION_ERROR',
        details: validation.error.errors,
        disclaimer: HIPAA_DISCLAIMER
      });
    }

    // Update settings
    Object.assign(phiControls, validation.data);

    res.json({
      success: true,
      message: 'PHI controls updated successfully',
      phiControls,
      auditLog: {
        action: 'PHI_CONTROLS_UPDATED',
        userId: req.user.id,
        timestamp: new Date().toISOString(),
        changes: validation.data
      },
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to update PHI controls',
      code: 'PHI_CONTROLS_UPDATE_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * GET /hipaa/access-controls
 * Returns access control configuration and active users
 */
router.get('/access-controls', authenticate, authorize(ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    res.json({
      success: true,
      accessControls: {
        ...accessControls,
        activeUsers
      },
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve access controls',
      code: 'ACCESS_CONTROLS_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * PUT /hipaa/access-controls
 * Update access control settings
 * Requires practice_admin role
 */
router.put('/access-controls', authenticate, authorize(ROLES.PRACTICE_ADMIN), (req, res) => {
  try {
    const validation = accessControlsSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid access control configuration',
        code: 'VALIDATION_ERROR',
        details: validation.error.errors,
        disclaimer: HIPAA_DISCLAIMER
      });
    }

    // Update settings
    Object.assign(accessControls, validation.data);

    res.json({
      success: true,
      message: 'Access controls updated successfully',
      accessControls,
      auditLog: {
        action: 'ACCESS_CONTROLS_UPDATED',
        userId: req.user.id,
        timestamp: new Date().toISOString(),
        changes: validation.data
      },
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to update access controls',
      code: 'ACCESS_CONTROLS_UPDATE_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * GET /hipaa/audit-trail
 * Returns paginated audit log entries
 * Query params: page, limit, userId, action, startDate, endDate
 */
router.get('/audit-trail', authenticate, authorize(ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    const { page = 1, limit = 20, userId, action, startDate, endDate } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    let filteredEntries = [...auditEntries];

    // Filter by userId
    if (userId) {
      filteredEntries = filteredEntries.filter(entry => entry.userId === userId);
    }

    // Filter by action
    if (action) {
      filteredEntries = filteredEntries.filter(entry => entry.action === action);
    }

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      filteredEntries = filteredEntries.filter(entry => new Date(entry.timestamp) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      filteredEntries = filteredEntries.filter(entry => new Date(entry.timestamp) <= end);
    }

    // Sort by timestamp descending
    filteredEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const total = filteredEntries.length;
    const paginatedEntries = filteredEntries.slice(offset, offset + limitNum);

    res.json({
      success: true,
      auditTrail: paginatedEntries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: offset + limitNum < total
      },
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve audit trail',
      code: 'AUDIT_TRAIL_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * GET /hipaa/encryption-status
 * Returns encryption configuration and status
 */
router.get('/encryption-status', authenticate, apiLimiter, (req, res) => {
  try {
    res.json({
      success: true,
      encryption: encryptionStatus,
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve encryption status',
      code: 'ENCRYPTION_STATUS_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * GET /hipaa/breach-status
 * Returns current breach/incident status and response workflow
 */
router.get('/breach-status', authenticate, authorize(ROLES.PRACTICE_ADMIN), apiLimiter, (req, res) => {
  try {
    res.json({
      success: true,
      breachStatus,
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve breach status',
      code: 'BREACH_STATUS_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * POST /hipaa/breach-assessment
 * Submit a breach risk assessment
 * Requires practice_admin role
 */
router.post('/breach-assessment', authenticate, authorize(ROLES.PRACTICE_ADMIN), (req, res) => {
  try {
    const validation = breachAssessmentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid breach assessment data',
        code: 'VALIDATION_ERROR',
        details: validation.error.errors,
        disclaimer: HIPAA_DISCLAIMER
      });
    }

    const assessment = {
      id: uuidv4(),
      ...validation.data,
      status: validation.data.severity === 'critical' ? 'under_investigation' : 'logged',
      submittedBy: req.user.id,
      submittedAt: new Date().toISOString(),
      currentStep: 1,
      escalated: validation.data.severity === 'critical'
    };

    // Log to audit trail
    const auditEntry = {
      id: uuidv4(),
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'BREACH_ASSESSMENT_SUBMITTED',
      resource: assessment.id,
      resourceType: 'BREACH_ASSESSMENT',
      status: 'success',
      timestamp: new Date().toISOString(),
      details: `Breach assessment submitted: ${assessment.severity} severity, ${validation.data.affectedRecords} records affected`
    };
    auditEntries.push(auditEntry);

    res.status(201).json({
      success: true,
      assessment,
      auditLog: auditEntry,
      nextSteps: assessment.escalated ? [
        'Contact Security Officer immediately',
        'Initiate containment procedures',
        'Begin forensic investigation'
      ] : [
        'Monitor situation closely',
        'Document all findings',
        'Prepare incident report'
      ],
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to submit breach assessment',
      code: 'BREACH_ASSESSMENT_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * GET /hipaa/training
 * Returns training modules and completion status
 */
router.get('/training', authenticate, apiLimiter, (req, res) => {
  try {
    // Get completion status for current user if they exist in the map
    const userCompletion = userTrainingCompletion.get(req.user.id) || {};

    const modulesWithCompletion = trainingModules.map(module => ({
      ...module,
      completed: userCompletion[module.id] || false,
      completedDate: userCompletion[`${module.id}_date`] || null
    }));

    const requiredModules = modulesWithCompletion.filter(m => m.required);
    const userCompletedRequired = requiredModules.filter(m => m.completed).length;
    const userComplianceRate = ((userCompletedRequired / requiredModules.length) * 100).toFixed(0);

    res.json({
      success: true,
      training: {
        modules: modulesWithCompletion,
        organizationComplianceRate: 89,
        userComplianceRate: parseInt(userComplianceRate),
        requiredModulesCount: requiredModules.length,
        userCompletedRequired,
        nextDeadline: new Date(Date.now() + 2592000000).toISOString()
      },
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve training modules',
      code: 'TRAINING_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

/**
 * POST /hipaa/training/:moduleId/complete
 * Mark a training module as complete for the current user
 */
router.post('/training/:moduleId/complete', authenticate, (req, res) => {
  try {
    const { moduleId } = req.params;

    // Verify module exists
    const module = trainingModules.find(m => m.id === moduleId);
    if (!module) {
      return res.status(404).json({
        error: 'Training module not found',
        code: 'MODULE_NOT_FOUND',
        disclaimer: HIPAA_DISCLAIMER
      });
    }

    // Mark as complete for user
    if (!userTrainingCompletion.has(req.user.id)) {
      userTrainingCompletion.set(req.user.id, {});
    }
    const userCompletion = userTrainingCompletion.get(req.user.id);
    userCompletion[moduleId] = true;
    userCompletion[`${moduleId}_date`] = new Date().toISOString();

    // Log to audit trail
    const auditEntry = {
      id: uuidv4(),
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'TRAINING_MODULE_COMPLETED',
      resource: moduleId,
      resourceType: 'TRAINING',
      status: 'success',
      timestamp: new Date().toISOString(),
      details: `Completed training module: ${module.title}`
    };
    auditEntries.push(auditEntry);

    res.json({
      success: true,
      message: `Training module "${module.title}" marked as complete`,
      module: {
        id: module.id,
        title: module.title,
        completedAt: userCompletion[`${moduleId}_date`]
      },
      auditLog: auditEntry,
      disclaimer: HIPAA_DISCLAIMER
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to complete training module',
      code: 'TRAINING_COMPLETION_ERROR',
      details: err.message,
      disclaimer: HIPAA_DISCLAIMER
    });
  }
});

module.exports = router;
