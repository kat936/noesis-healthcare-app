const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { npiLookupSchema, drugSearchSchema, fdaDeviceSearchSchema } = require('../schemas/validation');

// REAL integrations
const npiRegistry = require('../services/npiRegistry');
const openFDA = require('../services/openFDA');
const stripe = require('../services/stripe');

const router = express.Router();

/**
 * GET /integrations/status
 * Show status of all integrations
 * Available to all authenticated users
 */
router.get('/status', authenticate, apiLimiter, (req, res) => {
  try {
    const integrations = {
      npiRegistry: npiRegistry.getStatus(),
      openFDA: openFDA.getStatus(),
      stripe: stripe.getStatus()
    };

    res.json({
      success: true,
      integrations,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get integration status',
      code: 'STATUS_ERROR'
    });
  }
});

/**
 * POST /integrations/npi/lookup
 * REAL NPI Registry lookup
 * Makes actual HTTP call to CMS NPI Registry
 * Requires Professional or Enterprise plan
 */
router.post(
  '/npi/lookup',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  validate(npiLookupSchema),
  async (req, res) => {
    try {
      const params = req.validated;

      // Make REAL API call to NPI Registry
      const result = await npiRegistry.lookupNPI(params);

      res.json({
        success: result.success,
        source: result.source,
        resultCount: result.resultCount,
        providers: result.providers,
        timestamp: result.timestamp
      });
    } catch (err) {
      res.status(500).json({
        error: 'NPI lookup failed',
        code: 'NPI_LOOKUP_ERROR',
        details: err.error || err.message
      });
    }
  }
);

/**
 * POST /integrations/fda/drugs
 * REAL OpenFDA drug search
 * Makes actual HTTP call to FDA API
 * Requires Professional or Enterprise plan
 */
router.post(
  '/fda/drugs',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  validate(drugSearchSchema),
  async (req, res) => {
    try {
      const params = req.validated;

      // Make REAL API call to OpenFDA
      const result = await openFDA.searchDrugs(params);

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: 'FDA_SEARCH_ERROR',
          details: result.details
        });
      }

      res.json({
        success: result.success,
        source: result.source,
        resultCount: result.resultCount,
        drugs: result.drugs,
        timestamp: result.timestamp
      });
    } catch (err) {
      res.status(500).json({
        error: 'FDA drug search failed',
        code: 'FDA_SEARCH_ERROR',
        details: err.error || err.message
      });
    }
  }
);

/**
 * POST /integrations/fda/devices
 * REAL OpenFDA device search
 * Makes actual HTTP call to FDA API
 */
router.post(
  '/fda/devices',
  authenticate,
  requirePlan('professional', 'enterprise'),
  apiLimiter,
  validate(fdaDeviceSearchSchema),
  async (req, res) => {
    try {
      const params = req.validated;

      // Make REAL API call to OpenFDA
      const result = await openFDA.searchDevices(params);

      if (!result.success) {
        return res.status(400).json({
          error: result.error,
          code: 'FDA_DEVICE_ERROR',
          details: result.details
        });
      }

      res.json({
        success: result.success,
        source: result.source,
        resultCount: result.resultCount,
        events: result.events,
        timestamp: result.timestamp
      });
    } catch (err) {
      res.status(500).json({
        error: 'FDA device search failed',
        code: 'FDA_DEVICE_ERROR',
        details: err.error || err.message
      });
    }
  }
);

/**
 * GET /integrations/proof/:provider
 * PROVE integration works by making REAL API call
 * Returns raw response + normalized response + pipeline usage
 * Useful for demonstration and debugging
 */
router.get('/proof/:provider', authenticate, apiLimiter, async (req, res) => {
  try {
    const { provider } = req.params;

    switch (provider.toLowerCase()) {
      case 'npi':
        // Proof of NPI integration - lookup a known provider
        const npiResult = await npiRegistry.lookupNPI({
          npiNumber: '1234567893' // Valid NPI that may or may not exist
        });

        return res.json({
          success: true,
          provider: 'NPI_REGISTRY_CMS',
          proof: {
            apiCallMade: true,
            endpoint: 'https://npiregistry.cms.hhs.gov/api/',
            timestamp: new Date().toISOString(),
            response: npiResult
          },
          integration: npiRegistry.getStatus()
        });

      case 'fda':
        // Proof of FDA integration - search for a common drug
        const fdaResult = await openFDA.searchDrugs({
          genericName: 'acetaminophen',
          limit: 3
        });

        return res.json({
          success: true,
          provider: 'OPEN_FDA',
          proof: {
            apiCallMade: true,
            endpoint: 'https://api.fda.gov/drug/label.json',
            timestamp: new Date().toISOString(),
            response: fdaResult
          },
          integration: openFDA.getStatus()
        });

      case 'stripe':
        return res.json({
          success: true,
          provider: 'STRIPE',
          proof: {
            apiCallMade: false,
            reason: 'Stripe requires authentication and webhook configuration',
            configured: stripe.isConfigured,
            status: stripe.getStatus()
          },
          integration: stripe.getStatus()
        });

      default:
        return res.status(400).json({
          error: 'Unknown provider',
          code: 'INVALID_PROVIDER',
          available: ['npi', 'fda', 'stripe']
        });
    }
  } catch (err) {
    res.status(500).json({
      error: 'Integration proof failed',
      code: 'PROOF_ERROR',
      details: err.error || err.message
    });
  }
});

module.exports = router;
