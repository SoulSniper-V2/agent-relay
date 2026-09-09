# Hosting

SoulSniper hosts the **hub** on a GCE VM. The **site** is static `www/` on Vercel (GitHub `main` auto-deploys). Users install the skill and MCP or CLI. They do not run a laptop server.

## What is running

| Piece | Where | Notes |
|---|---|---|
| Site | Vercel project `agent-relay`, `https://agent-relay-eight.vercel.app` | GitHub integration. Push `www/` or `vercel.json` to `main`. |
| Hub | GCE `instance-20250928-022120`, `us-east1-c`, e2-micro | Debian 12. Tag `agent-relay`. Also runs PiVPN — do not touch those ports. |
| Process | systemd `agent-relay.service`, Node on `127.0.0.1:8787` | `node --experimental-sqlite --import tsx src/serve.ts` |
| Edge | Caddy on :80/:443 | TLS for `35.211.23.64.sslip.io`. Proxies `/health` `/v1` `/mcp`. Other paths redirect to Vercel. |
| Disk | `/var/lib/agent-relay/hub.db` | SQLite. One instance. |
| Email | Resend or SMTP via `/etc/agent-relay.env` | `onboarding@resend.dev` cannot mail a second person |
| Install | npm `coding-agent-relay` | `npx -y coding-agent-relay mcp` or CLI. Skill: `npx skills add SoulSniper-V2/agent-relay` |

Public hub: `https://35.211.23.64.sslip.io` (`RELAY_PUBLIC_URL`). HTTP IP `http://35.211.23.64` is a fallback.

## Secrets (on the VM)

```bash
# /etc/agent-relay.env  (mode 600, owned by root)
RELAY_RESEND_KEY=re_…
RELAY_FROM_EMAIL='Agent Relay <relay@yourdomain>'
# or SMTP:
# RELAY_SMTP_URL=smtps://you%40gmail.com:app-password@smtp.gmail.com:465
```

Two people cannot log in until From is a verified domain or SMTP. `onboarding@resend.dev` only mails the Resend account owner.

Do not log OTP codes or `arl_` tokens.

## Deploy

Push to `main`:

- `www/` → Vercel (GitHub integration, no extra secret)
- `src/` / `deploy/` → GCE via `.github/workflows/deploy-hub.yml` (GCP Workload Identity)
- `package.json` version bump → npm via `.github/workflows/publish.yml` (`NPM_TOKEN` repo secret)

Manual hub sync from this repo:

```bash
bash deploy/sync-gce.sh
```

That packs the hub tree, `npm ci --omit=dev`, reloads Caddy, restarts systemd, and leaves PiVPN alone.

## Optional self-host

If you run your own hub: Node 22, `npm run serve`, SQLite path `RELAY_DB`, mail secrets. Point both people at that `RELAY_URL`. The GCE origin remains the default in CLI and MCP.
