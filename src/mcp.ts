#!/usr/bin/env node
/**
 * MCP stdio adapter. Hosted Cursor/Claude should prefer POST /mcp on the hub.
 * Auth via RELAY_TOKEN + RELAY_URL or ~/.agent-relay/config.json.
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
  const out = await dispatchMcp(msg, { hubUrl: cfg.url, token: cfg.token });
  if (out) emit(out);
});
