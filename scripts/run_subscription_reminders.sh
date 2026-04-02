#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://167-17-184-16.nip.io}"
CRON_TOKEN="${REMINDERS_CRON_TOKEN:-}"

if [[ -z "$CRON_TOKEN" ]]; then
  echo "REMINDERS_CRON_TOKEN is required"
  exit 1
fi

for type in d3 d1; do
  curl --fail --show-error --silent \
    -X POST "${API_BASE_URL}/api/jobs/subscription-reminders" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${CRON_TOKEN}" \
    -d "{\"type\":\"${type}\"}"
  echo
done
