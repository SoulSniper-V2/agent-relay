import { createHmac, randomBytes } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions } from "node:dns";
import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions as HttpsRequestOptions } from "node:https";
import { isIP } from "node:net";
import { RelayError } from "./errors.ts";

export type Webhook = { url: string; secret: string };

type IpRange = readonly [bigint, bigint];

function ipv4Value(address: string): bigint | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const octet = Number(part);
    if (octet > 255) return undefined;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function ipv6Value(address: string): bigint | undefined {
  if (address.includes("%")) return undefined;
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return undefined;

  const expand = (half: string): number[] | undefined => {
    if (!half) return [];
    const parts = half.split(":");
    const groups: number[] = [];
    for (const part of parts) {
      if (part.includes(".")) {
        const value = ipv4Value(part);
        if (value === undefined) return undefined;
        groups.push(Number(value >> 16n), Number(value & 0xffffn));
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined;
        groups.push(Number.parseInt(part, 16));
      }
    }
    return groups;
  };

  const left = expand(halves[0] ?? "");
  const right = expand(halves[1] ?? "");
  if (!left || !right) return undefined;
  const groups = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right] : [...left];
  if (groups.length !== 8) return undefined;

  let value = 0n;
  for (const group of groups) value = (value << 16n) | BigInt(group);
  return value;
}

function ipv4Range(prefix: string, bits: number): IpRange {
  const value = ipv4Value(prefix);
  if (value === undefined) throw new Error(`Invalid IPv4 range: ${prefix}`);
  const hostBits = 32n - BigInt(bits);
  const start = (value >> hostBits) << hostBits;
  return [start, start + (1n << hostBits) - 1n];
}

function ipv6Range(prefix: string, bits: number): IpRange {
  const value = ipv6Value(prefix);
  if (value === undefined) throw new Error(`Invalid IPv6 range: ${prefix}`);
  const hostBits = 128n - BigInt(bits);
  const start = (value >> hostBits) << hostBits;
  return [start, start + (1n << hostBits) - 1n];
}

// Addresses that are not globally routable. Treating the whole special-use
// range as forbidden also covers cloud metadata endpoints such as 169.254.169.254.
const FORBIDDEN_IPV4: IpRange[] = [
  ipv4Range("0.0.0.0", 8),
  ipv4Range("10.0.0.0", 8),
  ipv4Range("100.64.0.0", 10),
  ipv4Range("127.0.0.0", 8),
  ipv4Range("169.254.0.0", 16),
  ipv4Range("172.16.0.0", 12),
  ipv4Range("192.0.0.0", 24),
  ipv4Range("192.0.2.0", 24),
  ipv4Range("192.168.0.0", 16),
  ipv4Range("192.88.99.0", 24),
  ipv4Range("198.18.0.0", 15),
  ipv4Range("198.51.100.0", 24),
  ipv4Range("203.0.113.0", 24),
  ipv4Range("224.0.0.0", 4),
  ipv4Range("240.0.0.0", 4),
];

const FORBIDDEN_IPV6: IpRange[] = [
  ipv6Range("::", 96), // unspecified and deprecated IPv4-compatible space
  ipv6Range("::ffff:0:0", 96), // IPv4-mapped addresses
  ipv6Range("100::", 64), // discard-only
  ipv6Range("2001::", 32), // Teredo and other reserved 2001:: space
  ipv6Range("2001:2::", 48), // benchmark
  ipv6Range("2001:10::", 28), // ORCHID
  ipv6Range("2001:20::", 28), // ORCHIDv2
  ipv6Range("2001:db8::", 32), // documentation
  ipv6Range("2002::", 16), // 6to4
  ipv6Range("3fff::", 20), // documentation
  ipv6Range("64:ff9b::", 96), // well-known NAT64 prefix
  ipv6Range("fc00::", 7), // unique-local
  ipv6Range("fe80::", 10), // link-local
  ipv6Range("ff00::", 8), // multicast
];

function inRange(value: bigint, ranges: readonly IpRange[]): boolean {
  return ranges.some(([start, end]) => value >= start && value <= end);
}

function forbiddenAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Value(address);
    return value === undefined || inRange(value, FORBIDDEN_IPV4);
  }
  if (family === 6) {
    const value = ipv6Value(address);
    if (value === undefined) return true;
    // Only global-unicast IPv6 is eligible. This excludes multicast,
    // link-local, unique-local, and all currently unassigned space up front.
    if (!inRange(value, [ipv6Range("2000::", 3)])) return true;
    return inRange(value, FORBIDDEN_IPV6);
  }
  return true;
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  return isIP(h) > 0 ? forbiddenAddress(h) : false;
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
  if (url.protocol === "https:" && isPrivateHost(url.hostname)) {
    throw new RelayError(400, "Webhook URL must not target a private address.");
  }
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

export type LookupImpl = (
  hostname: string,
  options: LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

export type RequestImpl = (options: HttpsRequestOptions, callback: (res: IncomingMessage) => void) => ClientRequest;

export type WebhookPostOptions = {
  timeoutMs?: number;
  /** Explicit local-test transport seam. Production uses native request by default. */
  fetchImpl?: typeof fetch;
  lookupImpl?: LookupImpl;
  requestImpl?: RequestImpl;
};

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30_000;

function boundedTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.ceil(value)));
}

