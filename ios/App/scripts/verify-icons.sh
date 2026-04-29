#!/bin/bash
# Noesis Health — App Icon pre-flight check
# © 2026 Athena Core Technologies, Inc.
#
# Run as a Run Script build phase in Xcode (target: App, position: before
# "Compile Sources"). Fails the build if any required App Store icon
# variant is missing.
#
# Apple's required iOS app icon set as of iOS 16+ (per Asset Catalog
# Compiler reference). The 1024×1024 marketing icon must be opaque
# (no alpha channel) — App Store Connect rejects alpha PNGs.

set -euo pipefail

ICON_DIR="${SRCROOT}/App/Assets.xcassets/AppIcon.appiconset"

if [ ! -d "${ICON_DIR}" ]; then
  echo "error: App icon directory missing: ${ICON_DIR}"
  exit 1
fi

REQUIRED_ICONS=(
  "Icon-App-20x20@2x.png"     # iPhone Notification
  "Icon-App-20x20@3x.png"
  "Icon-App-29x29@2x.png"     # iPhone Settings
  "Icon-App-29x29@3x.png"
  "Icon-App-40x40@2x.png"     # iPhone Spotlight
  "Icon-App-40x40@3x.png"
  "Icon-App-60x60@2x.png"     # iPhone App
  "Icon-App-60x60@3x.png"
  "Icon-App-20x20@1x.png"     # iPad Notification
  "Icon-App-29x29@1x.png"     # iPad Settings
  "Icon-App-40x40@1x.png"     # iPad Spotlight
  "Icon-App-76x76@2x.png"     # iPad App
  "Icon-App-83.5x83.5@2x.png" # iPad Pro App
  "Icon-App-1024x1024@1x.png" # App Store Marketing
)

MISSING=0
for ICON in "${REQUIRED_ICONS[@]}"; do
  if [ ! -f "${ICON_DIR}/${ICON}" ]; then
    echo "error: required app icon missing: ${ICON}"
    MISSING=$((MISSING + 1))
  fi
done

if [ "${MISSING}" -gt 0 ]; then
  echo "error: ${MISSING} app icon(s) missing — see ios/SUBMISSION.md §5"
  exit 1
fi

# Verify marketing icon has no alpha channel.
MARKETING_ICON="${ICON_DIR}/Icon-App-1024x1024@1x.png"
if command -v sips >/dev/null 2>&1; then
  ALPHA=$(sips -g hasAlpha "${MARKETING_ICON}" 2>/dev/null | awk '/hasAlpha/{print $2}')
  if [ "${ALPHA}" = "yes" ]; then
    echo "error: 1024×1024 marketing icon must NOT have an alpha channel."
    echo "       Re-export as opaque PNG. App Store Connect will reject this."
    exit 1
  fi
fi

echo "info: all required app icons present and marketing icon is opaque."
