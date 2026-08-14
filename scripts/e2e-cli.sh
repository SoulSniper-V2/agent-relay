#!/usr/bin/env bash
# Two-agent CLI smoke test against a real hub process.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$(mktemp -d)"
# Bind 0 then read the port from health is hard; pick an unused high port.
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
test "$code" = "501"

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

# Default post-invite: message ok, review denied until grant
alice send "$BH" "hello from alice cli" >/dev/null
bob sync | python3 -c "import json,sys; d=json.load(sys.stdin); assert any('hello from alice' in m['body'] for m in d['unread']), d"

echo "fn demo() {}" >"$DIR/snippet.ts"
set +e
alice review offer "$BH" --file "$DIR/snippet.ts" --ask "look?" >"$DIR/rev-fail.json" 2>"$DIR/rev-fail.err"
REV_RC=$?
set -e
test "$REV_RC" -ne 0
grep -qi "grant\|not allowed\|forbidden\|review\|403" "$DIR/rev-fail.err" "$DIR/rev-fail.json" || {
  echo "expected review to be denied before grant" >&2
  cat "$DIR/rev-fail.err" "$DIR/rev-fail.json" >&2
  exit 1
}

alice grant "$BH" --level cofounder >/dev/null
bob grant "$AH" --level cofounder >/dev/null

alice review offer "$BH" --file "$DIR/snippet.ts" --path src/demo.ts --ask "look?" >"$DIR/rev.json"
RID=$(jget "d['id']" <"$DIR/rev.json")
bob review list | python3 -c "import json,sys; d=json.load(sys.stdin); assert any(r['id']=='$RID' for r in d['reviews']), d"
bob review verdict "$RID" lgtm --comment "ok" >/dev/null

alice handoff offer "$BH" "Ship the demo" --body "take snippet.ts" --branch cursor/demo >/dev/null
HID=$(bob handoff list | jget "d['handoffs'][0]['id']")
bob handoff take "$HID" >/dev/null
bob handoff done "$HID" --note "done" >/dev/null

alice ping "$BH" "please sync" >/dev/null
alice whoami | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['me']['handle']=='$AH'"

echo "CLI two-agent smoke OK ($AH <-> $BH)"
