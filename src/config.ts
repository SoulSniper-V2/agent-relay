import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { HOSTED_HUB } from "./hosted.ts";

export type Config = {
  url: string;
  handle?: string;
  token?: string;
};

export function configPath(): string {
  return process.env.RELAY_CONFIG ?? join(homedir(), ".agent-relay", "config.json");
}

function readConfig(p: string): Config {
  let text: string;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    throw new Error(
      `Unable to read Agent Relay config at ${p}. Check its permissions or remove it and try again.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid Agent Relay config at ${p}: expected valid JSON. Fix or remove it and try again.`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Invalid Agent Relay config at ${p}: expected a JSON object. Fix or remove it and try again.`,
    );
  }
  return parsed as Config;
}

function normalizedOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function sameHub(left: unknown, right: unknown): boolean {
  const leftOrigin = normalizedOrigin(left);
  const rightOrigin = normalizedOrigin(right);
  return leftOrigin !== undefined && leftOrigin === rightOrigin;
}

export function loadConfig(): Config {
  const p = configPath();
  const envUrl = process.env.RELAY_URL;
  const envToken = process.env.RELAY_TOKEN;
  const fallback = envUrl ?? HOSTED_HUB;
  const cfg = existsSync(p) ? readConfig(p) : { url: fallback };
  const savedUrl = cfg.url;

  if (envUrl) cfg.url = envUrl;
  if (envToken) {
    cfg.token = envToken;
  } else if (envUrl && !sameHub(savedUrl, envUrl)) {
    // A URL override selects a different hub unless both origins are proven equal.
    // Never carry a token across that boundary without an explicit replacement.
    delete cfg.token;
  }
  if (!cfg.url) cfg.url = fallback;
  return cfg;
}

export function saveConfig(cfg: Config) {
  const p = configPath();
  const dir = dirname(p);
  const payload = JSON.stringify(cfg, null, 2) + "\n";
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  // Keep the temporary file beside the destination so rename is atomic.
  const temporaryPath = join(dir, `.${basename(p)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporaryPath, payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, p);
  } finally {
    try {
      unlinkSync(temporaryPath);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
}
