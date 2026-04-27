/**
 * Noesis.io Health — Billing Route
 * © 2026 Athena Core Technologies, Inc.
 *
 * Hybrid pricing:
 *   Solo        $299/mo  — up to 3 providers, 500 claims included
 *   Group       $799/mo  — up to 20 providers, 2,000 claims included
 *   Enterprise  Custom   — contact sales
 *
 * Endpoints:
 *   GET  /billing/plans              — public plan listing (no auth)
 *   GET  /billing/subscription       — current user's subscription
 *   POST /billing/checkout           — create Stripe checkout session
 *   POST /billing/portal             — create Stripe customer portal session
 *   GET  /billing/invoices           — list invoices from Stripe
 *   POST /billing/cancel             — cancel subscription at period end
 *   GET  /billing/entitlement        — check feature entitlement
 *   POST /billing/webhook            — Stripe webhook (raw body required)
 *   GET  /billing/era                — ERA / payment list
 *   GET  /billing/aging              — accounts receivable aging
 *   GET  /billing/analytics          — revenue analytics
 *   POST /billing/contact-sales      — enterprise sales inquiry
 */

const express = require('express');
const { authenticate, requirePlan } = require('../middleware/auth');
const { apiLimiter, strictLimiter, submissionLimiter } = require('../middleware/rateLimiter');
const stripe  = require('../services/stripe');
const db      = require('../db');
const { PLANS, PLAN_FEATURES, PLAN_LIMITS, getPublicPlans } = require('../config/roles');

const router = express.Router();

// ── GET /plans — public, no auth ─────────────────────────────────────────────
router.get('/plans', (req, res) => {
  res.json({ success: true, plans: getPublicPlans() });
});

// ── GET /subscription ─────────────────────────────────────────────────────────
router.get('/subscription', authenticate, apiLimiter, async (req, res) => {
  try {
    const plan     = req.user.plan || PLANS.SOLO;
    const features = PLAN_FEATURES[plan] || [];
    const limits   = PLAN_LIMITS[plan]   || {};

    let stripeSubscription = null;
    if (req.user.stripeSubscriptionId) {
      try {
        stripeSubscription = await stripe.getSubscription(req.user.stripeSubscriptionId);
      } catch { /* not critical */ }
    }

    const now   = new Date();
    const start = stripeSubscription
      ? new Date(stripeSubscription.current_period_start * 1000)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = stripeSubscription
      ? new Date(stripeSubscription.current_period_end * 1000)
      : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    res.json({
      success: true,
      subscription: {
        plan,
        features,
        limits,
        billingCycle:      'monthly',
        status:            stripeSubscription?.status || 'active',
        currentPeriodStart: start.toISOString(),
        currentPeriodEnd:   end.toISOString(),
        nextBillingDate:    end.toISOString(),
        cancelAtPeriodEnd:  stripeSubscription?.cancel_at_period_end || false,
        trialEnd:           stripeSubscription?.trial_end
          ? new Date(stripeSubscription.trial_end * 1000).toISOString()
          : null,
        stripeStatus:      stripe.getStatus(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve subscription', code: 'SUBSCRIPTION_ERROR' });
  }
});

// ── POST /checkout — create Stripe checkout session ───────────────────────────
router.post('/checkout', authenticate, submissionLimiter, async (req, res) => {
  try {
    const { plan, cycle = 'monthly', successUrl, cancelUrl } = req.body;

    if (!plan || !PLANS[plan.toUpperCase()]) {
      return res.status(400).json({ error: 'Invalid plan. Choose: solo, group, or enterprise', code: 'INVALID_PLAN' });
    }
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ error: 'successUrl and cancelUrl are required', code: 'MISSING_URLS' });
    }

    const normalizedPlan = plan.toLowerCase();

    // Ensure Stripe customer exists
    let customerId = req.user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.createCustomer({
        email:          req.user.email,
        name:           req.user.name,
        organizationId: req.user.organizationId,
        plan:           normalizedPlan,
      });
      customerId = customer.id;

      // Persist stripe customer ID to DB
      if (db.isConnected()) {
        await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.id])
          .catch(() => {});
      }
    }

    const { PLAN_PRICING } = require('../config/roles');
    const pricing = PLAN_PRICING[normalizedPlan];

    const session = await stripe.createCheckoutSession({
      customerId,
      plan:       normalizedPlan,
      cycle,
      successUrl,
      cancelUrl,
      trialDays:  pricing?.trialDays || 0,
    });

    res.json({
      success:    true,
      sessionId:  session.id,
      sessionUrl: session.url,
      demo:       session.demo || false,
      plan:       normalizedPlan,
      cycle,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create checkout session', code: 'CHECKOUT_ERROR' });
  }
});

