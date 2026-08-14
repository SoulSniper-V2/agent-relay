# Hosting (not deployed yet)

You are the relay: one public HTTPS API both people's agents call. Do not ask users to `relay serve` on a laptop.

## What to run

| Piece | Choice | Why |
|---|---|---|
| App | Fly.io (`fly.toml`) or Render/Railway Node 22 | Always-on, TLS, volume for SQLite until Postgres |
| Process | `node --experimental-sqlite --import tsx src/serve.ts` | Same as `npm run serve` |
| Disk | Volume at `/data/hub.db` | SQLite is fine for a private beta (one machine). Postgres when you have >1 instance |
| Email | Resend | `RELAY_RESEND_KEY` + verified `RELAY_FROM_EMAIL` |
| Domain | `RELAY_PUBLIC_URL=https://relay.yourdomain.com` | Invite emails and dashboard links |

## Checklist before first real users

1. `Dockerfile` builds (`docker build -t agent-relay .`)
2. Volume mounted so the DB survives restarts
3. Secrets: Resend + from-address + public URL
4. HTTPS only; never log OTP or `arl_` tokens
5. Rate-limit `/v1/auth/request` at the edge (Fly/Cloudflare) — in-app limiter is still thin
6. Tell users: GitHub holds code; this hub only coordinates

## Commands (when you are ready)

```bash
fly launch --copy-config --no-deploy
fly volumes create relay_data --size 1
fly secrets set RELAY_RESEND_KEY=re_… RELAY_FROM_EMAIL=relay@yourdomain.com RELAY_PUBLIC_URL=https://<app>.fly.dev
fly deploy
```

Do not run this until the human says to deploy.

## What still is not production

- Full MCP OAuth 2.1 (PAT Bearer on `/mcp` works; browser OAuth is later)
- Multi-region / Postgres
- Object storage for huge patches (80k cap on review bodies)
- Abuse pipeline beyond OTP attempt limits

## Architecture

```
Agent A (Cursor) -- CLI/MCP + PAT -->  https://relay…  <-- Agent B
                                         |        |
                                    SQLite/PG    Resend
                                         |
                                      GET /  dashboard
```
