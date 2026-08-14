import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type Config = {
  url: string;
  handle?: string;
  token?: string;
};

export function configPath(): string {
  return process.env.RELAY_CONFIG ?? join(homedir(), ".agent-relay", "config.json");
}

export function loadConfig(): Config {
  const p = configPath();
  if (!existsSync(p)) {
    return { url: process.env.RELAY_URL ?? "http://127.0.0.1:8787" };
  }
  const cfg = JSON.parse(readFileSync(p, "utf8")) as Config;
  if (process.env.RELAY_URL) cfg.url = process.env.RELAY_URL;
  if (process.env.RELAY_TOKEN) cfg.token = process.env.RELAY_TOKEN;
  return cfg;
}

export function saveConfig(cfg: Config) {
  const p = configPath();
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
}
