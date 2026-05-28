#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ -f "$ROOT/LICENSE" ]] || { echo "LICENSE missing" >&2; exit 1; }
[[ -f "$ROOT/NOTICE" ]] || { echo "NOTICE missing" >&2; exit 1; }

echo "License files present"
