#!/usr/bin/env node
/**
 * MCP stdio adapter — this is the install path (npx -y coding-agent-relay mcp).
 * Login saves the PAT on this machine. Do not put a token in mcp.json.
 * POST /mcp on the hub is for already-authed HTTP clients with Authorization: Bearer.
 */
import { writeSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadConfig } from "./config.ts";
import { dispatchMcp, McpProtocolError, validateRpc, type Rpc } from "./mcp-core.ts";

function emit(obj: unknown) {
  writeSync(1, JSON.stringify(obj) + "\n");
}

function errorResponse(code: number, message: string, id: number | string | null = null) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function requestId(value: unknown): number | string | null {
  if (value !== null && (typeof value === "string" || (typeof value === "number" && Number.isFinite(value)))) {
    return value;
  }
  return null;
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    emit(errorResponse(-32700, "Parse error."));
    return;
  }

  let msg: Rpc;
  try {
    msg = validateRpc(parsed);
  } catch (e) {
    const error = e instanceof McpProtocolError ? e : new McpProtocolError(-32600, "Invalid JSON-RPC request.");
    const candidate = parsed !== null && typeof parsed === "object" ? (parsed as { id?: unknown }) : undefined;
    emit(errorResponse(error.code, error.message, requestId(candidate?.id)));
    return;
  }

  let cfg: ReturnType<typeof loadConfig>;
  try {
    cfg = loadConfig();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to load Agent Relay config.";
    if (Object.prototype.hasOwnProperty.call(msg, "id")) emit(errorResponse(-32000, message, requestId(msg.id)));
    return;
  }

  try {
    const out = await dispatchMcp(msg, { hubUrl: cfg.url, token: cfg.token, persistAuth: true });
    if (out) emit(out);
  } catch (e) {
    // Keep the stdio loop alive if an unexpected adapter error escapes dispatch.
    const message = e instanceof Error ? e.message : "MCP request failed.";
    if (Object.prototype.hasOwnProperty.call(msg, "id")) emit(errorResponse(-32603, message, requestId(msg.id)));
  }
});
