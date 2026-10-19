#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
NODE_BIN="/opt/plesk/node/24/bin"
REMOTE_ROOT="sinthex:/var/www/vhosts/sinthex.de/mailconnect"
PUBLIC_REMOTE="sinthex:/var/www/vhosts/sinthex.de/hosting/sinthex.de/mailconnect"

npx tsc -p tsconfig.json --noEmit
npm test
npm run build

ssh sinthex 'mkdir -p /var/www/vhosts/sinthex.de/mailconnect/app /var/www/vhosts/sinthex.de/mailconnect/var /var/www/vhosts/sinthex.de/hosting/sinthex.de/mailconnect'

rsync -a --delete \
  --exclude '.env' \
  --exclude 'node_modules' \
  -e ssh \
  "$ROOT/release/" "$REMOTE_ROOT/app/"

rsync -a -e ssh \
  "$ROOT/deploy/public/" "$PUBLIC_REMOTE/"

rsync -a -e ssh \
  "$ROOT/deploy/ensure.sh" "$REMOTE_ROOT/ensure.sh"
rsync -a -e ssh \
  "$ROOT/deploy/sync.sh" "$REMOTE_ROOT/sync.sh"

ssh sinthex "bash -s" <<'EOF'
set -euo pipefail
ROOT="/var/www/vhosts/sinthex.de/mailconnect"
NODE="/opt/plesk/node/24/bin"
mkdir -p "$ROOT/app" "$ROOT/var"
chmod 700 "$ROOT" "$ROOT/var"
chmod 755 "$ROOT/ensure.sh" "$ROOT/sync.sh"
if [[ ! -f "$ROOT/.env" ]]; then
  umask 077
  MASTER="$(/opt/plesk/node/24/bin/node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  SECRET="$(/opt/plesk/node/24/bin/node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  ADMIN_PW="$(/opt/plesk/node/24/bin/node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
  cat > "$ROOT/.env" <<ENV
MAILCONNECT_MASTER_KEY='${MASTER}'
SESSION_SECRET='${SECRET}'
HOST=127.0.0.1
PORT=3911
NODE_ENV=production
APP_BASE_PATH=/mailconnect
APP_BASE_URL=https://sinthex.de/mailconnect
DATABASE_PATH=${ROOT}/var/mailconnect.sqlite
WEB_DIST=${ROOT}/app/public
INDEX_POLL_MS=300000
INDEX_BATCH=80
MAILCONNECT_ADMIN_EMAIL=hi@sinthex.de
MAILCONNECT_ADMIN_PASSWORD='${ADMIN_PW}'
ENV
  chmod 600 "$ROOT/.env"
  printf '%s\n' "$ADMIN_PW" > "$ROOT/var/initial-admin.txt"
  chmod 600 "$ROOT/var/initial-admin.txt"
fi
if ! grep -q '^CRON_SECRET=' "$ROOT/.env"; then
  umask 077
  CRON="$(/opt/plesk/node/24/bin/node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  printf '\nCRON_SECRET=%s\n' "$CRON" >> "$ROOT/.env"
  chmod 600 "$ROOT/.env"
fi
if grep -q '^INDEX_POLL_MS=' "$ROOT/.env"; then
  sed -i 's/^INDEX_POLL_MS=.*/INDEX_POLL_MS=300000/' "$ROOT/.env"
else
  printf '\nINDEX_POLL_MS=300000\n' >> "$ROOT/.env"
fi
export PATH="$NODE:$PATH"
cd "$ROOT/app"
npm install --omit=dev
set -a
source "$ROOT/.env"
set +a
if grep -q '^MAILCONNECT_ADMIN_EMAIL=' "$ROOT/.env"; then
  "$NODE/node" server.cjs bootstrap-admin
  grep -v '^MAILCONNECT_ADMIN_' "$ROOT/.env" > "$ROOT/.env.tmp"
  mv "$ROOT/.env.tmp" "$ROOT/.env"
  chmod 600 "$ROOT/.env"
fi
if ! crontab -l 2>/dev/null | grep -q '/mailconnect/ensure.sh'; then
  (crontab -l 2>/dev/null; echo '* * * * * /var/www/vhosts/sinthex.de/mailconnect/ensure.sh') | crontab -
fi
if ! crontab -l 2>/dev/null | grep -q '/mailconnect/sync.sh'; then
  (crontab -l 2>/dev/null; echo '* * * * * /var/www/vhosts/sinthex.de/mailconnect/sync.sh') | crontab -
fi
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
  if ! curl -fsS --max-time 1 "http://127.0.0.1:3911/mailconnect/api/health" >/dev/null; then
    break
  fi
  sleep 0.4
done
"$ROOT/ensure.sh"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 "http://127.0.0.1:3911/mailconnect/api/health" >/dev/null; then
    echo "local health ok"
    exit 0
  fi
  sleep 1
done
echo "MailConnect antwortet lokal nicht" >&2
tail -n 40 "$ROOT/var/mailconnect.log" >&2 || true
exit 1
EOF

curl -fsS --max-time 20 "https://sinthex.de/mailconnect/api/health"
echo
echo "Deployed: https://sinthex.de/mailconnect/"
