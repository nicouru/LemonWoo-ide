#!/usr/bin/env bash
set -euo pipefail

# 1. Detect root of the repository
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 2. List of prohibited patterns in regex format
NAMES=(
  "MCP_Hub"
  "MCP_Registry"
  "Anthropic_Endpoint"
  "Provider_Picker"
  "Model_Picker"
  "Stripe"
  "OpenTelemetry"
  "Multi_Agent_Orchestration"
  "Persistent_Memory"
  "Browser_Agents"
  "Playwright_MCP"
  "Stagehand"
  "GitHub_PR_Bot"
  "FIM_Beta_Requirement"
)

REGEXES=(
  "mcp[[:space:]]+hub"
  "mcp[[:space:]]+registry"
  "api\.anthropic\.com|anthropic[[:space:]]+endpoint"
  "provider[[:space:]]+picker"
  "model[[:space:]]+picker"
  "stripe"
  "opentelemetry"
  "multi-agent"
  "vector[[:space:]]+database|vector[[:space:]]+db|persistent[[:space:]]+memory[[:space:]]+sqlite"
  "browser[[:space:]]+agent"
  "playwright[[:space:]]+mcp"
  "stagehand"
  "github[[:space:]]+pr[[:space:]]+bot"
  "fim[[:space:]]+beta"
)

FAILED=0

echo "=== Running V1 Scope Guard Verification ==="

for i in "${!NAMES[@]}"; do
  NAME="${NAMES[$i]}"
  REGEX="${REGEXES[$i]}"
  
  # Search workspace excluding .git, node_modules, build artifacts, lockfiles,
  # the verification scripts themselves, and specified audit/roadmap documentation.
  MATCHES=$(grep -rEIn \
    --exclude-dir=".git" \
    --exclude-dir="node_modules" \
    --exclude-dir="dist" \
    --exclude-dir=".build" \
    --exclude="pnpm-lock.yaml" \
    --exclude="package-lock.json" \
    --exclude="*.test.ts" \
    --exclude="*.md" \
    --exclude="verify-v1-scope.sh" \
    --exclude="verify-public-readiness.sh" \
    --exclude="verify-release-artifacts.sh" \
    -i "$REGEX" "$ROOT" || true)

  # Filter out documentation comments that are explaining exclusions in client.ts
  FILTERED_MATCHES=$(echo "$MATCHES" | grep -vE "(\*[[:space:]]+-?[[:space:]]*No[[:space:]]+(Anthropic|FIM|mcp|stripe))" || true)

  # Filter out legitimate negative phrases (e.g. "no provider picker", "sin model picker", etc.)
  NEG_REGEX="(^|[^a-zA-Z0-9_-])(no|sin)[[:space:]]+(provider[[:space:]]+picker|model[[:space:]]+picker|mcp|stripe|opentelemetry|multi-agent)([^a-zA-Z0-9_-]|$)"
  FILTERED_MATCHES=$(echo "$FILTERED_MATCHES" | grep -ivE "$NEG_REGEX" || true)

  if [[ -n "$FILTERED_MATCHES" ]]; then
    echo "FAIL: Found prohibited scope reference '$NAME' (pattern: '$REGEX')"
    echo "$FILTERED_MATCHES" | while read -r line; do
      echo "  -> $line"
    done
    FAILED=1
  fi
done

if [[ $FAILED -eq 0 ]]; then
  echo "PASS: All V1 scope checks passed. No prohibited features (MCP, provider picker, Stripe, etc.) detected."
  exit 0
else
  echo "FAIL: Prohibited features or configurations found in the active workspace."
  exit 1
fi
