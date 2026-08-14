# Sources (read, not summarized from memory)

## MCP

- Spec index: https://modelcontextprotocol.io/llms.txt
- Authorization: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- AS discovery / RFC 9728: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery
- Tutorial: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/authorization
- Security BCP (confused deputy, token passthrough forbidden, stdio proxy notes): https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
- Streamable HTTP: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- Remote servers: https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-remote-servers
- Build with Agent Skills (remote HTTP default for cloud APIs; OAuth because redirects): https://modelcontextprotocol.io/docs/2026-07-28/develop/build-with-agent-skills
- SEP-1036 URL elicitation (secrets out-of-band, not through the model): https://modelcontextprotocol.io/seps/1036-url-mode-elicitation-for-secure-out-of-band-intera
- Claude Code MCP (HTTP recommended for remote; OAuth via `/mcp`): https://code.claude.com/docs/en/mcp.md

## Agent Skills

- Spec: https://agentskills.io/specification.md (name/description constraints, progressive disclosure, scripts/, references/, keep SKILL.md < 500 lines)
- Best practices: https://agentskills.io/skill-creation/best-practices.md (gotchas, defaults not menus, procedures, scripts for repeated logic)
- Scripts for agents: https://agentskills.io/skill-creation/using-scripts.md (no TTY prompts, JSON stdout, --help)
- Descriptions: https://agentskills.io/skill-creation/optimizing-descriptions.md (imperative, pushy when-to-use, 1024 char cap)
- Anthropic skill-creator: https://github.com/anthropics/skills/tree/main/skills/skill-creator
- MCP official plugin skills: https://github.com/anthropics/claude-plugins-official/tree/main/plugins/mcp-server-dev

## How production MCP auth actually ships

- GitHub MCP README (OAuth *or* PAT Bearer header; stdio env `GITHUB_PERSONAL_ACCESS_TOKEN`; PAT wins): https://github.com/github/github-mcp-server
- GitHub Cursor install (explicitly: GitHub remote currently wants a PAT in Cursor `headers.Authorization`): https://github.com/github/github-mcp-server/blob/HEAD/docs/installation-guides/install-cursor.md
- Cursor header vs Claude `authorization_token`: https://github.com/github/github-mcp-server/issues/647
- GitHub OAuth device flow (out-of-band user confirm): https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow

## MCP vs A2A (layering, not a bake-off)

- Redis: MCP is agent→tool (passive server); A2A is agent→agent across an ownership boundary. Use A2A when you do not control the other runtime. https://redis.io/blog/mcp-vs-a2a-which-protocol-do-you-need/
- Same layering: KodeKloud 2026, Tyk, AAIF (MCP + A2A under Linux Foundation). IBM ACP merged into A2A (2025).
- Coding agents (Cursor, Claude Code, Codex) already speak **MCP stdio / CLI**. They do **not** currently expose an A2A Agent Card as the default way a friend's agent reaches them.
- Implication for this repo: a **hub + MCP/CLI tools** is how those agents actually join today. An A2A adapter (Agent Card pointing at the same mailbox) is a later interoperability layer, not the first product. Building “an MCP server whose only job is to be A2A” would be the wrong layer (KodeKloud: if you are coordinating other agents, that is A2A’s job — here the *peers* are still MCP clients of a shared mailbox, because that is what the harnesses are).

## Closest products (checked Aug 2026)

### OpenAgents Workspace (closest)

- Docs: https://openagents.org/docs/en/workspace/what-is-workspace
- Cross-user **does exist**: share a workspace token; teammate `agn workspace join`; both agent pools appear in one Slack-like hub (channels, DMs, @mentions, shared files/browser).
- Protocol: OpenAgents Network Model (ONM) + their **Launcher** (`agn`). MCP/A2A are mentioned for self-hosted networks, not as the default Cursor/Claude install.
- Difference we still occupy: **no custom daemon**. Identity is **people** (email OTP) not a workspace token. **Grants** (visitor/pair/cofounder) are first-class. **GitHub remains the repo** — we do not share a disk or browser. Install is `SKILL.md` + `relay` CLI / stdio MCP.

### Others

- Local multi-agent MCP / “Agent Teams” (Claude Code): same-user JSON mailboxes + poll, not cross-account identity.
- Ledgenter-class same-user state: not two humans.

## Product implication

Agent-native email OTP + dashboard-minted PATs matches how humans already wire GitHub MCP. Full MCP OAuth 2.1 is the right *next* step for a hosted HTTP `/mcp` URL so Cursor can do a browser login without pasting secrets into chat. Do not collect long-lived tokens via the model if the dashboard can mint them instead (SEP-1036). Until Streamable HTTP MCP exists, the dashboard must only emit **stdio** snippets (tested: `GET /mcp` returns 501).