function lookupFailure(message: string): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = "EHOSTUNREACH";
  return error;
}

function allAddresses(hostname: string, resolver: LookupImpl): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    try {
      resolver(hostname, { all: true, order: "verbatim" }, (error, addresses) => {
        if (error) reject(error);
        else if (!Array.isArray(addresses)) reject(new Error("Webhook hostname lookup returned no address list."));
        else resolve(addresses);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function resolvePublicAddress(hostname: string, resolver: LookupImpl): Promise<LookupAddress> {
  const addresses = await allAddresses(hostname, resolver);
  if (!addresses.length) throw new Error("Webhook hostname did not resolve to an address.");
  for (const resolved of addresses) {
    if (!resolved || (resolved.family !== 4 && resolved.family !== 6) || isIP(resolved.address) !== resolved.family) {
      throw new Error("Webhook hostname lookup returned an invalid address.");
    }
    if (forbiddenAddress(resolved.address)) {
      throw new Error("Webhook hostname resolves to a private or reserved address.");
    }
  }
  return addresses[0]!;
}

function withDeadline<T>(timeoutMs: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = Promise.resolve().then(() => task(controller.signal));
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Webhook request timed out."));
    }, timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function postWithFetch(url: string, body: string, secret: string, timeoutMs: number, send: typeof fetch): Promise<number> {
  return withDeadline(timeoutMs, async (signal) => {
    const res = await send(url, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        "x-agent-relay-event": "message",
        "x-agent-relay-signature": signWebhook(secret, body),
      },
      body,
      signal,
    });
    // The status is all the caller needs. Cancel the stream so a test or
    // alternate fetch implementation cannot leave an unbounded response open.
    void Promise.resolve(res.body?.cancel()).catch(() => {});
    return res.status;
  });
}

function postWithRequest(
  url: URL,
  body: string,
  secret: string,
  selected: LookupAddress | undefined,
  requester: RequestImpl,
  signal: AbortSignal,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const expectedHost = hostOf(url).toLowerCase().replace(/\.$/, "");
    const lookup: NonNullable<HttpsRequestOptions["lookup"]> = (hostname, options, callback) => {
      const actualHost = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
      if (actualHost !== expectedHost || !selected || forbiddenAddress(selected.address) || isIP(selected.address) !== selected.family) {
        callback(lookupFailure("Webhook target address changed or is not public."), "", 0);
        return;
      }
      if (options.all) callback(null, [{ address: selected.address, family: selected.family }]);
      else callback(null, selected.address, selected.family);
    };

    const requestOptions: HttpsRequestOptions = {
      protocol: url.protocol,
      hostname: hostOf(url),
      port: url.port ? Number(url.port) : undefined,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      agent: false,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body).toString(),
        "x-agent-relay-event": "message",
        "x-agent-relay-signature": signWebhook(secret, body),
      },
      signal,
    };
    if (selected) requestOptions.lookup = lookup;
    if (url.protocol === "https:" && isIP(hostOf(url)) === 0) requestOptions.servername = hostOf(url);

    let settled = false;
    const finish = (error?: unknown, status?: number) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else if (!Number.isInteger(status)) reject(new Error("Webhook response had no status."));
      else resolve(status!);
    };

    let request: ClientRequest;
    try {
      request = requester(requestOptions, (response) => {
        response.once("error", (error) => finish(error));
        response.once("aborted", () => finish(new Error("Webhook response was aborted.")));
        response.once("end", () => finish(undefined, response.statusCode));
        response.resume();
      });
    } catch (error) {
      finish(error);
      return;
    }
    request.once("error", (error) => finish(error));
    try {
      request.end(body);
    } catch (error) {
      finish(error);
    }
  });
}

export async function postWebhook(webhook: Webhook, payload: unknown, opts: WebhookPostOptions = {}): Promise<number> {
  const body = JSON.stringify(payload);
  if (body === undefined) throw new Error("Webhook payload must be JSON serializable.");
  const urlString = validWebhookUrl(webhook.url);
  const url = new URL(urlString);
  const timeoutMs = boundedTimeout(opts.timeoutMs);
  const insecureHttp = process.env.RELAY_ALLOW_INSECURE_WEBHOOK === "1" && url.protocol === "http:";

  if (opts.fetchImpl) {
    if (!insecureHttp) throw new Error("fetchImpl is only available for local insecure webhook tests.");
    return postWithFetch(urlString, body, webhook.secret, timeoutMs, opts.fetchImpl);
  }

  return withDeadline(timeoutMs, async (signal) => {
    const selected = insecureHttp
      ? undefined
      : await resolvePublicAddress(
          hostOf(url),
          opts.lookupImpl ?? ((hostname, options, callback) => dnsLookup(hostname, options, callback)),
        );
    signal.throwIfAborted();
    const requester: RequestImpl = opts.requestImpl ?? ((requestOptions, callback) => {
      return url.protocol === "https:" ? httpsRequest(requestOptions, callback) : httpRequest(requestOptions, callback);
    });
    return postWithRequest(url, body, webhook.secret, selected, requester, signal);
  });
}

/** Push a message to every recipient that registered a webhook. Best effort. */
export async function dispatchMessageWebhooks(
  lookup: { webhookFor(userId: string): Webhook | undefined },
  recipients: string[],
  payload: unknown,
  opts: WebhookPostOptions = {},
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
