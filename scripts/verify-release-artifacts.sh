#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Running Local Release Artifacts Audit ==="

APP_PATH="dist/LemonWoo.app"
DIST_PATH="dist"
DMG_FOUND=""
if [[ -d "$DIST_PATH" ]]; then
  DMG_FOUND="$(ls -1 dist/LemonWoo-*-mac-*.dmg 2>/dev/null | head -n 1 || true)"
fi

# Check if any artifacts exist
if [[ ! -d "$DIST_PATH" ]]; then
  echo "SKIP: No release artifacts found in 'dist/'."
  echo "Instructions to generate artifacts:"
  echo "  - To build the app bundle: run 'pnpm build:mac'"
  echo "  - To package the DMG:      run 'pnpm package:dmg'"
  exit 0
fi

if [[ ! -d "$APP_PATH" && -z "$DMG_FOUND" ]]; then
  echo "SKIP: No release artifacts found in 'dist/'."
  echo "Instructions to generate artifacts:"
  echo "  - To build the app bundle: run 'pnpm build:mac'"
  echo "  - To package the DMG:      run 'pnpm package:dmg'"
  exit 0
fi

FAILED=0

# 1. Audit LemonWoo.app bundle if it exists
if [[ -d "$APP_PATH" ]]; then
  echo "Auditing $APP_PATH..."

  APP_PLIST="$APP_PATH/Contents/Info.plist"
  APP_PRODUCT="$APP_PATH/Contents/Resources/app/product.json"

  if [[ ! -f "$APP_PLIST" ]]; then
    echo "FAIL: Info.plist missing from $APP_PATH"
    FAILED=1
  else
    # Verify Info.plist fields
    BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PLIST")
    BUNDLE_NAME=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$APP_PLIST")
    DISPLAY_NAME=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$APP_PLIST")
    EXECUTABLE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_PLIST")
    
    if [[ "$BUNDLE_ID" != "dev.lemonwoo.ide" ]]; then
      echo "FAIL: CFBundleIdentifier is '$BUNDLE_ID', expected 'dev.lemonwoo.ide'"
      FAILED=1
    fi
    if [[ "$BUNDLE_NAME" != "LemonWoo" ]]; then
      echo "FAIL: CFBundleName is '$BUNDLE_NAME', expected 'LemonWoo'"
      FAILED=1
    fi
    if [[ "$DISPLAY_NAME" != "LemonWoo" ]]; then
      echo "FAIL: CFBundleDisplayName is '$DISPLAY_NAME', expected 'LemonWoo'"
      FAILED=1
    fi
    if [[ "$EXECUTABLE" != "LemonWoo" ]]; then
      echo "FAIL: CFBundleExecutable is '$EXECUTABLE', expected 'LemonWoo'"
      FAILED=1
    fi
  fi
  
  if [[ ! -f "$APP_PRODUCT" ]]; then
    echo "FAIL: product.json missing from app bundle Resources"
    FAILED=1
  else
    # Verify product.json fields
    /usr/bin/python3 - "$APP_PRODUCT" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
expected = {
    "nameShort": "LemonWoo",
    "nameLong": "LemonWoo",
    "applicationName": "lemonwoo",
    "dataFolderName": ".lemonwoo",
}
mismatch = False
for k, v in expected.items():
    if p.get(k) != v:
        print(f"FAIL: product.json {k} is {p.get(k)!r}, expected {v!r}")
        mismatch = True
if mismatch:
    sys.exit(1)
