import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { RelayBus } from "../src/bus.ts";
import { RelayClient } from "../src/client.ts";
import { createRelayServer } from "../src/http.ts";
import { openDb } from "../src/db.ts";
import { Store } from "../src/store.ts";

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "relay-e2e-"));
  process.env.RELAY_MAILBOX_DIR = join(dir, "mail");
  process.env.RELAY_DEV_OTP = "1";
  delete process.env.RELAY_RESEND_KEY;
  delete process.env.RELAY_REQUIRE_EMAIL;
  const bus = new RelayBus();
  const store = new Store(openDb(join(dir, "hub.db")), (ids, ev) => bus.publish(ids, ev));
  const server = createRelayServer(store, { publicUrl: "http://127.0.0.1", bus });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    dir,
    async stop() {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
      rmSync(dir, { recursive: true, force: true });
      delete process.env.RELAY_DEV_OTP;
      delete process.env.RELAY_MAILBOX_DIR;
    },
  };
}

async function signup(url: string, email: string) {
  const api = new RelayClient(url);
  const req = await api.request<{ dev_code: string; email: string }>("POST", "/v1/auth/request", { email });
  const ver = await api.request<{ token: string; user: { handle: string } }>("POST", "/v1/auth/verify", {
    email: req.email,
    code: req.dev_code,
  });
  return { api: new RelayClient(url, ver.token), handle: ver.user.handle };
}

test("e2e: two agents login, talk, human stays dark until escalate, then human reply", async () => {
  const hub = await boot();
  try {
    const root = await fetch(hub.url + "/");
    assert.equal(root.ok, true);
    const alice = await signup(hub.url, "alice@test.dev");
    const bob = await signup(hub.url, "bob@test.dev");
    const inv = await alice.api.request<{ code: string }>("POST", "/v1/invites", {});
    await bob.api.request("POST", "/v1/invites/accept", { code: inv.code });

    const sent = await alice.api.request<{ id: string }>("POST", "/v1/messages", {
      to: bob.handle,
      body: "take the webhook",
    });
    const inbox = await bob.api.request<{ messages: { id: string }[] }>("GET", "/v1/inbox");
    assert.equal(inbox.messages.some((m) => m.id === sent.id), true);
    const quiet = await bob.api.request<{ items: unknown[] }>("GET", "/v1/human/inbox");
    assert.equal(quiet.items.length, 0);

    await bob.api.request("POST", `/v1/messages/${sent.id}/decide`, {
      action: "escalate",
      reason: "needs a product call",
    });
    const human = await bob.api.request<{ items: { message_id: string }[] }>("GET", "/v1/human/inbox");
    assert.equal(human.items[0].message_id, sent.id);

    const resolved = await bob.api.request<{ reply: { from_role: string } }>(
      "POST",
      `/v1/messages/${sent.id}/resolve`,
      { reply: "yes, ship it" },
    );
    assert.equal(resolved.reply.from_role, "human");

    const mcp = await fetch(hub.url + "/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${alice.api.token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const mcpJson = (await mcp.json()) as { result: { tools: { name: string }[] } };
    assert.equal(mcpJson.result.tools.some((t) => t.name === "relay_human_inbox"), true);
    assert.equal(mcpJson.result.tools.some((t) => t.name === "relay_health"), true);

    const room = await alice.api.request<{ slug: string; members: string[] }>("POST", "/v1/rooms", {
      title: "webhook room",
      members: [bob.handle],
    });
    assert.equal(room.members.includes(bob.handle), true);
    await alice.api.request("POST", "/v1/messages", { room: room.slug, body: "room ping" });
    const bobInbox = await bob.api.request<{ messages: { body: string; intent: string }[] }>("GET", "/v1/inbox");
    assert.equal(bobInbox.messages.some((m) => m.body.includes("room ping")), true);

    const ping = await alice.api.request<{ intent: string }>("POST", "/v1/ping", { to: bob.handle, note: "sync" });
    assert.equal(ping.intent, "ping");

    const stream = await fetch(hub.url + "/v1/stream", {
      headers: { authorization: `Bearer ${bob.api.token}` },
    });
    assert.equal(stream.ok, true);
    assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = stream.body.getReader();
    const first = await reader.read();
    const chunk = new TextDecoder().decode(first.value);
    assert.match(chunk, /"type":"hello"/);
    await reader.cancel();
  } finally {
    await hub.stop();
  }
});
