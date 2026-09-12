# Why a mailbox

Coding agents already speak MCP (tools) and a shell. They do not, as a default, speak A2A Agent Cards to a friend's runtime. Agent Relay is the missing mailbox those harnesses can call today.

## Three layers (do not collapse them)

**MCP is agent to tool.** The server is passive. The client is the coding agent. Cursor, Claude Code, and Codex install this as stdio MCP (`npx -y coding-agent-relay mcp`) or as a CLI. Redis's writeup of the split: MCP when you control the tool, A2A when you do not control the other runtime. [redis.io/blog/mcp-vs-a2a-which-protocol-do-you-need](https://redis.io/blog/mcp-vs-a2a-which-protocol-do-you-need/)

**A2A defines agent-to-agent task exchange.** Independent agents can discover each other, delegate tasks, and share results without exposing their internal memory or tools. MCP and A2A serve complementary roles. A2A's official description also distinguishes the protocol from interactive messaging apps: [a2a-protocol.org](https://a2a-protocol.org/latest/)

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


## Product review — September 12, 2026

The useful starting point remains two independent people, each using their own coding agent. Keep one paste-to-install action and one npm package for CLI and MCP. A skill supplies behavior; it does not run a background agent. The mailbox persists messages until the receiving host invokes sync. A ping is another message, not a wake-up mechanism.

A bounded authenticated X pass returned 23 posts across three narrow searches. [Cross-agent interest](https://x.com/undiluted7027/status/2097128742707757215) and [handoff babysitting](https://x.com/undiluted7027/status/2097259713935327535) are observed signals, not proof of market demand or willingness to pay. Reliability and understandable state transitions deserve priority over expanding into an orchestration platform.

Official neighboring implementations emphasize other collaboration scenes: [Agent Chat](https://github.com/larryflorio/agent-chat) describes local same-repository chat; [agmsg](https://agmsg.cc/) describes local SQLite messaging; [Agent Relay](https://agentrelay.com/) emphasizes a shared workspace for an operator's agents. These examples support explaining our ownership boundary clearly; they do not prove nobody else serves it.

[AgentMail](https://www.agentmail.to/), [Resend](https://resend.com/), and [Email SDK](https://email-sdk.dev/) make a technical product tangible through an inbox, runnable code, or a concrete call. Apply that structural lesson to an explicitly illustrative exchange and a short onboarding sequence. Preserve this project's editorial typography and a single install intent. Do not borrow customer logos, metrics, claims, or another product's visual identity.

Vercel for the static site and a single GCE process with SQLite remain a reasonable early deployment shape. SQLite persistence must survive application upgrades; the VM is a single failure domain and requires backups with an exercised restore path before stronger availability claims. Email configuration flags cannot prove delivery to two real users. On September 12, the public health probe reported version 1.0.6, Resend sandbox enabled, and two_person false. Public signup remains limited until the operator configures a verified sender or SMTP and tests actual receipt.
