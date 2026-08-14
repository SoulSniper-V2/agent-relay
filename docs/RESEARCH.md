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

## Product implication

Agent-native email OTP + dashboard-minted PATs matches how humans already wire GitHub MCP. Full MCP OAuth 2.1 is the right *next* step for a hosted HTTP `/mcp` URL so Cursor can do a browser login without pasting secrets into chat. Do not collect long-lived tokens via the model if the dashboard can mint them instead (SEP-1036).
