#!/usr/bin/env node
/**
 * Noesis Health — iOS Info.plist injector
 * © 2026 Athena Core Technologies, Inc.
 *
 * Capacitor's `cap add ios` regenerates ios/App/App/Info.plist from a
 * vanilla template that lacks our HIPAA-relevant keys (NS*UsageDescription
 * strings, ATS hardening, ITSAppUsesNonExemptEncryption, Universal device
 * family). Running this after `cap add ios` overlays those keys so the
 * shipping Info.plist reflects the source of truth committed in the repo
 * at ios/App/App/Info.plist.
 *
 * Strategy:
 *   1. Read the canonical Info.plist from the repo (kept in lockstep with
 *      the App Store Connect privacy nutrition labels).
 *   2. Read the Capacitor-generated Info.plist.
 *   3. Merge the canonical keys into the generated plist (canonical wins).
 *   4. Write back via `plutil -convert xml1` for stable formatting.
 *
 * Required: macOS host with `plutil` available (always present on macOS).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT       = process.cwd();
const CANONICAL_PLIST = join(REPO_ROOT, 'ios', 'App', 'App', 'Info.plist');
const TARGET_PLIST    = join(REPO_ROOT, 'ios', 'App', 'App', 'Info.plist');

// After `cap add ios` regenerates the iOS scaffold, the canonical plist is
// destroyed. We restore from a preserved copy at /tmp/ios-preserve/Info.plist
// when running in CI; locally we use whatever's in the repo.
const PRESERVED_PLIST = '/tmp/ios-preserve/Info.plist';
const SOURCE = existsSync(PRESERVED_PLIST) ? PRESERVED_PLIST : CANONICAL_PLIST;

if (!existsSync(SOURCE)) {
  console.error(`[inject-ios-plist] No source plist at ${SOURCE}`);
  process.exit(1);
}

if (!existsSync(TARGET_PLIST)) {
  console.error(`[inject-ios-plist] No target plist at ${TARGET_PLIST}`);
  process.exit(1);
}

// Canonical keys we always want shipped — extracted from the source plist.
// We re-extract on each run rather than hardcoding so the script doesn't
// drift from the canonical file.
const KEYS_TO_INJECT = [
  // Privacy usage descriptions — required for any permission Apple sees
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSFaceIDUsageDescription',
  'NSLocalNetworkUsageDescription',

  // Security / compliance posture
  'NSAppTransportSecurity',
  'ITSAppUsesNonExemptEncryption',

  // Device + orientation matrix (Universal)
  'UIDeviceFamily',
  'LSRequiresIPhoneOS',
  'MinimumOSVersion',

  // Background modes (push only)
  'UIBackgroundModes',
];

// Bundle identity that must be preserved against Capacitor regeneration.
// CFBundleVersion is intentionally NOT injected — the workflow bumps it
// to GITHUB_RUN_NUMBER via xcrun agvtool right after this step runs.
const IDENTITY_KEYS = [
  'CFBundleIdentifier',
  'CFBundleName',
  'CFBundleDisplayName',
  'CFBundleShortVersionString',
];

function readKey(plistPath, key) {
  try {
    const out = execSync(`plutil -extract ${key} xml1 -o - "${plistPath}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString().trim();
    return out;
  } catch {
    return null;
  }
}

function writeKey(plistPath, key, xmlValue) {
  // Use a temp file because plutil -insert reads from a file
  const tmp = `/tmp/plist-value-${Date.now()}-${key}.xml`;
  writeFileSync(tmp, xmlValue);
  try {
    // Try replace first (key already exists in target)
    execSync(`plutil -replace ${key} -xml "$(cat ${tmp})" "${plistPath}"`, {
      stdio: 'pipe', shell: '/bin/bash',
    });
  } catch {
    // If replace fails (key absent), insert it
    execSync(`plutil -insert ${key} -xml "$(cat ${tmp})" "${plistPath}"`, {
      stdio: 'pipe', shell: '/bin/bash',
    });
  }
}

const allKeys = [...KEYS_TO_INJECT, ...IDENTITY_KEYS];
let injected = 0;
let skipped  = 0;

for (const key of allKeys) {
  const value = readKey(SOURCE, key);
  if (value === null) {
    console.log(`[inject-ios-plist] (skip) ${key} not present in source`);
    skipped++;
    continue;
  }
  try {
    writeKey(TARGET_PLIST, key, value);
    console.log(`[inject-ios-plist] (ok)   ${key}`);
    injected++;
  } catch (err) {
    console.error(`[inject-ios-plist] (FAIL) ${key}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`[inject-ios-plist] Done — ${injected} keys injected, ${skipped} skipped.`);
