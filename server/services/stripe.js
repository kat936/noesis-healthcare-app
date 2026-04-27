/**
 * Noesis.io Health — Stripe Billing Service
 * © 2026 Athena Core Technologies, Inc.
 *
 * Handles subscription lifecycle for the hybrid pricing model:
 *   Solo        $299/mo   (+ $0.45/claim over 500)
 *   Group       $799/mo   (+ $0.30/claim over 2,000)
 *   Enterprise  Custom    (invoiced separately)
 *
 * Uses real Stripe SDK when STRIPE_SECRET_KEY is configured.
 * Falls back to demo mode (no real charges) for local dev.
 *
 * Webhook events are verified via stripe.webhooks.constructEvent()
 * and persisted to the DB via the subscriptions table.
 */

const { PLANS, PLAN_PRICING, PLAN_FEATURES, normalizePlan } = require('../config/roles');

let _stripe = null;

function getStripe() {
  if (_stripe) { return _stripe; }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.includes('CHANGE_ME') || key.includes('sk_test_EXAMPLE')) {
    return null; // demo mode
  }
  try {
    _stripe = require('stripe')(key, { apiVersion: '2024-06-20' });
    return _stripe;
  } catch {
    return null; // stripe package not installed yet
  }
}

// ── Price ID → plan mapping ───────────────────────────────────────────────────
function buildPriceMap() {
  const map = {};
  for (const [plan, pricing] of Object.entries(PLAN_PRICING)) {
    if (pricing.stripeMonthlyPriceId) { map[pricing.stripeMonthlyPriceId] = { plan, cycle: 'monthly' }; }
    if (pricing.stripeAnnualPriceId)  { map[pricing.stripeAnnualPriceId]  = { plan, cycle: 'annual'  }; }
  }
  return map;
}

function mapPriceIdToPlan(priceId) {
  const map = buildPriceMap();
  return map[priceId] || { plan: 'unknown', cycle: 'unknown' };
}

// ── Status ────────────────────────────────────────────────────────────────────
function getStatus() {
  const stripe = getStripe();
  const key = process.env.STRIPE_SECRET_KEY || '';
  return {
    provider:        'Stripe',
    configured:      !!stripe,
    mode:            key.startsWith('sk_live_') ? 'live' : 'test',
    features:        ['subscriptions', 'checkout', 'customer_portal', 'webhooks', 'metered_billing'],
    publishableKey:  process.env.STRIPE_PUBLISHABLE_KEY || null,
    webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
  };
}

// ── Create Stripe Customer ────────────────────────────────────────────────────
async function createCustomer({ email, name, organizationId, plan }) {
  const stripe = getStripe();
  if (!stripe) {
    return { id: `cus_demo_${Date.now()}`, demo: true };
  }
  return stripe.customers.create({
    email,
    name,
    metadata: { organizationId: organizationId || '', plan: plan || '' },
  });
}

// ── Create Checkout Session ───────────────────────────────────────────────────
async function createCheckoutSession({ customerId, plan, cycle = 'monthly', successUrl, cancelUrl, trialDays }) {
  const stripe = getStripe();
  const pricing = PLAN_PRICING[plan];

  if (!pricing || pricing.contactSales) {
    throw new Error('Enterprise plan requires a sales quote — use /billing/contact-sales');
  }

  const priceId = cycle === 'annual' ? pricing.stripeAnnualPriceId : pricing.stripeMonthlyPriceId;
  const overagePriceId = pricing.stripeOveragePriceId;

  if (!stripe) {
    // Demo mode — return a mock session
    return {
      id:          `cs_demo_${Date.now()}`,
      url:         successUrl + '?session_id=demo&plan=' + plan,
      demo:        true,
      plan,
      cycle,
      monthlyPrice: pricing.monthlyPrice,
    };
  }

  const lineItems = [{ price: priceId, quantity: 1 }];
  if (overagePriceId) {
    lineItems.push({ price: overagePriceId }); // metered — no quantity
  }

  const params = {
    customer:   customerId,
    mode:       'subscription',
    line_items: lineItems,
    success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:  cancelUrl,
    // Include plan in both session and subscription metadata so webhook can read it
    metadata: { plan, cycle },
    subscription_data: {
      metadata: { plan, cycle },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  };

  if (trialDays && trialDays > 0) {
    params.subscription_data.trial_period_days = trialDays;
  }

  return stripe.checkout.sessions.create(params);
}

// ── Customer Portal Session ───────────────────────────────────────────────────
async function createPortalSession({ customerId, returnUrl }) {
  const stripe = getStripe();
  if (!stripe) {
    return { url: returnUrl + '?portal=demo', demo: true };
  }
  return stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: returnUrl,
  });
}

