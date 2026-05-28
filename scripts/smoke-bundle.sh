#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/dist/LemonWoo.app"

[[ -d "$APP" ]] || { echo "Missing app bundle: $APP" >&2; exit 1; }
[[ -f "$APP/Contents/Info.plist" ]] || { echo "Missing Info.plist" >&2; exit 1; }
EXECUTABLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"

/usr/bin/osascript -e 'tell application id "dev.lemonwoo.ide" to quit' >/dev/null 2>&1 || true
for _ in {1..20}; do
  if ! /usr/bin/pgrep -f "$APP/Contents/MacOS/$EXECUTABLE" >/dev/null; then
    break
  fi
  /bin/sleep 0.25
done

/usr/bin/open "$APP"
/bin/sleep 5

if ! /usr/bin/pgrep -f "$APP/Contents/MacOS/$EXECUTABLE" >/dev/null; then
  echo "Bundle smoke failed: LemonWoo process is not running" >&2
  exit 1
fi

OSA_OUT="$(/usr/bin/osascript <<'OSA' 2>&1 >/dev/null
tell application id "dev.lemonwoo.ide" to activate
delay 1
tell application "System Events"
  set p to first application process whose bundle identifier is "dev.lemonwoo.ide"
  set hasWindow to false
  repeat 10 times
    if (count of windows of p) > 0 then
      set hasWindow to true
      exit repeat
    end if
    delay 1
  end repeat
  if not hasWindow then error "LemonWoo has no window"
  set w to name of front window of p
  if w does not start with "LemonWoo Agent" then error "Expected LemonWoo Agent window, got " & w
end tell
OSA
)" || true

if [[ -n "$OSA_OUT" ]]; then
  if [[ "$OSA_OUT" == *"-25211"* ]]; then
    echo "Bundle smoke: LemonWoo process running (window check skipped: System Events permission denied)"
    exit 0
  fi
  echo "Bundle smoke failed: $OSA_OUT" >&2
  exit 1
fi

echo "Bundle smoke: LemonWoo launched with LemonWoo Agent window"
