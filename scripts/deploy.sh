#!/usr/bin/env bash
# Builds the release and installs it on your server over SSH.
# Server details come from deploy/deploy.env (see deploy/deploy.env.example).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONFIG="$ROOT/deploy/deploy.env"
if [[ ! -f "$CONFIG" ]]; then
  echo "deploy/deploy.env fehlt. Kopiere deploy/deploy.env.example und trage deinen Server ein." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$CONFIG"
set +a

: "${DEPLOY_SSH_HOST:?DEPLOY_SSH_HOST fehlt in deploy/deploy.env}"
: "${DEPLOY_REMOTE_ROOT:?DEPLOY_REMOTE_ROOT fehlt in deploy/deploy.env}"
: "${DEPLOY_APP_BASE_URL:?DEPLOY_APP_BASE_URL fehlt in deploy/deploy.env}"
: "${DEPLOY_ADMIN_EMAIL:?DEPLOY_ADMIN_EMAIL fehlt in deploy/deploy.env}"
DEPLOY_NODE_BIN="${DEPLOY_NODE_BIN:-/usr/bin}"
DEPLOY_APP_BASE_PATH="${DEPLOY_APP_BASE_PATH:-/mailconnect}"
DEPLOY_PORT="${DEPLOY_PORT:-3911}"
DEPLOY_PUBLIC_ROOT="${DEPLOY_PUBLIC_ROOT:-}"

npx tsc -p tsconfig.json --noEmit
npm test
npm run build

ssh "$DEPLOY_SSH_HOST" "mkdir -p $(printf %q "$DEPLOY_REMOTE_ROOT/app") $(printf %q "$DEPLOY_REMOTE_ROOT/var")"

rsync -a --delete \
  --exclude '.env' \
  --exclude 'node_modules' \
  -e ssh \
  "$ROOT/release/" "$DEPLOY_SSH_HOST:$DEPLOY_REMOTE_ROOT/app/"

if [[ -n "$DEPLOY_PUBLIC_ROOT" ]]; then
  ssh "$DEPLOY_SSH_HOST" "mkdir -p $(printf %q "$DEPLOY_PUBLIC_ROOT")"
  rsync -a -e ssh \
    "$ROOT/deploy/public/" "$DEPLOY_SSH_HOST:$DEPLOY_PUBLIC_ROOT/"
fi

rsync -a -e ssh \
  "$ROOT/deploy/ensure.sh" "$DEPLOY_SSH_HOST:$DEPLOY_REMOTE_ROOT/ensure.sh"
rsync -a -e ssh \
  "$ROOT/deploy/sync.sh" "$DEPLOY_SSH_HOST:$DEPLOY_REMOTE_ROOT/sync.sh"

REMOTE_ENV="ROOT=$(printf %q "$DEPLOY_REMOTE_ROOT") NODE_BIN=$(printf %q "$DEPLOY_NODE_BIN") APP_BASE_PATH=$(printf %q "$DEPLOY_APP_BASE_PATH") APP_BASE_URL=$(printf %q "$DEPLOY_APP_BASE_URL") PORT=$(printf %q "$DEPLOY_PORT") ADMIN_EMAIL=$(printf %q "$DEPLOY_ADMIN_EMAIL")"

