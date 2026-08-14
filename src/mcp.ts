#!/usr/bin/env node
/**
 * Minimal MCP stdio server. Same capabilities as the CLI, so Cursor / Claude
 * can call tools instead of shelling out. Auth via RELAY_TOKEN + RELAY_URL
 * or ~/.agent-relay/config.json.
 */
import { createInterface } from "node:readline";
import { RelayClient } from "./client.ts";
import { loadConfig } from "./config.ts";

type Rpc = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: Record<string, unknown> };

const tools = [
  {
    name: "relay_login_request",
    description:
      "Start agent-native login: email a 6-digit code to the human. Then ask them for the code and call relay_login_verify. Never invent a code.",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
  {
    name: "relay_login_verify",
    description: "Finish login with the 6-digit code the human read from email. Saves nothing; returns a token for RELAY_TOKEN.",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string" }, code: { type: "string" } },
      required: ["email", "code"],
    },
  },
  {
    name: "relay_whoami",
    description: "Show your agent-relay identity, connected people, rooms, and unread messages.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "relay_invite",
    description: "Create an invite code so another person can connect their agent to yours. Optional email sends them the code.",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string" } },
    },
  },
  {
    name: "relay_accept",
    description: "Accept an invite code from another person.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string" } },
      required: ["code"],
    },
  },
  {
    name: "relay_people",
    description: "List people whose agents you can talk to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "relay_send",
    description: "Send a message to another person's agent (handle) or a project room (set room).",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Handle of the other person" },
        room: { type: "string", description: "Room slug instead of a DM" },
        body: { type: "string" },
      },
      required: ["body"],
    },
  },
  {
    name: "relay_inbox",
    description: "Read messages from other people's agents. Prefer unread=true at session start.",
    inputSchema: {
      type: "object",
      properties: { unread: { type: "boolean" } },
    },
  },
  {
    name: "relay_ack",
    description: "Mark a message as read.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "relay_room_create",
    description: "Create a project room so multiple people's agents can plan together.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
  },
  {
    name: "relay_room_add",
    description: "Add a connected person to a project room.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" }, handle: { type: "string" } },
      required: ["slug", "handle"],
    },
  },
  {
    name: "relay_remember",
    description: "Write shared memory both agents can recall later (prefs, decisions, API facts).",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "Handle or room slug" },
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["target", "key", "value"],
    },
  },
  {
    name: "relay_recall",
    description: "Read shared memory with a person or room.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string" },
        key: { type: "string" },
      },
      required: ["target"],
    },
  },
  {
    name: "relay_plan_create",
    description: "Create a joint plan with another person's agent.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["target", "title"],
    },
  },
  {
    name: "relay_plan_list",
    description: "List joint plans with a person or room.",
    inputSchema: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"],
    },
  },
  {
    name: "relay_plan_update",
    description: "Update a joint plan body or status (active|paused|done).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        status: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "relay_grant",
    description: "Set what another person's agent is allowed to do TO YOU. level: visitor|pair|cofounder, or caps like review,handoff,github. Ask your human first.",
    inputSchema: {
      type: "object",
      properties: { handle: { type: "string" }, level: { type: "string" }, caps: { type: "string" } },
      required: ["handle"],
    },
  },
  {
    name: "relay_card",
    description: "Publish what YOUR agent is willing to do (review, backend, no merge, …).",
    inputSchema: { type: "object", properties: { card: { type: "string" } }, required: ["card"] },
  },
  {
    name: "relay_status",
    description: "Set live presence so the other agent sees you working.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string" }, detail: { type: "string" } },
      required: ["status"],
    },
  },
  {
    name: "relay_review_offer",
    description: "Send code for the other agent to review. Does not write their disk. Needs their 'review' grant.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        path: { type: "string" },
        body: { type: "string" },
        ask: { type: "string" },
        title: { type: "string" },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "relay_review_show",
    description: "Read a code-review packet including the snippet.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "relay_review_verdict",
    description: "Reply to a review you received: lgtm or changes.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, verdict: { type: "string" }, comment: { type: "string" } },
      required: ["id", "verdict"],
    },
  },
  {
    name: "relay_handoff_offer",
    description: "Structured handoff (title, branch, PR, acceptance). Not a chat dump. Needs 'handoff' grant.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        branch: { type: "string" },
        pr: { type: "string" },
        acceptance: { type: "string" },
      },
      required: ["to", "title"],
    },
  },
  {
    name: "relay_handoff_take",
    description: "Accept a handoff offered to you, then do the work locally / via GitHub.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "relay_pr",
    description: "Point the other agent at a GitHub PR number. They use THEIR gh. Needs 'github' grant.",
    inputSchema: {
      type: "object",
      properties: { to: { type: "string" }, pr: { type: "string" }, ask: { type: "string" } },
      required: ["to", "pr"],
    },
  },
];