PY
    if [[ $? -ne 0 ]]; then
      FAILED=1
    fi
  fi

  # Verify executable exists and is executable
  EXEC_PATH="$APP_PATH/Contents/MacOS/LemonWoo"
  if [[ ! -x "$EXEC_PATH" ]]; then
    echo "FAIL: LemonWoo main executable is missing or not executable at $EXEC_PATH"
    FAILED=1
  fi

  # Verify "LemonWoo" appears in Info.plist text
  if ! /usr/bin/plutil -p "$APP_PLIST" 2>/dev/null | /usr/bin/grep -q "LemonWoo"; then
    echo "FAIL: Info.plist does not include expected LemonWoo branding text."
    FAILED=1
  fi

  # Validate user-facing branding fields do not contain prohibited references
  if /usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$APP_PLIST" | /usr/bin/grep -Eiq '(cursor|vscodium|code - oss)'; then
    echo "FAIL: CFBundleName contains prohibited branding reference."
    FAILED=1
  fi
  if /usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$APP_PLIST" | /usr/bin/grep -Eiq '(cursor|vscodium|code - oss)'; then
    echo "FAIL: CFBundleDisplayName contains prohibited branding reference."
    FAILED=1
  fi
  if /usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_PLIST" | /usr/bin/grep -Eiq '(cursor|vscodium|code - oss)'; then
    echo "FAIL: CFBundleExecutable contains prohibited branding reference."
    FAILED=1
  fi

  # Audit Helper apps
  for helper in "LemonWoo Helper" "LemonWoo Helper (GPU)" "LemonWoo Helper (Plugin)" "LemonWoo Helper (Renderer)"; do
    HELPER_APP_PATH="$APP_PATH/Contents/Frameworks/${helper}.app"
    if [[ ! -d "$HELPER_APP_PATH" ]]; then
      echo "FAIL: Helper app ${helper}.app is missing"
      FAILED=1
    else
      HELPER_PLIST="$HELPER_APP_PATH/Contents/Info.plist"
      if [[ ! -f "$HELPER_PLIST" ]]; then
        echo "FAIL: Helper app ${helper}.app/Contents/Info.plist is missing"
        FAILED=1
      else
        helper_suffix=".helper"
        if [[ "$helper" == *"Helper (GPU)"* ]]; then
          helper_suffix=".helper.GPU"
        elif [[ "$helper" == *"Helper (Plugin)"* ]]; then
          helper_suffix=".helper.Plugin"
        elif [[ "$helper" == *"Helper (Renderer)"* ]]; then
          helper_suffix=".helper.Renderer"
        fi

        HELPER_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$HELPER_PLIST")
        if [[ "$HELPER_ID" != "dev.lemonwoo.ide$helper_suffix" ]]; then
          echo "FAIL: Helper ${helper} CFBundleIdentifier is '$HELPER_ID', expected 'dev.lemonwoo.ide$helper_suffix'"
          FAILED=1
        fi

        if /usr/bin/plutil -p "$HELPER_PLIST" 2>/dev/null | /usr/bin/grep -Eiq '(vscodium|cursor|visual studio code)'; then
          echo "FAIL: Prohibited branding strings found in Helper ${helper} Info.plist"
          FAILED=1
        fi
      fi
    fi
  done

  # Broad branding check on main info plist
  if /usr/bin/plutil -p "$APP_PLIST" 2>/dev/null | /usr/bin/grep -Eiq '(vscodium|cursor|visual studio code)'; then
    echo "FAIL: Prohibited branding strings found in main Info.plist"
    FAILED=1
  fi

  # Verify codesign
  echo "Verifying code signature of $APP_PATH..."
  if ! codesign --verify --deep --strict --verbose=2 "$APP_PATH" 2>&1; then
    echo "FAIL: Codesign verification failed for $APP_PATH"
    FAILED=1
  fi
else
  echo "SKIP: $APP_PATH does not exist. (Run 'pnpm build:mac' to generate it)"
fi

# 2. Audit DMG if it exists
if [[ -n "$DMG_FOUND" ]]; then
  echo "Auditing DMG file $DMG_FOUND..."
  if ! hdiutil verify "$DMG_FOUND"; then
    echo "FAIL: hdiutil verification failed for $DMG_FOUND"
    FAILED=1
  fi

  SHA_PATH="${DMG_FOUND}.sha256"
  if [[ ! -f "$SHA_PATH" ]]; then
    echo "FAIL: Missing checksum file $SHA_PATH"
    FAILED=1
  else
    EXPECTED_SHA="$(awk '{print $1}' "$SHA_PATH")"
    ACTUAL_SHA="$(shasum -a 256 "$DMG_FOUND" | awk '{print $1}')"
    if [[ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]]; then
      echo "FAIL: DMG checksum mismatch for $DMG_FOUND"
      echo "  expected: $EXPECTED_SHA"
      echo "  actual:   $ACTUAL_SHA"
      FAILED=1
    fi
  fi
else
  echo "SKIP: DMG artifact does not exist. (Run 'pnpm package:dmg' to generate it)"
fi

# 3. Final report
if [[ $FAILED -eq 0 ]]; then
  echo "PASS: Local release artifacts audit completed successfully."
  exit 0
else
  echo "FAIL: Local release artifacts audit failed."
  exit 1
fi
