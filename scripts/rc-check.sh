#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RESULTS_PATH="dist/rc-check-last.json"
TMP_RESULTS="$(mktemp "${TMPDIR:-/tmp}/lemonwoo-rc-check.XXXXXX.json")"
trap 'rm -f "$TMP_RESULTS"' EXIT

mkdir -p "dist"

timestamp="$(date '+%Y-%m-%d %H:%M:%S %z')"
printf '{\n  "generatedAt": "%s",\n  "steps": [\n' "$timestamp" > "$TMP_RESULTS"

first_step=1

record_step() {
  local name="$1"
  local command="$2"
  local status="$3"
  local exit_code="$4"

  if [[ $first_step -eq 0 ]]; then
    printf ',\n' >> "$TMP_RESULTS"
  fi
  first_step=0

  printf '    {"name":"%s","command":"%s","status":"%s","exitCode":%s}' \
     "$name" "$command" "$status" "$exit_code" >> "$TMP_RESULTS"
}

finalize_and_exit() {
  local exit_code="$1"
  printf '\n  ]\n}\n' >> "$TMP_RESULTS"
  mv "$TMP_RESULTS" "$RESULTS_PATH"
  exit "$exit_code"
}

run_step() {
  local name="$1"
  local command="$2"
  echo
  echo "=== ${name} ==="
  echo "$command"
  if eval "$command"; then
    record_step "$name" "$command" "PASS" "0"
    echo "PASS: ${name}"
  else
    local code=$?
    record_step "$name" "$command" "FAIL" "$code"
    echo "FAIL: ${name} (exit ${code})"
    finalize_and_exit "$code"
  fi
}

run_live_smoke() {
  local name="Live DeepSeek smoke"
  local command="pnpm smoke:agent:live"
  echo
  echo "=== ${name} ==="
  echo "$command"
  set +e
  eval "$command"
  local code=$?
  set -e

  if [[ $code -eq 0 ]]; then
    record_step "$name" "$command" "PASS" "0"
    echo "PASS: ${name}"
    return 0
  fi

  if [[ $code -eq 78 ]]; then
    record_step "$name" "$command" "SKIP_EXPECTED_EXTERNAL" "78"
    echo "SKIP externo esperado: falta DEEPSEEK_API_KEY (exit 78)"
    return 0
  fi

  record_step "$name" "$command" "FAIL" "$code"
  echo "FAIL: ${name} (exit ${code})"
  finalize_and_exit "$code"
}

echo "========================================="
echo "LemonWoo RC check started"
echo "========================================="

run_step "Workspace build" "pnpm -r build"
run_step "Workspace tests" "pnpm -r test"
run_step "Branding check" "pnpm check:branding"
run_step "Secrets check" "pnpm check:secrets"
run_step "Licenses check" "pnpm check:licenses"
run_step "Bundle smoke" "pnpm smoke:bundle"
run_step "V1 scope guard" "bash scripts/verify-v1-scope.sh"
run_step "Public readiness guard" "bash scripts/verify-public-readiness.sh"
run_step "Document consistency guard" "pnpm verify:docs"
run_step "Package DMG" "pnpm package:dmg"
run_step "Release artifacts verification" "bash scripts/verify-release-artifacts.sh"
run_live_smoke

finalize_and_exit 0

echo
echo "========================================="
echo "LemonWoo RC check completed"
echo "Results file: ${RESULTS_PATH}"
echo "========================================="
