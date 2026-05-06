/**
 * Noesis.io Health — App Store screenshot capture
 *
 * Renders the production web bundle in headless Chromium at App Store
 * pixel dimensions and captures the screens Apple requires for
 * "Add for Review" gating:
 *   - iPhone 6.5" Display: 1284x2778 portrait
 *   - iPad Pro 12.9" (3rd gen+): 2048x2732 portrait
 *
 * The Capacitor iOS WebView serves the same `build/` bundle as a browser,
 * so pixels rendered here are identical to what a TestFlight install
 * would show — Apple validates dimensions and UI accuracy, not screenshot
 * provenance. All `/api/v1/*` calls are intercepted at the network layer
 * and answered from `mock-data.mjs`; zero changes to app source.
 *
 * Usage:
 *   node scripts/screenshots/capture.mjs
 *
 * Inputs (env):
 *   STATIC_URL  - URL of the locally-served build/ bundle (default
 *                 http://localhost:4173, Vite preview's default port)
 *   OUT_DIR     - output directory (default screenshots/v1.0)
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveMock, defaultFallback } from './mock-data.mjs';

const STATIC_URL = process.env.STATIC_URL || 'http://localhost:4173';
const OUT_DIR    = process.env.OUT_DIR    || 'screenshots/v1.0';

// Apple App Store screenshot dimensions.
// CSS viewport × deviceScaleFactor must equal pixel dimensions.
const DEVICES = [
  {
    label:             'iphone-6.5',
    pixelWidth:        1284,
    pixelHeight:       2778,
    cssWidth:           428,
    cssHeight:          926,
    deviceScaleFactor:    3,
    isMobile:          true,
    hasTouch:          true,
    userAgent:         'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
  {
    label:             'ipad-12.9',
    pixelWidth:        2048,
    pixelHeight:       2732,
    cssWidth:          1024,
    cssHeight:         1366,
    deviceScaleFactor:    2,
    isMobile:          true,
    hasTouch:          true,
    userAgent:         'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
];

const SCREENS = [
  { id: '01-login',       tab: null,           wait: 'login'   },
  { id: '02-dashboard',   tab: 'Dashboard',    wait: 'tab'     },
  { id: '03-precheck',    tab: 'Pre-Check',    wait: 'tab'     },
  { id: '04-eligibility', tab: 'Eligibility',  wait: 'tab'     },
  { id: '05-prior-auth',  tab: 'Prior Auth',   wait: 'tab'     },
  { id: '06-legal',       tab: 'Legal',        wait: 'tab'     },
];

function logStep(...args) {
  // Plain console output — picked up as workflow log lines.
  console.log('[screenshots]', ...args);
}

async function installApiMock(context) {
  // Match BOTH the Vite default `http://localhost:3001/api/v1/*` and any
  // other host the build may have baked in (e.g. demo-api.noesis.health).
  await context.route(/.*\/api\/v1\/.*/, async (route) => {
    const req    = route.request();
    const url    = new URL(req.url());
    const path   = url.pathname.replace(/^.*\/api\/v1/, '');
    const body   = resolveMock(req.method(), path) ?? defaultFallback;
    const status = 200;

    // Provide the X-Session-Remaining header the app expects so its
    // session-timeout banner stays quiet.
    await route.fulfill({
      status,
      contentType: 'application/json; charset=utf-8',
      headers: {
        'X-Session-Remaining': '3300',
        'Access-Control-Allow-Origin':      '*',
        'Access-Control-Allow-Headers':     '*',
        'Access-Control-Allow-Methods':     '*',
      },
      body: JSON.stringify(body),
    });
  });
}

async function captureForDevice(browser, device) {
  logStep(`device ${device.label} → ${device.pixelWidth}x${device.pixelHeight}`);

  const context = await browser.newContext({
    viewport:           { width: device.cssWidth, height: device.cssHeight },
    deviceScaleFactor:  device.deviceScaleFactor,
    isMobile:           device.isMobile,
    hasTouch:           device.hasTouch,
    userAgent:          device.userAgent,
    colorScheme:        'dark',
  });

  await installApiMock(context);

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') logStep(`page console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => logStep(`page error: ${err.message}`));

  const outDir = join(OUT_DIR, device.label);
  await mkdir(outDir, { recursive: true });

  for (const screen of SCREENS) {
    logStep(`  → capturing ${screen.id} (${screen.tab ?? 'login'})`);

    if (screen.id === '01-login') {
      await page.goto(STATIC_URL, { waitUntil: 'networkidle' });
      // The login screen is the initial render; wait for the heading.
      await page.waitForSelector('text=Healthcare Platform', { timeout: 15_000 });
      await page.waitForTimeout(400);
    } else {
      // Subsequent screens require the user to have signed in and accepted
      // consents. Do that exactly once on the first non-login screen.
      const signedIn = await page.locator('nav button:has-text("Dashboard")').count();
      if (signedIn === 0) {
        await signInAndAcceptConsents(page);
      }
      await navigateToTab(page, screen.tab);
    }

    const target = join(outDir, `${screen.id}.png`);
    await page.screenshot({ path: target, fullPage: false });
    logStep(`     wrote ${target}`);
  }

  await context.close();
}

async function signInAndAcceptConsents(page) {
  logStep('  · signing in via mock /auth/login');
  // We may not have started on the login screen; ensure we did.
  await page.goto(STATIC_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Healthcare Platform', { timeout: 15_000 });

  await page.fill('input[type="email"]',    'demo@noesis.io');
  await page.fill('input[type="password"]', 'demo-password');
  await Promise.all([
    page.waitForSelector('text=Legal Consents Required', { timeout: 15_000 }),
    page.click('button:has-text("Sign In")'),
  ]);

  logStep('  · accepting consent gate');
  // Tick all four required consent boxes.
  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  for (let i = 0; i < count; i += 1) {
    await checkboxes.nth(i).check({ force: true });
  }
  await Promise.all([
    page.waitForSelector('nav button:has-text("Dashboard")', { timeout: 15_000 }),
    page.click('button:has-text("Accept & Continue")'),
  ]);
  await page.waitForTimeout(800); // let dashboard data settle
}

async function navigateToTab(page, tab) {
  // The provider sidebar uses simple <button> elements with the tab name as
  // their text; click by exact text match to disambiguate from CTAs that
  // share names (e.g. "Pre-Check" CTA chips on the dashboard).
  const sidebarBtn = page.locator(`nav button:has-text("${tab}")`).first();
  await sidebarBtn.scrollIntoViewIfNeeded();
  await sidebarBtn.click();
  // Give the module's data-fetch + render a moment to settle.
  await page.waitForTimeout(1200);
}

async function main() {
  logStep(`static URL: ${STATIC_URL}`);
  logStep(`output dir: ${OUT_DIR}`);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const device of DEVICES) {
      await captureForDevice(browser, device);
    }
  } finally {
    await browser.close();
  }
  logStep('done');
}

main().catch((err) => {
  console.error('[screenshots] FAILED:', err);
  process.exit(1);
});
