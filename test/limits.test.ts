import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AddressInfo } from "node:net";
import { test } from "node:test";
import { openDb } from "../src/db.ts";
import { createRelayServer } from "../src/http.ts";
import { Store } from "../src/store.ts";

test("rate-limited responses carry Retry-After", async () => {
  const dir = mkdtempSync(join(tmpdir(), "relay-limits-"));
  const previousMailbox = process.env.RELAY_MAILBOX_DIR;
  process.env.RELAY_MAILBOX_DIR = join(dir, "mail");
  const store = new Store(openDb(join(dir, "hub.db")));
  const server = createRelayServer(store, { publicUrl: "http://127.0.0.1" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const body = JSON.stringify({ email: "rate@example.com" });
    const headers = { "content-type": "application/json" };
    const first = await fetch(`${base}/v1/auth/request`, { method: "POST", headers, body });
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/v1/auth/request`, { method: "POST", headers, body });
    assert.equal(second.status, 429);
    assert.equal(second.headers.get("retry-after"), "600");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousMailbox === undefined) delete process.env.RELAY_MAILBOX_DIR;
    else process.env.RELAY_MAILBOX_DIR = previousMailbox;
    rmSync(dir, { recursive: true, force: true });
  }
});
