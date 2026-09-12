import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { ApiError, RelayClient, RelayClientError } from "../src/client.ts";

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (url: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("timeouts cover response bodies and writes are sent only once", async () => {
  const originalFetch = globalThis.fetch;
  const token = "client-secret";
  let calls = 0;
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      controller.enqueue(new TextEncoder().encode('{"ok":'));
    },
  });

  globalThis.fetch = (async (_input, init) => {
    calls += 1;
    init?.signal?.addEventListener(
      "abort",
      () => streamController?.error(new Error("response body aborted")),
      { once: true },
    );
    return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => new RelayClient("http://relay.test", token, { timeoutMs: 20 }).request("POST", "/v1/messages", { body: "hello" }),
      (error: unknown) =>
        error instanceof RelayClientError &&
        error.code === "timeout" &&
        /timed out/i.test(error.message) &&
        !error.message.includes(token),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects malformed or non-JSON successful responses without exposing auth", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html>client-secret</html>");
  }, async (url) => {
    const token = "client-secret";
    await assert.rejects(
      () => new RelayClient(url, token).request("GET", "/health"),
      (error: unknown) =>
        error instanceof RelayClientError &&
        error.code === "invalid_response" &&
        /JSON/i.test(error.message) &&
        !error.message.includes(token),
    );
  });
});

test("accepts JSON and preserves API failure status while redacting the token", async () => {
  await withServer((_req, res) => {
    if (_req.url === "/ok") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid token client-secret" }));
  }, async (url) => {
    const token = "client-secret";
    const client = new RelayClient(url, token);
    assert.deepEqual(await client.request<{ ok: boolean }>("GET", "/ok"), { ok: true });
    await assert.rejects(
      () => client.request("GET", "/failure"),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 401 &&
        /invalid token/i.test(error.message) &&
        !error.message.includes(token),
    );
  });
});

test("allows empty successful responses", async () => {
  await withServer((_req, res) => {
    res.writeHead(204, { "content-type": "text/html" });
    res.end();
  }, async (url) => {
    assert.deepEqual(await new RelayClient(url).request("POST", "/empty"), {});
  });
});

test("network failures are actionable and do not expose auth", async () => {
  const server = createServer((_req, res) => res.end());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));

  const token = "client-secret";
  await assert.rejects(
    () => new RelayClient(`http://127.0.0.1:${port}`, token).request("GET", "/health"),
    (error: unknown) =>
      error instanceof RelayClientError &&
      error.code === "network" &&
      /hub URL|network connection/i.test(error.message) &&
      !error.message.includes(token),
  );
});
