#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/dist/LemonWoo.app"

[[ -d "$APP" ]] || { echo "Missing app bundle: $APP" >&2; exit 1; }
[[ -f "$APP/Contents/Info.plist" ]] || { echo "Missing Info.plist" >&2; exit 1; }
EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"

/usr/bin/open "$APP"
/bin/sleep 5

if ! /usr/bin/pgrep -f "$APP/Contents/MacOS/$EXECUTABLE" >/dev/null; then
  echo "Bundle smoke failed: LemonWoo process is not running" >&2
  exit 1
fi

/usr/bin/osascript <<'OSA' >/dev/null
tell application id "dev.lemonwoo.ide" to activate
delay 1
tell application "System Events"
  set p to first application process whose bundle identifier is "dev.lemonwoo.ide"
  if (count of windows of p) < 1 then error "LemonWoo has no window"
  if name of front window of p is not "LemonWoo Agent" then error "Expected LemonWoo Agent window, got " & name of front window of p
end tell
OSA

echo "Bundle smoke: LemonWoo launched with LemonWoo Agent window"
