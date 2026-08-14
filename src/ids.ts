import { createHash, randomBytes } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function inviteCode(): string {
  return randomBytes(5).toString("hex");
}

export function token(): string {
  return `arl_${randomBytes(24).toString("hex")}`;
}

export function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export function now(): number {
  return Date.now();
}

export function normalizeHandle(handle: string): string {
  const h = handle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(h)) {
    throw new Error(
      "Handle must be 2–32 chars: letters, numbers, _ or - (start with a letter or number).",
    );
  }
  return h;
}

export function dmScope(a: string, b: string): string {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export function roomScope(roomId: string): string {
  return `room:${roomId}`;
}
