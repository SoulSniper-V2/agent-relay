#!/usr/bin/env bash
# Probe public health configuration. Exit 0 when two-person email is eligible;
# successful delivery still needs a real login flow with both people.
# Resend onboarding@resend.dev is sandbox (account owner only) and must fail.
# Do not POST /v1/auth/request here — that would consume the per-email cooldown.
set -euo pipefail
HUB="${RELAY_URL:-https://35.211.23.64.sslip.io}"
HUB="${HUB%/}"
raw="$(curl -sfS --max-time 10 "$HUB/health")"
python3 -c '
import json, sys
hub, raw = sys.argv[1], sys.argv[2]
h = json.loads(raw)
email = h.get("email")
two = h.get("two_person")
sandbox = h.get("sandbox")
print(json.dumps({"hub": hub, "ok": h.get("ok"), "version": h.get("version"), "email": email, "two_person": two, "sandbox": sandbox}, indent=2))
if h.get("ok") is True and h.get("login_ok") is True and two is True and email in ("resend", "smtp") and sandbox is not True:
    print("Two-person email is configured. Actual delivery has not been verified by this health probe.")
    raise SystemExit(0)
sys.stderr.write(
    "Hosted two-person login email is not configured or health is unavailable.\n"
    "Need Resend with a verified domain (not onboarding@resend.dev) or SMTP.\n"
    "onboarding@resend.dev can only mail the Resend account owner.\n"
)
raise SystemExit(1)
' "$HUB" "$raw"
