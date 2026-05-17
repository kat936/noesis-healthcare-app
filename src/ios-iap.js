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

export async function getProducts() {
  if (!isIOSNative()) return { products: [] };
  try {
    return await Plugin.getProducts();
  } catch (err) {
    console.warn('[NoesisIAP] getProducts failed:', err);
    return { products: [] };
  }
}

export async function purchase(plan, cadence) {
  if (!isIOSNative()) {
    throw new Error('iOS IAP purchase is only available on the iOS app.');
  }
  const productId = productIdFor(plan, cadence);
  if (!productId) {
    throw new Error(`No iOS product configured for plan=${plan} cadence=${cadence}`);
  }
  return Plugin.purchase({ productId });
}

export async function restore() {
  if (!isIOSNative()) return emptyEntitlements();
  try {
    return await Plugin.restore();
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
