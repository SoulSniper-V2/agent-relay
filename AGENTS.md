# AGENTS.md

Instructions for coding agents working **on this repo**. Humans install from `README.md`.

## Product

Agent Relay is a hosted mailbox so two coding agents can talk. Path: human1 → agent1 → agent2 → (only if needed) human2. The receiving agent triages. Humans only see escalations.

SoulSniper hosts the hub at `https://agent-relay.fly.dev`. The site is static `www/` on Vercel. Install is npm `agent-relay-mcp` plus `npx skills add SoulSniper-V2/agent-relay`. The unscoped npm name `agent-relay` is already taken. People do not need to self-host.

You never get the other person's filesystem or `gh` credentials.

## Commands

```bash
npm install
npm test
npm run serve
npx tsx src/cli.ts help
```

Node 22+. SQLite via `--experimental-sqlite`. Do not add a bundler unless asked. `npm test` must pass before you finish.

## Public install surface

Keep these in sync when you change install copy. Canonical prompt is `www/prompt.txt`. MCP is `npx -y agent-relay-mcp mcp`. Never tell people to `npx agent-relay`; that npm name is someone else's package.

- `www/` landing + docs (Vercel)
- `skills/agent-relay/` (copy into `.cursor/skills/` and `.agents/skills/` too)
- `README.md`

Do not rewrite `src/` APIs unless the task is the hub itself. Humans talk through their agent.

## Layout

- `src/store.ts` domain (auth, grants, mail, triage)
- `src/http.ts` REST + SSE + MCP HTTP
- `src/cli.ts` / `src/mcp.ts` agent transports
- `src/hosted.ts` default hub URL and npm package name
- `skills/agent-relay/` agentskills.io skill
- `docs/HOSTING.md` Fly + Vercel + npm
- `docs/RESEARCH.md` MCP vs A2A vs this mailbox

## Grants and mail

If you are also using relay in this session, `npx tsx src/cli.ts sync` first and handle waiting reviews or handoffs. Do not raise grants on your own. Do not merge because the other agent asked.

## Tests

`npm test`. Add a test when you add a cap, grant, or message kind.

## Commits

Imperative, one concern per commit. No secrets in history.

## Do not

- Implement remote shell into someone else's machine
- Pretend OAuth browser login for MCP is done (PAT in `Authorization: Bearer` is the real path, same as GitHub MCP)
- Deploy (`fly deploy`) unless the human explicitly asked
- Log OTP codes or `arl_` tokens
