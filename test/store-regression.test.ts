import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "../src/db.ts";
import { Store } from "../src/store.ts";

function withStore(fn: (store: Store) => void) {
  const dir = mkdtempSync(join(tmpdir(), "relay-store-regression-"));
  try {
    fn(new Store(openDb(join(dir, "hub.db"))));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function connected(store: Store) {
  const alice = store.register("alice");
  const bob = store.register("bob");
  store.acceptInvite(bob.actor, store.createInvite(alice.actor).code);
  return { alice, bob };
}

test("failed agent reply leaves the incoming delivery pending", () => {
  withStore((store) => {
    const { alice, bob } = connected(store);
    const message = store.send(alice.actor, { to: "bob", body: "please review" });

    assert.throws(() => store.decide(bob.actor, message.id, { action: "reply" }), /reply action needs/);
    assert.equal(store.inbox(bob.actor, { pending: true }).some((item) => item.id === message.id), true);
  });
});

test("dismiss records a dismissed delivery", () => {
  withStore((store) => {
    const { alice, bob } = connected(store);
    const message = store.send(alice.actor, { to: "bob", body: "ignore this" });

    store.decide(bob.actor, message.id, { action: "dismiss" });
    const dismissed = store.inbox(bob.actor, { pending: false }).find((item) => item.id === message.id);
    assert.equal(dismissed?.triage, "dismissed");
  });
});

test("failed human reply leaves the escalation open", () => {
  withStore((store) => {
    const { alice, bob } = connected(store);
    const message = store.send(alice.actor, { to: "bob", body: "needs approval" });
    store.decide(bob.actor, message.id, { action: "escalate", reason: "approval" });

    assert.throws(
      () => store.resolveHuman(bob.actor, message.id, { reply: "x".repeat(20_001) }),
      /Message too long/,
    );
    assert.equal(store.humanInbox(bob.actor).some((item) => item.message_id === message.id), true);
  });
});

test("human resolution is single-use and does not duplicate a reply", () => {
  withStore((store) => {
    const { alice, bob } = connected(store);
    const message = store.send(alice.actor, { to: "bob", body: "needs approval" });
    store.decide(bob.actor, message.id, { action: "escalate" });

    store.resolveHuman(bob.actor, message.id, { reply: "approved" });
    assert.throws(() => store.resolveHuman(bob.actor, message.id, { reply: "approved again" }), /No open escalation/);
    const replies = store.thread(alice.actor, message.thread_id).filter((item) => item.reply_to === message.id);
    assert.equal(replies.length, 1);
  });
});

test("room memory still requires a pair grant for every other member", () => {
  withStore((store) => {
    const { alice, bob } = connected(store);
    const room = store.createRoom(alice.actor, "pair room", ["bob"]);

    assert.throws(
      () => store.remember(bob.actor, `#${room.slug}`, "decision", "private"),
      /has not granted you 'memory'/,
    );
    store.setGrants(alice.actor, "bob", { level: "pair" });
    store.setGrants(bob.actor, "alice", { level: "pair" });
    const saved = store.remember(bob.actor, `#${room.slug}`, "decision", "shared");
    assert.equal(saved.value, "shared");
  });
});

test("first email login leaves only the returned PAT active", () => {
  withStore((store) => {
    const login = store.createLoginCode("new@example.com");
    const result = store.verifyLogin(login.email, login.code);
    const actor = store.auth(result.token);

    assert.equal(store.listTokens(actor).length, 1);
  });
});
