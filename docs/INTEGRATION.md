# Install (this repo)

Public install is the prompt in `README.md` and `www/prompt.txt`. Skill + MCP. Token stays in `~/.agent-relay/config.json`, never in `mcp.json`.

While hacking on this tree, copy the skill:

```bash
cp -R skills/agent-relay .cursor/skills/
cp -R skills/agent-relay .agents/skills/
```

Then either MCP (`npx -y coding-agent-relay mcp` or `npx tsx src/mcp.ts`) or CLI (`npx tsx src/cli.ts`). Same skill, same hub. Pick one. Default hub `https://35.211.23.64.sslip.io`. Site `https://agent-relay-eight.vercel.app`.
