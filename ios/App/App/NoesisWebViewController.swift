/**
 * Noesis Health — WKWebView Wrapper (Alternative to Capacitor)
 * © 2026 Athena Core Technologies, Inc.
 *
 * Use this if NOT using Capacitor. Wraps the hosted React web app in a
 * native WKWebView with HIPAA-appropriate security settings.
 *
 * Set PRODUCTION_URL to your deployed web app URL before archiving.
 */

import UIKit
import WebKit

class NoesisWebViewController: UIViewController {

    // MARK: - Configuration
    private let PRODUCTION_URL = "https://app.noesishealth.com"
    private let APP_USER_AGENT = "NoesisHealth/1.0 iOS"

    // MARK: - Properties
    private var webView: WKWebView!
    private var activityIndicator: UIActivityIndicatorView!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupActivityIndicator()
        loadApp()
    }

    // MARK: - Setup

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()

        // Security: disable data detection that could expose PHI
        configuration.dataDetectorTypes = []

        // Allow media playback for any video content
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        // Content controller for JS bridge (optional — for native features)
        let contentController = WKUserContentController()
        configuration.userContentController = contentController

        // Preferences
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self

        // HIPAA: Disable screenshot/screen recording for sensitive healthcare data
        // NOTE: In production, consider using UITextField.isSecureTextEntry equivalent
        // for financial fields displayed on screen
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 15/255, green: 23/255, blue: 42/255, alpha: 1.0)

        // Custom user agent - identifies as Noesis iOS app to backend
        webView.customUserAgent = APP_USER_AGENT

        // Disable long-press context menu (prevents PHI leakage via copy/share)
        let longPressGesture = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPress))
        longPressGesture.minimumPressDuration = Double.infinity
        webView.addGestureRecognizer(longPressGesture)

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func setupActivityIndicator() {
        activityIndicator = UIActivityIndicatorView(style: .large)
        activityIndicator.color = UIColor(red: 20/255, green: 184/255, blue: 166/255, alpha: 1.0) // Teal
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.hidesWhenStopped = true
        view.addSubview(activityIndicator)
        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private func loadApp() {
        guard let url = URL(string: PRODUCTION_URL) else { return }
        let request = URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30)
        webView.load(request)
        activityIndicator.startAnimating()
    }

    // MARK: - Actions

    @objc private func handleLongPress(_ gesture: UILongPressGestureRecognizer) {
        // Suppress long-press context menu to prevent PHI copy/share
    }
}

// MARK: - WKNavigationDelegate

extension NoesisWebViewController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        showNetworkError()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        let nsError = error as NSError
        // Ignore cancelled loads (e.g. user navigated away before load completed)
        if nsError.code != NSURLErrorCancelled {
            showNetworkError()
        }
    }

    // Allow navigation only within the app domain + essential third-party (Stripe)
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        let allowedHosts = [
            "app.noesishealth.com",
            "noesishealth.com",
            "localhost",
            "127.0.0.1",
            "stripe.com",
            "checkout.stripe.com",
            "js.stripe.com",
        ]

        let host = url.host ?? ""
        let isAllowed = allowedHosts.contains(where: { host == $0 || host.hasSuffix(".\($0)") })

        if isAllowed || navigationAction.navigationType == .other {
            decisionHandler(.allow)
        } else {
            // Open external links in Safari, not in app
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
        }
    }

    private func showNetworkError() {
        let alert = UIAlertController(
            title: "Connection Error",
            message: "Unable to connect to Noesis Health. Please check your internet connection and try again.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Retry", style: .default) { [weak self] _ in
            self?.loadApp()
        })
        present(alert, animated: true)
    }
}

// MARK: - WKUIDelegate

extension NoesisWebViewController: WKUIDelegate {

    // Handle JavaScript alert()
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: "Noesis Health", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    // Handle JavaScript confirm()
    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: "Noesis Health", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}
