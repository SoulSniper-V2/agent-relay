import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RelayError, Store } from "./store.ts";
import { inviteMail, inviteResult, loginCodeMail, mailStatus, sendMail } from "./email.ts";
import { HOSTED_HUB, SITE } from "./hosted.ts";
import type { RelayBus } from "./bus.ts";
import { dispatchMcp, type Rpc } from "./mcp-core.ts";
import { NAME, VERSION } from "./version.ts";
import type { Actor } from "./types.ts";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      chunks.push(c);
      if (chunks.reduce((n, x) => n + x.length, 0) > 256_000) {
        reject(new RelayError(413, "Body too large."));
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new RelayError(400, "Invalid JSON body.");
  }
}

function send(res: ServerResponse, status: number, data: unknown, extra: Record<string, string> = {}) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, mcp-session-id",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    ...extra,
  });
  res.end(body);
}

function pathOf(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://relay.local");
}

function bearer(req: IncomingMessage): string | undefined {
  const h = req.headers.authorization;
  return typeof h === "string" ? h : undefined;
}

function clientIp(req: IncomingMessage): string {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) return real.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // Caddy appends the connecting client. Prefer that hop over a spoofed left-most XFF.
    if (hops.length) return hops[hops.length - 1]!;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const t = Date.now();
    const next = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (next.length >= max) {
      hits.set(key, next);
      return false;
    }
    next.push(t);
    hits.set(key, next);
    return true;
  };
}

function agentCard(publicUrl: string) {
  const url = publicUrl || "http://127.0.0.1:8787";
  return {
    protocolVersion: "0.2.9",
    name: "Agent Relay",
    description:
      "Mailbox switchboard for humans and coding agents. Messages land on an agent; that agent decides whether a human ever sees them.",
    url: `${url}/mcp`,
    provider: { organization: "agent-relay" },
    version: VERSION,
    capabilities: { streaming: true },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "mailbox",
        name: "Mailbox",
        description: "Send and triage messages between agents. Escalate to a human only when needed.",
        tags: ["messaging", "hitl", "mcp"],
      },
    ],
    extra: {
      rest: `${url}/v1`,
      mcp: `${url}/mcp`,
      note: "This hub is a messaging switchboard, not an A2A task-executing agent. Use MCP tools or REST. A2A Agent Cards are advertised for discovery.",
    },
  };
}

