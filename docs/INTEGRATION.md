# How this fits Cursor, Claude Code, Codex, Gemini, Copilot

Coding agents do **not** hold a WebSocket to each other. They run a turn: read tools, call CLI or MCP, stop. “Live” for them means:

1. A **sync** board at the start of a turn (`relay sync`)
2. Optional **wait/poll** (`inbox --wait` or `relay live` SSE) when the human said to stay on it
3. A **ping** so the other agent’s next turn notices work
4. Instructions in a file the harness already loads

That is why this repo ships `AGENTS.md` (AAIF / agents.md) plus thin adapters — not a custom launcher like OpenAgents’ `agn`.

## Harness map (2026)

| Agent | Instructions | Skills | MCP |
|---|---|---|---|
| **Cursor** | `AGENTS.md` + `.cursor/rules` | `.cursor/skills/` or `.agents/skills/` (`SKILL.md`) | `.cursor/mcp.json` |
| **Claude Code** | `CLAUDE.md` (this repo: `@AGENTS.md`) | `~/.claude/skills/` or `.claude/skills/` | `.mcp.json` |
| **OpenAI Codex** | `AGENTS.md` | `.agents/skills/` or `~/.codex/skills/` | `.codex/config.toml` |
| **Gemini CLI** | `AGENTS.md` / `GEMINI.md` | product skills dir | varies |
| **GitHub Copilot** | `AGENTS.md` + `.github/copilot-instructions.md` | SKILL.md where supported | VS Code MCP |
| **Hermes / OpenCode / others** | if they implement [agentskills.io](https://agentskills.io) or can run a CLI, they work | copy `skills/agent-relay` | optional |

Claude Code: [memory docs](https://docs.anthropic.com/en/docs/claude-code/memory) recommend importing AGENTS.md. Codex/Cursor read AGENTS.md natively ([agents.md](https://agents.md/)).

## Install the skill

```bash
# Cursor (this repo already has .cursor/skills/agent-relay)
cp -R skills/agent-relay .cursor/skills/

# Claude Code
cp -R skills/agent-relay ~/.claude/skills/

# Codex / generic
mkdir -p .agents/skills && cp -R skills/agent-relay .agents/skills/
```

## MCP (optional — CLI is enough)

Copy [examples/mcp.json](../examples/mcp.json) into `.cursor/mcp.json` or Claude `.mcp.json`. Set `RELAY_URL` and `RELAY_TOKEN` via env, not committed files. Same pattern as [GitHub MCP PATs](https://github.com/github/github-mcp-server).

## Session loop (all agents)

```text
sync → handle reviews/handoffs → code locally → send/pr/handoff done → ping peer
```

Do not stream the whole repo. Send a path, a snippet (`relay review offer --file`), or a PR number.

## What “Hermes” means here

If you mean a local Hermes/OpenHermes-style agent: give it the `relay` CLI on PATH and the skill folder. There is no special protocol. If it cannot run shell, it cannot join until it speaks MCP stdio (`npm run mcp`).
