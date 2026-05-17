/**
 * Noesis Health - iOS StoreKit bridge (JS side).
 *
 * Wraps the native NoesisIAPPlugin (ios/App/App/NoesisIAPPlugin.swift) so
 * the React layer doesn't need to know about Capacitor internals. On web,
 * every method is a safe no-op that reports "no active iOS subscription"
 * so the Stripe-on-web path stays untouched.
 *
 * Product ids (kept in sync with ios/Noesis.storekit and PLAN_FEATURES in
 * noesis-health-app.jsx):
 *   solo:  monthly $299, annual $2,989
 *   group: monthly $799, annual $7,989
 *   enterprise: contact sales (no IAP product)
 */

import { registerPlugin, Capacitor } from '@capacitor/core';

export const IOS_PRODUCT_IDS = {
  solo:  { monthly: 'io.noesis.health.solo.monthly',  annual: 'io.noesis.health.solo.annual'  },
  group: { monthly: 'io.noesis.health.group.monthly', annual: 'io.noesis.health.group.annual' },
};

const ALL_PRODUCT_IDS = [
  IOS_PRODUCT_IDS.solo.monthly,
  IOS_PRODUCT_IDS.solo.annual,
  IOS_PRODUCT_IDS.group.monthly,
  IOS_PRODUCT_IDS.group.annual,
];

export function isIOSNative() {
  return Capacitor?.isNativePlatform?.() && Capacitor.getPlatform?.() === 'ios';
}

export function productIdFor(plan, cadence) {
  return IOS_PRODUCT_IDS[plan]?.[cadence] || null;
}

export function planFromProductId(productId) {
  if (!productId) return null;
  if (productId.startsWith('io.noesis.health.solo.'))  return 'solo';
  if (productId.startsWith('io.noesis.health.group.')) return 'group';
  return null;
}

// registerPlugin returns a proxy on every platform. On web it errors when
// called, which we catch below. On iOS it routes to the Swift plugin.
const Plugin = registerPlugin('NoesisIAP');

function emptyEntitlements() {
  return { active: false, plan: 'none', entitlements: [] };
}

// Phase 1: fire-and-forget POST the signed Apple JWS to the Health backend
// so the server can begin recording Apple subscriptions as soon as users
// start purchasing. Phase 2 will add real JWS signature verification against
// Apple's public keys and persist plan/role entitlements server-side. The
// client never blocks on this — purchase / restore UX must remain instant
// and offline-tolerant even when the verify endpoint is missing or down.
const VERIFY_PATH = '/billing/apple/verify-transaction';

function apiBase() {
  // Mirrors the API_BASE constant in noesis-health-app.jsx so the IAP
  // bridge can stay self-contained. If Vite has inlined REACT_APP_API_URL
  // at build time, use it; otherwise fall back to the local dev server.
  // typeof guard avoids a ReferenceError in environments where process is
  // undefined (Capacitor/iOS runtime with Vite's strict prod build).
  try {
    if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
      return process.env.REACT_APP_API_URL;
    }
  } catch {
    // ignore — fall through to default
  }
  return 'http://localhost:3001/api/v1';
}

export function postTransactionForVerification(payload, { token } = {}) {
  // Only meaningful on iOS, and only when there's something to send.
  if (!isIOSNative() || !payload) return;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // keepalive lets the POST survive if the WebView navigates immediately
    // after purchase (e.g. logout → LoginScreen transition).
    fetch(`${apiBase()}${VERIFY_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {}); // fire-and-forget
  } catch {
    // never throw — Phase 1 must not block purchase UX
  }
}

export async function getProducts() {
  if (!isIOSNative()) return { products: [] };
  try {
    return await Plugin.getProducts();
  } catch (err) {
    console.warn('[NoesisIAP] getProducts failed:', err);
    return { products: [] };
  }
}

export async function purchase(plan, cadence, opts = {}) {
  if (!isIOSNative()) {
    throw new Error('iOS IAP purchase is only available on the iOS app.');
  }
  const productId = productIdFor(plan, cadence);
  if (!productId) {
    throw new Error(`No iOS product configured for plan=${plan} cadence=${cadence}`);
  }
  const result = await Plugin.purchase({ productId });
  // Fire-and-forget: if the purchase succeeded, ship the signed JWS to the
  // backend so Phase 2 can finalize entitlement persistence.
  if (result?.success && result.jwsRepresentation) {
    postTransactionForVerification(
      {
        kind: 'purchase',
        productId: result.productId || productId,
        transactionId: result.transactionId,
        originalTransactionId: result.originalTransactionId,
        jwsRepresentation: result.jwsRepresentation,
      },
      { token: opts.token },
    );
  }
  return result;
}

export async function restore(opts = {}) {
  if (!isIOSNative()) return emptyEntitlements();
  try {
    const result = await Plugin.restore();
    // Mirror purchase: ship every restored entitlement's JWS so Phase 2 can
    // reconcile server-side state if the user reinstalls or switches devices.
    if (result?.active && Array.isArray(result.entitlements)) {
      for (const ent of result.entitlements) {
        if (ent?.jwsRepresentation) {
          postTransactionForVerification(
            {
              kind: 'restore',
              productId: ent.productId,
              transactionId: ent.transactionId,
              originalTransactionId: ent.originalTransactionId,
              jwsRepresentation: ent.jwsRepresentation,
            },
            { token: opts.token },
          );
        }
      }
    }
    return result;
  } catch (err) {
    console.warn('[NoesisIAP] restore failed:', err);
    return emptyEntitlements();
  }
}

export async function getActiveEntitlements() {
  if (!isIOSNative()) return emptyEntitlements();
  try {
    return await Plugin.getActiveEntitlements();
  } catch (err) {
    console.warn('[NoesisIAP] getActiveEntitlements failed:', err);
    return emptyEntitlements();
  }
}

export async function openManageSubscriptions() {
  if (!isIOSNative()) return { opened: false };
  try {
    return await Plugin.manageSubscriptions();
  } catch (err) {
    console.warn('[NoesisIAP] manageSubscriptions failed:', err);
    return { opened: false };
  }
}

export function addSubscriptionUpdatedListener(handler) {
  if (!isIOSNative() || !Plugin?.addListener) return () => {};
  const sub = Plugin.addListener('subscriptionUpdated', handler);
  return () => { sub?.remove?.(); };
}

export { ALL_PRODUCT_IDS };
