#!/bin/sh
# Box side of Croon on Jinx: Postgres role and database, the env file, and the site block.
# The app itself runs under Coolify (deploy/compose.yaml, image from GHCR), so nothing is
# built or restarted here (FRC/DEPLOY.md). Re-runnable: existing secrets are never replaced.
set -eu
cd "$(dirname "$0")/.."
HOST=${HOST:-ssh.futile.studio}
NAME=croon

scp -q deploy/$NAME.caddy "$HOST":/tmp/
ssh "$HOST" "NAME=$NAME sh -s" <<'BOX'
set -eu
ENV=/etc/apps/$NAME.env
if ! sudo -n test -f "$ENV"; then
  # Secrets are generated here so they never touch the laptop or git.
  PW=$(openssl rand -hex 24)
  sudo -n -u postgres psql -v ON_ERROR_STOP=1 -q -c "create role $NAME login password '$PW'" 2>/dev/null \
    || sudo -n -u postgres psql -v ON_ERROR_STOP=1 -q -c "alter role $NAME password '$PW'"
  sudo -n -u postgres psql -q -tc "select 1 from pg_database where datname = '$NAME'" | grep -q 1 \
    || sudo -n -u postgres createdb -O "$NAME" "$NAME"
  printf 'DATABASE_URL=postgres://%s:%s@127.0.0.1:5432/%s\nCSRF_SECRET=%s\n# YOUTUBE_API_KEY=\n' "$NAME" "$PW" "$NAME" "$(openssl rand -hex 32)" \
    | sudo -n install -m 600 -o 1000 -g 1000 /dev/stdin "$ENV"
  echo "$NAME: database and $ENV created"
fi

LIVE=/etc/caddy/conf.d/$NAME.caddy
IN=/tmp/$NAME.caddy
if cmp -s "$IN" "$LIVE"; then
  rm -f "$IN"
else
  # Imported into the config serving every site: validate, and restore on failure.
  sudo -n cp "$LIVE" "$IN.prev" 2>/dev/null || true
  sudo -n install -m 644 "$IN" "$LIVE" && rm -f "$IN"
  if ! caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    if [ -f "$IN.prev" ]; then sudo -n mv "$IN.prev" "$LIVE"; else sudo -n rm -f "$LIVE"; fi
    echo "$NAME: site block rejected by caddy validate, config unchanged" >&2
    exit 1
  fi
  sudo -n rm -f "$IN.prev"
  sudo -n systemctl reload caddy
fi
BOX
echo "$NAME: box side in place; deploy it from Coolify"
