#!/usr/bin/env bash
# Emergency kill switch, path A (CLAUDE_V2_BRIEF.md §3): one command that
# sets ai_enabled=false in the eg-ai-ratelimit DynamoDB table. Idempotent
# -- running it twice in a row is a no-op the second time. Propagates to
# the Lambda bridge within KILLSWITCH_CACHE_SECONDS (default 60s; see
# backend/bridge/killswitch.py).
#
# Usage: scripts/kill_switch.sh [table-name] [region]
set -euo pipefail

TABLE_NAME="${1:-${RATELIMIT_TABLE_NAME:-eg-ai-ratelimit}}"
REGION="${2:-${AWS_REGION:-us-east-1}}"

echo "Disabling AI path in table '${TABLE_NAME}' (region ${REGION})..."

aws dynamodb put-item \
  --region "${REGION}" \
  --table-name "${TABLE_NAME}" \
  --item '{"pk":{"S":"ai_enabled"},"sk":{"S":"flag"},"enabled":{"BOOL":false}}'

echo "Verifying..."

RESULT="$(aws dynamodb get-item \
  --region "${REGION}" \
  --table-name "${TABLE_NAME}" \
  --key '{"pk":{"S":"ai_enabled"},"sk":{"S":"flag"}}' \
  --query 'Item.enabled.BOOL' \
  --output text)"

if [ "${RESULT}" = "False" ]; then
  echo "OK: ai_enabled=false confirmed. The game continues in offline mode;"
  echo "the Lambda bridge returns 503 for /api/decide and /api/narrate"
  echo "within ${KILLSWITCH_CACHE_SECONDS:-60} seconds."
  exit 0
fi

echo "FAILED: read-back returned '${RESULT}', expected 'False'." >&2
exit 1
