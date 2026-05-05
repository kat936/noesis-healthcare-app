/**
 * scripts/regenerate-icons.mjs
 *
 * Regenerates the icon set from the canonical Noesis emblem in
 * `noesis-emblem-source.png` (1024 x 1024 RGBA, gold/transparent)
 * into every size Apple App Store, the PWA manifest, and the iOS
 * asset catalog need.
 *
 * Apple App Review Guideline 2.3.8 (Accurate Metadata) rejects builds
 * whose icons "appear to be placeholder icons". The default Capacitor
 * iOS template ships a blue-X placeholder; without an explicit step
 * that writes the Noesis emblem into `ios/App/App/Assets.xcassets/`,
 * every built `.ipa` carries that placeholder. This script generates
 * the source PNGs; `scripts/inject-ios-icons.mjs` copies them into the
 * iOS asset catalog after `cap sync ios` runs.
 *
 * Apple also rejects icons with alpha channels in the 1024x1024
 * marketing icon. Every PNG produced here is flattened onto solid
 * #0f172a (matches SplashScreen.backgroundColor in capacitor.config.json
 * for the Health app) so the assets are opaque end-to-end.
 *
 * Run:
 *   npm i sharp --no-save
 *   node scripts/regenerate-icons.mjs
 */

import sharp from "sharp";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "noesis-emblem-source.png");

if (!existsSync(SRC)) {
  console.error(`Source emblem missing at ${SRC}`);
  process.exit(1);
}

// Solid background colour for opaque icons. Matches
// SplashScreen.backgroundColor in capacitor.config.json so the launch
// icon and splash blend on cold start.
const BG_HEX = "#0f172a";

// Repo-root sizes (PWA manifest, App Store master, and the master that
// inject-ios-icons.mjs reads to fill the iOS asset catalog).
const FLAT_SIZES = [1024, 512, 192, 180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20];

// The emblem is rendered with a small inset so it doesn't visually
// crowd the rounded-corner mask iOS applies. 12% inset matches HIG
// safe area for circular/round-rect icons.
const ICON_INSET = 0.12;

async function makeFlatIcon(size, outPath) {
  const inner = Math.max(1, Math.round(size * (1 - ICON_INSET * 2)));
  const inset = Math.round((size - inner) / 2);
  const logoBuf = await sharp(SRC)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 3, background: BG_HEX },
  })
    .composite([{ input: logoBuf, top: inset, left: inset }])
    .png({ compressionLevel: 9, palette: false })
    .removeAlpha()
    .toFile(outPath);
}

(async () => {
  // 1. Repo-root flat PNGs.
  for (const size of FLAT_SIZES) {
    const out = join(ROOT, `noesis-icon-${size}.png`);
    await makeFlatIcon(size, out);
    console.log(`  ${size.toString().padStart(4)} -> ${out}`);
  }

  // 2. iOS splash screen (2732 x 2732, solid background with the emblem
  // centred at ~33% of the canvas). The Capacitor iOS template needs
  // a single 2732 PNG which gets reused at 1x/2x/3x by the imageset.
  const SPLASH_SIZE = 2732;
  const SPLASH_LOGO = Math.round(SPLASH_SIZE * 0.33);
  const splashLogo = await sharp(SRC)
    .resize(SPLASH_LOGO, SPLASH_LOGO, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .toBuffer();
  const splashOut = join(ROOT, "noesis-splash-2732.png");
  await sharp({
    create: {
      width: SPLASH_SIZE,
      height: SPLASH_SIZE,
      channels: 3,
      background: BG_HEX,
    },
  })
    .composite([{ input: splashLogo, gravity: "center" }])
    .png({ compressionLevel: 9, palette: false })
    .removeAlpha()
    .toFile(splashOut);
  console.log(`  splash -> ${splashOut}`);

  console.log(`\nDone. ${FLAT_SIZES.length} icons + 1 splash regenerated.`);
  console.log(`Run 'node scripts/inject-ios-icons.mjs' to push them into the iOS asset catalog.`);
})().catch((err) => {
  console.error("Icon regeneration failed:", err);
  process.exit(1);
});
