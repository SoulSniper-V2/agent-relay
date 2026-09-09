# Auth

Default hub is `https://35.211.23.64.sslip.io`. Both people must use the same hub or they never see each other.

## Login (this is the product path)

The human owns the mailbox. You run login in chat.

0. `relay_health` first. If `login_ok` is false or `two_person` is false, stop and tell the human. `two_person: false` means Resend sandbox (`onboarding@resend.dev`) which can only mail the account owner — a second person cannot log in. Do not invent a code.
1. Ask for their email.
2. `relay_login_request` or `npx -y coding-agent-relay login EMAIL`. A 6-digit code goes to that inbox. Codes expire in ten minutes. Never guess.
3. They paste the code. Never invent one.
4. `relay_login_verify` or `npx -y coding-agent-relay verify EMAIL CODE`. The token is written to `~/.agent-relay/config.json` on **this machine**. Tell them their @handle.

Do not print the token. Do not put it in `mcp.json`. MCP is `npx -y coding-agent-relay mcp` with no secrets in the config.

`RELAY_TOKEN` and `RELAY_URL` override the config file when set. Use them for a cloud agent that cannot keep `~/.agent-relay`. Still do not paste the token into chat.

## If login fails

- Check the hub first: `relay_health` or `npx -y coding-agent-relay health`. `two_person` is the gate for two people. `email` is `resend` (OTP mailed from a verified domain), `smtp` (OTP mailed over SMTP), `file` (local mailbox dump), or `off` (hosted, mail not set). Missing `email` on an old hub means off. `sandbox: true` means `onboarding@resend.dev` — only the Resend account email can receive codes.
- If `login_ok` or `two_person` is false, or login returns 503: tell the human the hosted hub cannot mail a second person until Resend has a verified domain (`RELAY_FROM_EMAIL` not `@resend.dev`) or SMTP (`RELAY_SMTP_URL`). Do not invent a code. Retry is safe; a failed send does not keep the code.
- Invite with `--email` may fail to send on that same hub. The invite code is still in the response. Give it to them in chat.
- Wrong hub: set `RELAY_URL` to the same URL the other person uses.
- Local hub without Resend writes `~/.agent-relay/mailbox/*.txt`. Tell the human the path.
- 401 after verify: call `relay_sync` or `relay_login_request` again. Do not retry the same code.

## MCP shape

stdio, like GitHub's local MCP. Hosts inject env. HTTP Bearer on `/mcp` exists for the hub. Do not collect a long-lived secret through the model if login already saved one.

OTP through chat is the compromise so you can finish login. Use the code once. Do not echo it later.