// ── Retrieve Subscription ─────────────────────────────────────────────────────
async function getSubscription(subscriptionId) {
  const stripe = getStripe();
  if (!stripe) { return null; }
  return stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
}

// ── List Customer Invoices ────────────────────────────────────────────────────
async function getInvoices(customerId, limit = 12) {
  const stripe = getStripe();
  if (!stripe) {
    return { data: [], demo: true };
  }
  return stripe.invoices.list({ customer: customerId, limit });
}

// ── Cancel Subscription ───────────────────────────────────────────────────────
async function cancelSubscription(subscriptionId, { atPeriodEnd = true } = {}) {
  const stripe = getStripe();
  if (!stripe) { return { id: subscriptionId, cancel_at_period_end: atPeriodEnd, demo: true }; }
  if (atPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  }
  return stripe.subscriptions.cancel(subscriptionId);
}

// ── Record Claim Usage (metered overage) ──────────────────────────────────────
async function recordClaimUsage(subscriptionItemId, quantity, timestamp) {
  const stripe = getStripe();
  if (!stripe) { return { recorded: quantity, demo: true }; }
  return stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    quantity,
    timestamp: timestamp ? Math.floor(new Date(timestamp).getTime() / 1000) : 'now',
    action: 'increment',
  });
}

// ── Validate Webhook ──────────────────────────────────────────────────────────
function validateWebhook(rawBody, signature) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    // Demo mode — trust all webhooks (never do this in production)
    try {
      const event = JSON.parse(rawBody);
      return { valid: true, event };
    } catch {
      return { valid: false };
    }
  }

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    return { valid: true, event };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ── Check Feature Entitlement ──────────────────────────────────────────────────
async function checkEntitlement(userPlan, feature) {
  const plan = normalizePlan(userPlan) || PLANS.SOLO;
  const features = PLAN_FEATURES[plan] || [];
  const entitled = features.includes(feature);
  return {
    entitled,
    plan,
    features,
    reason: entitled ? null : `"${feature}" requires a higher plan. Current plan: ${plan}.`,
  };
}

// ── Webhook Event Handlers ────────────────────────────────────────────────────
function parseSubscriptionEvent(subscription) {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const { plan, cycle } = mapPriceIdToPlan(priceId);
  return {
    customerId:          subscription.customer,
    subscriptionId:      subscription.id,
    plan:                plan || subscription.metadata?.plan || 'unknown',
    cycle:               cycle || subscription.metadata?.cycle || 'monthly',
    status:              subscription.status,
    currentPeriodStart:  new Date(subscription.current_period_start * 1000).toISOString(),
    currentPeriodEnd:    new Date(subscription.current_period_end   * 1000).toISOString(),
    cancelAtPeriodEnd:   subscription.cancel_at_period_end,
    trialEnd:            subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    overageItemId:       subscription.items?.data?.find((i) => i.price?.recurring?.usage_type === 'metered')?.id || null,
  };
}

function parseInvoiceEvent(invoice) {
  return {
    invoiceId:      invoice.id,
    customerId:     invoice.customer,
    subscriptionId: invoice.subscription,
    amountPaid:     invoice.amount_paid,
    amountDue:      invoice.amount_due,
    currency:       invoice.currency,
    status:         invoice.status,
    paidAt:         invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : null,
    hostedUrl:      invoice.hosted_invoice_url,
    pdfUrl:         invoice.invoice_pdf,
  };
}

module.exports = {
  getStatus,
  getStripe,
  createCustomer,
  createCheckoutSession,
  createPortalSession,
  getSubscription,
  getInvoices,
  cancelSubscription,
  recordClaimUsage,
  validateWebhook,
  checkEntitlement,
  mapPriceIdToPlan,
  parseSubscriptionEvent,
  parseInvoiceEvent,
  // legacy compat
  isConfigured: !!getStripe(),
};
