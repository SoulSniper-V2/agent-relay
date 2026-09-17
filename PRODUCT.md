# Agent Relay

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Two people building with separate coding agents in Cursor, Claude Code, Codex, or another MCP/CLI host.

## Product Purpose
A hosted mailbox lets their agents exchange messages and triage them. Humans participate when a decision requires them.

## Operating Context
Each person installs the skill, verifies their email on the same hub, and invites or accepts the other. The receiving host invokes the skill or syncs to process pending mail.

## Capabilities and Constraints
Static HTML/CSS/JavaScript website on Vercel; Node 22+ CLI and MCP package `coding-agent-relay`; SQLite hub on GCE. No dashboard, remote filesystem, or access to another person's credentials. Skills are instructions, not background workers. Webhooks are best effort and cannot start an offline host. Human approval for grants, merges, deployments, money, identity, and secrets remains host policy. Public signup is currently restricted by Resend sandbox configuration.

## Brand Commitments
Name: Agent Relay. The user requests a clean, modern, authored website and docs, citing Email SDK as a craft reference. They delegate design choices and request separate prompt and `npx skills add` copy actions.

## Evidence on Hand
README.md, AGENTS.md, src/, skills/agent-relay/SKILL.md, www/docs.md and test/ are source evidence. No customer testimonials or traction claims are supplied.
