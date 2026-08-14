import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  const bus = new RelayBus();
  const store = new Store(openDb(join(dir, "hub.db")), (ids, ev) => bus.publish(ids, ev));
  const server = createRelayServer(store, { publicUrl: "http://127.0.0.1", bus });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
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
  return { api: new RelayClient(url, ver.token), token: ver.token, handle: ver.user.handle };
}

test("e2e: two agents login, grant, talk live over SSE, review, handoff, ping", async () => {
  const hub = await boot();
  try {
    const dash = await fetch(hub.url + "/");
    assert.equal(dash.ok, true);
    const html = await dash.text();
    assert.match(html, /agent-relay/);
    assert.match(html, /\/mcp/);

    const mcpHttp = await fetch(hub.url + "/mcp");
    assert.equal(mcpHttp.status, 405);

    const init = await fetch(hub.url + "/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } },
      }),
    });
    assert.equal(init.ok, true);
    assert.equal((await init.json() as { result: { serverInfo: { name: string } } }).result.serverInfo.name, "agent-relay");

    const health = await fetch(hub.url + "/health");
    assert.equal((await health.json() as { ok: boolean }).ok, true);

    const alice = await signup(hub.url, "alice@example.com");
    const bob = await signup(hub.url, "bob@example.com");

    const mcpWho = await fetch(hub.url + "/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${alice.token}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "relay_whoami", arguments: {} },
      }),
    });
    assert.equal(mcpWho.ok, true);
    const mcpWhoBody = await mcpWho.json() as { result: { content: { text: string }[] } };
    assert.match(mcpWhoBody.result.content[0].text, new RegExp(alice.handle));

    const events: unknown[] = [];
    const stream = await fetch(hub.url + "/v1/stream", {
      headers: { authorization: `Bearer ${bob.token}` },
    });
    assert.equal(stream.ok, true);
    const reader = stream.body!.getReader();
    const dec = new TextDecoder();
    const collect = (async () => {
      let buf = "";
      while (events.length < 3) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.split("\n").find((l) => l.startsWith("data: "));
          if (line) events.push(JSON.parse(line.slice(6)));
        }
      }
    })();

    const inv = await alice.api.request<{ code: string }>("POST", "/v1/invites", {});
    await bob.api.request("POST", "/v1/invites/accept", { code: inv.code });

    await alice.api.request("POST", "/v1/grants", { handle: bob.handle, level: "cofounder" });
    await bob.api.request("POST", "/v1/grants", { handle: alice.handle, level: "cofounder" });

    await alice.api.request("POST", "/v1/card", { card: "backend, tests, no merge" });
    await alice.api.request("POST", "/v1/status", { status: "working", detail: "webhooks" });

    const sent = await alice.api.request<{ id: string }>("POST", "/v1/messages", {
      to: bob.handle,
      body: "please own src/webhooks.ts",
    });
    const threaded = await bob.api.request<{ reply_to: string | null }>("POST", "/v1/messages", {
      to: alice.handle,
      body: "on it",
      reply_to: sent.id,
    });
    assert.equal(threaded.reply_to, sent.id);

    const board = await bob.api.request<{
      unread: { body: string }[];
      people: { handle: string; they_allow_you: string[] }[];
    }>("GET", "/v1/sync");
    assert.equal(board.unread.some((m) => m.body.includes("webhooks")), true);
    const alicePeer = board.people.find((p) => p.handle === alice.handle);
    assert.ok(alicePeer?.they_allow_you.includes("review"));

    const rev = await alice.api.request<{ id: string }>("POST", "/v1/reviews", {
      to: bob.handle,
      path: "src/webhooks.ts",
      body: "export function handle() { return 1 }\n",
      ask: "ok?",
    });
    const shown = await bob.api.request<{ body: string }>("GET", `/v1/reviews/${rev.id}`);
    assert.match(shown.body, /handle/);
    await bob.api.request("POST", `/v1/reviews/${rev.id}/verdict`, { verdict: "lgtm", comment: "ship" });

    const hd = await alice.api.request<{ id: string }>("POST", "/v1/handoffs", {
      to: bob.handle,
      title: "Implement webhooks",
      branch: "feat/hooks",
      acceptance: "tests pass",
    });
    await bob.api.request("POST", `/v1/handoffs/${hd.id}`, { status: "accepted" });
    await bob.api.request("POST", `/v1/handoffs/${hd.id}`, { status: "done", note: "PR 9" });

    const room = await alice.api.request<{ slug: string }>("POST", "/v1/rooms", { title: "Launch" });
    await alice.api.request("POST", `/v1/rooms/${room.slug}/members`, { handle: bob.handle });
    const bound = await alice.api.request<{ github_repo: string }>("POST", `/v1/rooms/${room.slug}/github`, {
      repo: "acme/app",
    });
    assert.equal(bound.github_repo, "acme/app");
    await alice.api.request("POST", "/v1/github/pr", { to: bob.handle, pr: "9", ask: "review auth" });

    await alice.api.request("POST", "/v1/ping", { to: bob.handle, note: "sync please" });
    await alice.api.request("POST", "/v1/memory", { target: bob.handle, key: "api.webhooks", value: "POST /stripe" });
    const mem = await bob.api.request<{ items: { value: string }[] }>(
      "GET",
      `/v1/memory?target=${alice.handle}&key=api.webhooks`,
    );
    assert.equal(mem.items[0].value, "POST /stripe");

    await Promise.race([collect, new Promise((r) => setTimeout(r, 2000))]);
    await reader.cancel().catch(() => {});
    assert.equal(
      events.some((e) => (e as { type?: string }).type === "hello" || (e as { type?: string }).type === "message"),
      true,
      `expected SSE events, got ${JSON.stringify(events)}`,
    );
  } finally {
    await hub.stop();
  }
});

test("e2e: MCP stdio initialize, tools/list, whoami", async () => {
  const hub = await boot();
  try {
    const alice = await signup(hub.url, "mcp-user@example.com");
    const dir = mkdtempSync(join(tmpdir(), "relay-mcp-"));
    const cfg = join(dir, "config.json");
    writeFileSync(cfg, JSON.stringify({ url: hub.url, token: alice.token, handle: alice.handle }));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", join(process.cwd(), "src/mcp.ts")],
      {
        env: { ...process.env, RELAY_CONFIG: cfg, RELAY_URL: hub.url, RELAY_TOKEN: alice.token },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const lines: string[] = [];
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) if (line.trim()) lines.push(line);
    });
    const waitLine = async () => {
      const start = Date.now();
      while (Date.now() - start < 4000) {
        if (lines.length) return lines.shift()!;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error("MCP timed out");
    };
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } } }) + "\n",
    );
    const init = JSON.parse(await waitLine());
    assert.equal(init.result.serverInfo.name, "agent-relay");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    const listed = JSON.parse(await waitLine());
    const names = listed.result.tools.map((t: { name: string }) => t.name);
    assert.ok(names.includes("relay_sync"));
    assert.ok(names.includes("relay_ping"));
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "relay_sync", arguments: {} } }) + "\n",
    );
    const called = JSON.parse(await waitLine());
    assert.match(called.result.content[0].text, /how/);
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  } finally {
    await hub.stop();
  }
});
