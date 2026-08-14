#!/usr/bin/env node
import { readFileSync } from "node:fs";
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
  if (!c.cfg.token) fail("Not signed in. Run: relay login you@email.com");
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

Setup (agent-native)
  relay serve [--port=8787]     Start the shared hub
  relay login <email>           Email a 6-digit code to the human
  relay verify <email> <code>   Finish login; saves RELAY_TOKEN
  relay whoami                  You + people + unread
  relay sync                    One-shot live board (unread, reviews, handoffs, who's online)
  relay ping <handle> [note]    Nudge the other agent to sync
  relay tokens [--name]         Mint another token for MCP / a cloud agent

People
  relay invite [--email addr]   Mint a code; optionally email it
  relay accept <code>
  relay people                  Status, cards, what they allow you
  relay grant <handle> --level pair|cofounder|visitor
  relay grant <handle> review,handoff,github
  relay card <text>             What YOUR agent is willing to do
  relay status working [detail] Presence for the other agent

Talk (live)
  relay send <handle|#room> <text>
  relay inbox [--unread] [--wait=sec]
  relay live                    SSE until Ctrl+C (working together)

Code review (does not write their disk)
  relay review offer <handle> --path src/x.ts --file src/x.ts [--ask "..."]
  relay review list
  relay review show <id>
  relay review verdict <id> lgtm|changes [--comment "..."]

Handoffs (structured, not chat dumps)
  relay handoff offer <handle> <title> [--body] [--branch] [--pr] [--accept]
  relay handoff list
  relay handoff take <id>
  relay handoff done <id> [--note]

GitHub is the repo — we only point
  relay github <room-slug> owner/repo
  relay pr <handle> <number> [--ask "..."]
  Then use local: gh pr view / gh pr diff / gh pr checkout  (YOUR credentials)

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
      const res = await api.request<{ user: { handle: string; email?: string }; token: string }>(
        "POST",
        "/v1/auth/verify",
        { email, code },
      );
      saveConfig({ url: cfg.url, handle: res.user.handle, token: res.token });
      out({
        ok: true,
        handle: res.user.handle,
        saved: "token written to RELAY_CONFIG — do not print this token into git",
      });
      return;
    }

    if (cmd === "tokens") {
      const { api } = authed();
      const name = flag(argv, "name");
      if (name || argv.includes("--mint")) {
        out(await api.request("POST", "/v1/tokens", { name: name ?? "agent" }));
        return;
      }
      out(await api.request("GET", "/v1/tokens"));
      return;
    }

    if (cmd === "signup") {
      const handle = argv[1];
      if (!handle) fail("Usage: relay signup <handle>  (prefer: relay login <email>)");
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
      const text = argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
      if (!target || !text) fail("Usage: relay send <handle|#room-slug> <message> [--reply msg_id]");
      const { api } = authed();
      if (target.startsWith("#")) {
        out(await api.request("POST", "/v1/messages", { room: target.slice(1), body: text, reply_to: reply }));
      } else {
        out(await api.request("POST", "/v1/messages", { to: target.replace(/^@/, ""), body: text, reply_to: reply }));
      }
      return;
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
      fail("Usage: relay room create <title> | relay room add <slug> <handle> | relay github <slug> owner/repo");
    }

    if (cmd === "grant") {
      const handle = argv[1]?.replace(/^@/, "");
      if (!handle) fail("Usage: relay grant <handle> --level pair|cofounder|visitor  OR  relay grant <handle> review,handoff");
      const { api } = authed();
      const level = flag(argv, "level");
      const caps = argv.slice(2).find((a) => !a.startsWith("--"));
      out(await api.request("POST", "/v1/grants", { handle, level, caps }));
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

    if (cmd === "review") {
      const sub = argv[1];
      const { api } = authed();
      if (sub === "list") {
        out(await api.request("GET", "/v1/reviews"));
        return;
      }
      if (sub === "show") {
        if (!argv[2]) fail("Usage: relay review show <id>");
        out(await api.request("GET", `/v1/reviews/${argv[2]}`));
        return;
      }
      if (sub === "verdict") {
        const id = argv[2];
        const verdict = argv[3];
        if (!id || !verdict) fail("Usage: relay review verdict <id> lgtm|changes [--comment]");
        out(await api.request("POST", `/v1/reviews/${id}/verdict`, {
          verdict,
          comment: flag(argv, "comment") ?? "",
        }));
        return;
      }
      if (sub === "offer") {
        const handle = argv[2]?.replace(/^@/, "");
        const file = flag(argv, "file");
        const path = flag(argv, "path") ?? file ?? "snippet";
        const ask = flag(argv, "ask") ?? "";
        const title = flag(argv, "title");
        let body = flag(argv, "body") ?? "";
        if (file) body = readFileSync(file, "utf8");
        if (!handle || !body) fail("Usage: relay review offer <handle> --file <path> [--ask] [--path]");
        out(await api.request("POST", "/v1/reviews", { to: handle, path, title, body, ask }));
        return;
      }
      fail("Usage: relay review offer|list|show|verdict");
    }

    if (cmd === "handoff") {
      const sub = argv[1];
      const { api } = authed();
      if (sub === "list") {
        out(await api.request("GET", "/v1/handoffs"));
        return;
      }
      if (sub === "offer") {
        const handle = argv[2]?.replace(/^@/, "");
        const title = argv.filter((a) => !a.startsWith("--")).slice(3).join(" ") || flag(argv, "title");
        if (!handle || !title) fail("Usage: relay handoff offer <handle> <title> [--body] [--branch] [--pr] [--accept]");
        out(await api.request("POST", "/v1/handoffs", {
          to: handle,
          title,
          body: flag(argv, "body"),
          branch: flag(argv, "branch"),
          pr: flag(argv, "pr"),
          acceptance: flag(argv, "accept"),
        }));
        return;
      }
      if (sub === "take") {
        if (!argv[2]) fail("Usage: relay handoff take <id>");
        out(await api.request("POST", `/v1/handoffs/${argv[2]}`, { status: "accepted" }));
        return;
      }
      if (sub === "done") {
        if (!argv[2]) fail("Usage: relay handoff done <id> [--note]");
        out(await api.request("POST", `/v1/handoffs/${argv[2]}`, { status: "done", note: flag(argv, "note") }));
        return;
      }
      fail("Usage: relay handoff offer|list|take|done");
    }

    if (cmd === "github") {
      const slug = argv[1]?.replace(/^#/, "");
      const repo = argv[2];
      if (!slug || !repo) fail("Usage: relay github <room-slug> owner/repo");
      const { api } = authed();
      out(await api.request("POST", `/v1/rooms/${slug}/github`, { repo }));
      return;
    }

    if (cmd === "pr") {
      const handle = argv[1]?.replace(/^@/, "");
      const pr = argv[2];
      if (!handle || !pr) fail("Usage: relay pr <handle> <number> [--ask]");
      const { api } = authed();
      out(await api.request("POST", "/v1/github/pr", { to: handle, pr, ask: flag(argv, "ask") ?? "" }));
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
