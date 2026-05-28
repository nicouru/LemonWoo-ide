#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PRODUCT="$ROOT/dist/LemonWoo.app/Contents/Resources/app/product.json"
APP_PLIST="$ROOT/dist/LemonWoo.app/Contents/Info.plist"
[[ -f "$APP_PRODUCT" ]] || { echo "Missing app product.json"; exit 1; }
[[ -f "$APP_PLIST" ]] || { echo "Missing app Info.plist"; exit 1; }
/usr/bin/python3 - "$APP_PRODUCT" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
expected={
 "nameShort":"LemonWoo",
 "nameLong":"LemonWoo",
 "applicationName":"lemonwoo",
 "dataFolderName":".lemonwoo",
 "serverApplicationName":"lemonwoo-server",
 "darwinBundleIdentifier":"dev.lemonwoo.ide",
}
for k,v in expected.items():
    if p.get(k)!=v:
        raise SystemExit(f"Branding mismatch for {k}: {p.get(k)!r} != {v!r}")
print("Branding key fields verified")
PY

[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PLIST")" == "dev.lemonwoo.ide" ]] || {
  echo "Info.plist bundle id is not LemonWoo" >&2
  exit 1
}
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$APP_PLIST")" == "LemonWoo" ]] || {
  echo "Info.plist bundle name is not LemonWoo" >&2
  exit 1
}
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$APP_PLIST")" == "LemonWoo" ]] || {
  echo "Info.plist display name is not LemonWoo" >&2
  exit 1
}
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_PLIST")" == "LemonWoo" ]] || {
  echo "Info.plist executable is not LemonWoo" >&2
  exit 1
}
[[ -x "$ROOT/dist/LemonWoo.app/Contents/MacOS/LemonWoo" ]] || {
  echo "Missing LemonWoo executable" >&2
  exit 1
}
[[ -d "$ROOT/dist/LemonWoo.app/Contents/Frameworks/LemonWoo Helper.app" ]] || {
  echo "Missing LemonWoo Helper.app" >&2
  exit 1
}

echo "Branding check passed"
