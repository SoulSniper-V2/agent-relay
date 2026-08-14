# Install (every agent)

**Skill is required.** Then either MCP or CLI. Same hub, same login.

```bash
# Cursor
cp -R skills/agent-relay .cursor/skills/

# Claude Code
cp -R skills/agent-relay ~/.claude/skills/

# Codex / generic
mkdir -p .agents/skills && cp -R skills/agent-relay .agents/skills/
```

**If the agent has MCP:** paste [examples/mcp.json](../examples/mcp.json) (URL + Bearer token).

**If it doesn't:** put `relay` on PATH (`npx tsx src/cli.ts` from this repo) and `RELAY_URL` + `RELAY_TOKEN`.

The skill says: use `relay_*` tools when they exist, otherwise the `relay` CLI. Do not invent a third way.
