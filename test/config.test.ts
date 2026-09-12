import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HOSTED_HUB } from "../src/hosted.ts";
import { loadConfig, saveConfig } from "../src/config.ts";

const ENV_KEYS = ["RELAY_CONFIG", "RELAY_URL", "RELAY_TOKEN"] as const;
type ConfigEnv = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

function withConfigEnv<T>(values: ConfigEnv, action: () => T): T {
  const previous = new Map<string, string | undefined>(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return action();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function tempConfig() {
  const dir = mkdtempSync(join(tmpdir(), "agent-relay-config-"));
  return { dir, path: join(dir, "config.json") };
}

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

test("loadConfig applies RELAY_TOKEN even when the config file is absent", () => {
  const temp = tempConfig();
  try {
    const cfg = withConfigEnv(
      {
        RELAY_CONFIG: temp.path,
        RELAY_URL: "https://new.example.test",
        RELAY_TOKEN: "env-token-fixture",
      },
      loadConfig,
    );

    assert.deepEqual(cfg, {
      url: "https://new.example.test",
      token: "env-token-fixture",
    });
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("loadConfig uses the hosted fallback with RELAY_TOKEN when no file or URL is set", () => {
  const temp = tempConfig();
  try {
    const cfg = withConfigEnv(
      { RELAY_CONFIG: temp.path, RELAY_TOKEN: "env-token-fixture" },
      loadConfig,
    );
    assert.deepEqual(cfg, { url: HOSTED_HUB, token: "env-token-fixture" });
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("loadConfig drops a saved token when RELAY_URL selects another origin", () => {
  const temp = tempConfig();
  try {
    withConfigEnv({ RELAY_CONFIG: temp.path }, () =>
      saveConfig({
        url: "https://old.example.test",
        handle: "alice",
        token: "saved-token-fixture",
      }),
    );

    const cfg = withConfigEnv(
      { RELAY_CONFIG: temp.path, RELAY_URL: "https://new.example.test" },
      loadConfig,
    );
    assert.equal(cfg.url, "https://new.example.test");
    assert.equal(cfg.handle, "alice");
    assert.equal(cfg.token, undefined);
    assert.equal("token" in cfg, false);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("loadConfig keeps a saved token for the same normalized HTTP origin", () => {
  const temp = tempConfig();
  try {
    withConfigEnv({ RELAY_CONFIG: temp.path }, () =>
      saveConfig({
        url: "HTTPS://Example.TEST:443/old-path",
        token: "saved-token-fixture",
      }),
    );

    const cfg = withConfigEnv(
      { RELAY_CONFIG: temp.path, RELAY_URL: "https://example.test/new-path" },
      loadConfig,
    );
    assert.equal(cfg.url, "https://example.test/new-path");
    assert.equal(cfg.token, "saved-token-fixture");
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("loadConfig drops a saved token when the saved hub URL cannot be proven equivalent", () => {
  const temp = tempConfig();
  try {
    withConfigEnv({ RELAY_CONFIG: temp.path }, () =>
      saveConfig({ url: "not-a-hub-url", token: "saved-token-fixture" }),
    );

    const cfg = withConfigEnv(
      { RELAY_CONFIG: temp.path, RELAY_URL: "https://new.example.test" },
      loadConfig,
    );
    assert.equal(cfg.token, undefined);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("loadConfig reports malformed JSON without echoing config contents", () => {
  const temp = tempConfig();
  const fixtureSecret = "malformed-token-fixture";
  try {
    writeFileSync(
      temp.path,
      `{"url":"https://example.test","token":"${fixtureSecret}",`,
      "utf8",
    );

    assert.throws(
      () => withConfigEnv({ RELAY_CONFIG: temp.path }, loadConfig),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Invalid Agent Relay config/);
        assert.match(error.message, /valid JSON/);
        assert.match(error.message, new RegExp(temp.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.doesNotMatch(error.message, new RegExp(fixtureSecret));
        return true;
      },
    );
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("saveConfig creates a private directory and atomically writes a private file", () => {
  const temp = tempConfig();
  rmSync(temp.dir, { recursive: true, force: true });
  const parent = join(temp.dir, "new-parent");
  try {
    withConfigEnv({ RELAY_CONFIG: join(parent, "config.json") }, () =>
      saveConfig({ url: "https://example.test", token: "saved-token-fixture" }),
    );

    assert.equal(mode(parent), 0o700);
    assert.equal(mode(join(parent, "config.json")), 0o600);
    assert.deepEqual(readdirSync(parent), ["config.json"]);
    assert.match(readFileSync(join(parent, "config.json"), "utf8"), /saved-token-fixture/);
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});

test("saveConfig tightens an existing file without changing an existing parent directory", () => {
  const temp = tempConfig();
  const parent = join(temp.dir, "existing-parent");
  const path = join(parent, "config.json");
  try {
    mkdirSync(parent);
    writeFileSync(path, "old\n", { mode: 0o644 });
    chmodSync(parent, 0o755);
    chmodSync(path, 0o644);

    withConfigEnv({ RELAY_CONFIG: path }, () =>
      saveConfig({ url: "https://example.test", token: "saved-token-fixture" }),
    );

    assert.equal(mode(parent), 0o755);
    assert.equal(mode(path), 0o600);
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      url: "https://example.test",
      token: "saved-token-fixture",
    });
  } finally {
    rmSync(temp.dir, { recursive: true, force: true });
  }
});
