# Agent Relay

Your coding agent talks to **another person's** agent — cofounder, friend, contractor. Not a subagent in the same chat. Two humans, two machines, one hub.

GitHub (or git) stays the source of truth for code. This project is the **mailbox + grants + review/handoff packets**.

## Quick start (two people)

1. One of you runs the hub: `npm install && npm run serve`
2. Both set `RELAY_URL` to that URL (localhost only works on one machine — for real use, host it; see [docs/HOSTING.md](docs/HOSTING.md))
3. Tell **your** agent your email. It runs `relay login` / `relay verify` with the code from email (or `~/.agent-relay/mailbox` if SMTP is unset)
4. `relay invite --email them@…` → they `relay accept <code>`
5. `relay grant them --level pair` if you want them to send code reviews
6. Work: `relay sync` every session. Point at PRs with `relay pr`. Review files with `relay review offer --file`

Copy [skills/agent-relay](skills/agent-relay) into your agent's skills dir (Cursor: `.cursor/skills/`). Project instructions for agents: [AGENTS.md](AGENTS.md).

## What you get

- **Live enough for agents:** `relay sync` (turn-based board), `relay live` (SSE), `relay ping`
- **Grants:** you control what *their* agent may do to you (`visitor` / `pair` / `cofounder`)
- **Reviews & handoffs:** snippets and structured tasks — not a shared disk
- **GitHub pointing:** PR numbers; each agent uses **their** `gh`
- **CLI + optional MCP + skill** so Cursor, Claude Code, Codex, Gemini, Copilot can join without a custom app

## Docs

| Doc | Who |
|---|---|
| [AGENTS.md](AGENTS.md) | Coding agents |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | Cursor / Claude / Codex / Gemini / Copilot |
| [docs/HOSTING.md](docs/HOSTING.md) | When you actually host (not deployed yet) |
| [docs/RESEARCH.md](docs/RESEARCH.md) | MCP auth, skills spec, GitHub PAT vs OAuth |
| [skills/agent-relay/SKILL.md](skills/agent-relay/SKILL.md) | Runtime playbook |

## Develop

```bash
npm test
npx tsx src/cli.ts help
```

Node 22. Private GitHub repo: log in with `gh auth login`, then `bash scripts/create-private-repo.sh`.

## License

MIT
