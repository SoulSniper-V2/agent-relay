#!/usr/bin/env bash
# Replace the old hub on the GCE VM with this tree. Does not print secrets.
# The remote installer stages dependencies, checkpoints SQLite after stopping
# the writer, and rolls back the app tree if its strict health gate fails.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${GCE_PROJECT:-sacred-epigram-473220-s3}"
ZONE="${GCE_ZONE:-us-east1-c}"
INSTANCE="${GCE_INSTANCE:-instance-20250928-022120}"
export PATH="/opt/homebrew/bin:${PATH}"

echo "packing…"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
COPYFILE_DISABLE=1 tar -C "$ROOT" -czf "$tmp/relay.tgz" \
  --exclude node_modules \
  --exclude .git \
  src bin skills deploy package.json package-lock.json

if ! gcloud compute firewall-rules describe allow-http-https --project="$PROJECT" >/dev/null 2>&1; then
  echo "opening tcp:80,443…"
  gcloud compute firewall-rules create allow-http-https \
    --project="$PROJECT" \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:80,tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=agent-relay
fi

echo "uploading…"
gcloud compute scp --quiet --zone="$ZONE" --project="$PROJECT" \
  "$tmp/relay.tgz" "$ROOT/deploy/remote-install.sh" \
  "$INSTANCE:~/"

gcloud compute ssh "$INSTANCE" --zone="$ZONE" --project="$PROJECT" --quiet \
  --command='sudo mv -f ~/relay.tgz /tmp/agent-relay-new.tgz && sudo bash ~/remote-install.sh'
