#!/usr/bin/env bash
# Inverse of scripts/kill_switch.sh: sets ai_enabled=true, with a confirm
# prompt since re-enabling the AI path is the higher-consequence direction
# (CLAUDE_V2_BRIEF.md §3 path A). Pass -y/--yes to skip the prompt for
# non-interactive use (e.g. a deploy pipeline).
#
# Usage: scripts/kill_switch_restore.sh [-y|--yes] [table-name] [region]
set -euo pipefail

SKIP_CONFIRM=false
ARGS=()
for arg in "$@"; do
  case "${arg}" in
    -y|--yes)
      SKIP_CONFIRM=true
      ;;
    *)
      ARGS+=("${arg}")
      ;;
  esac
done

TABLE_NAME="${ARGS[0]:-${RATELIMIT_TABLE_NAME:-eg-ai-ratelimit}}"
REGION="${ARGS[1]:-${AWS_REGION:-us-east-1}}"

if [ "${SKIP_CONFIRM}" != "true" ]; then
  read -r -p "Re-enable the AI path in table '${TABLE_NAME}' (region ${REGION})? [y/N] " CONFIRM
  case "${CONFIRM}" in
    y|Y|yes|YES) ;;
    *)
      echo "Aborted; ai_enabled left unchanged."
      exit 1
      ;;
  esac
fi

echo "Re-enabling AI path in table '${TABLE_NAME}' (region ${REGION})..."

aws dynamodb put-item \
  --region "${REGION}" \
  --table-name "${TABLE_NAME}" \
  --item '{"pk":{"S":"ai_enabled"},"sk":{"S":"flag"},"enabled":{"BOOL":true}}'

echo "Verifying..."

RESULT="$(aws dynamodb get-item \
  --region "${REGION}" \
  --table-name "${TABLE_NAME}" \
  --key '{"pk":{"S":"ai_enabled"},"sk":{"S":"flag"}}' \
  --query 'Item.enabled.BOOL' \
  --output text)"

if [ "${RESULT}" = "True" ]; then
  echo "OK: ai_enabled=true confirmed."
  exit 0
fi

echo "FAILED: read-back returned '${RESULT}', expected 'True'." >&2
exit 1
