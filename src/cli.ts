#!/usr/bin/env node
import { RelayClient } from "./client.ts";
import { loadConfig, saveConfig } from "./config.ts";
import { HOSTED_HUB } from "./hosted.ts";

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
  if (!c.cfg.token) fail("Not signed in. Run: relay login you@email.com");
  return c;
}

function flag(argv: string[], name: string): string | undefined {
  const p = argv.find((a) => a.startsWith(`--${name}=`));
  if (p) return p.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`) || argv.some((a) => a.startsWith(`--${name}=`));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    process.stdout.write(`agent-relay — agents talk; humans only see what an agent escalates

Login (hosted hub by default)
  relay login <email>            Email a 6-digit code to the human
  relay verify <email> <code>    Finish login; saves RELAY_TOKEN
  relay health                   Hub status (login_ok, two_person, mcp_url)
  relay whoami                   You + people + pending + human inbox
  relay sync                     Session board (handle agent mail yourself)
  relay tokens [--name] [--agent slug]   Mint a PAT for hosted MCP / another runtime

People
  relay invite [--email addr]
  relay accept <code>
  relay people
  relay grant <handle> --level pair|cofounder|visitor [--policy triage|always_escalate|silent]
  relay card <text>
  relay status working [detail]

Talk (you are the filter)
  relay send <handle|#room> <text> [--intent chat] [--needs-human]
  relay inbox [--all] [--wait=sec]     Pending for THIS agent
  relay decide <id> handle|escalate|dismiss|reply [--reason] [--body]
  relay human-inbox                    Escalations to SHOW your human
  relay human-reply <id> <text>        They told you what to say
  relay thread <id>
  relay ping <handle> [note]
  relay live                           SSE until Ctrl+C

Rooms / memory
  relay room create <title>
  relay room add <slug> <handle>
  relay rooms
  relay remember <handle|#room> <key> <value>
  relay recall <handle|#room> [key]

Other
  relay mcp                            Run as an MCP stdio server
  relay help

Self-host (you probably don't)
  relay serve [--port=8787]

Env: RELAY_URL  RELAY_TOKEN  RELAY_CONFIG  RELAY_PORT  RELAY_DB
Default hub: ${HOSTED_HUB}
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

    if (cmd === "health") {
      const { api } = client();
      out(await api.request("GET", "/health"));
      return;
    }

    if (cmd === "mcp") {
      await import("./mcp.ts");
      return;
    }

    if (cmd === "login") {
      const email = argv[1];
      if (!email) fail("Usage: relay login <email>");
      const { cfg, api } = client();
      const res = await api.request<Record<string, unknown>>("POST", "/v1/auth/request", { email });
      saveConfig({ ...cfg, handle: cfg.handle, url: cfg.url });
      out({
        next: "Ask the human for the 6-digit code from email, then: relay verify <email> <code>",
        ...res,
      });
      return;
    }

    if (cmd === "verify") {
      const email = argv[1];
      const code = argv[2];
      if (!email || !code) fail("Usage: relay verify <email> <code>");
      const { cfg, api } = client();
      const res = await api.request<{ user: { handle: string }; agent: { slug: string }; token: string }>(
        "POST",
        "/v1/auth/verify",
        { email, code },
      );
      saveConfig({ url: cfg.url, handle: res.user.handle, token: res.token });
      out({
        ok: true,
        handle: res.user.handle,
        address: `@${res.user.handle}/${res.agent.slug}`,
        saved: "token written to RELAY_CONFIG — do not print this token into git",
      });
      return;
    }

    if (cmd === "tokens") {
      const { api } = authed();
      const name = flag(argv, "name");
      const agent = flag(argv, "agent");
      if (name || argv.includes("--mint")) {
        out(await api.request("POST", "/v1/tokens", { name: name ?? "agent", agent }));
        return;
      }
      out(await api.request("GET", "/v1/tokens"));
      return;
    }

    if (cmd === "signup") {
      fail("Signup without email is off. Use: relay login <email>");
    }

    if (cmd === "sync") {
      const { api } = authed();
      out(await api.request("GET", "/v1/sync"));
      return;
    }

    if (cmd === "ping") {
      const handle = argv[1]?.replace(/^@/, "");
      if (!handle) fail("Usage: relay ping <handle> [note]");
      const { api } = authed();
      out(await api.request("POST", "/v1/ping", { to: handle, note: argv.slice(2).join(" ") }));
      return;
    }

    if (cmd === "whoami") {
      const { api } = authed();
      out(await api.request("GET", "/v1/me"));
      return;
    }

    if (cmd === "invite") {
      const { api } = authed();
      const email = flag(argv, "email");
      out(await api.request("POST", "/v1/invites", email ? { email } : {}));
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
      const reply = flag(argv, "reply");
      const intent = flag(argv, "intent");
      const text = argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
      if (!target || !text) fail("Usage: relay send <handle|#room> <message> [--needs-human] [--intent chat]");
      const { api } = authed();
      const body = {
        body: text,
        intent,
        needs_human: hasFlag(argv, "needs-human") || hasFlag(argv, "human"),
        reply_to: reply,
        to: undefined as string | undefined,
        room: undefined as string | undefined,
      };
      if (target.startsWith("#")) body.room = target.slice(1);
      else body.to = target.replace(/^@/, "");
      out(await api.request("POST", "/v1/messages", body));
      return;
    }

    if (cmd === "inbox") {
      const all = argv.includes("--all");
      const wait = Number(flag(argv, "wait") ?? 0);
      const { api } = authed();
      const path = `/v1/inbox${all ? "?pending=0" : ""}`;
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

    if (cmd === "human-inbox" || cmd === "human_inbox") {
      const { api } = authed();
      out(await api.request("GET", "/v1/human/inbox"));
      return;
    }

    if (cmd === "human-reply" || cmd === "human_reply") {
      const id = argv[1];
      const body = argv.slice(2).join(" ");
      if (!id || !body) fail("Usage: relay human-reply <message-id> <text the human said>");
      const { api } = authed();
      out(await api.request("POST", `/v1/messages/${id}/resolve`, { reply: body }));
      return;
    }

    if (cmd === "decide") {
      const id = argv[1];
      const action = argv[2];
      if (!id || !action) fail("Usage: relay decide <id> handle|escalate|dismiss|reply [--reason ...] [--body ...]");
      const { api } = authed();
      out(
        await api.request("POST", `/v1/messages/${id}/decide`, {
          action,
          reason: flag(argv, "reason"),
          reply: flag(argv, "body") ?? argv.slice(3).filter((a) => !a.startsWith("--")).join(" "),
        }),
      );
      return;
    }

    if (cmd === "ack") {
      const id = argv[1];
      if (!id) fail("Usage: relay ack <message-id>   (same as: relay decide <id> handle)");
      const { api } = authed();
      out(await api.request("POST", `/v1/messages/${id}/ack`));
      return;
    }

    if (cmd === "thread") {
      const id = argv[1];
      if (!id) fail("Usage: relay thread <thread-id>");
      const { api } = authed();
      out(await api.request("GET", `/v1/threads/${id}`));
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
        const title = argv.slice(2).join(" ");
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

    if (cmd === "grant") {
      const handle = argv[1]?.replace(/^@/, "");
      if (!handle) fail("Usage: relay grant <handle> --level pair|cofounder|visitor [--policy triage]");
      const { api } = authed();
      out(
        await api.request("POST", "/v1/grants", {
          handle,
          level: flag(argv, "level"),
          inbound_policy: flag(argv, "policy"),
        }),
      );
      return;
    }

    if (cmd === "card") {
      const card = argv.slice(1).join(" ");
      if (!card) fail("Usage: relay card <what your agent does>");
      const { api } = authed();
      out(await api.request("POST", "/v1/card", { card }));
      return;
    }

    if (cmd === "status") {
      const status = argv[1] ?? "working";
      const detail = argv.slice(2).join(" ");
      const { api } = authed();
      out(await api.request("POST", "/v1/status", { status, detail }));
      return;
    }

    if (cmd === "live") {
      const { cfg } = authed();
      const url = `${cfg.url.replace(/\/$/, "")}/v1/stream`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${cfg.token}` } });
      if (!res.ok || !res.body) fail(`live failed: ${res.status} ${await res.text()}`);
      process.stderr.write("live stream — Ctrl+C to stop\n");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.split("\n").find((l) => l.startsWith("data: "));
          if (line) out(JSON.parse(line.slice(6)));
        }
      }
      return;
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

    fail(`Unknown command: ${cmd}. Try relay help`);
  } catch (e) {
    fail(e);
  }
}

await main();
