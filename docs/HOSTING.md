# Hosting

SoulSniper hosts the hub. Users install the skill and MCP. They do not run a laptop server.

## What is running

| Piece | Where | Notes |
|---|---|---|
| Hub | Fly.io app `agent-relay`, region `iad` | One machine, `min_machines_running = 1`, `auto_stop_machines = "off"`, health `GET /health` |
| Process | `node --experimental-sqlite --import tsx src/serve.ts` | Same as `npm run serve` |
| Disk | Volume `relay_data` mounted at `/data`, DB `/data/hub.db` | SQLite. One instance. |
| Email | Resend | OTP login codes. `RELAY_REQUIRE_EMAIL=1` so the hub does not pretend file delivery works |
| Site | Vercel, output `www/` | Static landing + docs |
| Install | npm `coding-agent-relay` | `npx -y coding-agent-relay mcp` |

Public URL: `https://agent-relay.fly.dev` (`RELAY_PUBLIC_URL`).

## Secrets (Fly)

```bash
fly secrets set RELAY_RESEND_KEY=re_… RELAY_FROM_EMAIL=relay@yourdomain.com
```

`fly.toml` already sets `RELAY_PUBLIC_URL` and `RELAY_REQUIRE_EMAIL=1`. Until those two secrets exist, login returns 503 instead of writing a code file on the machine.

Open `/v1/register` is off. Login is email OTP only.

Do not log OTP codes or `arl_` tokens. HTTPS only.

## Site

Vercel root `vercel.json` publishes `www/` with no build. Rewrites `/docs` and `/prompt`.

## Install (npm)

The unscoped npm name `agent-relay` is already taken. Public install is `npx -y coding-agent-relay`. Skill install stays `npx skills add SoulSniper-V2/agent-relay`. The in-repo bin is `agent-relay` / `relay` / `coding-agent-relay`.

## Optional self-host

If you run your own hub: Node 22, `npm run serve`, SQLite path `RELAY_DB`, same three secrets. Point both people at that `RELAY_URL`. Hosted Fly remains the default in CLI and MCP.

Do not `fly deploy` unless the human explicitly asked.
