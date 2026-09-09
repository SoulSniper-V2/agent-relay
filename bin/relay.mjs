#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(
  process.execPath,
  ["--experimental-sqlite", "--import", "tsx", join(root, "src/cli.ts"), ...process.argv.slice(2)],
  { stdio: "inherit", cwd: root },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
