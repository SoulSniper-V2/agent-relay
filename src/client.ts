export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type RelayClientErrorCode = "timeout" | "network" | "invalid_response";

export class RelayClientError extends Error {
  code: RelayClientErrorCode;

  constructor(code: RelayClientErrorCode, message: string) {
    super(message);
    this.name = "RelayClientError";
    this.code = code;
  }
}

export interface RelayClientOptions {
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

function redactToken(message: string, token?: string): string {
  return token ? message.split(token).join("[redacted]") : message;
}

function fallbackApiMessage(res: Response, token?: string): string {
  const statusText = res.statusText.trim();
  return redactToken(statusText || `HTTP ${res.status}`, token);
}

function hasJsonContentType(contentType: string | null): boolean {
  return contentType === null || /\bjson\b/i.test(contentType);
}

export class RelayClient {
  readonly timeoutMs: number;

  constructor(
    public url: string,
    public token?: string,
    options: RelayClientOptions = {},
  ) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("RelayClient timeoutMs must be a finite positive number.");
    }
    this.timeoutMs = timeoutMs;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${this.url.replace(/\/$/, "")}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      // Keep the timeout active while consuming the response body too. A server
      // can send headers promptly and then leave the body hanging indefinitely.
      text = await res.text();
    } catch {
      if (controller.signal.aborted) {
        throw new RelayClientError(
          "timeout",
          `Agent Relay request timed out after ${this.timeoutMs} ms. Check the hub URL and network connection, then try again.`,
        );
      }
      throw new RelayClientError(
        "network",
        "Unable to reach the Agent Relay hub. Check the hub URL and network connection, then try again.",
      );
    } finally {
      clearTimeout(timer);
    }

    const trimmed = text.trim();
    let data: unknown = {};
    if (trimmed) {
      try {
        data = JSON.parse(text);
      } catch {
        if (!res.ok) {
          throw new ApiError(res.status, fallbackApiMessage(res, this.token));
        }
        throw new RelayClientError(
          "invalid_response",
          "Agent Relay returned a successful response that was not valid JSON. Check that the hub URL points to the Agent Relay API.",
        );
      }
    }

    if (!res.ok) {
      const err =
        data && typeof data === "object" && !Array.isArray(data) && typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : fallbackApiMessage(res, this.token);
      throw new ApiError(res.status, redactToken(err, this.token));
    }

    if (trimmed && !hasJsonContentType(res.headers.get("content-type"))) {
      throw new RelayClientError(
        "invalid_response",
        "Agent Relay returned a successful response with a non-JSON content type. Check that the hub URL points to the Agent Relay API.",
      );
    }

    return data as T;
  }
}
