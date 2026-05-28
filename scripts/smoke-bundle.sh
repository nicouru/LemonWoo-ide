#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/dist/LemonWoo.app"

[[ -d "$APP" ]] || { echo "Missing app bundle: $APP" >&2; exit 1; }
[[ -f "$APP/Contents/Info.plist" ]] || { echo "Missing Info.plist" >&2; exit 1; }

/usr/bin/open "$APP"
echo "Bundle smoke: open command issued"
