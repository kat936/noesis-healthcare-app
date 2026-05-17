// NoesisIAPPlugin.m
// Objective-C registration for the Swift StoreKit bridge so Capacitor's
// runtime discovery (CAP_PLUGIN macros) can find and expose it to JS.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NoesisIAPPlugin, "NoesisIAP",
    CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(restore, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getActiveEntitlements, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(manageSubscriptions, CAPPluginReturnPromise);
)
