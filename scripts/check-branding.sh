#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PRODUCT="$ROOT/dist/LemonWoo.app/Contents/Resources/app/product.json"
[[ -f "$APP_PRODUCT" ]] || { echo "Missing app product.json"; exit 1; }
/usr/bin/python3 - "$APP_PRODUCT" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
expected={
 "nameShort":"LemonWoo",
 "nameLong":"LemonWoo",
 "applicationName":"lemonwoo",
 "dataFolderName":".lemonwoo",
 "serverApplicationName":"lemonwoo-server",
}
for k,v in expected.items():
    if p.get(k)!=v:
        raise SystemExit(f"Branding mismatch for {k}: {p.get(k)!r} != {v!r}")
print("Branding key fields verified")
PY

echo "Branding check passed"
