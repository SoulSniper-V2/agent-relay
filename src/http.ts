import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RelayError, Store, type User } from "./store.ts";
import { dashboardHtml } from "./dashboard.ts";
import { sendMail } from "./email.ts";
import type { RelayBus } from "./bus.ts";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
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
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    ...extra,
  });
  res.end(body);
}

function pathOf(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://relay.local");
}

function bearer(req: IncomingMessage): string | undefined {
  return req.headers.authorization;
}

export function createRelayServer(store: Store, opts: { publicUrl?: string; bus?: RelayBus } = {}) {
  const publicUrl = opts.publicUrl ?? "";
  const bus = opts.bus;

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        send(res, 204, {});
        return;
      }
      const url = pathOf(req);
      const p = url.pathname.replace(/\/$/, "") || "/";
      const method = req.method ?? "GET";

      if (method === "GET" && (p === "/" || p === "/app")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(dashboardHtml(publicUrl));
        return;
      }

      if (method === "GET" && p === "/.well-known/oauth-protected-resource") {
        send(res, 200, {
          resource: publicUrl || "http://127.0.0.1:8787",
          authorization_servers: [],
          bearer_methods_supported: ["header"],
          resource_documentation:
            "Agent-relay uses personal access tokens (same pattern as GitHub MCP PATs). Mint one at / after email login. Put it in Authorization: Bearer or RELAY_TOKEN. Full OAuth 2.1 for HTTP MCP is not implemented yet.",
        });
        return;
      }

      if (method === "GET" && p === "/health") {
        send(res, 200, { ok: true, name: "agent-relay" });
        return;
      }

      if (method === "POST" && p === "/v1/auth/request") {
        const b = await jsonBody(req);
        const issued = store.createLoginCode(String(b.email ?? ""));
        const delivered = await sendMail({
          to: issued.email,
          subject: `Your agent-relay code: ${issued.code}`,
          text: [
            `Your login code is: ${issued.code}`,
            "",
            "Give this code to your agent (or paste it on the dashboard).",
            "It expires in 10 minutes. Do not forward it.",
            publicUrl ? `Dashboard: ${publicUrl}` : "",
          ].join("\n"),
        });
        const payload: Record<string, unknown> = {
          ok: true,
          email: issued.email,
          delivered: delivered.delivered,
          expires_in_sec: 600,
          hint:
            delivered.delivered === "file"
              ? "No SMTP configured. Code written to RELAY_MAILBOX_DIR (default ~/.agent-relay/mailbox). Ask the human to read that email/file and tell you the 6-digit code."
              : "Code emailed. Ask the human to read their inbox and tell you the 6-digit code. Do not guess.",
        };
        if (process.env.RELAY_DEV_OTP === "1") payload.dev_code = issued.code;
        send(res, 200, payload);
        return;
      }

      if (method === "POST" && p === "/v1/auth/verify") {
        const b = await jsonBody(req);
        const result = store.verifyLogin(String(b.email ?? ""), String(b.code ?? ""));
        send(res, 200, {
          ...result,
          hint: "Save token as RELAY_TOKEN. Do not commit it. Mint extra tokens on the dashboard for MCP/cloud agents.",
        });
        return;
      }

      if (method === "POST" && p === "/v1/register") {
        const b = await jsonBody(req);
        const result = store.register(String(b.handle ?? ""), b.name ? String(b.name) : undefined);
        send(res, 201, result);
        return;
      }

      const need = (): User => store.auth(bearer(req));

      if (method === "GET" && p === "/v1/me") {
        send(res, 200, store.snapshot(need()));
        return;
      }

      if (method === "GET" && p === "/v1/people") {
        send(res, 200, { people: store.people(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/invites") {
        const me = need();
        const b = await jsonBody(req);
        const inv = store.createInvite(me);
        const email = b.email ? String(b.email) : "";
        if (email) {
          await sendMail({
            to: email,
            subject: `@${me.handle} invited your agent to agent-relay`,
            text: [
              `@${me.handle} wants your agents to talk.`,
              "",
              `1. Open ${publicUrl || "the hub"} or tell your agent: relay login ${email}`,
              `2. After login: relay accept ${inv.code}`,
              "",
              `Invite code: ${inv.code}`,
            ].join("\n"),
          });
        }
        send(res, 201, {
          ...inv,
          emailed: email || undefined,
          accept: `relay accept ${inv.code}`,
          hint: email
            ? `Emailed ${email}. They log in, then relay accept ${inv.code}.`
            : "Send this code to a friend. They log in on the same hub, then accept.",
          hub: publicUrl || undefined,
        });
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
        const unread = url.searchParams.get("unread") === "1";
        const after = url.searchParams.get("after");
        send(res, 200, {
          messages: store.inbox(me, {
            unread,
            after: after ? Number(after) : undefined,
          }),
        });
        return;
      }

      if (method === "GET" && p === "/v1/sync") {
        send(res, 200, store.sync(need()));
        return;
      }

      if (method === "POST" && p === "/v1/ping") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.ping(me, String(b.to ?? ""), String(b.note ?? "")));
        return;
      }

      if (method === "POST" && p === "/v1/messages") {
        const me = need();
        const b = await jsonBody(req);
        const body = String(b.body ?? "");
        const reply = b.reply_to ? String(b.reply_to) : undefined;
        const kind = b.kind ? String(b.kind) : "chat";
        if (b.room) {
          send(res, 201, store.sendRoom(me, String(b.room), body, kind, reply));
          return;
        }
        send(res, 201, store.sendDm(me, String(b.to ?? ""), body, kind, reply));
        return;
      }

      if (method === "POST" && p.startsWith("/v1/messages/") && p.endsWith("/ack")) {
        const me = need();
        const messageId = p.split("/")[3];
        send(res, 200, store.ack(me, messageId));
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

      if (method === "GET" && p === "/v1/plans") {
        const me = need();
        send(res, 200, { plans: store.listPlans(me, url.searchParams.get("target") ?? "") });
        return;
      }

      if (method === "POST" && p === "/v1/plans") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.createPlan(me, String(b.target ?? ""), String(b.title ?? ""), String(b.body ?? "")));
        return;
      }

      if (method === "PATCH" && p.startsWith("/v1/plans/")) {
        const me = need();
        const planId = p.split("/")[3];
        const b = await jsonBody(req);
        send(res, 200, store.updatePlan(me, planId, {
          title: b.title != null ? String(b.title) : undefined,
          body: b.body != null ? String(b.body) : undefined,
          status: b.status != null ? String(b.status) : undefined,
        }));
        return;
      }

      if (method === "GET" && p === "/v1/tokens") {
        send(res, 200, { tokens: store.listTokens(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/tokens") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.issueToken(me, String(b.name ?? "agent")));
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
        res.write(`data: ${JSON.stringify({ type: "hello", handle: me.handle, at: Date.now() })}\n\n`);
        const unsub = bus.subscribe(me.id, (ev) => {
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        });
        const ping = setInterval(() => {
          res.write(`: ping ${Date.now()}\n\n`);
        }, 15000);
        req.on("close", () => {
          unsub();
          clearInterval(ping);
        });
        return;
      }

      if (method === "POST" && p === "/v1/grants") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.setGrants(me, String(b.handle ?? ""), {
          caps: b.caps as string | string[] | undefined,
          level: b.level != null ? String(b.level) : undefined,
        }));
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

      if (method === "GET" && p === "/v1/reviews") {
        send(res, 200, { reviews: store.listReviews(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/reviews") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.offerReview(me, String(b.to ?? ""), {
          path: String(b.path ?? ""),
          title: b.title != null ? String(b.title) : undefined,
          body: String(b.body ?? ""),
          ask: b.ask != null ? String(b.ask) : undefined,
        }));
        return;
      }

      if (method === "GET" && p.startsWith("/v1/reviews/")) {
        send(res, 200, store.getReview(need(), p.split("/")[3]));
        return;
      }

      if (method === "POST" && p.match(/^\/v1\/reviews\/[^/]+\/verdict$/)) {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.verdictReview(me, p.split("/")[3], String(b.verdict ?? ""), String(b.comment ?? "")));
        return;
      }

      if (method === "GET" && p === "/v1/handoffs") {
        send(res, 200, { handoffs: store.listHandoffs(need()) });
        return;
      }

      if (method === "POST" && p === "/v1/handoffs") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.offerHandoff(me, String(b.to ?? ""), {
          title: String(b.title ?? ""),
          body: b.body != null ? String(b.body) : undefined,
          branch: b.branch != null ? String(b.branch) : undefined,
          pr: b.pr != null ? String(b.pr) : undefined,
          acceptance: b.acceptance != null ? String(b.acceptance) : undefined,
        }));
        return;
      }

      if (method === "POST" && p.startsWith("/v1/handoffs/")) {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.updateHandoff(me, p.split("/")[3], {
          status: b.status != null ? String(b.status) : undefined,
          note: b.note != null ? String(b.note) : undefined,
        }));
        return;
      }

      if (method === "POST" && p.match(/^\/v1\/rooms\/[^/]+\/github$/)) {
        const me = need();
        const b = await jsonBody(req);
        send(res, 200, store.setRoomGithub(me, p.split("/")[3], String(b.repo ?? "")));
        return;
      }

      if (method === "POST" && p === "/v1/github/pr") {
        const me = need();
        const b = await jsonBody(req);
        send(res, 201, store.pointPr(me, String(b.to ?? ""), String(b.pr ?? ""), String(b.ask ?? "")));
        return;
      }

      send(res, 404, { error: "Not found" });
    } catch (e) {
      if (e instanceof RelayError) {
        const extra = e.status === 401 ? { "www-authenticate": 'Bearer realm="agent-relay"' } : {};
        send(res, e.status, { error: e.message }, extra);
        return;
      }
      console.error(e);
      send(res, 500, { error: e instanceof Error ? e.message : "Server error" });
    }
  });

  return server;
}
