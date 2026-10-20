#!/usr/bin/env bash
# Keeps the MailConnect Node process running. Invoked every minute by cron.
# Lives next to .env in the installation directory; secrets stay in .env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$ROOT/app"
PIDFILE="$ROOT/var/mailconnect.pid"
LOG="$ROOT/var/mailconnect.log"

if [[ ! -f "$ROOT/.env" ]]; then
  exit 0
fi
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
NODE="${NODE_BIN:+$NODE_BIN/}node"
if ! command -v "$NODE" >/dev/null 2>&1; then
  NODE="$(command -v node)"
fi

mkdir -p "$ROOT/var"
if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  exit 0
fi
if curl -fsS --max-time 2 "http://127.0.0.1:${PORT:-3911}${APP_BASE_PATH:-}/api/health" >/dev/null 2>&1; then
  exit 0
fi

cd "$APP"
nohup "$NODE" server.cjs >>"$LOG" 2>&1 &
echo $! >"$PIDFILE"
