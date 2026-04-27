const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const { authenticate, authorize } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../config/roles');

const router = express.Router();

// Mock storage
const providers = new Map();
const credentialing = new Map();

const mockProviders = [
  {
    npi: '1234567890',
    firstName: 'John',
    lastName: 'Smith',
    specialty: 'Family Medicine',
    location: 'New York, NY',
    networkStatus: 'in_network',
    credentialingStatus: 'approved',
    contractStatus: 'active',
    createdAt: '2025-01-15'
  },
  {
    npi: '1234567891',
    firstName: 'Sarah',
    lastName: 'Johnson',
    specialty: 'Cardiology',
    location: 'Los Angeles, CA',
    networkStatus: 'in_network',
    credentialingStatus: 'approved',
    contractStatus: 'active',
    createdAt: '2025-01-10'
  },
  {
    npi: '1234567892',
    firstName: 'Michael',
    lastName: 'Chen',
    specialty: 'Orthopedic Surgery',
    location: 'Chicago, IL',
    networkStatus: 'out_of_network',
    credentialingStatus: 'pending_verification',
    contractStatus: 'pending',
    createdAt: '2026-03-01'
  },
  {
    npi: '1234567893',
    firstName: 'Patricia',
    lastName: 'Williams',
    specialty: 'Psychiatry',
    location: 'Houston, TX',
    networkStatus: 'in_network',
    credentialingStatus: 'approved',
    contractStatus: 'active',
    createdAt: '2025-06-20'
  },
  {
    npi: '1234567894',
    firstName: 'Robert',
    lastName: 'Garcia',
    specialty: 'Oncology',
    location: 'Phoenix, AZ',
    networkStatus: 'in_network',
    credentialingStatus: 'approved',
    contractStatus: 'active',
    createdAt: '2025-03-05'
  },
  {
    npi: '1234567895',
    firstName: 'Jennifer',
    lastName: 'Davis',
    specialty: 'Dermatology',
    location: 'Philadelphia, PA',
    networkStatus: 'pending_decision',
    credentialingStatus: 'under_review',
    contractStatus: 'pending',
    createdAt: '2026-02-15'
  }
];

const mockCredentialing = [
  {
    id: uuidv4(),
    npi: '1234567890',
    providerName: 'John Smith',
    applicationDate: '2024-12-01',
    status: 'approved',
    currentStage: 'approved',
    stages: [
      { stage: 'application', status: 'completed', completedDate: '2024-12-05' },
      { stage: 'verification', status: 'completed', completedDate: '2024-12-20' },
      { stage: 'review', status: 'completed', completedDate: '2025-01-10' },
      { stage: 'approved', status: 'completed', completedDate: '2025-01-15' }
    ]
  },
  {
    id: uuidv4(),
    npi: '1234567892',
    providerName: 'Michael Chen',
    applicationDate: '2026-03-01',
    status: 'pending_verification',
    currentStage: 'verification',
    stages: [
      { stage: 'application', status: 'completed', completedDate: '2026-03-05' },
      { stage: 'verification', status: 'in_progress', completedDate: null },
      { stage: 'review', status: 'pending', completedDate: null },
      { stage: 'approved', status: 'pending', completedDate: null }
    ]
  },
  {
    id: uuidv4(),
    npi: '1234567893',
    providerName: 'Patricia Williams',
    applicationDate: '2025-05-10',
    status: 'approved',
    currentStage: 'approved',
    stages: [
      { stage: 'application', status: 'completed', completedDate: '2025-05-15' },
      { stage: 'verification', status: 'completed', completedDate: '2025-05-30' },
      { stage: 'review', status: 'completed', completedDate: '2025-06-15' },
      { stage: 'approved', status: 'completed', completedDate: '2025-06-20' }
    ]
  },
  {
    id: uuidv4(),
    npi: '1234567895',
    providerName: 'Jennifer Davis',
    applicationDate: '2026-02-15',
    status: 'under_review',
    currentStage: 'review',
    stages: [
      { stage: 'application', status: 'completed', completedDate: '2026-02-20' },
      { stage: 'verification', status: 'completed', completedDate: '2026-03-10' },
      { stage: 'review', status: 'in_progress', completedDate: null },
      { stage: 'approved', status: 'pending', completedDate: null }
    ]
  }
];

// Initialize mock data
mockProviders.forEach((prov) => providers.set(prov.npi, prov));
mockCredentialing.forEach((cred) => credentialing.set(cred.id, cred));

// Validation schemas
const providerSearchSchema = z.object({
  npi: z.string().regex(/^\d{10}$/).optional(),
  name: z.string().min(2).optional(),
  specialty: z.string().optional(),
  location: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0)
});

const credentialingUpdateSchema = z.object({
  status: z.enum(['application', 'verification', 'review', 'approved', 'denied']),
  notes: z.string().max(2000).optional()
});

/**
 * GET /network/providers
 * Provider directory with search capabilities
 * NPI lookup, specialty filtering, geographic search
 * Authorized for insurance reps and practice admins
 */
