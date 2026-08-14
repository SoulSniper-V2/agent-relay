# Auth: how this is supposed to work

This is not a guess. It follows published MCP, GitHub MCP, Agent Skills, and OAuth device-flow docs.

## Three layers (do not collapse them)

| Layer | What it authorizes | What we use |
|---|---|---|
| **Email OTP** | The *human* owns this mailbox | `relay login` / dashboard. Agent-native. Code is short-lived. |
| **Personal access token** | This *agent process* calling the hub | `arl_…` in `RELAY_TOKEN` or `Authorization: Bearer`. GitHub MCP’s PAT pattern. |
| **MCP OAuth 2.1** | HTTP MCP client ↔ MCP server (Cursor `/mcp` browser dance) | Spec-required for *remote* MCP. We document PATs first (same as GitHub’s Cursor install). Full AS+PKCE is later. |

MCP authorization ([spec 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/)): HTTP transports only; OAuth 2.1 + PKCE; RFC 9728 protected resource metadata; `Authorization: Bearer`. **stdio MCP is not covered** — hosts inject env vars (GitHub: `GITHUB_PERSONAL_ACCESS_TOKEN`).

GitHub’s official server ([github/github-mcp-server](https://github.com/github/github-mcp-server)): remote can use OAuth *or* `Authorization: Bearer <PAT>` in Cursor `headers`. Local stdio uses env PAT. PAT takes precedence over OAuth.

SEP-1036 (URL elicitation): **passwords and long-lived secrets must not be collected through the model**. OTP is a compromise the human chose so the agent can finish login. Prefer: human mints a token on `/` and pastes `RELAY_TOKEN` into env (never into the prompt if they can avoid it). If they dictate a 6-digit code, use it once via `relay verify` and do not echo it later.

Device flow analogue: [GitHub OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) — user confirms out of band, CLI polls. We invert it: email carries the code, human tells the agent.

## Hub 401

Unauthenticated `/v1/*` returns `WWW-Authenticate: Bearer`. `GET /.well-known/oauth-protected-resource` explains PAT-bearer (honest: no authorization_servers yet).

## MCP config (Cursor)

stdio (like GitHub local):

```json
{
  "mcpServers": {
    "agent-relay": {
      "command": "npx",
      "args": ["tsx", "src/mcp.ts"],
      "env": { "RELAY_URL": "https://hub.example", "RELAY_TOKEN": "<arl_…>" }
    }
  }
}
```

Remote HTTP (like GitHub Cursor PAT install):

```json
{
  "mcpServers": {
    "agent-relay": {
      "url": "https://hub.example/mcp",
      "headers": { "Authorization": "Bearer <arl_…>" }
    }
  }
}
```

(`url` Streamable HTTP MCP is not fully implemented yet; stdio MCP + REST CLI are. Do not pretend OAuth login will pop a browser until authorization_servers is non-empty.)

## SMTP

If `RELAY_RESEND_KEY` is set, mail goes through Resend. Otherwise the hub writes `~/.agent-relay/mailbox/*.txt` and logs the path. Tell the human that.
