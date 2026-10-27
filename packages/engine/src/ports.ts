/**
 * External effects the engine may need. Add a port only when its first consumer
 * exists, so the engine cannot quietly depend on ambient runtime state.
 */
export type Clock = {
  readonly now: () => number;
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

export const MAX_HTTP_TIMEOUT_MS = 120_000;
export const MAX_HTTP_RESPONSE_BYTES = 10_000_000;

export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

export type HttpRequest = {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
};

export type HttpResponse = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
};

export type HttpErrorCode =
  | "invalid-request"
  | "blocked-address"
  | "dns"
  | "network"
  | "timeout"
  | "response-too-large"
  | "aborted";

/**
 * A stable failure shape for the Http port. The port decides whether a failure
 * is safe to retry; node code translates that into a RetryableNodeError.
 */
export class HttpError extends Error {
  readonly code: HttpErrorCode;
  readonly retryable: boolean;

  constructor(code: HttpErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type Http = {
  readonly request: (request: HttpRequest, signal: AbortSignal) => Promise<HttpResponse>;
};

export type EnginePorts = {
  readonly clock: Clock;
  readonly http: Http;
};
