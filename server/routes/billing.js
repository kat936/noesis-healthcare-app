const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter, strictLimiter } = require('../middleware/rateLimiter');
const stripe = require('../services/stripe');
const { PLANS, PLAN_FEATURES, PLAN_LIMITS } = require('../config/roles');

const router = express.Router();

/**
 * GET /billing/subscription
 * Get current subscription status and plan details
 */
router.get('/subscription', authenticate, apiLimiter, (req, res) => {
  try {
    const plan = req.user.plan || PLANS.ESSENTIALS;
    const features = PLAN_FEATURES[plan] || [];
    const limits = PLAN_LIMITS[plan] || {};

    res.json({
      success: true,
      subscription: {
        plan,
        features,
        limits,
        billingCycle: 'monthly',
        currentPeriodStart: '2025-01-01',
        currentPeriodEnd: '2025-01-31',
        autoRenewal: true,
        status: 'active',
        nextBillingDate: '2025-02-01'
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve subscription',
      code: 'SUBSCRIPTION_ERROR'
    });
  }
});

/**
 * GET /billing/invoices
 * Get billing invoices
 */
router.get('/invoices', authenticate, apiLimiter, (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    // Mock invoices
    const invoices = [
      {
        id: 'inv-001',
        date: '2025-01-01',
        amount: 99.99,
        plan: req.user.plan || 'professional',
        status: 'paid',
        pdfUrl: '/invoices/inv-001.pdf'
      },
      {
        id: 'inv-002',
        date: '2024-12-01',
        amount: 99.99,
        plan: req.user.plan || 'professional',
        status: 'paid',
        pdfUrl: '/invoices/inv-002.pdf'
      }
    ];

    const paginated = invoices.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      invoices: paginated,
      total: invoices.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve invoices',
      code: 'INVOICE_ERROR'
    });
  }
});

/**
 * POST /billing/webhook
 * Stripe webhook endpoint
 * Validates signature and processes subscription events
 */
router.post('/webhook', strictLimiter, (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({
        error: 'Missing Stripe signature',
        code: 'MISSING_SIGNATURE'
      });
    }

    // Validate webhook signature
    const event = stripe.validateWebhook(JSON.stringify(req.body), signature);

    if (!event.valid) {
      return res.status(400).json({
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Handle webhook based on event type
    switch (event.type) {
      case 'checkout.session.completed':
        handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        handleSubscriptionCanceled(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        handleInvoicePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        handleInvoicePaymentFailed(event.data.object);
        break;

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    // Acknowledge webhook reception
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({
      error: 'Webhook processing failed',
      code: 'WEBHOOK_ERROR',
      details: err.message
    });
  }
});

/**
 * GET /billing/entitlement
 * Check if user has entitlement for feature
 */
router.get('/entitlement', authenticate, apiLimiter, async (req, res) => {
  try {
    const { feature } = req.query;

    if (!feature) {
      return res.status(400).json({
        error: 'feature parameter required',
        code: 'VALIDATION_ERROR'
      });
    }

    const entitlement = await stripe.checkEntitlement(req.user.id, feature);

    res.json({
      success: true,
      feature,
      entitled: entitlement.entitled,
      plan: entitlement.plan,
      features: entitlement.features,
      reason: entitlement.reason
    });
  } catch (err) {
    res.status(500).json({
      error: 'Entitlement check failed',
      code: 'ENTITLEMENT_ERROR'
    });
  }
});

/**
 * GET /billing/plans
 * List available subscription plans
 */
router.get('/plans', (req, res) => {
  try {
    const plans = [
      {
        name: PLANS.ESSENTIALS,
        displayName: 'Essentials',
        price: 29.99,
        currency: 'USD',
        billingPeriod: 'month',
        description: 'Perfect for small practices',
        features: PLAN_FEATURES[PLANS.ESSENTIALS],
        limits: PLAN_LIMITS[PLANS.ESSENTIALS],
        monthlyPrice: 29.99,
        annualPrice: 299.99
      },
      {
        name: PLANS.PROFESSIONAL,
        displayName: 'Professional',
        price: 99.99,
        currency: 'USD',
        billingPeriod: 'month',
        description: 'For growing practices',
        features: PLAN_FEATURES[PLANS.PROFESSIONAL],
        limits: PLAN_LIMITS[PLANS.PROFESSIONAL],
        monthlyPrice: 99.99,
        annualPrice: 999.99,
        mostPopular: true
      },
      {
        name: PLANS.ENTERPRISE,
        displayName: 'Enterprise',
        price: 'Custom',
        currency: 'USD',
        billingPeriod: 'month',
        description: 'For large organizations',
        features: PLAN_FEATURES[PLANS.ENTERPRISE],
        limits: PLAN_LIMITS[PLANS.ENTERPRISE],
        monthlyPrice: null,
        annualPrice: null,
        contactSales: true
      }
    ];

    res.json({
      success: true,
      plans
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to retrieve plans',
      code: 'PLANS_ERROR'
    });
  }
});

// ============ WEBHOOK HANDLERS ============

function handleCheckoutCompleted(session) {
  console.log(`Checkout completed for customer ${session.customer}`);
  // In production: update customer record, grant access
}

function handleSubscriptionCreated(subscription) {
  console.log(`Subscription created for customer ${subscription.customer}`);
  // In production: store subscription, activate features
}

function handleSubscriptionUpdated(subscription) {
  console.log(`Subscription updated for customer ${subscription.customer}`);
  // In production: sync plan changes
}

function handleSubscriptionCanceled(subscription) {
  console.log(`Subscription canceled for customer ${subscription.customer}`);
  // In production: revoke features, archive customer
}

function handleInvoicePaymentSucceeded(invoice) {
  console.log(`Invoice ${invoice.id} payment succeeded`);
  // In production: mark invoice as paid
}

function handleInvoicePaymentFailed(invoice) {
  console.log(`Invoice ${invoice.id} payment failed`);
  // In production: send retry notification
}

module.exports = router;
