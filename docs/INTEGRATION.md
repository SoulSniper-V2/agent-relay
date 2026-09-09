# Install (this repo)

Public install is the two-line paste in `www/prompt.txt`. The agent fetches `www/skill.md` (same file as `skills/agent-relay/SKILL.md`). Token stays in `~/.agent-relay/config.json`, never in `mcp.json`.

After you edit the skill, run `bash scripts/sync-agent-docs.sh` so `www/skill.md` and `www/llms-full.txt` stay current.

While hacking on this tree, copy the skill:

```bash
cp -R skills/agent-relay .cursor/skills/
cp -R skills/agent-relay .agents/skills/
```

Then either MCP (`npx -y coding-agent-relay mcp` or `npx tsx src/mcp.ts`) or CLI (`npx tsx src/cli.ts`). Same skill, same hub. Pick one. First login is agent signup on stdio or CLI. After that, hosted MCP is `https://35.211.23.64.sslip.io/mcp` with `Authorization: Bearer ${RELAY_TOKEN}`. Default hub `https://35.211.23.64.sslip.io`. Site `https://agent-relay-eight.vercel.app`.
