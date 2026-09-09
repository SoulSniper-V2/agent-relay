export const CAPS = ["message", "memory"] as const;
export type Cap = (typeof CAPS)[number];

export const POLICIES = ["triage", "always_escalate", "silent"] as const;

export const LEVELS: Record<string, Cap[]> = {
  visitor: ["message"],
  pair: ["message", "memory"],
  cofounder: ["message", "memory"],
};

/** New contacts start here. Raise to pair only after the human says so. */
export const DEFAULT_CAPS: Cap[] = LEVELS.visitor;

export function parseCaps(raw: string | string[] | undefined, fallback: Cap[] = DEFAULT_CAPS): Cap[] {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw ?? "")
        .split(/[,\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
  const out = parts.filter((p): p is Cap => (CAPS as readonly string[]).includes(p));
  return out.length ? [...new Set(out)] : fallback;
}

export function capsCsv(caps: Cap[]): string {
  return [...new Set(caps)].join(",");
}

/** Cofounder and pair share the same caps today. */
export function levelFromCaps(caps: Cap[]): "visitor" | "pair" {
  return caps.includes("memory") ? "pair" : "visitor";
}
