import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RelayError, Store, type User } from "./store.ts";

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

function send(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  });
  res.end(body);
}

function pathOf(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://relay.local");
}

function bearer(req: IncomingMessage): string | undefined {
  return req.headers.authorization;
}

export function createRelayServer(store: Store, opts: { publicUrl?: string } = {}) {
  const publicUrl = opts.publicUrl ?? "";

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        send(res, 204, {});
        return;
      }
      const url = pathOf(req);
      const p = url.pathname.replace(/\/$/, "") || "/";
      const method = req.method ?? "GET";

      if (method === "GET" && p === "/health") {
        send(res, 200, { ok: true, name: "agent-relay" });
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
        const inv = store.createInvite(me);
        send(res, 201, {
          ...inv,
          accept: `relay accept ${inv.code}`,
          hint: "Send this code to a friend. They run the same hub URL, signup, then accept.",
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

      if (method === "POST" && p === "/v1/messages") {
        const me = need();
        const b = await jsonBody(req);
        const body = String(b.body ?? "");
        if (b.room) {
          send(res, 201, store.sendRoom(me, String(b.room), body));
          return;
        }
        send(res, 201, store.sendDm(me, String(b.to ?? ""), body));
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

      send(res, 404, { error: "Not found" });
    } catch (e) {
      if (e instanceof RelayError) {
        send(res, e.status, { error: e.message });
        return;
      }
      console.error(e);
      send(res, 500, { error: e instanceof Error ? e.message : "Server error" });
    }
  });

  return server;
}
