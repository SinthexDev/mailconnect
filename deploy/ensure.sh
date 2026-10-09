#!/usr/bin/env bash
# Keeps the MailConnect Node process running. Invoked every minute by cron,
# same pattern as the other Sinthex apps. Secrets stay in ../.env.
set -euo pipefail

ROOT="/var/www/vhosts/sinthex.de/mailconnect"
APP="$ROOT/app"
NODE="/opt/plesk/node/24/bin/node"
PIDFILE="$ROOT/var/mailconnect.pid"
LOG="$ROOT/var/mailconnect.log"

mkdir -p "$ROOT/var"
if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  exit 0
fi
if curl -fsS --max-time 2 "http://127.0.0.1:3911/mailconnect/api/health" >/dev/null 2>&1; then
  exit 0
fi

cd "$APP"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
nohup "$NODE" server.cjs >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"
