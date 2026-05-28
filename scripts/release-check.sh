#!/usr/bin/env bash
set -euo pipefail

# 1. Detect root of the repository
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=========================================="
echo "Starting Release Check Flow for LemonWoo"
echo "=========================================="

echo "Running workspace tests..."
pnpm -r test

echo "Building macOS application..."
pnpm build:mac

echo "Running branding checks..."
pnpm check:branding

echo "Verifying code signature of LemonWoo.app..."
codesign --verify --deep --strict --verbose=2 dist/LemonWoo.app

echo "Scanning for secrets..."
pnpm check:secrets

echo "Checking license files..."
pnpm check:licenses

echo "Running bundle smoke tests..."
pnpm smoke:bundle

echo "Packaging application into DMG..."
pnpm package:dmg

# Read version and build bundle ID details for summary
VERSION=$(node -p "require('./package.json').version")
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) ARCH="$ARCH_RAW" ;;
esac
BUNDLE_ID="dev.lemonwoo.ide"
EXECUTABLE="dist/LemonWoo.app/Contents/MacOS/LemonWoo"
DMG_PATH="dist/LemonWoo-${VERSION}-mac-${ARCH}.dmg"

echo "=========================================="
echo "Release Check Completed Successfully!"
echo "=========================================="
echo "Summary:"
echo "- App generated: $(pwd)/dist/LemonWoo.app"
echo "- Bundle ID: ${BUNDLE_ID}"
echo "- Executable: $(pwd)/${EXECUTABLE}"
echo "- DMG generated: $(pwd)/${DMG_PATH}"
echo "=========================================="
