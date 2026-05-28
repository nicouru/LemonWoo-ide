#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_DIR="$ROOT/apps/desktop/.build"
DIST_DIR="$ROOT/dist"
APP_DIR="$DIST_DIR/LemonWoo.app"
ZIP_PATH="$BUILD_DIR/VSCodium-darwin-arm64.zip"
DOWNLOAD_URL="${VSCODIUM_URL:-}"

/bin/mkdir -p "$BUILD_DIR" "$DIST_DIR"

if [[ -z "$DOWNLOAD_URL" ]]; then
  DOWNLOAD_URL="$(/usr/bin/curl -sL "https://api.github.com/repos/VSCodium/vscodium/releases/latest" | /usr/bin/python3 -c "import sys,json; d=json.load(sys.stdin); assets=d.get('assets',[]); name='VSCodium-darwin-arm64-'; m=[a['browser_download_url'] for a in assets if a.get('name','').startswith(name) and a.get('name','').endswith('.zip')]; print(m[0] if m else '')")"
fi

if [[ -z "$DOWNLOAD_URL" ]]; then
  echo "Failed to resolve VSCodium arm64 asset URL" >&2
  exit 1
fi

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Downloading VSCodium from: $DOWNLOAD_URL"
  /usr/bin/curl -fL "$DOWNLOAD_URL" -o "$ZIP_PATH"
else
  echo "Using cached archive: $ZIP_PATH"
fi

/bin/rm -rf "$APP_DIR" "$BUILD_DIR/unpack"
/bin/mkdir -p "$BUILD_DIR/unpack"
/usr/bin/unzip -q "$ZIP_PATH" -d "$BUILD_DIR/unpack"

SOURCE_APP="$BUILD_DIR/unpack/VSCodium.app"
if [[ ! -d "$SOURCE_APP" ]]; then
  echo "VSCodium.app not found in archive" >&2
  exit 1
fi

/bin/cp -R "$SOURCE_APP" "$APP_DIR"

bash "$ROOT/apps/desktop/rebrand-macos.sh" "$APP_DIR" "$ROOT/apps/desktop/product.json"

echo "Building bundled extension..."
(cd "$ROOT" && pnpm --filter @lemonwoo/deepseek build && pnpm --filter @lemonwoo/test-gate build && pnpm --filter lemonwoo-ai build)

EXT_TARGET="$APP_DIR/Contents/Resources/app/extensions/lemonwoo-ai"
/bin/rm -rf "$EXT_TARGET"
/bin/mkdir -p "$EXT_TARGET"
/bin/cp "$ROOT/extensions/lemonwoo-ai/package.json" "$EXT_TARGET/"
/bin/mkdir -p "$EXT_TARGET/dist"
/bin/cp -R "$ROOT/extensions/lemonwoo-ai/dist/"* "$EXT_TARGET/dist/"

/usr/bin/xattr -cr "$APP_DIR" || true

echo "Built: $APP_DIR"
