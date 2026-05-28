#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Running Public Release Readiness Verification ==="

FAILED=0

# 1. Verify existence of required repository files
FILES_TO_CHECK=(
  "README.md"
  "LICENSE"
  "NOTICE"
  "docs/BUILD-MAC.md"
  "docs/INSTALL-ES.md"
  "docs/PRIVACY.md"
  "docs/SECURITY.md"
  "docs/RELEASE-MAC.md"
  "docs/PUBLIC-RELEASE-CHECKLIST.md"
  "docs/QA-MANUAL-ES.md"
  "docs/TROUBLESHOOTING-ES.md"
  "scripts/check-secrets.sh"
  "scripts/check-branding.sh"
  "scripts/check-licenses.sh"
)

echo "Checking required files..."
for FILE in "${FILES_TO_CHECK[@]}"; do
  if [[ ! -f "$FILE" ]]; then
    echo "FAIL: Required file is missing: $FILE"
    FAILED=1
  else
    echo "  [OK] $FILE"
  fi
done

# 2. Run existing check scripts
echo "Running check-secrets.sh..."
if ! bash scripts/check-secrets.sh; then
  echo "FAIL: check-secrets.sh failed"
  FAILED=1
fi

echo "Running check-branding.sh..."
if ! bash scripts/check-branding.sh; then
  echo "FAIL: check-branding.sh failed (dist/LemonWoo.app may not be built yet)"
  FAILED=1
fi

echo "Running check-licenses.sh..."
if ! bash scripts/check-licenses.sh; then
  echo "FAIL: check-licenses.sh failed"
  FAILED=1
fi

# 3. Double-check for sk- and ghp_ keys in git-tracked files
echo "Checking git-tracked files for potential secrets..."
SECRET_PATTERN='(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})'
SECRET_MATCHES=$(git grep -EI "$SECRET_PATTERN" 2>/dev/null || true)
if [[ -n "$SECRET_MATCHES" ]]; then
  # Exclude matches in test files, verification scripts, or allowed documentation files.
  FILTERED_MATCHES=$(echo "$SECRET_MATCHES" | grep -vE "(test/|/test|\.test\.|V1-SCOPE-GUARDS.md|verify-v1-scope.sh|verify-public-readiness.sh|check-secrets.sh|PUBLIC-RELEASE-CHECKLIST.md|TROUBLESHOOTING-ES.md)" || true)
  if [[ -n "$FILTERED_MATCHES" ]]; then
    echo "FAIL: Found potential secrets in git-tracked files:"
    echo "$FILTERED_MATCHES"
    FAILED=1
  else
    echo "  [OK] No secrets found in tracked code files (pattern matches in verification/documentation files were ignored)"
  fi
else
  echo "  [OK] No secrets found in tracked files"
fi

# 4. Check for tracked files > 25MB
echo "Checking for tracked files exceeding 25MB..."
LARGE_FILES_COUNT=0
# 25MB = 26214400 bytes
while read -r file; do
  if [[ -f "$file" ]]; then
    size=$(wc -c < "$file")
    if [[ $size -gt 26214400 ]]; then
      echo "FAIL: Tracked file exceeds 25MB limit: $file ($((size/1024/1024)) MB)"
      FAILED=1
      LARGE_FILES_COUNT=$((LARGE_FILES_COUNT+1))
    fi
  fi
done < <(git ls-files)

if [[ $LARGE_FILES_COUNT -eq 0 ]]; then
  echo "  [OK] No tracked files exceed 25MB"
fi

# 5. Final report
if [[ $FAILED -eq 0 ]]; then
  echo "PASS: Public release readiness verification completed successfully."
  exit 0
else
  echo "FAIL: Public release readiness verification failed. Please correct the issues listed above."
  exit 1
fi