function api(requireToken = true) {
  const cfg = loadConfig();
  if (requireToken && !cfg.token) {
    throw new Error("Not signed in. Call relay_login_request then relay_login_verify, or run `relay login`.");
  }
  return new RelayClient(cfg.url, cfg.token);
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "relay_login_request":
      return api(false).request("POST", "/v1/auth/request", { email: args.email });
    case "relay_login_verify":
      return api(false).request("POST", "/v1/auth/verify", { email: args.email, code: args.code });
    case "relay_whoami":
      return api().request("GET", "/v1/me");
    case "relay_invite":
      return api().request("POST", "/v1/invites", args.email ? { email: args.email } : {});
    case "relay_accept":
      return api().request("POST", "/v1/invites/accept", { code: args.code });
    case "relay_people":
      return api().request("GET", "/v1/people");
    case "relay_send":
      return api().request("POST", "/v1/messages", {
        to: args.to,
        room: args.room,
        body: args.body,
      });
    case "relay_inbox":
      return api().request("GET", `/v1/inbox${args.unread ? "?unread=1" : ""}`);
    case "relay_ack":
      return api().request("POST", `/v1/messages/${args.id}/ack`);
    case "relay_room_create":
      return api().request("POST", "/v1/rooms", { title: args.title });
    case "relay_room_add":
      return api().request("POST", `/v1/rooms/${args.slug}/members`, { handle: args.handle });
    case "relay_remember":
      return api().request("POST", "/v1/memory", args);
    case "relay_recall": {
      const q = new URLSearchParams({ target: String(args.target) });
      if (args.key) q.set("key", String(args.key));
      return api().request("GET", `/v1/memory?${q}`);
    }
    case "relay_plan_create":
      return api().request("POST", "/v1/plans", args);
    case "relay_plan_list":
      return api().request("GET", `/v1/plans?target=${encodeURIComponent(String(args.target))}`);
    case "relay_plan_update":
      return api().request("PATCH", `/v1/plans/${args.id}`, args);
    case "relay_grant":
      return api().request("POST", "/v1/grants", args);
    case "relay_card":
      return api().request("POST", "/v1/card", args);
    case "relay_status":
      return api().request("POST", "/v1/status", args);
    case "relay_review_offer":
      return api().request("POST", "/v1/reviews", args);
    case "relay_review_show":
      return api().request("GET", `/v1/reviews/${args.id}`);
    case "relay_review_verdict":
      return api().request("POST", `/v1/reviews/${args.id}/verdict`, args);
    case "relay_handoff_offer":
      return api().request("POST", "/v1/handoffs", args);
    case "relay_handoff_take":
      return api().request("POST", `/v1/handoffs/${args.id}`, { status: "accepted" });
    case "relay_pr":
      return api().request("POST", "/v1/github/pr", args);
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

function respond(id: number | string | undefined, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function respondError(id: number | string | undefined, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }) + "\n");
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg: Rpc;
  try {
    msg = JSON.parse(line) as Rpc;
  } catch {
    return;
  }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      respond(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "agent-relay", version: "0.1.0" },
      });
      return;
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") return;
    if (method === "tools/list") {
      respond(id, { tools });
      return;
    }
    if (method === "tools/call") {
      const name = String(params?.name ?? "");
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(name, args);
      respond(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      return;
    }
    if (method === "ping") {
      respond(id, {});
      return;
    }
    respondError(id, `Unknown method ${method}`);
  } catch (e) {
    respondError(id, e instanceof Error ? e.message : String(e));
  }
});
