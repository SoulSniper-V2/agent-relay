import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function inviteCode(): string {
  return randomBytes(5).toString("hex");
}

export function token(): string {
  return `arl_${randomBytes(24).toString("hex")}`;
}

export function otp(): string {
  for (;;) {
    const n = randomBytes(4).readUInt32BE(0);
    if (n < 4_294_000_000) return (n % 1_000_000).toString().padStart(6, "0");
  }
}

export function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

export function hashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function now(): number {
  return Date.now();
}

export function dmScope(a: string, b: string): string {
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export function roomScope(roomId: string): string {
  return `room:${roomId}`;
}