// ── POST /portal — Stripe customer portal ────────────────────────────────────
router.post('/portal', authenticate, submissionLimiter, async (req, res) => {
  try {
    const { returnUrl } = req.body;
    const customerId    = req.user.stripeCustomerId;

    if (!customerId) {
      return res.status(400).json({ error: 'No billing account found. Please subscribe first.', code: 'NO_CUSTOMER' });
    }

    const session = await stripe.createPortalSession({ customerId, returnUrl: returnUrl || req.headers.origin || '' });
    res.json({ success: true, portalUrl: session.url, demo: session.demo || false });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to create portal session', code: 'PORTAL_ERROR' });
  }
});

// ── GET /invoices ─────────────────────────────────────────────────────────────
router.get('/invoices', authenticate, apiLimiter, async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const customerId = req.user.stripeCustomerId;

    if (customerId) {
      const invoices = await stripe.getInvoices(customerId, parseInt(limit));
      const formatted = (invoices.data || []).map((inv) => ({
        id:        inv.id,
        date:      new Date(inv.created * 1000).toISOString().slice(0, 10),
        amount:    (inv.amount_paid / 100).toFixed(2),
        currency:  inv.currency?.toUpperCase(),
        status:    inv.status,
        pdfUrl:    inv.invoice_pdf,
        hostedUrl: inv.hosted_invoice_url,
        plan:      req.user.plan,
      }));
      return res.json({ success: true, invoices: formatted, total: formatted.length, demo: invoices.demo || false });
    }

    // Demo invoices when no Stripe customer
    const { PLAN_PRICING } = require('../config/roles');
    const plan    = req.user.plan || PLANS.SOLO;
    const pricing = PLAN_PRICING[plan];
    const demoInvoices = [
      { id: 'inv-demo-002', date: '2026-03-01', amount: pricing?.monthlyPrice || 299, currency: 'USD', status: 'paid',   plan },
      { id: 'inv-demo-001', date: '2026-02-01', amount: pricing?.monthlyPrice || 299, currency: 'USD', status: 'paid',   plan },
    ];
    res.json({ success: true, invoices: demoInvoices, total: demoInvoices.length, demo: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve invoices', code: 'INVOICE_ERROR' });
  }
});

// ── POST /cancel ──────────────────────────────────────────────────────────────
router.post('/cancel', authenticate, strictLimiter, async (req, res) => {
  try {
    const { immediately = false } = req.body;
    const subscriptionId = req.user.stripeSubscriptionId;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'No active subscription found', code: 'NO_SUBSCRIPTION' });
    }

    const result = await stripe.cancelSubscription(subscriptionId, { atPeriodEnd: !immediately });
    res.json({ success: true, cancelAtPeriodEnd: result.cancel_at_period_end, demo: result.demo || false });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to cancel subscription', code: 'CANCEL_ERROR' });
  }
});

