#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

run_gauntlet() {
  local label="$1"
  local script="$2"

  if [[ ! -f "$script" ]]; then
    echo "SKIP: $label ($script not found on this branch)"
    return 0
  fi

  echo "==> $label"
  node "$script"
}

run_gauntlet "v2 functional gauntlet" "scripts/v2-functional-gauntlet.mjs"
run_gauntlet "v2 web preview gauntlet" "scripts/v2-web-preview-gauntlet.mjs"
run_gauntlet "v2 terminal gauntlet" "scripts/v2-terminal-gauntlet.mjs"

echo "V2 check passed."
