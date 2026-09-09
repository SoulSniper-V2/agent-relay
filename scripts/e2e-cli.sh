#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$(mktemp -d)"
PORT="${PORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')}"
export RELAY_DEV_OTP=1
export RELAY_MAILBOX_DIR="$DIR/mail"
export RELAY_DB="$DIR/hub.db"
export RELAY_PORT="$PORT"
export RELAY_URL="http://127.0.0.1:$PORT"
CLI=(node --experimental-sqlite --import tsx "$ROOT/src/cli.ts")

node --experimental-sqlite --import tsx "$ROOT/src/serve.ts" >"$DIR/hub.log" 2>&1 &
HUB=$!
cleanup() { kill "$HUB" 2>/dev/null || true; rm -rf "$DIR"; }
trap cleanup EXIT
for i in $(seq 1 50); do
  curl -sf "$RELAY_URL/health" >/dev/null && break
  sleep 0.1
done
curl -sf "$RELAY_URL/health" >/dev/null
code=$(curl -s -o /tmp/relay-mcp-code -w "%{http_code}" "$RELAY_URL/mcp")
test "$code" = "405"

alice() { RELAY_CONFIG="$DIR/alice.json" "${CLI[@]}" "$@"; }
bob() { RELAY_CONFIG="$DIR/bob.json" "${CLI[@]}" "$@"; }
jget() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

alice login alice@test.dev >"$DIR/a-login.json"
CODE=$(jget "d['dev_code']" <"$DIR/a-login.json")
alice verify alice@test.dev "$CODE" >/dev/null
bob login bob@test.dev >"$DIR/b-login.json"
CODE=$(jget "d['dev_code']" <"$DIR/b-login.json")
bob verify bob@test.dev "$CODE" >/dev/null

alice invite >"$DIR/inv.json"
INV=$(jget "d['code']" <"$DIR/inv.json")
AH=$(jget "d['handle']" <"$DIR/alice.json")
BH=$(jget "d['handle']" <"$DIR/bob.json")
bob accept "$INV" >/dev/null

alice send "$BH" "hello from alice cli" >/dev/null
bob sync | python3 -c "import json,sys; d=json.load(sys.stdin); assert any('hello from alice' in m['body'] for m in d['pending']), d"
bob human-inbox | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['items']==[] or len(d['items'])==0, d"

MID=$(bob inbox | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['messages'][-1]['id'])")
bob decide "$MID" escalate --reason "needs a human" >/dev/null
bob human-inbox | python3 -c "import json,sys; d=json.load(sys.stdin); assert len(d['items'])==1, d"

alice ping "$BH" "please sync" >/dev/null
alice whoami | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['me']['handle']=='$AH'"

echo "CLI two-agent smoke OK ($AH <-> $BH)"
