import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "../src/db.ts";
import { Store } from "../src/store.ts";
import { dispatchMessageWebhooks, signWebhook, validWebhookUrl } from "../src/webhook.ts";

test("webhook URLs must be https, public, and credential-free", () => {
  assert.equal(validWebhookUrl("https://example.com/hook"), "https://example.com/hook");
  assert.throws(() => validWebhookUrl("http://example.com/hook"), /must use https/);
  assert.throws(() => validWebhookUrl("https://127.0.0.1/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://localhost/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://user:pass@example.com/hook"), /credentials/);
  assert.throws(() => validWebhookUrl("not a url"), /valid URL/);
});

test("signWebhook is a stable HMAC of the body", () => {
  const a = signWebhook("whsec_test", '{"a":1}');
  assert.match(a, /^sha256=[0-9a-f]{64}$/);
  assert.equal(a, signWebhook("whsec_test", '{"a":1}'));
  assert.notEqual(a, signWebhook("whsec_other", '{"a":1}'));
});

test("a registered webhook receives a signed POST and keeps its secret", async () => {
  const dir = mkdtempSync(join(tmpdir(), "relay-webhook-"));
  const previous = process.env.RELAY_ALLOW_INSECURE_WEBHOOK;
  process.env.RELAY_ALLOW_INSECURE_WEBHOOK = "1";

  const received: { signature?: string; event?: string; body: string }[] = [];
  const http = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({
        signature: req.headers["x-agent-relay-signature"] as string | undefined,
        event: req.headers["x-agent-relay-event"] as string | undefined,
        body,
      });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as AddressInfo).port;

  try {
    const store = new Store(openDb(join(dir, "hub.db")));
    const alice = store.register("alice");
    const bob = store.register("bob");
    store.acceptInvite(bob.actor, store.createInvite(alice.actor).code);

    const first = store.setWebhook(bob.actor, `http://127.0.0.1:${port}/hook`);
    assert.match(first.secret, /^whsec_/);
    const second = store.setWebhook(bob.actor, `http://127.0.0.1:${port}/hook-two`);
    assert.equal(second.secret, first.secret);

    const message = store.send(alice.actor, { to: "bob", body: "wake up" });
    const hook = store.webhookFor(bob.user.id);
    assert.ok(hook);

    assert.deepEqual(await dispatchMessageWebhooks(store, [bob.user.id], message), [
      { userId: bob.user.id, status: 204 },
    ]);
    assert.equal(received.length, 1);
    assert.equal(received[0].event, "message");
    assert.equal(received[0].signature, signWebhook(hook.secret, received[0].body));
    assert.equal(JSON.parse(received[0].body).body, "wake up");

    // A recipient without a webhook is skipped, and clearing removes it.
    assert.deepEqual(await dispatchMessageWebhooks(store, [alice.user.id], message), []);
    store.clearWebhook(bob.actor);
    assert.equal(store.webhookFor(bob.user.id), undefined);
    assert.deepEqual(await dispatchMessageWebhooks(store, [bob.user.id], message), []);
  } finally {
    await new Promise<void>((resolve) => http.close(() => resolve()));
    if (previous === undefined) delete process.env.RELAY_ALLOW_INSECURE_WEBHOOK;
    else process.env.RELAY_ALLOW_INSECURE_WEBHOOK = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
