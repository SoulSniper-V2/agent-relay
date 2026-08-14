#!/usr/bin/env node
import { RelayClient } from "./client.ts";
import { loadConfig, saveConfig } from "./config.ts";

function out(data: unknown) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(msg + "\n");
  process.exit(1);
}

function client() {
  const cfg = loadConfig();
  return { cfg, api: new RelayClient(cfg.url, cfg.token) };
}

function authed() {
  const c = client();
  if (!c.cfg.token) fail("Not signed in. Run: relay signup <handle>");
  return c;
}

function rest(argv: string[]) {
  return argv;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    process.stdout.write(`agent-relay — your agent talks to another person's agent

Setup
  relay serve [--port=8787]     Start the shared hub (one per friend group)
  relay signup <handle>         Create your identity on the hub
  relay whoami                  You + people + unread

People
  relay invite                  Mint a code to text a friend
  relay accept <code>           Connect to whoever invited you
  relay people                  Who you can talk to

Talk
  relay send <handle> <text>    DM a person's agent
  relay send #room <text>       Message a project room
  relay inbox [--unread] [--wait=sec]
  relay ack <message-id>

Rooms
  relay room create <title>
  relay room add <slug> <handle>
  relay rooms

Shared memory (both agents can read/write)
  relay remember <handle|#room> <key> <value>
  relay recall <handle|#room> [key]

Joint plans
  relay plan create <handle|#room> <title> [--body ...]
  relay plan list <handle|#room>
  relay plan update <id> [--title] [--body] [--status=active|paused|done]

Other
  relay mcp                     Run as an MCP stdio server
  relay help

Env: RELAY_URL  RELAY_TOKEN  RELAY_CONFIG  RELAY_PORT  RELAY_DB
`);
    return;
  }

  try {
    if (cmd === "serve") {
      const port = flag(argv, "port");
      const db = flag(argv, "db");
      if (port) process.env.RELAY_PORT = port;
      if (db) process.env.RELAY_DB = db;
      await import("./serve.ts");
      return;
    }

    if (cmd === "mcp") {
      await import("./mcp.ts");
      return;
    }

    if (cmd === "signup") {
      const handle = argv[1];
      if (!handle) fail("Usage: relay signup <handle>");
      const name = flag(argv, "name") ?? handle;
      const { cfg, api } = client();
      const res = await api.request<{ user: { handle: string; name: string }; token: string }>(
        "POST",
        "/v1/register",
        { handle, name },
      );
      saveConfig({ url: cfg.url, handle: res.user.handle, token: res.token });
      out({ ok: true, handle: res.user.handle, hub: cfg.url, saved: "credentials in RELAY_CONFIG" });
      return;
    }

    if (cmd === "whoami") {
      const { api } = authed();
      out(await api.request("GET", "/v1/me"));
      return;
    }

    if (cmd === "invite") {
      const { api } = authed();
      out(await api.request("POST", "/v1/invites", {}));
      return;
    }

    if (cmd === "accept") {
      const code = argv[1];
      if (!code) fail("Usage: relay accept <code>");
      const { api } = authed();
      out(await api.request("POST", "/v1/invites/accept", { code }));
      return;
    }

    if (cmd === "people") {
      const { api } = authed();
      out(await api.request("GET", "/v1/people"));
      return;
    }

    if (cmd === "send") {
      const target = argv[1];
      const text = argv.slice(2).join(" ").replace(/^--body=/, "");
      if (!target || !text) fail("Usage: relay send <handle|#room-slug> <message>");
      const { api } = authed();
      if (target.startsWith("#")) {
        out(await api.request("POST", "/v1/messages", { room: target.slice(1), body: text }));
      } else {
        out(await api.request("POST", "/v1/messages", { to: target.replace(/^@/, ""), body: text }));
      }
      return;
    }

    if (cmd === "inbox") {
      const unread = argv.includes("--unread");
      const wait = Number(flag(argv, "wait") ?? 0);
      const { api } = authed();
      const path = `/v1/inbox${unread ? "?unread=1" : ""}`;
      const start = Date.now();
      while (true) {
        const data = await api.request<{ messages: unknown[] }>("GET", path);
        if (data.messages.length || wait <= 0 || Date.now() - start >= wait * 1000) {
          out(data);
          return;
        }
        await sleep(1500);
      }
    }

    if (cmd === "ack") {
      const id = argv[1];
      if (!id) fail("Usage: relay ack <message-id>");
      const { api } = authed();
      out(await api.request("POST", `/v1/messages/${id}/ack`));
      return;
    }

    if (cmd === "rooms") {
      const { api } = authed();
      out(await api.request("GET", "/v1/rooms"));
      return;
    }

    if (cmd === "room") {
      const sub = argv[1];
      const { api } = authed();
      if (sub === "create") {
        const title = rest(argv.slice(2)).join(" ");
        if (!title) fail("Usage: relay room create <title>");
        out(await api.request("POST", "/v1/rooms", { title }));
        return;
      }
      if (sub === "add") {
        const slug = argv[2]?.replace(/^#/, "");
        const handle = argv[3];
        if (!slug || !handle) fail("Usage: relay room add <slug> <handle>");
        out(await api.request("POST", `/v1/rooms/${slug}/members`, { handle }));
        return;
      }
      fail("Usage: relay room create <title> | relay room add <slug> <handle>");
    }

    if (cmd === "remember") {
      const target = argv[1]?.replace(/^#/, "");
      const key = argv[2];
      const value = argv.slice(3).join(" ");
      if (!target || !key || !value) fail("Usage: relay remember <handle|room> <key> <value>");
      const { api } = authed();
      out(await api.request("POST", "/v1/memory", { target, key, value }));
      return;
    }

    if (cmd === "recall") {
      const target = argv[1]?.replace(/^#/, "");
      const key = argv[2];
      if (!target) fail("Usage: relay recall <handle|room> [key]");
      const { api } = authed();
      const q = new URLSearchParams({ target });
      if (key) q.set("key", key);
      out(await api.request("GET", `/v1/memory?${q}`));
      return;
    }

    if (cmd === "plan") {
      const sub = argv[1];
      const { api } = authed();
      if (sub === "create") {
        const target = argv[2]?.replace(/^#/, "");
        const titleParts = argv.slice(3);
        const bodyIdx = titleParts.findIndex((a) => a.startsWith("--body"));
        let body = "";
        let titleBits = titleParts;
        if (bodyIdx >= 0) {
          titleBits = titleParts.slice(0, bodyIdx);
          const b = titleParts[bodyIdx];
          body = b.includes("=") ? b.slice(b.indexOf("=") + 1) : titleParts.slice(bodyIdx + 1).join(" ");
        }
        const title = titleBits.join(" ");
        if (!target || !title) fail("Usage: relay plan create <handle|room> <title> [--body text]");
        out(await api.request("POST", "/v1/plans", { target, title, body }));
        return;
      }
      if (sub === "list") {
        const target = argv[2]?.replace(/^#/, "");
        if (!target) fail("Usage: relay plan list <handle|room>");
        out(await api.request("GET", `/v1/plans?target=${encodeURIComponent(target)}`));
        return;
      }
      if (sub === "update") {
        const id = argv[2];
        if (!id) fail("Usage: relay plan update <id> [--title] [--body] [--status]");
        out(
          await api.request("PATCH", `/v1/plans/${id}`, {
            title: flag(argv, "title"),
            body: flag(argv, "body"),
            status: flag(argv, "status"),
          }),
        );
        return;
      }
      fail("Usage: relay plan create|list|update");
    }

    fail(`Unknown command: ${cmd}. Try relay help`);
  } catch (e) {
    fail(e);
  }
}

function flag(argv: string[], name: string): string | undefined {
  const p = argv.find((a) => a.startsWith(`--${name}=`));
  if (p) return p.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return undefined;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

await main();
