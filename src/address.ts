import { RelayError } from "./errors.ts";
import type { Address } from "./types.ts";

export function normalizeSlug(raw: string, label = "Name"): string {
  const h = raw.trim().toLowerCase().replace(/^@/, "").replace(/^#/, "");
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(h)) {
    throw new RelayError(
      400,
      `${label} must be 2–32 characters: letters, numbers, _ or - (start with a letter or number).`,
    );
  }
  return h;
}

export function parseTarget(raw: string): Address {
  const t = raw.trim();
  if (!t) throw new RelayError(400, "Missing address.");
  if (t.startsWith("#")) return { kind: "room", slug: normalizeSlug(t, "Room") };
  const bare = t.replace(/^@/, "");
  if (bare.includes("/")) {
    const [handle, agentSlug, extra] = bare.split("/");
    if (extra) throw new RelayError(400, "Address looks like @handle or @handle/agent.");
    return { kind: "agent", handle: normalizeSlug(handle, "Handle"), agentSlug: normalizeSlug(agentSlug, "Agent") };
  }
  return { kind: "agent", handle: normalizeSlug(bare, "Handle") };
}

export function formatAgentAddr(handle: string, slug: string): string {
  return `@${handle}/${slug}`;
}
