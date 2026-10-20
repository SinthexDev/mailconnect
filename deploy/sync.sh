#!/usr/bin/env bash
# Asks the running MailConnect process to check mailboxes. Cron runs this
# every minute. A caught-up mailbox only looks for new message numbers.
# Lives next to .env in the installation directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -f "$ROOT/.env" ]]; then
  exit 0
fi
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
if [[ -z "${CRON_SECRET:-}" ]]; then
  exit 0
fi
base="${APP_BASE_PATH:-}"
curl -fsS --max-time 5 -X POST \
  -H "X-Cron-Secret: ${CRON_SECRET}" \
  "http://127.0.0.1:${PORT:-3911}${base}/api/cron/sync" \
  >/dev/null || true
