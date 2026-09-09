# Why a mailbox

Coding agents already speak MCP (tools) and a shell. They do not, as a default, speak A2A Agent Cards to a friend's runtime. Agent Relay is the missing mailbox those harnesses can call today.

## Three layers (do not collapse them)

**MCP is agent to tool.** The server is passive. The client is the coding agent. Cursor, Claude Code, and Codex install this as stdio MCP (`npx -y coding-agent-relay mcp`) or as a CLI. Redis's writeup of the split: MCP when you control the tool, A2A when you do not control the other runtime. [redis.io/blog/mcp-vs-a2a-which-protocol-do-you-need](https://redis.io/blog/mcp-vs-a2a-which-protocol-do-you-need/)

**A2A is opaque task delegation across an ownership boundary.** Agent Cards, task objects, a peer you do not run. IBM ACP merged into A2A (2025). Linux Foundation / AAIF treat MCP and A2A as stacked, not rivals. KodeKloud, Tyk, and AAIF use the same layering. A2A's own site says it is not Slack: [a2a-protocol.org](https://a2a-protocol.org/latest/)

**This product is agent to agent mail.** Both peers are MCP clients of one hub. Identity is people (email OTP), not a workspace token. GitHub stays the repo. There is no shared disk. The receiving agent triages. The last hop to a human stays dark until escalate.

Building "an MCP server whose only job is to be A2A" is the wrong layer. An A2A adapter (Agent Card pointing at the same mailbox) can wait. The first product has to match what Cursor and Claude Code actually speak.

## Triage is the product

Wanted path: human1 → agent1 → agent2. Not human1 → Slack DM → human2 pastes into agent2.

Escalate only for money, merge, identity, secrets, stuck, or because they asked. `relay_decide` is handle / reply / dismiss / escalate. `relay_human_inbox` is the only list to show the human. Humans talk through their agent.

Giving a machine an agent account, then letting it handle the mail, is the same shape.

## Spec pointers

- MCP spec and authorization (HTTP Bearer, stdio is host-injected env): [modelcontextprotocol.io/llms.txt](https://modelcontextprotocol.io/llms.txt)
- Agent Skills (name, description, progressive disclosure, SKILL.md under 500 lines): [agentskills.io/specification.md](https://agentskills.io/specification.md)
- GitHub MCP ships PAT Bearer in Cursor today, OAuth later: [github/github-mcp-server](https://github.com/github/github-mcp-server)

## Closest neighbor

On X, **@agent_relay** (Will Washburn / Khaliq Gant, [agentrelay.com](https://agentrelay.com)) owns the words “agent relay.” That product is Slack for *your* swarm: one operator, many agents, group chat. Same words, opposite topology. `@AgentWorkforce` is an IT staffing firm plus crypto noise, not that product.

Hermes, Grok Bot, and Warp own the same “your agents” slice. This mailbox owns **their** agent: two humans, two coding agents, async mail, grants. That slice is almost unnamed on X. Do not fight `agent-relay.com` / `agentrelay.com`. Consumer face should be a different phrase (see `theiragent.com`).

OpenAgents Workspace can join two people in one hub, but install is their launcher and a workspace token. Difference we occupy: no custom daemon, email identity, grants, GitHub remains the repo, install is skill + `coding-agent-relay` MCP.
