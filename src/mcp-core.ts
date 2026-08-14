/**
 * MCP JSON-RPC: used by stdio (local Cursor) and Streamable HTTP POST /mcp (hosted).
 */
import { RelayClient } from "./client.ts";

export type Rpc = { jsonrpc: "2.0"; id?: number | string; method?: string; params?: Record<string, unknown> };

const OPEN_TOOLS = new Set(["relay_login_request", "relay_login_verify"]);

export const MCP_TOOLS = [
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
    name: "relay_sync",
    description:
      "Live work board: unread messages, reviews waiting on you, handoffs to take, who is online. Call at session start and after waiting.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "relay_ping",
    description: "Nudge another person's agent to run relay_sync.",
    inputSchema: {
      type: "object",
      properties: { to: { type: "string" }, note: { type: "string" } },
      required: ["to"],
    },
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

function api(hubUrl: string, token: string | undefined, requireToken: boolean) {
  if (requireToken && !token) {
    throw new Error("Not signed in. Call relay_login_request then relay_login_verify, then put the token in Authorization: Bearer.");
  }
  return new RelayClient(hubUrl, token);
}

async function callTool(
  hubUrl: string,
  token: string | undefined,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const need = !OPEN_TOOLS.has(name);
  switch (name) {
    case "relay_login_request":
      return api(hubUrl, token, need).request("POST", "/v1/auth/request", { email: args.email });
    case "relay_login_verify":
      return api(hubUrl, token, need).request("POST", "/v1/auth/verify", { email: args.email, code: args.code });
    case "relay_whoami":
      return api(hubUrl, token, need).request("GET", "/v1/me");
    case "relay_invite":
      return api(hubUrl, token, need).request("POST", "/v1/invites", args.email ? { email: args.email } : {});
    case "relay_accept":
      return api(hubUrl, token, need).request("POST", "/v1/invites/accept", { code: args.code });
    case "relay_people":
      return api(hubUrl, token, need).request("GET", "/v1/people");
    case "relay_sync":
      return api(hubUrl, token, need).request("GET", "/v1/sync");
    case "relay_ping":
      return api(hubUrl, token, need).request("POST", "/v1/ping", args);
    case "relay_send":
      return api(hubUrl, token, need).request("POST", "/v1/messages", {
        to: args.to,
        room: args.room,
        body: args.body,
      });
    case "relay_inbox":
      return api(hubUrl, token, need).request("GET", `/v1/inbox${args.unread ? "?unread=1" : ""}`);
    case "relay_ack":
      return api(hubUrl, token, need).request("POST", `/v1/messages/${args.id}/ack`);
    case "relay_room_create":
      return api(hubUrl, token, need).request("POST", "/v1/rooms", { title: args.title });
    case "relay_room_add":
      return api(hubUrl, token, need).request("POST", `/v1/rooms/${args.slug}/members`, { handle: args.handle });
    case "relay_remember":
      return api(hubUrl, token, need).request("POST", "/v1/memory", args);
    case "relay_recall": {
      const q = new URLSearchParams({ target: String(args.target) });
      if (args.key) q.set("key", String(args.key));
      return api(hubUrl, token, need).request("GET", `/v1/memory?${q}`);
    }
    case "relay_plan_create":
      return api(hubUrl, token, need).request("POST", "/v1/plans", args);
    case "relay_plan_list":
      return api(hubUrl, token, need).request("GET", `/v1/plans?target=${encodeURIComponent(String(args.target))}`);
    case "relay_plan_update":
      return api(hubUrl, token, need).request("PATCH", `/v1/plans/${args.id}`, args);
    case "relay_grant":
      return api(hubUrl, token, need).request("POST", "/v1/grants", args);
    case "relay_card":
      return api(hubUrl, token, need).request("POST", "/v1/card", args);
    case "relay_status":
      return api(hubUrl, token, need).request("POST", "/v1/status", args);
    case "relay_review_offer":
      return api(hubUrl, token, need).request("POST", "/v1/reviews", args);
    case "relay_review_show":
      return api(hubUrl, token, need).request("GET", `/v1/reviews/${args.id}`);
    case "relay_review_verdict":
      return api(hubUrl, token, need).request("POST", `/v1/reviews/${args.id}/verdict`, args);
    case "relay_handoff_offer":
      return api(hubUrl, token, need).request("POST", "/v1/handoffs", args);
    case "relay_handoff_take":
      return api(hubUrl, token, need).request("POST", `/v1/handoffs/${args.id}`, { status: "accepted" });
    case "relay_pr":
      return api(hubUrl, token, need).request("POST", "/v1/github/pr", args);
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

export type McpJson = { jsonrpc: "2.0"; id?: number | string; result?: unknown; error?: { code: number; message: string } };

/** null = notification, no HTTP/stdio body */
export async function dispatchMcp(
  msg: Rpc,
  opts: { hubUrl: string; token?: string },
): Promise<McpJson | null> {
  const { id, method, params } = msg;
  const notify = id === undefined;
  try {
    if (method === "initialize") {
      const requested = String((params as { protocolVersion?: string } | undefined)?.protocolVersion ?? "2024-11-05");
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: requested || "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "agent-relay", version: "0.1.0" },
        },
      };
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") return null;
    if (method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
    }
    if (method === "tools/call") {
      const name = String(params?.name ?? "");
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(opts.hubUrl, opts.token, name, args);
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
      };
    }
    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }
    if (notify) return null;
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } };
  } catch (e) {
    if (notify) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: e instanceof Error ? e.message : String(e) },
    };
  }
}
