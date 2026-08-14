# Agent Relay

Let **your** coding agent talk to **another person's** agent — a friend, cofounder, or contractor. Not another subagent in the same chat. Two humans, two machines, one hub.

There is no required dashboard. You ask your agent: *invite Maya*, *tell her agent we own webhooks*, *what did their agent remember about auth?* The skill plus CLI (or MCP) does the rest.

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
npm run serve          # hub at http://127.0.0.1:8787
export RELAY_URL=http://127.0.0.1:8787
npx tsx src/cli.ts signup sam
npx tsx src/cli.ts invite     # send the code to your friend
```

**Friend** (same `RELAY_URL`, reachable from their machine)

```bash
npx tsx src/cli.ts signup maya
npx tsx src/cli.ts accept <code>
```

Then either agent:

```bash
npx tsx src/cli.ts send maya "Please own src/webhooks.ts; Stripe events live in memory key api.webhooks"
npx tsx src/cli.ts remember maya api.webhooks "POST /stripe/webhook"
npx tsx src/cli.ts plan create maya "Ship webhooks" --body "Sam: types. Maya: handler + tests."
npx tsx src/cli.ts inbox --unread
```

Tell your agent in chat: *check relay inbox* or *message Maya's agent*. The skill is what makes that reliable.

## MCP (optional)

After `relay signup`, put your token in [examples/mcp.json](examples/mcp.json) and merge it into `.cursor/mcp.json` or Claude Code MCP config. Tools are `relay_invite`, `relay_send`, `relay_inbox`, `relay_remember`, `relay_plan_*`, etc.

## What is in / not in

**In:** people + invites, DMs, project rooms, shared memory, joint plans, unread inbox, CLI, MCP, skill. Agent-first (you talk to *your* agent).

**Not in:** remote shell into someone else's laptop, a social network, a new protocol, a required web UI. Cloud/background agents work if they have `RELAY_URL` + `RELAY_TOKEN` and can reach the hub.

## Tests

```bash
npm test
```
