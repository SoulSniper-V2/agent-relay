#!/bin/bash
set -euo pipefail
sudo mkdir -p /opt/agent-relay /var/lib/agent-relay /var/backups /etc/caddy
if [ -d /opt/agent-relay/src ] && [ ! -f /var/backups/agent-relay-0.1.0.tgz ]; then
  sudo tar -czf /var/backups/agent-relay-0.1.0.tgz -C /opt agent-relay || true
fi
if [ -f /var/lib/agent-relay/hub.db ] && [ ! -f /var/lib/agent-relay/hub.db.0.1.0.bak ]; then
  sudo cp -a /var/lib/agent-relay/hub.db /var/lib/agent-relay/hub.db.0.1.0.bak
fi
sudo systemctl stop agent-relay.service || true
sudo rm -rf /opt/agent-relay
sudo mkdir -p /opt/agent-relay
sudo tar -xzf /tmp/agent-relay-new.tgz -C /opt/agent-relay
sudo rm -f /tmp/agent-relay-new.tgz /opt/agent-relay/src/dashboard.ts
id agent-relay >/dev/null
sudo chown -R agent-relay:agent-relay /opt/agent-relay /var/lib/agent-relay
sudo -u agent-relay rm -f /var/lib/agent-relay/hub.db /var/lib/agent-relay/hub.db-wal /var/lib/agent-relay/hub.db-shm
cd /opt/agent-relay
sudo -u agent-relay npm ci --omit=dev
sudo cp /opt/agent-relay/deploy/agent-relay.service /etc/systemd/system/agent-relay.service
sudo chmod 644 /etc/systemd/system/agent-relay.service
if ! command -v caddy >/dev/null; then
  sudo apt-get update -qq
  if ! sudo apt-get install -y -qq caddy; then
    sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq caddy
  fi
fi
sudo cp /opt/agent-relay/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl daemon-reload
sudo systemctl enable agent-relay.service caddy
sudo systemctl restart agent-relay.service
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sS --max-time 2 http://127.0.0.1:8787/health >/tmp/relay-health.json 2>/dev/null; then
    cat /tmp/relay-health.json
    echo
    break
  fi
  sleep 1
done
if [ ! -s /tmp/relay-health.json ]; then
  echo "hub did not listen on 127.0.0.1:8787"
  journalctl -u agent-relay.service -n 30 --no-pager
  exit 1
fi
echo
sudo systemctl reload caddy || sudo systemctl restart caddy
systemctl is-active agent-relay.service
systemctl is-active caddy