router.get(
  '/providers',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      const { npi, name, specialty, location, limit = 20, offset = 0 } = req.query;

      let results = Array.from(providers.values());

      // Filter by NPI
      if (npi) {
        results = results.filter((p) => p.npi === npi);
      }

      // Filter by name (partial match)
      if (name) {
        const nameLower = name.toLowerCase();
        results = results.filter(
          (p) =>
            p.firstName.toLowerCase().includes(nameLower) ||
            p.lastName.toLowerCase().includes(nameLower)
        );
      }

      // Filter by specialty
      if (specialty) {
        results = results.filter((p) => p.specialty.toLowerCase().includes(specialty.toLowerCase()));
      }

      // Filter by location
      if (location) {
        results = results.filter((p) => p.location.toLowerCase().includes(location.toLowerCase()));
      }

      const total = results.length;
      const paginated = results.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: paginated,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + parseInt(limit) < total
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to search providers',
        code: 'SEARCH_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /network/providers/:npi
 * Get provider detail with credentialing and contract status
 */
router.get(
  '/providers/:npi',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      const provider = providers.get(req.params.npi);

      if (!provider) {
        return res.status(404).json({
          error: 'Provider not found',
          code: 'NOT_FOUND'
        });
      }

      // Find credentialing record
      const credentialingRecord = Array.from(credentialing.values()).find(
        (c) => c.npi === req.params.npi
      );

      res.json({
        success: true,
        provider: {
          ...provider,
          credentialing: credentialingRecord || null
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve provider',
        code: 'GET_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /network/credentialing
 * List credentialing pipeline
 * Shows all applications in various stages
 */
router.get(
  '/credentialing',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      const { status, limit = 20, offset = 0 } = req.query;

      let pipeline = Array.from(credentialing.values());

      // Filter by status
      if (status) {
        pipeline = pipeline.filter((c) => c.status === status);
      }

      // Sort by application date (newest first)
      pipeline.sort((a, b) => new Date(b.applicationDate) - new Date(a.applicationDate));

      const total = pipeline.length;
      const paginated = pipeline.slice(offset, offset + parseInt(limit));

      res.json({
        success: true,
        data: paginated,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + parseInt(limit) < total
        },
        pipelineStats: {
          total,
          approved: pipeline.filter((c) => c.status === 'approved').length,
          underReview: pipeline.filter((c) => c.status === 'under_review').length,
          pendingVerification: pipeline.filter((c) => c.status === 'pending_verification').length,
          denied: pipeline.filter((c) => c.status === 'denied').length
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to retrieve credentialing pipeline',
        code: 'LIST_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * PUT /network/credentialing/:id
 * Update credentialing status and stage
 */
router.put(
  '/credentialing/:id',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  (req, res) => {
    try {
      const credentialingRecord = credentialing.get(req.params.id);

      if (!credentialingRecord) {
        return res.status(404).json({
          error: 'Credentialing record not found',
          code: 'NOT_FOUND'
        });
      }

      // Validate request
      const validation = credentialingUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          error: 'Invalid credentialing data',
          code: 'VALIDATION_ERROR',
          details: validation.error.errors
        });
      }

      const newStatus = validation.data.status;

      // Update stage in pipeline
      const stageMap = {
        application: 0,
        verification: 1,
        review: 2,
        approved: 3,
        denied: 4
      };

      const stageIndex = stageMap[newStatus];
      if (stageIndex !== undefined && stageIndex < 4) {
        credentialingRecord.stages[stageIndex].status = 'in_progress';
        credentialingRecord.currentStage = newStatus;
      }

      credentialingRecord.status = newStatus;
      credentialingRecord.lastUpdated = new Date().toISOString();
      credentialingRecord.updatedBy = req.user.id;

      if (validation.data.notes) {
        credentialingRecord.notes = validation.data.notes;
      }

      // Update provider network status
      const provider = providers.get(credentialingRecord.npi);
      if (provider) {
        if (newStatus === 'approved') {
          provider.credentialingStatus = 'approved';
          provider.networkStatus = 'in_network';
          provider.contractStatus = 'active';
        } else if (newStatus === 'denied') {
          provider.credentialingStatus = 'denied';
          provider.networkStatus = 'denied';
        } else {
          provider.credentialingStatus = newStatus.replace('_', ' ');
        }
      }

      res.json({
        success: true,
        credentialingRecord,
        provider
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to update credentialing status',
        code: 'UPDATE_ERROR',
        details: err.message
      });
    }
  }
);

/**
 * GET /network/adequacy
 * Network adequacy metrics by specialty and geography
 * Shows whether network meets regulatory requirements
 */
router.get(
  '/adequacy',
  authenticate,
  authorize(ROLES.INSURANCE_REP, ROLES.PRACTICE_ADMIN),
  apiLimiter,
  (req, res) => {
    try {
      // Mock adequacy calculation
      const specialties = {};
      Array.from(providers.values()).forEach((p) => {
        if (!specialties[p.specialty]) {
          specialties[p.specialty] = { in_network: 0, out_of_network: 0, adequacy_score: 0 };
        }
        if (p.networkStatus === 'in_network') {
          specialties[p.specialty].in_network += 1;
        } else {
          specialties[p.specialty].out_of_network += 1;
        }
      });

      // Calculate adequacy scores (mock)
      Object.values(specialties).forEach((spec) => {
        const total = spec.in_network + spec.out_of_network;
        spec.adequacy_score = ((spec.in_network / total) * 100).toFixed(2);
      });

      // Geographic adequacy
      const geographic = {};
      Array.from(providers.values()).forEach((p) => {
        const state = p.location.split(', ')[1];
        if (!geographic[state]) {
          geographic[state] = { total: 0, in_network: 0, adequacy_score: 0 };
        }
        geographic[state].total += 1;
        if (p.networkStatus === 'in_network') {
          geographic[state].in_network += 1;
        }
      });

      Object.values(geographic).forEach((geo) => {
        geo.adequacy_score = ((geo.in_network / geo.total) * 100).toFixed(2);
      });

      res.json({
        success: true,
        adequacy: {
          bySpecialty: specialties,
          byGeography: geographic,
          regulatoryComplianceNote: 'Network adequacy must meet state-specific requirements for distance and availability'
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Failed to calculate adequacy metrics',
        code: 'ADEQUACY_ERROR',
        details: err.message
      });
    }
  }
);

module.exports = router;
