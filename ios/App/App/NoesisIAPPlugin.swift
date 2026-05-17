// NoesisIAPPlugin.swift
// Noesis Health - StoreKit 2 bridge for Capacitor.
// Phase 1: client-side purchase + entitlement gating. Phase 2 will add
// server-side App Store Server Notifications v2 receipt validation.
//
// Apple bundle id: com.athenacore.noesishealth
// Subscription group: noesis_health_subscriptions
// Product ids:
//   io.noesis.health.solo.monthly  ($299/mo, 7-day free trial)
//   io.noesis.health.solo.annual   ($2,989/yr, 7-day free trial)
//   io.noesis.health.group.monthly ($799/mo, 7-day free trial)
//   io.noesis.health.group.annual  ($7,989/yr, 7-day free trial)

import Foundation
import Capacitor
import StoreKit

@available(iOS 15.0, *)
@objc(NoesisIAPPlugin)
public class NoesisIAPPlugin: CAPPlugin {

    private static let productIds: [String] = [
        "io.noesis.health.solo.monthly",
        "io.noesis.health.solo.annual",
        "io.noesis.health.group.monthly",
        "io.noesis.health.group.annual"
    ]

    private var transactionListener: Task<Void, Error>?

    public override func load() {
        // Listen for transactions that arrive outside of an explicit purchase
        // (renewals, family sharing, App Store-initiated buys). When one
        // fires we re-broadcast active entitlements so the JS layer can flip
        // gating immediately.
        transactionListener = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    let payload = await self.activeEntitlementsPayload()
                    await MainActor.run {
                        self.notifyListeners("subscriptionUpdated", data: payload)
                    }
                }
            }
        }
    }

    deinit {
        transactionListener?.cancel()
    }

    // MARK: - Public API

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: Self.productIds)
                let payload = products.map { p -> [String: Any] in
                    var trialDays = 0
                    if let intro = p.subscription?.introductoryOffer,
                       intro.paymentMode == .freeTrial {
                        trialDays = self.daysIn(period: intro.period)
                    }
                    return [
                        "productId": p.id,
                        "displayName": p.displayName,
                        "description": p.description,
                        "displayPrice": p.displayPrice,
                        "price": NSDecimalNumber(decimal: p.price).doubleValue,
                        "currencyCode": p.priceFormatStyle.currencyCode,
                        "trialDays": trialDays
                    ]
                }
                call.resolve(["products": payload])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found: \(productId)")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        let entitlements = await self.activeEntitlementsPayload()
                        var payload: [String: Any] = [
                            "success": true,
                            "productId": transaction.productID,
                            "transactionId": String(transaction.id),
                            "originalTransactionId": String(transaction.originalID)
                        ]
                        for (key, value) in entitlements {
                            payload[key] = value
                        }
                        call.resolve(payload)
                    case .unverified(_, let error):
                        call.reject("Transaction failed verification: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["success": false, "cancelled": true])
                case .pending:
                    call.resolve(["success": false, "pending": true])
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let payload = await self.activeEntitlementsPayload()
                call.resolve(payload)
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func getActiveEntitlements(_ call: CAPPluginCall) {
        Task {
            let payload = await self.activeEntitlementsPayload()
            call.resolve(payload)
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
                call.reject("No active window scene")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["opened": true])
            } catch {
                call.reject("Failed to open Manage Subscriptions: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Helpers

    private func activeEntitlementsPayload() async -> [String: Any] {
        var active: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                if transaction.revocationDate == nil,
                   Self.productIds.contains(transaction.productID) {
                    active.append([
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "expirationDate": transaction.expirationDate?.timeIntervalSince1970 ?? 0
                    ])
                }
            }
        }
        let plan = Self.planForProducts(active.compactMap { $0["productId"] as? String })
        return [
            "active": !active.isEmpty,
            "plan": plan,
            "entitlements": active
        ]
    }

    private static func planForProducts(_ productIds: [String]) -> String {
        // Group plan strictly outranks Solo if both are somehow active.
        if productIds.contains(where: { $0.hasPrefix("io.noesis.health.group.") }) {
            return "group"
        }
        if productIds.contains(where: { $0.hasPrefix("io.noesis.health.solo.") }) {
            return "solo"
        }
        return "none"
    }

    private func daysIn(period: Product.SubscriptionPeriod) -> Int {
        switch period.unit {
        case .day:   return period.value
        case .week:  return period.value * 7
        case .month: return period.value * 30
        case .year:  return period.value * 365
        @unknown default: return 0
        }
    }
}
