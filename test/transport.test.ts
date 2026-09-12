import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb } from "../src/db.ts";
import { createRelayServer } from "../src/http.ts";
import { dispatchMcp } from "../src/mcp-core.ts";
import { ApiError, RelayClient } from "../src/client.ts";
import { Store } from "../src/store.ts";

const ENV_KEYS = ["RELAY_DEV_OTP", "RELAY_MAILBOX_DIR", "RELAY_REQUIRE_EMAIL", "RELAY_RESEND_KEY", "RELAY_SEND_MAX"];

type Hub = {
  url: string;
  store: Store;
  dir: string;
  stop: () => Promise<void>;
};

async function boot(options: { publicUrl?: string; sendMax?: number } = {}): Promise<Hub> {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  const dir = mkdtempSync(join(tmpdir(), "relay-transport-"));
  process.env.RELAY_DEV_OTP = "1";
  process.env.RELAY_MAILBOX_DIR = join(dir, "mail");
  delete process.env.RELAY_REQUIRE_EMAIL;
  delete process.env.RELAY_RESEND_KEY;
  if (options.sendMax == null) delete process.env.RELAY_SEND_MAX;
  else process.env.RELAY_SEND_MAX = String(options.sendMax);

  const store = new Store(openDb(join(dir, "hub.db")));
  const server = createRelayServer(store, { publicUrl: options.publicUrl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    store,
    dir,
    async stop() {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      rmSync(dir, { recursive: true, force: true });
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}

async function login(url: string, email: string) {
  const anonymous = new RelayClient(url);
  const requested = await anonymous.request<{ email: string; dev_code: string }>("POST", "/v1/auth/request", { email });
  const verified = await anonymous.request<{ token: string; user: { handle: string } }>("POST", "/v1/auth/verify", {
    email: requested.email,
    code: requested.dev_code,
  });
  return { api: new RelayClient(url, verified.token), token: verified.token, handle: verified.user.handle };
}

async function mcp(url: string, body: unknown, token?: string, headers: Record<string, string> = {}) {
  const requestHeaders: Record<string, string> = { "content-type": "application/json", ...headers };
  if (token) requestHeaders.authorization = `Bearer ${token}`;
  const response = await fetch(`${url}/mcp`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, any> };
}

test("HTTP JSON bodies reject non-objects and oversized input", async () => {
  const hub = await boot();
  try {
    for (const body of ["null", "[]", "1", JSON.stringify("text")]) {
      const response = await fetch(`${hub.url}/v1/auth/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      assert.equal(response.status, 400, body);
    }

    const response = await fetch(`${hub.url}/v1/auth/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(256_001),
    });
    assert.equal(response.status, 413);
  } finally {
    await hub.stop();
  }
});

test("MCP validates requests and reports business failures as tool errors", async () => {
  const hub = await boot({ publicUrl: "https://configured.example" });
  try {
    const parseResponse = await fetch(`${hub.url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    assert.equal(parseResponse.status, 400);
    assert.equal(((await parseResponse.json()) as { error?: { code: number } }).error?.code, -32700);

    const scalarResponse = await mcp(hub.url, null);
    assert.equal(scalarResponse.status, 400);
    assert.equal(scalarResponse.json.error?.code, -32600);

    const malformed = await mcp(hub.url, { jsonrpc: "2.0", id: 1 });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json.error?.code, -32600);

    const unknown = await mcp(hub.url, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "relay_missing", arguments: {} },
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.json.error?.code, -32601);

    const missing = await mcp(hub.url, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "relay_send", arguments: {} },
    });
    assert.equal(missing.json.error?.code, -32602);

    const scalarArguments = await mcp(hub.url, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "relay_health", arguments: [] },
    });
    assert.equal(scalarArguments.json.error?.code, -32602);

    const signedIn = await login(hub.url, "business-error@test.dev");
    const business = await mcp(
      hub.url,
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "relay_ping", arguments: { to: "nobody" } },
      },
      signedIn.token,
    );
    assert.equal(business.status, 200);
    assert.equal(business.json.result?.isError, true);
    assert.match(String(business.json.result?.content?.[0]?.text), /No user|not connected/i);

    const health = await mcp(
      hub.url,
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "relay_health", arguments: {} } },
      undefined,
      { host: "attacker.example" },
    );
    const healthData = health.json.result?.structuredContent as { hub: string; mcp_url: string };
    assert.equal(healthData.hub, "https://configured.example");
    assert.equal(healthData.mcp_url, "https://configured.example/mcp");

    assert.equal(
      await dispatchMcp({ jsonrpc: "2.0", method: "tools/list" }, { hubUrl: hub.url }),
      null,
    );
  } finally {
    await hub.stop();
  }
});

test("REST and hosted MCP share the per-user send quota", async () => {
  const hub = await boot({ sendMax: 2 });
  try {
    const alice = await login(hub.url, "quota-alice@test.dev");
    const bob = await login(hub.url, "quota-bob@test.dev");
    const invite = await alice.api.request<{ code: string }>("POST", "/v1/invites", {});
    await bob.api.request("POST", "/v1/invites/accept", { code: invite.code });

    await alice.api.request("POST", "/v1/messages", { to: bob.handle, body: "REST one" });
    const viaMcp = await mcp(
      hub.url,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "relay_send", arguments: { to: bob.handle, body: "MCP two" } },
      },
      alice.token,
    );
    assert.equal(viaMcp.status, 200);
    assert.equal(viaMcp.json.result?.isError, undefined);

    await assert.rejects(
      () => alice.api.request("POST", "/v1/messages", { to: bob.handle, body: "REST three" }),
      (error: unknown) => error instanceof ApiError && error.status === 429,
    );
  } finally {
    await hub.stop();
  }
});

test("stdio MCP returns parse, request, and config errors without exiting", async () => {
  const dir = mkdtempSync(join(tmpdir(), "relay-mcp-stdio-"));
  const config = join(dir, "config.json");
  writeFileSync(config, "{ malformed config", "utf8");
  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/mcp.ts"], {
        cwd: process.cwd(),
        env: { ...process.env, RELAY_CONFIG: config },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
      child.once("error", reject);
      child.once("close", (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(
        [
          "not json",
          "null",
          JSON.stringify({ jsonrpc: "2.0", id: 1 }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
          JSON.stringify({ jsonrpc: "2.0", method: "tools/list" }),
        ].join("\n") + "\n",
      );
    });
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const responses = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { error?: { code: number; message: string } });
    assert.deepEqual(
      responses.map((response) => response.error?.code),
      [-32700, -32600, -32600, -32000],
    );
    assert.match(responses[3]!.error!.message, /Invalid Agent Relay config/);
    assert.doesNotMatch(responses[3]!.error!.message, /token|arl_/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
