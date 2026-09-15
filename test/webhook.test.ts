import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type ClientRequest, type IncomingMessage } from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import type { RequestOptions as HttpsRequestOptions } from "node:https";
import { openDb } from "../src/db.ts";
import { Store } from "../src/store.ts";
import { dispatchMessageWebhooks, postWebhook, signWebhook, validWebhookUrl } from "../src/webhook.ts";

test("webhook URLs must be https, public, and credential-free", () => {
  assert.equal(validWebhookUrl("https://example.com/hook"), "https://example.com/hook");
  assert.throws(() => validWebhookUrl("http://example.com/hook"), /must use https/);
  assert.throws(() => validWebhookUrl("https://127.0.0.1/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://localhost/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://[::ffff:127.0.0.1]/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://[fc00::1]/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://[2001:db8::1]/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://240.0.0.1/hook"), /private address/);
  assert.throws(() => validWebhookUrl("https://user:pass@example.com/hook"), /credentials/);
  assert.throws(() => validWebhookUrl("not a url"), /valid URL/);
});

test("signWebhook is a stable HMAC of the body", () => {
  const a = signWebhook("whsec_test", '{"a":1}');
  assert.match(a, /^sha256=[0-9a-f]{64}$/);
  assert.equal(a, signWebhook("whsec_test", '{"a":1}'));
  assert.notEqual(a, signWebhook("whsec_other", '{"a":1}'));
});

test("postWebhook rejects a private address in any DNS answer before opening a request", async () => {
  let requestCalls = 0;
  await assert.rejects(
    postWebhook(
      { url: "https://hooks.example.test/hook", secret: "whsec_test" },
      { body: "hello" },
      {
        lookupImpl: (_hostname, _options, callback) =>
          callback(null, [
            { address: "93.184.216.34", family: 4 },
            { address: "169.254.169.254", family: 4 },
          ]),
        requestImpl: () => {
          requestCalls += 1;
          throw new Error("request must not start");
        },
      },
    ),
    /private or reserved address/,
  );
  assert.equal(requestCalls, 0);
});

test("postWebhook pins the vetted DNS answer and honors scalar and all lookup callbacks", async () => {
  let resolverCalls = 0;
  let sentBody = "";
  let captured: HttpsRequestOptions | undefined;

  class FakeRequest extends EventEmitter {
    end(body?: string | Uint8Array) {
      sentBody = typeof body === "string" ? body : Buffer.from(body ?? []).toString();
      return this;
    }
  }

  const payload = { body: "hello" };
  const secret = "whsec_test";
  const status = await postWebhook(
    { url: "https://hooks.example.test/hook?x=1", secret },
    payload,
    {
      lookupImpl: (_hostname, _options, callback) => {
        resolverCalls += 1;
        callback(null, [
          { address: resolverCalls === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 },
        ]);
      },
      requestImpl: (options, callback) => {
        captured = options;
        const request = new FakeRequest();
        queueMicrotask(() => {
          const response = new PassThrough() as PassThrough & { statusCode?: number };
          response.statusCode = 202;
          callback(response as unknown as IncomingMessage);
          response.end("discarded response body");
        });
        return request as unknown as ClientRequest;
      },
    },
  );

  assert.equal(status, 202);
  assert.equal(resolverCalls, 1);
  assert.equal(sentBody, JSON.stringify(payload));
  assert.equal(captured?.agent, false);
  assert.equal(captured?.servername, "hooks.example.test");
  assert.equal(captured?.path, "/hook?x=1");
  assert.equal(captured?.headers?.["x-agent-relay-signature"], signWebhook(secret, sentBody));
  assert.ok(captured?.lookup);

  await new Promise<void>((resolve, reject) => {
    captured!.lookup!("hooks.example.test", { all: false }, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }
      assert.equal(address, "93.184.216.34");
      assert.equal(family, 4);
      resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    captured!.lookup!("hooks.example.test", { all: true }, (error, address) => {
      if (error) {
        reject(error);
        return;
      }
      assert.deepEqual(address, [{ address: "93.184.216.34", family: 4 }]);
      resolve();
    });
  });
});

test("postWebhook applies one finite deadline while DNS is unresolved", async () => {
  const started = Date.now();
  let requestCalls = 0;
  await assert.rejects(
    postWebhook(
      { url: "https://hooks.example.test/hook", secret: "whsec_test" },
      { body: "hello" },
      {
        timeoutMs: 20,
        lookupImpl: (_hostname, _options, callback) => {
          setTimeout(() => callback(null, [{ address: "93.184.216.34", family: 4 }]), 50);
        },
        requestImpl: () => {
          requestCalls += 1;
          throw new Error("request must not start after the deadline");
        },
      },
    ),
    /timed out/,
  );
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(requestCalls, 0);
  assert.ok(Date.now() - started < 500);
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
