#!/usr/bin/env bash
# Probe the public hub. Exit 0 only when OTP email is live (health.email=resend).
# Do not POST /v1/auth/request here — that would consume the per-email cooldown.
set -euo pipefail
HUB="${RELAY_URL:-https://agent-relay.fly.dev}"
HUB="${HUB%/}"
raw="$(curl -sfS "$HUB/health")"
python3 -c '
import json, sys
hub, raw = sys.argv[1], sys.argv[2]
h = json.loads(raw)
email = h.get("email")
print(json.dumps({"hub": hub, "ok": h.get("ok"), "version": h.get("version"), "email": email}, indent=2))
if email == "resend":
    raise SystemExit(0)
sys.stderr.write(
    "Hosted login email is not live. Set Fly secrets RELAY_RESEND_KEY and RELAY_FROM_EMAIL.\n"
    "Until a domain is verified, From can be Agent Relay <onboarding@resend.dev>.\n"
)
raise SystemExit(1)
' "$HUB" "$raw"
