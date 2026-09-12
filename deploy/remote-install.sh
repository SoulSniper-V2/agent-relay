#!/usr/bin/env bash
set -Eeuo pipefail

# This script runs as root on the hub VM. The database is durable state: never
# remove hub.db, hub.db-wal, or hub.db-shm during an application upgrade.
APP_ROOT=/opt/agent-relay
DATA_ROOT=/var/lib/agent-relay
BACKUP_ROOT=/var/backups/agent-relay
INCOMING=/tmp/agent-relay-new.tgz
SERVICE_FILE=/etc/systemd/system/agent-relay.service
CADDY_FILE=/etc/caddy/Caddyfile
HEALTH_URL=http://127.0.0.1:8787/health

STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
STAGE=""
PREVIOUS=""
APP_BACKUP=""
DB_BACKUP=""
SERVICE_BACKUP=""
CADDY_BACKUP=""
SERVICE_WAS_ACTIVE=0
PREVIOUS_MOVED=0
NEW_INSTALLED=0
CONFIG_SNAPSHOT_TAKEN=0
SERVICE_FILE_WAS_PRESENT=0
CADDY_FILE_WAS_PRESENT=0

rollback_on_failure() {
  local status=$?
  trap - EXIT

  if (( status != 0 )); then
    set +e
    echo "agent-relay deploy failed; attempting rollback" >&2

    # Stop the candidate before moving its tree out of the working directory.
    if (( NEW_INSTALLED )); then
      systemctl stop agent-relay.service >/dev/null 2>&1 || true
      local failed_tree="${APP_ROOT}.failed-${STAMP}"
      if [[ -e "$APP_ROOT" && ! -e "$failed_tree" ]]; then
        mv "$APP_ROOT" "$failed_tree" || true
      fi
    fi

    # A failed switch leaves the old tree at PREVIOUS. Restore it in place.
    if (( PREVIOUS_MOVED )) && [[ -n "$PREVIOUS" && -e "$PREVIOUS" && ! -e "$APP_ROOT" ]]; then
      mv "$PREVIOUS" "$APP_ROOT" || true
    fi

    if (( CONFIG_SNAPSHOT_TAKEN )); then
      if (( SERVICE_FILE_WAS_PRESENT )); then
        [[ -n "$SERVICE_BACKUP" && -e "$SERVICE_BACKUP" ]] && cp -a "$SERVICE_BACKUP" "$SERVICE_FILE" || true
      else
        rm -f "$SERVICE_FILE" || true
      fi
      if (( CADDY_FILE_WAS_PRESENT )); then
        [[ -n "$CADDY_BACKUP" && -e "$CADDY_BACKUP" ]] && cp -a "$CADDY_BACKUP" "$CADDY_FILE" || true
      else
        rm -f "$CADDY_FILE" || true
      fi
    fi

    systemctl daemon-reload >/dev/null 2>&1 || true
    if (( SERVICE_WAS_ACTIVE )); then
      systemctl start agent-relay.service >/dev/null 2>&1 || true
    fi
    caddy validate --config "$CADDY_FILE" --adapter caddyfile >/dev/null 2>&1 &&
      (systemctl reload caddy >/dev/null 2>&1 || systemctl restart caddy >/dev/null 2>&1) || true
  fi

  if [[ -n "$STAGE" && -e "$STAGE" ]]; then
    rm -rf -- "$STAGE" || true
  fi
  if (( status == 0 )); then
    rm -f -- "$INCOMING" || true
  fi
  exit "$status"
}
trap rollback_on_failure EXIT

if [[ ! -r "$INCOMING" ]]; then
  echo "missing incoming archive: $INCOMING" >&2
  exit 1
fi
id agent-relay >/dev/null
command -v /usr/bin/node >/dev/null
command -v npm >/dev/null

mkdir -p "$(dirname "$APP_ROOT")" "$DATA_ROOT" "$BACKUP_ROOT" /etc/caddy
chmod 755 "$APP_ROOT" "$DATA_ROOT"
chmod 700 "$BACKUP_ROOT"
chown -R agent-relay:agent-relay "$DATA_ROOT"

# Stage and install dependencies while the current service is still serving.
STAGE="$(mktemp -d /opt/agent-relay.stage.XXXXXX)"
tar --extract --gzip --file "$INCOMING" --directory "$STAGE" --no-same-owner
test -f "$STAGE/package.json"
test -f "$STAGE/package-lock.json"
test -f "$STAGE/src/serve.ts"
test -f "$STAGE/deploy/agent-relay.service"
test -f "$STAGE/deploy/Caddyfile"
chown -R agent-relay:agent-relay "$STAGE"
(cd "$STAGE" && sudo -u agent-relay npm ci --omit=dev)

EXPECTED_VERSION="$(sudo -u agent-relay /usr/bin/node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const pkg = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (!pkg.version) process.exit(1);
  process.stdout.write(String(pkg.version));
' "$STAGE/package.json")"
test -n "$EXPECTED_VERSION"

# Ensure a missing Caddy install or invalid candidate config fails before the
# service is stopped. Existing Caddy/PiVPN ports are left alone.
if ! command -v caddy >/dev/null; then
  apt-get update -qq
  if ! apt-get install -y -qq caddy; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
      gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
      tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -qq
    apt-get install -y -qq caddy
  fi
fi
caddy validate --config "$STAGE/deploy/Caddyfile" --adapter caddyfile

if systemctl is-active --quiet agent-relay.service; then
  SERVICE_WAS_ACTIVE=1
fi
systemctl stop agent-relay.service || true
if systemctl is-active --quiet agent-relay.service; then
  echo "agent-relay.service did not stop" >&2
  exit 1
