import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "../src/db.ts";
import { createRelayServer } from "../src/http.ts";
import { RelayClient } from "../src/client.ts";
import { Store } from "../src/store.ts";

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), "relay-"));
  return { dir, db: join(dir, "hub.db") };
}

test("two people connect, chat, share memory, and plan", () => {
  const { dir, db } = tmpDb();
  try {
    const store = new Store(openDb(db));
    const alice = store.register("alice", "Alice");
    const bob = store.register("bob", "Bob");
    const inv = store.createInvite(alice.user);
    const accepted = store.acceptInvite(bob.user, inv.code);
    assert.equal(accepted.contact.handle, "alice");
    assert.equal(store.people(alice.user).map((p) => p.handle).join(), "bob");

    store.sendDm(alice.user, "bob", "Can your agent own the webhook handler?");
    const inbox = store.inbox(bob.user, { unread: true });
    assert.equal(inbox.some((m) => m.body.includes("webhook")), true);

    store.remember(alice.user, "bob", "api.webhooks", "POST /stripe/webhook");
    const mem = store.recall(bob.user, "alice", "api.webhooks");
    assert.equal(mem[0].value, "POST /stripe/webhook");

    const plan = store.createPlan(alice.user, "bob", "Ship webhooks", "Alice: types. Bob: handler.");
    const listed = store.listPlans(bob.user, "alice");
    assert.equal(listed[0].id, plan.id);
    store.updatePlan(bob.user, plan.id, { status: "done" });
    assert.equal(store.listPlans(alice.user, "bob")[0].status, "done");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("HTTP: invite, room, and inbox across two tokens", async () => {
  const { dir, db } = tmpDb();
  const store = new Store(openDb(db));
  const server = createRelayServer(store);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}`;
  try {
    const a = new RelayClient(url);
    const alice = await a.request<{ user: { handle: string }; token: string }>("POST", "/v1/register", {
      handle: "alice",
    });
    const bobReg = await new RelayClient(url).request<{ user: { handle: string }; token: string }>(
      "POST",
      "/v1/register",
      { handle: "bob" },
    );
    const aliceApi = new RelayClient(url, alice.token);
    const bobApi = new RelayClient(url, bobReg.token);
    const inv = await aliceApi.request<{ code: string }>("POST", "/v1/invites", {});
    await bobApi.request("POST", "/v1/invites/accept", { code: inv.code });
    await aliceApi.request("POST", "/v1/messages", { to: "bob", body: "hi from alice's agent" });
    const inbox = await bobApi.request<{ messages: { body: string }[] }>("GET", "/v1/inbox?unread=1");
    assert.match(inbox.messages.at(-1)?.body ?? "", /hi from alice/);
    const room = await aliceApi.request<{ slug: string }>("POST", "/v1/rooms", { title: "Launch" });
    await aliceApi.request("POST", `/v1/rooms/${room.slug}/members`, { handle: "bob" });
    await bobApi.request("POST", "/v1/messages", { room: room.slug, body: "in the room" });
    const rooms = await bobApi.request<{ rooms: { slug: string }[] }>("GET", "/v1/rooms");
    assert.equal(rooms.rooms.some((r) => r.slug === room.slug), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("strangers cannot DM until they accept an invite", () => {
  const { dir, db } = tmpDb();
  try {
    const store = new Store(openDb(db));
    const alice = store.register("alice");
    const eve = store.register("eve");
    assert.throws(() => store.sendDm(alice.user, "eve", "nope"), /not connected/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
