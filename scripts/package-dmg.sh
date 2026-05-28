#!/usr/bin/env bash
set -euo pipefail

# 1. Detect root of the repository
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 2. Read version from package.json
VERSION=$(node -p "require('./package.json').version")
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) ARCH="$ARCH_RAW" ;;
esac
echo "Starting DMG packaging for LemonWoo v${VERSION} (${ARCH})..."

APP_PATH="dist/LemonWoo.app"

# 3. Ensure dist/LemonWoo.app exists; if not, build it
if [[ ! -d "$APP_PATH" ]]; then
  echo "ERROR: Application bundle not found at ${APP_PATH}."
  echo "Run 'pnpm build:mac' first (or use 'pnpm release:check') and retry."
  echo "Attempting automatic build now..."
  pnpm build:mac
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "ERROR: build completed but ${APP_PATH} still does not exist."
  exit 1
fi

# 4. Run required validation checks
echo "Running branding checks..."
pnpm check:branding

echo "Running secrets checks..."
pnpm check:secrets

echo "Running license checks..."
pnpm check:licenses

echo "Verifying code signature of ${APP_PATH}..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

# 5. Create the DMG with hdiutil
DMG_NAME="LemonWoo-${VERSION}-mac-${ARCH}.dmg"
DMG_PATH="dist/${DMG_NAME}"
SHA_PATH="${DMG_PATH}.sha256"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lemonwoo-dmg.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "Creating DMG at ${DMG_PATH}..."
# Remove any existing DMG at that path first to avoid conflicts
rm -f "$DMG_PATH"

# hdiutil copies the contents of -srcfolder into the volume root. Use a
# staging directory so the mounted DMG contains LemonWoo.app, not Contents/.
ditto "$APP_PATH" "$STAGE_DIR/LemonWoo.app"
ln -s /Applications "$STAGE_DIR/Applications"

hdiutil create -volname "LemonWoo" -srcfolder "$STAGE_DIR" -ov -format UDZO "$DMG_PATH"

# 6. Verify the DMG
echo "Verifying DMG integrity..."
hdiutil verify "$DMG_PATH"

# 7. Generate checksum
echo "Generating SHA256 checksum..."
(cd dist && shasum -a 256 "${DMG_NAME}" > "${DMG_NAME}.sha256")

# 8. Print the final paths
echo "DMG packaging successful!"
echo "Final DMG Path: $(pwd)/${DMG_PATH}"
echo "SHA256 File: $(pwd)/${SHA_PATH}"
