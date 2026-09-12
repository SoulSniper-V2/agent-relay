import { createHmac, randomBytes } from "node:crypto";
import { RelayError } from "./errors.ts";

export type Webhook = { url: string; secret: string };

const PRIVATE_IPV4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true; // unique local
  if (/^fe80:/i.test(h)) return true; // link local
  return PRIVATE_IPV4.some((re) => re.test(h));
}

/**
 * Webhook delivery makes the hub issue outbound requests, so keep the target
 * public and encrypted. RELAY_ALLOW_INSECURE_WEBHOOK=1 relaxes this for local
 * testing only; never set it on a public hub.
 */
export function validWebhookUrl(raw: string): string {
  const insecure = process.env.RELAY_ALLOW_INSECURE_WEBHOOK === "1";
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new RelayError(400, "Webhook URL is not a valid URL.");
  }
  if (url.protocol !== "https:" && !(insecure && url.protocol === "http:")) {
    throw new RelayError(400, "Webhook URL must use https.");
  }
  if (!url.hostname) throw new RelayError(400, "Webhook URL needs a host.");
  if (url.username || url.password) throw new RelayError(400, "Webhook URL must not embed credentials.");
  if (!insecure && isPrivateHost(url.hostname)) {
    throw new RelayError(400, "Webhook URL must not target a private address.");
  }
  return url.toString();
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function signWebhook(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export async function postWebhook(
  webhook: Webhook,
  payload: unknown,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const body = JSON.stringify(payload);
  const send = opts.fetchImpl ?? fetch;
  const res = await send(webhook.url, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      "x-agent-relay-event": "message",
      "x-agent-relay-signature": signWebhook(webhook.secret, body),
    },
    body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
  });
  return res.status;
}

/** Push a message to every recipient that registered a webhook. Best effort. */
export async function dispatchMessageWebhooks(
  lookup: { webhookFor(userId: string): Webhook | undefined },
  recipients: string[],
  payload: unknown,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ userId: string; status?: number; error?: string }[]> {
  const results: { userId: string; status?: number; error?: string }[] = [];
  for (const userId of new Set(recipients)) {
    const webhook = lookup.webhookFor(userId);
    if (!webhook) continue;
    try {
      results.push({ userId, status: await postWebhook(webhook, payload, opts) });
    } catch (error) {
      results.push({ userId, error: error instanceof Error ? error.message : "webhook failed" });
    }
  }
  return results;
}
