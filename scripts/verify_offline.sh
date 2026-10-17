#!/usr/bin/env bash
# Runs every offline test suite in this repo and prints a pass/fail
# summary. No network calls, no AWS credentials required (moto mocks all
# AWS surfaces the bridge/watchdog tests touch). Exits non-zero if any
# suite fails.
#
# Usage: scripts/verify_offline.sh
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

declare -a NAMES=()
declare -a RESULTS=()

run_suite() {
  local name="$1"
  shift
  echo "=== ${name} ==="
  if "$@"; then
    NAMES+=("${name}")
    RESULTS+=("PASS")
  else
    NAMES+=("${name}")
    RESULTS+=("FAIL")
  fi
  echo
}

run_suite "tests/ (unittest)" python -m unittest discover -s tests -q
run_suite "backend/tests/ (unittest)" python -m unittest discover -s backend/tests -q
run_suite "backend/bridge/tests/ (pytest)" python -m pytest backend/bridge/tests -q
run_suite "backend/bridge/watchdog/tests/ (pytest)" python -m pytest backend/bridge/watchdog/tests -q
run_suite "tests/*.test.mjs (node --test)" node --test tests/*.test.mjs

echo "================ SUMMARY ================"
OVERALL=0
for i in "${!NAMES[@]}"; do
  printf '%-40s %s\n' "${NAMES[$i]}" "${RESULTS[$i]}"
  if [ "${RESULTS[$i]}" = "FAIL" ]; then
    OVERALL=1
  fi
done
echo "=========================================="

if [ "${OVERALL}" -eq 0 ]; then
  echo "ALL SUITES PASSED"
else
  echo "ONE OR MORE SUITES FAILED" >&2
fi

exit "${OVERALL}"