// ── GET /entitlement ──────────────────────────────────────────────────────────
router.get('/entitlement', authenticate, apiLimiter, async (req, res) => {
  try {
    const { feature } = req.query;
    if (!feature) { return res.status(400).json({ error: 'feature parameter required', code: 'MISSING_FEATURE' }); }

    const result = await stripe.checkEntitlement(req.user.plan, feature);
    res.json({ success: true, feature, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Entitlement check failed', code: 'ENTITLEMENT_ERROR' });
  }
});

// ── GET /era — ERA / payment remittance list ──────────────────────────────────
router.get('/era', authenticate, requirePlan('solo', 'group', 'enterprise'), apiLimiter, async (req, res) => {
  try {
    const clearinghouse = require('../services/clearinghouse');
    const { fromDate, toDate, limit } = req.query;
    const result = await clearinghouse.getERAs({ fromDate, toDate, limit: parseInt(limit) || 20 });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve ERA data', code: 'ERA_ERROR' });
  }
});

// ── GET /aging — accounts receivable aging ────────────────────────────────────
router.get('/aging', authenticate, requirePlan('solo', 'group', 'enterprise'), apiLimiter, async (req, res) => {
  try {
    if (db.isConnected()) {
      const result = await db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'submitted' AND created_at > NOW() - INTERVAL '30 days')  AS current_30,
          COUNT(*) FILTER (WHERE status = 'submitted' AND created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days') AS days_31_60,
          COUNT(*) FILTER (WHERE status = 'submitted' AND created_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '60 days') AS days_61_90,
          COUNT(*) FILTER (WHERE status = 'submitted' AND created_at < NOW() - INTERVAL '90 days') AS over_90,
          SUM(amount) FILTER (WHERE status = 'submitted' AND created_at > NOW() - INTERVAL '30 days') AS amount_current,
          SUM(amount) FILTER (WHERE status = 'submitted' AND created_at BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days') AS amount_31_60,
          SUM(amount) FILTER (WHERE status = 'submitted' AND created_at BETWEEN NOW() - INTERVAL '90 days' AND NOW() - INTERVAL '60 days') AS amount_61_90,
          SUM(amount) FILTER (WHERE status = 'submitted' AND created_at < NOW() - INTERVAL '90 days') AS amount_over_90
        FROM claims
        WHERE provider_id = $1
      `, [req.user.id]);
      const r = result.rows[0];
      return res.json({ success: true, aging: {
        current:  { count: parseInt(r.current_30)  || 0, amount: parseFloat(r.amount_current) || 0 },
        days3160: { count: parseInt(r.days_31_60)  || 0, amount: parseFloat(r.amount_31_60)   || 0 },
        days6190: { count: parseInt(r.days_61_90)  || 0, amount: parseFloat(r.amount_61_90)   || 0 },
        over90:   { count: parseInt(r.over_90)     || 0, amount: parseFloat(r.amount_over_90) || 0 },
      }});
    }

    // Demo aging
    res.json({ success: true, demo: true, aging: {
      current:  { count: 14, amount: 8420.50 },
      days3160: { count: 8,  amount: 4100.00 },
      days6190: { count: 3,  amount: 1850.00 },
      over90:   { count: 2,  amount: 960.00  },
    }});
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve aging', code: 'AGING_ERROR' });
  }
});

// ── GET /analytics — available to all plans (solo gets summary, group/enterprise full) ──
router.get('/analytics', authenticate, requirePlan('solo', 'group', 'enterprise'), apiLimiter, async (req, res) => {
  try {
    if (db.isConnected()) {
      const result = await db.query(`
        SELECT
          COUNT(*)                                         AS total_claims,
          SUM(amount)                                      AS total_billed,
          COUNT(*) FILTER (WHERE status = 'paid')          AS paid_claims,
          SUM(amount) FILTER (WHERE status = 'paid')       AS total_collected,
          COUNT(*) FILTER (WHERE status = 'denied')        AS denied_claims,
          COUNT(*) FILTER (WHERE status = 'pending')       AS pending_claims,
          AVG(amount)                                      AS avg_claim_amount,
          DATE_TRUNC('month', created_at)                  AS month
        FROM claims
        WHERE provider_id = $1 AND created_at > NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month DESC
      `, [req.user.id]);

      const totals = await db.query(`
        SELECT
          COUNT(*) AS total_claims, SUM(amount) AS total_billed,
          SUM(amount) FILTER (WHERE status = 'paid') AS total_collected
        FROM claims WHERE provider_id = $1
      `, [req.user.id]);

      const t = totals.rows[0];
      return res.json({ success: true, analytics: {
        totalClaims:    parseInt(t.total_claims) || 0,
        totalBilled:    parseFloat(t.total_billed) || 0,
        totalCollected: parseFloat(t.total_collected) || 0,
        collectionRate: t.total_billed > 0 ? ((t.total_collected / t.total_billed) * 100).toFixed(1) + '%' : '0%',
        byMonth:        result.rows,
      }});
    }

    res.json({ success: true, demo: true, analytics: {
      totalClaims: 127, totalBilled: 89400, totalCollected: 72100,
      collectionRate: '80.6%',
      byMonth: [
        { month: '2026-04', totalClaims: 24, totalBilled: 17800, paidClaims: 18, totalCollected: 14200 },
        { month: '2026-03', totalClaims: 31, totalBilled: 22100, paidClaims: 26, totalCollected: 18400 },
        { month: '2026-02', totalClaims: 28, totalBilled: 19600, paidClaims: 23, totalCollected: 15800 },
      ],
    }});
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve analytics', code: 'ANALYTICS_ERROR' });
  }
});

// ── POST /contact-sales — enterprise inquiry ──────────────────────────────────
router.post('/contact-sales', submissionLimiter, async (req, res) => {
  try {
    const { name, email, organization, providerCount, message } = req.body;
    if (!email || !organization) {
      return res.status(400).json({ error: 'email and organization are required', code: 'VALIDATION_ERROR' });
    }

    // In production: send to CRM (HubSpot / Salesforce) or email via SendGrid
    console.warn(`[SALES LEAD] ${organization} | ${email} | ${providerCount} providers | ${message}`);

    res.json({
      success: true,
      message: 'Thanks! Our team will reach out within 1 business day.',
      leadId:  `LEAD-${Date.now()}`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit inquiry', code: 'CONTACT_ERROR' });
  }
});

// ── POST /webhook — Stripe webhook ───────────────────────────────────────────
// IMPORTANT: This route is mounted in index.js with express.raw() BEFORE express.json()
// so that req.body is a raw Buffer here (required for Stripe HMAC sig validation).
// The router also handles this path for non-webhook requests normally.
router.post('/webhook', strictLimiter, webhookHandler);

async function webhookHandler(req, res) {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) { return res.status(400).json({ error: 'Missing stripe-signature', code: 'MISSING_SIG' }); }

    // req.body is a raw Buffer when mounted with express.raw() in index.js
    // Fall back to re-serializing if somehow body-parser ran first (dev only)
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    const { valid, event, error } = stripe.validateWebhook(rawBody, signature);

    if (!valid) { return res.status(400).json({ error: 'Invalid webhook signature', code: 'INVALID_SIG', details: error }); }

    await handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: 'Webhook processing failed', code: 'WEBHOOK_ERROR', details: err.message });
  }
}

async function handleWebhookEvent(event) {
  const { type, data } = event;

  switch (type) {
    case 'checkout.session.completed': {
      const session = data.object;
      // Derive plan from subscription metadata (set at checkout creation time)
      // Fall back to 'solo' only if metadata is missing
      const checkoutPlan = session.metadata?.plan
        || session.subscription_data?.metadata?.plan
        || 'solo';
      console.warn(`[billing] Checkout completed: customer=${session.customer} sub=${session.subscription} plan=${checkoutPlan}`);
      if (db.isConnected() && session.customer) {
        await db.query(
          `UPDATE users SET stripe_subscription_id = $1, plan = $2 WHERE stripe_customer_id = $3`,
          [session.subscription, checkoutPlan, session.customer]
        ).catch(() => {});
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = stripe.parseSubscriptionEvent(data.object);
      console.warn(`[billing] Subscription ${type.split('.').pop()}: customer=${sub.customerId} plan=${sub.plan}`);
      if (db.isConnected()) {
        await db.query(
          `UPDATE users SET plan = $1, stripe_subscription_id = $2 WHERE stripe_customer_id = $3`,
          [sub.plan, sub.subscriptionId, sub.customerId]
        ).catch(() => {});
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = stripe.parseSubscriptionEvent(data.object);
      console.warn(`[billing] Subscription canceled: customer=${sub.customerId}`);
      if (db.isConnected()) {
        await db.query(
          `UPDATE users SET plan = NULL, stripe_subscription_id = NULL WHERE stripe_customer_id = $1`,
          [sub.customerId]
        ).catch(() => {});
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const inv = stripe.parseInvoiceEvent(data.object);
      console.warn(`[billing] Invoice paid: ${inv.invoiceId} amount=${inv.amountPaid} customer=${inv.customerId}`);
      break;
    }
    case 'invoice.payment_failed': {
      const inv = stripe.parseInvoiceEvent(data.object);
      console.warn(`[billing] Invoice payment FAILED: ${inv.invoiceId} customer=${inv.customerId}`);
      // In production: trigger dunning email via SendGrid / Postmark
      break;
    }
    default:
      console.warn(`[billing] Unhandled webhook event: ${type}`);
  }
}

// Export both the router AND the raw webhook handler
// index.js mounts webhookHandler with express.raw() before express.json()
router.webhookHandler = webhookHandler;
module.exports = router;
