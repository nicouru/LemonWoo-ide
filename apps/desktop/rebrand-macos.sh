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
blocked={"darwinBundleIdentifier","win32AppId","win32UserAppId","win32x64AppId","win32arm64AppId"}
for k,v in src.items():
    if k in blocked:
        continue
    target[k]=v
with open(target_path,"w") as f:
    json.dump(target,f,indent=2)
PY
fi
