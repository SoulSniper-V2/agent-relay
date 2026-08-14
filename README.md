# Agent Relay

Let **your** coding agent talk to **another person's** agent — a friend, cofounder, or contractor. Not another subagent in the same chat. Two humans, two machines, one hub.

Agent-first: you say *invite Maya*, *log me in*, *tell her agent we own webhooks*. The skill plus CLI (or MCP) does it. There is a **small dashboard** at `/` only to mint extra tokens and glance at people — GitHub’s MCP uses the same PAT-on-a-website pattern.

Auth research (MCP spec, GitHub MCP, Agent Skills spec) is in [docs/RESEARCH.md](docs/RESEARCH.md). Short version: email OTP for the human, personal access tokens for agents, OAuth 2.1 later for hosted Streamable HTTP.

## MCP vs CLI vs Skill (what we chose)

| Piece | What it is | In this project |
|---|---|---|
| **Skill** (`SKILL.md`) | Playbook the agent loads on demand | [skills/agent-relay/SKILL.md](skills/agent-relay/SKILL.md) — when to invite, how to poll, never dump secrets |
| **CLI** (`relay`) | What the agent actually runs | Primary interface. Works in Cursor, Claude Code, Codex, cloud agents, cron |
| **MCP** | JSON-RPC tools the host can call | Optional: `relay mcp` / `src/mcp.ts` — same hub, same auth |
| **A2A** | Google/Linux Foundation protocol for agent-to-agent peers | **Not v1.** Cross-person identity and consent are the product; A2A can wrap this later |

Skills do not open a network socket. MCP does not teach judgment. A CLI without a skill gets ignored or used badly. **Skill + CLI is the portable pair.** MCP is for hosts that prefer tools over shell.

Both people must point at the **same hub URL**. One of you runs `relay serve` (laptop, Fly, a VPS). That is the mailbox. Agents are often offline, so this is async by default (`inbox --wait` when you really need to block).

## Install

```bash
cd agent-relay
npm install
```

Copy the skill into your agent (Cursor example):

```bash
mkdir -p .cursor/skills
cp -R skills/agent-relay .cursor/skills/
```

Claude Code: copy to `~/.claude/skills/agent-relay/`.

## Two-person loop

**You**

```bash
npm run serve
export RELAY_URL=http://127.0.0.1:8787
# tell your agent your email, or:
npx tsx src/cli.ts login you@example.com
npx tsx src/cli.ts verify you@example.com 123456
npx tsx src/cli.ts invite --email friend@example.com
```

Open `http://127.0.0.1:8787` to mint a token for MCP. Without `RELAY_RESEND_KEY`, codes land in `~/.agent-relay/mailbox/`.

**Friend** (same `RELAY_URL`, reachable from their machine)

```bash
npx tsx src/cli.ts login friend@example.com
npx tsx src/cli.ts verify friend@example.com <code>
npx tsx src/cli.ts accept <invite-code>
```

Then either agent:

```bash
npx tsx src/cli.ts send maya "Please own src/webhooks.ts; Stripe events live in memory key api.webhooks"
npx tsx src/cli.ts remember maya api.webhooks "POST /stripe/webhook"
npx tsx src/cli.ts plan create maya "Ship webhooks" --body "Sam: types. Maya: handler + tests."
npx tsx src/cli.ts inbox --unread
```

Tell your agent: *check relay inbox*, *offer Maya a review of src/auth.ts*, *grant Maya pair*, *point her at PR 14*. Skill: [skills/agent-relay/SKILL.md](skills/agent-relay/SKILL.md). Hosting (not deployed): [docs/HOSTING.md](docs/HOSTING.md).

## MCP (optional)

After `relay login` / `relay verify` (or a token from `/`), put `RELAY_TOKEN` in [examples/mcp.json](examples/mcp.json).

## What is in / not in

**In:** email OTP, dashboard PATs, grants (visitor/pair/cofounder), presence, live SSE, code-review packets, structured handoffs, GitHub PR pointing (git stays git), CLI, MCP, skill.

**Not in:** remote shell, merging for them, replacing GitHub, hosted OAuth MCP. See [docs/HOSTING.md](docs/HOSTING.md).

## Tests

```bash
npm test
```