ssh "$DEPLOY_SSH_HOST" "$REMOTE_ENV bash -s" <<'EOF'
set -euo pipefail
NODE="$NODE_BIN/node"
mkdir -p "$ROOT/app" "$ROOT/var"
chmod 700 "$ROOT" "$ROOT/var"
chmod 755 "$ROOT/ensure.sh" "$ROOT/sync.sh"
if [[ ! -f "$ROOT/.env" ]]; then
  umask 077
  MASTER="$("$NODE" -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  SECRET="$("$NODE" -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  ADMIN_PW="$("$NODE" -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
  cat > "$ROOT/.env" <<ENV
MAILCONNECT_MASTER_KEY='${MASTER}'
SESSION_SECRET='${SECRET}'
HOST=127.0.0.1
PORT=${PORT}
NODE_ENV=production
APP_BASE_PATH=${APP_BASE_PATH}
APP_BASE_URL=${APP_BASE_URL}
DATABASE_PATH=${ROOT}/var/mailconnect.sqlite
WEB_DIST=${ROOT}/app/public
INDEX_POLL_MS=300000
INDEX_BATCH=80
NODE_BIN=${NODE_BIN}
MAILCONNECT_ADMIN_EMAIL=${ADMIN_EMAIL}
MAILCONNECT_ADMIN_PASSWORD='${ADMIN_PW}'
ENV
  chmod 600 "$ROOT/.env"
  printf '%s\n' "$ADMIN_PW" > "$ROOT/var/initial-admin.txt"
  chmod 600 "$ROOT/var/initial-admin.txt"
fi
if ! grep -q '^CRON_SECRET=' "$ROOT/.env"; then
  umask 077
  CRON="$("$NODE" -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  printf '\nCRON_SECRET=%s\n' "$CRON" >> "$ROOT/.env"
  chmod 600 "$ROOT/.env"
fi
if ! grep -q '^NODE_BIN=' "$ROOT/.env"; then
  printf '\nNODE_BIN=%s\n' "$NODE_BIN" >> "$ROOT/.env"
fi
if grep -q '^INDEX_POLL_MS=' "$ROOT/.env"; then
  sed -i 's/^INDEX_POLL_MS=.*/INDEX_POLL_MS=300000/' "$ROOT/.env"
else
  printf '\nINDEX_POLL_MS=300000\n' >> "$ROOT/.env"
fi
export PATH="$NODE_BIN:$PATH"
cd "$ROOT/app"
npm install --omit=dev
set -a
source "$ROOT/.env"
set +a
if grep -q '^MAILCONNECT_ADMIN_EMAIL=' "$ROOT/.env"; then
  "$NODE" server.cjs bootstrap-admin
  grep -v '^MAILCONNECT_ADMIN_' "$ROOT/.env" > "$ROOT/.env.tmp"
  mv "$ROOT/.env.tmp" "$ROOT/.env"
  chmod 600 "$ROOT/.env"
fi
if ! crontab -l 2>/dev/null | grep -qF "$ROOT/ensure.sh"; then
  (crontab -l 2>/dev/null; echo "* * * * * $ROOT/ensure.sh") | crontab -
fi
if ! crontab -l 2>/dev/null | grep -qF "$ROOT/sync.sh"; then
  (crontab -l 2>/dev/null; echo "* * * * * $ROOT/sync.sh") | crontab -
fi
HEALTH="http://127.0.0.1:${PORT}${APP_BASE_PATH}/api/health"
# Restart so a new server.cjs is picked up.
if [[ -f "$ROOT/var/mailconnect.pid" ]]; then
  old="$(cat "$ROOT/var/mailconnect.pid")"
  kill "$old" 2>/dev/null || true
  rm -f "$ROOT/var/mailconnect.pid"
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ! kill -0 "$old" 2>/dev/null; then
      break
    fi
    sleep 0.4
  done
  if kill -0 "$old" 2>/dev/null; then
    kill -9 "$old" 2>/dev/null || true
    sleep 0.2
  fi
fi
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! curl -fsS --max-time 1 "$HEALTH" >/dev/null; then
    break
  fi
  sleep 0.4
done
"$ROOT/ensure.sh"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 "$HEALTH" >/dev/null; then
    echo "local health ok"
    exit 0
  fi
  sleep 1
done
echo "MailConnect antwortet lokal nicht" >&2
tail -n 40 "$ROOT/var/mailconnect.log" >&2 || true
exit 1
EOF

curl -fsS --max-time 20 "$DEPLOY_APP_BASE_URL/api/health"
echo
echo "Deployed: $DEPLOY_APP_BASE_URL/"
