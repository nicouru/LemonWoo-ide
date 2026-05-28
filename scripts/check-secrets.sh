#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATTERN='(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})'

if /usr/bin/grep -RInE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=test --exclude='*.test.ts' "$PATTERN" "$ROOT"; then
  echo "Secret scan failed" >&2
  exit 1
fi

echo "Secret scan passed"
