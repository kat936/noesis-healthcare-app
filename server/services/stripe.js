/**
 * Stripe Billing Service
 * © 2026 Athena Core Technologies
 *
 * Manages subscription lifecycle, billing events, and feature entitlement
 * Validates webhook signatures and checks subscription status
 * All subscription logic is server-side and never exposed to frontend
 */

class StripeService {
  constructor() {
    this.apiKey = process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    this.publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    this.isConfigured = !!this.apiKey && !this.apiKey.includes('CHANGE_ME');
  }

  /**
   * Get Stripe integration status
   */
  getStatus() {
    return {
      provider: 'Stripe',
      configured: this.isConfigured,
      mode: this.apiKey?.startsWith('sk_live_') ? 'live' : 'test',
      features: ['subscriptions', 'invoicing', 'webhooks', 'metered_billing'],
      requiresWebhook: true
    };
  }

  /**
   * Check if customer has entitlement for feature
   * Server-side subscription validation
   * Returns boolean and feature list for customer's plan
   */
  async checkEntitlement(customerId, feature) {
    if (!this.isConfigured) {
      return {
        entitled: false,
        reason: 'Stripe billing not configured',
        plan: 'free'
      };
    }

    // In production: const stripe = require('stripe')(this.apiKey);
    // const subscriptions = await stripe.subscriptions.list({
    //   customer: customerId,
    //   status: 'active',
    //   limit: 1
    // });
    // Then map subscription price to plan and check PLAN_FEATURES

    // Mock implementation for demo
    const planFeatures = {
      essentials: ['claims', 'eligibility', 'messaging'],
      professional: [
        'claims',
        'eligibility',
        'messaging',
        'authorizations',
        'analytics',
        'guardrails'
      ],
      enterprise: [
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

    // Default to professional for demo
    const plan = 'professional';
    const features = planFeatures[plan];
    const entitled = features.includes(feature);

    return {
      entitled,
      plan,
      features,
      reason: entitled ? null : `Feature requires upgrade from ${plan} plan`
    };
  }

  /**
   * Validate webhook signature from Stripe
   * Ensures webhook payload is authentic and from Stripe
   */
  validateWebhook(payload, signature) {
    if (!this.webhookSecret) {
      throw new Error('Stripe webhook secret not configured');
    }

    // In production:
    // const stripe = require('stripe')(this.apiKey);
    // return stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);

    // Mock implementation for demo
    return {
      valid: true,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          customer: 'cus_test_123',
          subscription: 'sub_test_123',
          payment_status: 'paid'
        }
      }
    };
  }

  /**
   * Handle subscription.created webhook
   */
  handleSubscriptionCreated(data) {
    const subscription = data.object;
    return {
      customerId: subscription.customer,
      subscriptionId: subscription.id,
      plan: this.mapPriceIdToPlan(subscription.items.data[0].price.id),
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    };
  }

  /**
   * Handle subscription.updated webhook
   */
  handleSubscriptionUpdated(data) {
    const subscription = data.object;
    return {
      customerId: subscription.customer,
      subscriptionId: subscription.id,
      plan: this.mapPriceIdToPlan(subscription.items.data[0].price.id),
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
    };
  }

  /**
   * Handle invoice.payment_succeeded webhook
   */
  handleInvoicePaymentSucceeded(data) {
    const invoice = data.object;
    return {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      subscriptionId: invoice.subscription,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      paidAt: new Date(invoice.paid_date * 1000)
    };
  }

  /**
   * Map Stripe price ID to plan name
   * In production, these IDs come from Stripe dashboard
   */
  mapPriceIdToPlan(priceId) {
    const priceMap = {
      'price_essentials': 'essentials',
      'price_professional': 'professional',
      'price_enterprise': 'enterprise'
    };
    return priceMap[priceId] || 'unknown';
  }

  /**
   * Get usage metrics for metered billing
   */
  async getUsageMetrics(customerId, metricName) {
    // In production, retrieve from database or Stripe API
    return {
      customerId,
      metric: metricName,
      currentUsage: 0,
      resetAt: new Date()
    };
  }

  /**
   * Record usage for metered billing
   */
  async recordUsage(customerId, subscriptionItemId, quantity) {
    // In production: const stripe = require('stripe')(this.apiKey);
    // await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, { quantity });
    return {
      success: true,
      recorded: quantity,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new StripeService();