export function createRelayServer(store: Store, opts: { publicUrl?: string; bus?: RelayBus } = {}) {
  const publicUrl = opts.publicUrl ?? "";
  const bus = opts.bus;
  const authIpOk = makeLimiter(10, 10 * 60 * 1000);
  const verifyIpOk = makeLimiter(30, 10 * 60 * 1000);
  const sendMax = Number(process.env.RELAY_SEND_MAX ?? 40);
  const sendOk = makeLimiter(Number.isFinite(sendMax) && sendMax > 0 ? sendMax : 40, 10 * 60 * 1000);
  const inviteOk = makeLimiter(20, 10 * 60 * 1000);

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        send(res, 204, {});
        return;
      }
      const url = pathOf(req);
      const p = url.pathname.replace(/\/$/, "") || "/";
      const method = req.method ?? "GET";

      if ((method === "GET" || method === "HEAD") && (p === "/" || p === "/app" || p === "/health")) {
        if (p === "/health") {
          if (method === "HEAD") {
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end();
            return;
          }
          send(res, 200, {
            ok: true,
            name: NAME,
            version: VERSION,
            mcp_url: `${(publicUrl || HOSTED_HUB).replace(/\/$/, "")}/mcp`,
            ...mailStatus(),
          });
          return;
        }
        if (method === "HEAD") {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end();
          return;
        }
        send(res, 200, {
          name: NAME,
          version: VERSION,
          ...mailStatus(),
          mcp: "POST /mcp",
          mcp_url: `${(publicUrl || HOSTED_HUB).replace(/\/$/, "")}/mcp`,
          site: SITE,
          hub: publicUrl || HOSTED_HUB,
          login: "POST /v1/auth/request then POST /v1/auth/verify",
        });
        return;
      }

      if (method === "GET" && p === "/.well-known/oauth-protected-resource") {
        send(res, 200, {
          resource: publicUrl || "http://127.0.0.1:8787",
          authorization_servers: [],
          bearer_methods_supported: ["header"],
          resource_documentation:
            "Agent Relay MCP: POST /mcp with Authorization: Bearer <PAT>. Mint a token after email login.",
        });
        return;
      }

      if (method === "GET" && p === "/.well-known/agent-card.json") {
        send(res, 200, agentCard(publicUrl));
        return;
      }

      if (p === "/mcp" || p.startsWith("/mcp/")) {
        if (method !== "POST") {
          send(
            res,
            405,
            {
              error: "Streamable HTTP MCP: POST JSON-RPC to /mcp. Put your PAT in Authorization: Bearer.",
              transport: "streamable-http",
            },
            { allow: "POST, OPTIONS" },
          );
          return;
        }
        const raw = await jsonBody(req);
        const msg = raw as Rpc;
        if (!msg || typeof msg !== "object" || Array.isArray(msg) || !msg.method) {
          send(res, 400, { jsonrpc: "2.0", error: { code: -32600, message: "Invalid JSON-RPC" }, id: null });
          return;
        }
        const host = req.headers.host ?? "127.0.0.1";
        const proto = publicUrl.startsWith("https") ? "https" : "http";
        const hubUrl = `${proto}://${host}`;
        const token = bearer(req)?.replace(/^Bearer\s+/i, "").trim();
        const out = await dispatchMcp(msg, {
          hubUrl,
          token,
          store,
          allowLogin: () => authIpOk(clientIp(req)),
        });
        if (!out) {
          res.writeHead(202, { "content-type": "application/json" });
          res.end();
          return;
        }
        send(res, 200, out);
        return;
      }

      if (method === "POST" && p === "/v1/auth/request") {
        if (!authIpOk(clientIp(req))) {
          throw new RelayError(429, "Too many login requests from this network. Try again later.");
        }
        const b = await jsonBody(req);
        const issued = store.createLoginCode(String(b.email ?? ""));
        let delivered: { delivered: "resend" | "smtp" | "file" };
        try {
          delivered = await sendMail(loginCodeMail(issued.email, issued.code));
        } catch (e) {
          store.clearLoginCode(issued.email);
          throw e;
        }
        const payload: Record<string, unknown> = {
          ok: true,
          email: issued.email,
          delivered: delivered.delivered,
          expires_in_sec: 600,
          hint:
            delivered.delivered === "file"
              ? "Local file mailbox. Ask the human to read RELAY_MAILBOX_DIR (default ~/.agent-relay/mailbox) and tell you the 6-digit code."
              : "Code emailed. Ask the human to read their inbox and tell you the 6-digit code. Do not guess.",
        };
        if (process.env.RELAY_DEV_OTP === "1") payload.dev_code = issued.code;
        send(res, 200, payload);
        return;
      }

      if (method === "POST" && p === "/v1/auth/verify") {
        if (!verifyIpOk(clientIp(req))) {
          throw new RelayError(429, "Too many login tries from this network. Try again later.");
        }
        const b = await jsonBody(req);
        const result = store.verifyLogin(String(b.email ?? ""), String(b.code ?? ""));
        send(res, 200, {
          user: result.user,
          agent: result.agent,
          token: result.token,
          is_new: result.is_new,
          hint: "Save token as RELAY_TOKEN or ~/.agent-relay/config.json. Do not commit it. Do not print it.",
        });
        return;
      }

      if (method === "POST" && p === "/v1/register") {
        if (process.env.RELAY_ALLOW_OPEN_REGISTER !== "1") {
          throw new RelayError(403, "Open register is off. Use email login: POST /v1/auth/request.");
        }
        const b = await jsonBody(req);
        const result = store.register(String(b.handle ?? ""), b.name ? String(b.name) : undefined);
        send(res, 201, { user: result.user, agent: result.agent, token: result.token });
        return;
      }

      const need = (): Actor => store.auth(bearer(req));

      if (method === "GET" && p === "/v1/me") {
        send(res, 200, store.snapshot(need()));
        return;
      }

      if (method === "GET" && p === "/v1/sync") {
        send(res, 200, { ...store.sync(need()), hub: { version: VERSION, ...mailStatus() } });
        return;
      }

      if (method === "GET" && p === "/v1/people") {
        send(res, 200, { people: store.people(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/invites") {
        const me = need();
        if (!inviteOk(me.user.id)) {
          throw new RelayError(429, "Too many invites from this agent. Try again in a few minutes.");
        }
        const b = await jsonBody(req);
        const inv = store.createInvite(me);
        const email = b.email ? String(b.email) : "";
        let emailed: string | undefined;
        let mail_error: string | undefined;
        if (email) {
          try {
            await sendMail(inviteMail(me.user.handle, email, inv.code));
            emailed = email;
          } catch (e) {
            mail_error = e instanceof Error ? e.message : "email failed";
          }
        }
        send(res, 201, inviteResult(inv, { emailed, mail_error, hub: publicUrl || undefined }));
        return;
      }

      if (method === "POST" && p === "/v1/invites/accept") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.acceptInvite(me, String(b.code ?? "")));
        return;
      }

      if (method === "GET" && p === "/v1/inbox") {
        const me = need();
        const pending = url.searchParams.get("pending") !== "0" && url.searchParams.get("unread") !== "0";
        const after = url.searchParams.get("after");
        send(res, 200, {
          messages: store.inbox(me, {
            pending,
            after: after ? Number(after) : undefined,
          }),
        });
        return;
      }

      if (method === "GET" && p === "/v1/human/inbox") {
        send(res, 200, { items: store.humanInbox(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/ping") {
        const me = need();
        if (!sendOk(me.user.id)) {
          throw new RelayError(429, "Too many messages from this agent. Try again in a few minutes.");
        }
        const b = await jsonBody(req);
        send(res, 201, store.ping(me, String(b.to ?? ""), String(b.note ?? "")));
        return;
      }

      if (method === "POST" && p === "/v1/messages") {
        const me = need();
        if (!sendOk(me.user.id)) {
          throw new RelayError(429, "Too many messages from this agent. Try again in a few minutes.");
        }
        const b = await jsonBody(req);
        send(
          res,
          201,
          store.send(me, {
            to: b.to ? String(b.to) : undefined,
            room: b.room ? String(b.room) : undefined,
            body: String(b.body ?? ""),
            intent: b.intent ? String(b.intent) : undefined,
            needs_human: Boolean(b.needs_human),
            reply_to: b.reply_to ? String(b.reply_to) : undefined,
            payload: b.payload && typeof b.payload === "object" ? (b.payload as Record<string, unknown>) : undefined,
          }),
        );
        return;
      }

      if (method === "POST" && p.match(/^\/v1\/messages\/[^/]+\/decide$/)) {
        const me = need();
        const messageId = p.split("/")[3];
        const b = await jsonBody(req);
        send(
          res,
          200,
          store.decide(me, messageId, {
            action: String(b.action ?? "") as "handle" | "escalate" | "dismiss" | "reply",
            reason: b.reason != null ? String(b.reason) : undefined,
            reply: b.reply != null ? String(b.reply) : undefined,
          }),
        );
        return;
      }

      if (method === "POST" && p.match(/^\/v1\/messages\/[^/]+\/ack$/)) {
        const me = need();
        const messageId = p.split("/")[3];
        send(res, 200, store.decide(me, messageId, { action: "handle" }));
        return;
      }

      if (method === "POST" && p.match(/^\/v1\/messages\/[^/]+\/resolve$/)) {
        const me = need();
        const messageId = p.split("/")[3];
        const b = await jsonBody(req);
        send(res, 200, store.resolveHuman(me, messageId, { reply: b.reply != null ? String(b.reply) : undefined }));
        return;
      }

      if (method === "GET" && p.startsWith("/v1/threads/")) {
        send(res, 200, { messages: store.thread(need(), p.split("/")[3]) });
        return;
      }

      if (method === "GET" && p === "/v1/rooms") {
        send(res, 200, { rooms: store.listRooms(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/rooms") {
        const me = need();
        const b = await jsonBody(req);
        const members = Array.isArray(b.members) ? b.members.map(String) : [];
        send(res, 201, store.createRoom(me, String(b.title ?? ""), members));
        return;
      }

      if (method === "POST" && p.match(/^\/v1\/rooms\/[^/]+\/members$/)) {
        const me = need();
        const slug = p.split("/")[3];
        const b = await jsonBody(req);
        send(res, 200, store.addRoomMember(me, slug, String(b.handle ?? "")));
        return;
      }

      if (method === "POST" && p === "/v1/memory") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.remember(me, String(b.target ?? ""), String(b.key ?? ""), String(b.value ?? "")));
        return;
      }

      if (method === "GET" && p === "/v1/memory") {
        const me = need();
        const target = url.searchParams.get("target") ?? "";
        const key = url.searchParams.get("key") ?? undefined;
        send(res, 200, { items: store.recall(me, target, key) });
        return;
      }

      if (method === "GET" && p === "/v1/agents") {
        send(res, 200, { agents: store.listAgents(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/agents") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.createAgent(me, String(b.slug ?? ""), b.name != null ? String(b.name) : undefined));
        return;
      }

      if (method === "GET" && p === "/v1/tokens") {
        send(res, 200, { tokens: store.listTokens(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/tokens") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.mintToken(me, String(b.name ?? "agent"), b.agent != null ? String(b.agent) : undefined));
        return;
      }

      if (method === "DELETE" && p.startsWith("/v1/tokens/")) {
        send(res, 200, store.revokeToken(need(), p.split("/")[3]));
        return;
      }

      if (method === "GET" && p === "/v1/stream") {
        const me = need();
        if (!bus) {
          send(res, 501, { error: "Live stream not enabled on this hub." });
          return;
        }
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });
        res.write(
          `data: ${JSON.stringify({ type: "hello", address: `@${me.user.handle}/${me.agent.slug}`, at: Date.now() })}\n\n`,
        );
        const unsub = bus.subscribe(me.user.id, (ev) => {
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        });
        const ping = setInterval(() => {
          res.write(`: ping ${Date.now()}\n\n`);
        }, 15_000);
        req.on("close", () => {
          unsub();
          clearInterval(ping);
        });
        return;
      }

      if (method === "POST" && p === "/v1/grants") {
        const me = need();
        const b = await jsonBody(req);
        send(
          res,
          200,
          store.setGrants(me, String(b.handle ?? ""), {
            caps: b.caps as string | string[] | undefined,
            level: b.level != null ? String(b.level) : undefined,
            inbound_policy: b.inbound_policy != null ? String(b.inbound_policy) : undefined,
          }),
        );
        return;
      }

      if (method === "POST" && p === "/v1/status") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.setStatus(me, String(b.status ?? "working"), String(b.detail ?? "")));
        return;
      }

      if (method === "POST" && p === "/v1/card") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.setCard(me, String(b.card ?? "")));
        return;
      }

      send(res, 404, { error: "Not found" });
    } catch (e) {
      if (e instanceof RelayError) {
        const extra: Record<string, string> = {};
        if (e.status === 401) extra["www-authenticate"] = 'Bearer realm="agent-relay"';
        send(res, e.status, { error: e.message }, extra);
        return;
      }
      console.error(e);
      send(res, 500, { error: "Server error" });
    }
  });

  return server;
}
