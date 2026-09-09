#!/usr/bin/env node
/**
 * MCP stdio adapter — this is the install path (npx -y coding-agent-relay mcp).
 * Login saves the PAT on this machine. Do not put a token in mcp.json.
 * POST /mcp on the hub is for already-authed HTTP clients with Authorization: Bearer.
 */
import { writeSync } from "node:fs";
import { createInterface } from "node:readline";
import { loadConfig } from "./config.ts";
import { dispatchMcp, type Rpc } from "./mcp-core.ts";

function emit(obj: unknown) {
  writeSync(1, JSON.stringify(obj) + "\n");
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
  const cfg = loadConfig();
  const out = await dispatchMcp(msg, { hubUrl: cfg.url, token: cfg.token, persistAuth: true });
  if (out) emit(out);
});
