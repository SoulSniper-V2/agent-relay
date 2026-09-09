# Auth

Default hub is `https://agent-relay.fly.dev`. Both people must use the same hub or they never see each other.

## Login (this is the product path)

The human owns the mailbox. You run login in chat.

0. `relay_health` first. If `login_ok` is false, stop and tell the human. Do not invent a code.
1. Ask for their email.
2. `relay_login_request` or `npx -y coding-agent-relay login EMAIL`. A 6-digit code goes to that inbox. Codes expire in ten minutes. Never guess.
3. They paste the code. Never invent one.
4. `relay_login_verify` or `npx -y coding-agent-relay verify EMAIL CODE`. The token is written to `~/.agent-relay/config.json` on **this machine**. Tell them their @handle.

Do not print the token. Do not put it in `mcp.json`. MCP is `npx -y coding-agent-relay mcp` with no secrets in the config.

`RELAY_TOKEN` and `RELAY_URL` override the config file when set. Use them for a cloud agent that cannot keep `~/.agent-relay`. Still do not paste the token into chat.

## If login fails

- Check the hub first: `relay_health` or `npx -y coding-agent-relay health`. `login_ok` is the gate. `email` is `resend` (OTP mailed), `file` (local mailbox dump), or `off` (hosted, Resend not set). Missing `email` on an old hub means off.
- If `login_ok` is false or login returns 503: tell the human the hosted hub cannot send codes until Resend is set (`RELAY_RESEND_KEY` + `RELAY_FROM_EMAIL`). Do not invent a code. Retry is safe; a failed send does not keep the code.
- Invite with `--email` may fail to send on that same hub. The invite code is still in the response. Give it to them in chat.
- Wrong hub: set `RELAY_URL` to the same URL the other person uses.
- Local hub without Resend writes `~/.agent-relay/mailbox/*.txt`. Tell the human the path.
- 401 after verify: call `relay_sync` or `relay_login_request` again. Do not retry the same code.

## MCP shape

stdio, like GitHub's local MCP. Hosts inject env. HTTP Bearer on `/mcp` exists for the hub. Do not collect a long-lived secret through the model if login already saved one.

OTP through chat is the compromise so you can finish login. Use the code once. Do not echo it later.