fi

# Take a coherent SQLite snapshot only after the writer is stopped. WAL is
# checkpointed and truncated, then the main database is copied and opened
# again with integrity_check before the candidate is installed.
if [[ -e "$DATA_ROOT/hub.db-wal" || -e "$DATA_ROOT/hub.db-shm" ]]; then
  if [[ ! -f "$DATA_ROOT/hub.db" ]]; then
    echo "database sidecar exists without hub.db; refusing upgrade" >&2
    exit 1
  fi
fi
if [[ -f "$DATA_ROOT/hub.db" ]]; then
  DB_BACKUP="$BACKUP_ROOT/hub.db-${STAMP}"
  if [[ -e "$DB_BACKUP" ]]; then
    echo "refusing to overwrite existing database backup: $DB_BACKUP" >&2
    exit 1
  fi
  sudo -u agent-relay env RELAY_DB="$DATA_ROOT/hub.db" /usr/bin/node --experimental-sqlite --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync(process.env.RELAY_DB);
    db.exec("PRAGMA busy_timeout = 5000;");
    const result = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    const busy = Number(result?.busy);
    db.close();
    if (busy !== 0) process.exit(1);
  '
  cp -a "$DATA_ROOT/hub.db" "$DB_BACKUP"
  chmod 600 "$DB_BACKUP"
  env RELAY_DB="$DB_BACKUP" /usr/bin/node --experimental-sqlite --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync(process.env.RELAY_DB);
    const result = db.prepare("PRAGMA integrity_check").get();
    const value = result ? String(Object.values(result)[0] ?? "") : "";
    db.close();
    if (value !== "ok") process.exit(1);
  '
fi

# Keep a restorable application archive and the system configuration before
# replacing them. Backups are timestamped and never overwritten in place.
if [[ -e "$APP_ROOT" ]]; then
  APP_BACKUP="$BACKUP_ROOT/app-${STAMP}.tgz"
  if [[ -e "$APP_BACKUP" ]]; then
    echo "refusing to overwrite existing app backup: $APP_BACKUP" >&2
    exit 1
  fi
  tar --create --gzip --file "$APP_BACKUP" --directory "$(dirname "$APP_ROOT")" "$(basename "$APP_ROOT")"
  chmod 600 "$APP_BACKUP"
  tar --list --gzip --file "$APP_BACKUP" >/dev/null
fi
if [[ -e "$SERVICE_FILE" ]]; then
  SERVICE_FILE_WAS_PRESENT=1
  SERVICE_BACKUP="$BACKUP_ROOT/service-${STAMP}.unit"
  cp -a "$SERVICE_FILE" "$SERVICE_BACKUP"
  chmod 600 "$SERVICE_BACKUP"
fi
if [[ -e "$CADDY_FILE" ]]; then
  CADDY_FILE_WAS_PRESENT=1
  CADDY_BACKUP="$BACKUP_ROOT/Caddyfile-${STAMP}"
  cp -a "$CADDY_FILE" "$CADDY_BACKUP"
  chmod 600 "$CADDY_BACKUP"
fi
CONFIG_SNAPSHOT_TAKEN=1

# Rename the old tree and install the staged tree with same-filesystem moves.
# PREVIOUS_MOVED is set only after the old tree is safely out of the way so the
# EXIT trap can restore it if the second move or any later health check fails.
if [[ -e "$APP_ROOT" ]]; then
  PREVIOUS="$(mktemp -d /opt/agent-relay.previous.XXXXXX)"
  rmdir "$PREVIOUS"
  mv "$APP_ROOT" "$PREVIOUS"
  PREVIOUS_MOVED=1
fi
mv "$STAGE" "$APP_ROOT"
STAGE=""
NEW_INSTALLED=1
chown -R agent-relay:agent-relay "$APP_ROOT"

cp -a "$APP_ROOT/deploy/agent-relay.service" "$SERVICE_FILE"
chmod 644 "$SERVICE_FILE"
cp -a "$APP_ROOT/deploy/Caddyfile" "$CADDY_FILE"
chmod 644 "$CADDY_FILE"
systemctl daemon-reload
systemctl enable agent-relay.service caddy
systemctl restart agent-relay.service

health_body=""
health_ok=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if health_body="$(curl -fsS --max-time 2 "$HEALTH_URL")" &&
    EXPECTED_VERSION="$EXPECTED_VERSION" HEALTH_BODY="$health_body" /usr/bin/node --input-type=module -e '
      const body = JSON.parse(process.env.HEALTH_BODY ?? "");
      if (body.ok !== true || body.version !== process.env.EXPECTED_VERSION) process.exit(1);
    '; then
    health_ok=1
    break
  fi
  sleep 1
done
if (( ! health_ok )); then
  echo "hub failed strict health check (HTTP 2xx, ok=true, version=$EXPECTED_VERSION)" >&2
  journalctl -u agent-relay.service -n 30 --no-pager >&2 || true
  exit 1
fi
printf '%s\n' "$health_body"

caddy validate --config "$CADDY_FILE" --adapter caddyfile
systemctl reload caddy || systemctl restart caddy
systemctl is-active --quiet agent-relay.service
systemctl is-active --quiet caddy

# The previous tree is now covered by APP_BACKUP and the candidate has passed
# the local health gate. Remove only that old code directory; the database and
# all timestamped backups remain untouched.
if [[ -n "$PREVIOUS" && -e "$PREVIOUS" ]]; then
  rm -rf -- "$PREVIOUS" || echo "warning: could not remove old app tree $PREVIOUS" >&2
fi
echo "agent-relay deploy ok: version=$EXPECTED_VERSION backup_dir=$BACKUP_ROOT"
