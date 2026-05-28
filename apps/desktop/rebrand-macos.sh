#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:?app path required}"
PRODUCT_JSON="${2:?product.json path required}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "App not found: $APP_PATH" >&2
  exit 1
fi

if [[ ! -f "$PRODUCT_JSON" ]]; then
  echo "product.json not found: $PRODUCT_JSON" >&2
  exit 1
fi

RESOURCES="$APP_PATH/Contents/Resources"

if [[ -f "$RESOURCES/app/product.json" ]]; then
  /usr/bin/python3 - "$RESOURCES/app/product.json" "$PRODUCT_JSON" <<'PY'
import json,sys
target_path,src_path=sys.argv[1],sys.argv[2]
with open(target_path) as f:
    target=json.load(f)
with open(src_path) as f:
    src=json.load(f)
blocked={"win32AppId","win32UserAppId","win32x64AppId","win32arm64AppId"}
for k,v in src.items():
    if k in blocked:
        continue
    target[k]=v
with open(target_path,"w") as f:
    json.dump(target,f,indent=2)
PY
fi

MAIN_PLIST="$APP_PATH/Contents/Info.plist"
if [[ -f "$MAIN_PLIST" ]]; then
  read -r NAME_SHORT BUNDLE_ID URL_SCHEME < <(/usr/bin/python3 - "$PRODUCT_JSON" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
print(p.get("nameShort","LemonWoo"), p.get("darwinBundleIdentifier","dev.lemonwoo.ide"), p.get("urlProtocol","lemonwoo"))
PY
)

  set_plist_string() {
    local plist="$1"
    local key="$2"
    local value="$3"
    /usr/libexec/PlistBuddy -c "Set :$key $value" "$plist" 2>/dev/null \
      || /usr/libexec/PlistBuddy -c "Add :$key string $value" "$plist"
  }

  set_plist_string "$MAIN_PLIST" "CFBundleIdentifier" "$BUNDLE_ID"
  set_plist_string "$MAIN_PLIST" "CFBundleName" "$NAME_SHORT"
  set_plist_string "$MAIN_PLIST" "CFBundleDisplayName" "$NAME_SHORT"
  if [[ -f "$APP_PATH/Contents/MacOS/VSCodium" && "$NAME_SHORT" != "VSCodium" ]]; then
    /bin/mv "$APP_PATH/Contents/MacOS/VSCodium" "$APP_PATH/Contents/MacOS/$NAME_SHORT"
  fi
  set_plist_string "$MAIN_PLIST" "CFBundleExecutable" "$NAME_SHORT"

  /usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLName $NAME_SHORT" "$MAIN_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:0:CFBundleURLSchemes:0 $URL_SCHEME" "$MAIN_PLIST" 2>/dev/null || true

  for helper_app in "$APP_PATH"/Contents/Frameworks/VSCodium\ Helper*.app; do
    [[ -d "$helper_app" ]] || continue
    old_app_name="$(basename "$helper_app")"
    new_app_name="${old_app_name/VSCodium/$NAME_SHORT}"
    new_helper_app="$(dirname "$helper_app")/$new_app_name"
    if [[ "$helper_app" != "$new_helper_app" ]]; then
      /bin/rm -rf "$new_helper_app"
      /bin/mv "$helper_app" "$new_helper_app"
      helper_app="$new_helper_app"
    fi

    old_exec="$helper_app/Contents/MacOS/${old_app_name%.app}"
    new_exec="$helper_app/Contents/MacOS/${new_app_name%.app}"
    if [[ -f "$old_exec" && "$old_exec" != "$new_exec" ]]; then
      /bin/mv "$old_exec" "$new_exec"
    fi

    helper_plist="$helper_app/Contents/Info.plist"
    [[ -f "$helper_plist" ]] || continue
    helper_name="${new_app_name%.app}"
    set_plist_string "$helper_plist" "CFBundleIdentifier" "$BUNDLE_ID.helper"
    set_plist_string "$helper_plist" "CFBundleName" "$helper_name"
    set_plist_string "$helper_plist" "CFBundleDisplayName" "$helper_name"
    set_plist_string "$helper_plist" "CFBundleExecutable" "$helper_name"
  done
fi
