import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import {
  request as httpRequest,
  validateHeaderName,
  validateHeaderValue,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
} from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { BlockList, isIP } from "node:net";
import { performance } from "node:perf_hooks";

import {
  HttpError,
  MAX_HTTP_RESPONSE_BYTES,
  MAX_HTTP_TIMEOUT_MS,
  type Http,
  type HttpRequest,
  type HttpResponse,
} from "@krypton/engine";

export type HttpPortOptions = {
  /**
   * Explicitly allow loopback and private addresses. The CLI never sets this;
   * it exists for local adapter tests and a future reviewed allow-list setting.
   */
  readonly allowPrivateNetworks?: boolean;
};

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();

const blockedIpv4Subnets: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
  ["255.255.255.255", 32],
];

for (const [address, prefix] of blockedIpv4Subnets) {
  blockedIpv4.addSubnet(address, prefix, "ipv4");
}

const blockedIpv6Subnets: readonly (readonly [string, number])[] = [
  ["::", 128],
  ["::1", 128],
  ["::", 96],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

for (const [address, prefix] of blockedIpv6Subnets) {
  blockedIpv6.addSubnet(address, prefix, "ipv6");
}

/**
 * True when an IP literal is outside the public internet. Invalid values are
 * treated as blocked so a malformed resolver result cannot bypass the policy.
 */
export const isBlockedAddress = (address: string): boolean => {
  const normalized =
    address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
  const family = isIP(normalized);
  if (family === 0) {
    return true;
  }
  try {
    return family === 6
      ? blockedIpv6.check(normalized, "ipv6")
      : blockedIpv4.check(normalized, "ipv4");
  } catch {
    return true;
  }
};

const blockedHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa") ||
    normalized.endsWith(".lan")
  );
};

const parseTargetUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError("invalid-request", "The URL is invalid.", false);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError("invalid-request", "Only http and https URLs are allowed.", false);
  }
  if (url.username !== "" || url.password !== "") {
    throw new HttpError("invalid-request", "URL credentials are not allowed.", false);
  }
  if (url.hostname === "") {
    throw new HttpError("invalid-request", "The URL needs a hostname.", false);
  }

  return url;
};

type ResolvedTarget = {
  readonly address: string;
};

const resolveTargetWithinTimeout = (
  url: URL,
  allowPrivateNetworks: boolean,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<ResolvedTarget> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      settle();
    };
    const onAbort = (): void => {
      finish(() => reject(new HttpError("aborted", "The request was aborted.", false)));
    };
    const timer = setTimeout(() => {
      finish(() =>
        reject(new HttpError("timeout", `Request timed out after ${timeoutMs}ms.`, true)),
      );
    }, timeoutMs);

    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    void resolveTarget(url, allowPrivateNetworks).then(
      (target) => finish(() => resolve(target)),
      (error: unknown) => finish(() => reject(error)),
    );
  });

const validatePortRequest = (request: HttpRequest): void => {
  if (
    !Number.isSafeInteger(request.timeoutMs) ||
    request.timeoutMs < 1 ||
    request.timeoutMs > MAX_HTTP_TIMEOUT_MS
  ) {
    throw new HttpError(
      "invalid-request",
      "The request timeout is outside the supported range.",
      false,
    );
  }
  if (
    !Number.isSafeInteger(request.maxResponseBytes) ||
    request.maxResponseBytes < 1 ||
    request.maxResponseBytes > MAX_HTTP_RESPONSE_BYTES
  ) {
    throw new HttpError(
      "invalid-request",
      "The response-size limit is outside the supported range.",
      false,
    );
  }
};

const resolveTarget = async (url: URL, allowPrivateNetworks: boolean): Promise<ResolvedTarget> => {
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;

  if (!allowPrivateNetworks && blockedHostname(hostname)) {
    throw new HttpError("blocked-address", `Blocked private hostname "${hostname}".`, false);
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (!allowPrivateNetworks && isBlockedAddress(hostname)) {
      throw new HttpError("blocked-address", `Blocked private address "${hostname}".`, false);
    }
    return { address: hostname };
  }

  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError("dns", `Could not resolve host "${hostname}".`, true);
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new HttpError("dns", `Could not resolve host "${hostname}".`, true);
  }

  if (!allowPrivateNetworks) {
    for (const entry of addresses) {
      if (isBlockedAddress(entry.address)) {
        throw new HttpError(
          "blocked-address",
          `Blocked private address for host "${hostname}".`,
          false,
        );
      }
    }
  }

  const first = addresses[0];
  if (first === undefined || (first.family !== 4 && first.family !== 6)) {
    throw new HttpError("dns", `Could not resolve host "${hostname}".`, true);
  }
  return { address: first.address };
};

const normalizeHeaders = (headers: IncomingHttpHeaders): Record<string, string> => {
  const entries: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      entries.push([name.toLowerCase(), Array.isArray(value) ? value.join(", ") : value]);
    }
  }
  return Object.fromEntries(entries);
};

const asHttpError = (error: unknown): HttpError => {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof Error && "code" in error && error.code === "ABORT_ERR") {
    return new HttpError("aborted", "The request was aborted.", false);
  }
  return new HttpError(
    "network",
    error instanceof Error ? error.message : "The request failed.",
    true,
  );
};

const validateHeaders = (headers: Readonly<Record<string, string>>): void => {
  for (const [name, value] of Object.entries(headers)) {
    try {
      validateHeaderName(name);
      validateHeaderValue(name, value);
    } catch {
      throw new HttpError("invalid-request", `Invalid HTTP header "${name}".`, false);
    }
  }
};

const requestOptions = (url: URL, request: HttpRequest, target: ResolvedTarget): RequestOptions => {
  const headerEntries: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(request.headers)) {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName === "host" ||
      normalizedName === "content-length" ||
      normalizedName === "transfer-encoding"
    ) {
      continue;
    }
    headerEntries.push([name, value]);
  }
  const headers = Object.fromEntries(headerEntries);
  headers["host"] = url.host;
  validateHeaders(headers);

  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
  const options: RequestOptions = {
    protocol: url.protocol,
    hostname: target.address,
    port,
    method: request.method,
    path: `${url.pathname}${url.search}`,
    headers,
    agent: false,
  };

  const bareHostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (url.protocol === "https:" && isIP(bareHostname) === 0) {
    return { ...options, servername: bareHostname };
  }
  return options;
};

const performRequest = async (
  request: HttpRequest,
  signal: AbortSignal,
  allowPrivateNetworks: boolean,
): Promise<HttpResponse> => {
  if (signal.aborted) {
    throw new HttpError("aborted", "The request was aborted.", false);
  }
  validatePortRequest(request);

  const startedAt = performance.now();
  const url = parseTargetUrl(request.url);
  const target = await resolveTargetWithinTimeout(
    url,
    allowPrivateNetworks,
    request.timeoutMs,
    signal,
  );
  const remainingTimeoutMs = Math.floor(request.timeoutMs - (performance.now() - startedAt));
  if (remainingTimeoutMs < 1) {
    throw new HttpError("timeout", `Request timed out after ${request.timeoutMs}ms.`, true);
  }

  if (signal.aborted) {
    throw new HttpError("aborted", "The request was aborted.", false);
  }

  return new Promise<HttpResponse>((resolve, reject) => {
    let settled = false;
    const handles: { request?: ClientRequest; timer?: NodeJS.Timeout } = {};

    const finish = (settle: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (handles.timer !== undefined) {
        clearTimeout(handles.timer);
      }
      signal.removeEventListener("abort", onAbort);
      settle();
    };

    const fail = (error: unknown): void => {
      finish(() => {
        reject(asHttpError(error));
      });
    };

    const onAbort = (): void => {
      handles.request?.destroy(new HttpError("aborted", "The request was aborted.", false));
    };

    const onResponse = (response: IncomingMessage): void => {
      const chunks: Buffer[] = [];
      let size = 0;

      response.on("data", (chunk: Buffer) => {
        if (settled) {
          return;
        }
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.byteLength;
        if (size > request.maxResponseBytes) {
          const error = new HttpError(
            "response-too-large",
            `Response exceeded ${request.maxResponseBytes} bytes.`,
            false,
          );
          fail(error);
          handles.request?.destroy(error);
          return;
        }
        chunks.push(buffer);
      });

      response.on("end", () => {
        const status = response.statusCode;
        if (status === undefined) {
          fail(new HttpError("network", "The response had no status.", true));
          return;
        }
        finish(() => {
          resolve({
            status,
            headers: normalizeHeaders(response.headers),
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      });

      response.on("aborted", () => {
        fail(new HttpError("network", "The response was aborted.", true));
      });
      response.on("error", fail);
    };

    const options = requestOptions(url, request, target);
    const requestHandle =
      url.protocol === "https:"
        ? httpsRequest(options, onResponse)
        : httpRequest(options, onResponse);
    handles.request = requestHandle;

    handles.timer = setTimeout(() => {
      handles.request?.destroy(
        new HttpError("timeout", `Request timed out after ${request.timeoutMs}ms.`, true),
      );
    }, remainingTimeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
    }

    requestHandle.on("error", fail);
    requestHandle.on("close", () => {
      if (!settled) {
        fail(new HttpError("network", "The connection closed before a response.", true));
      }
    });

    if (request.body !== undefined) {
      requestHandle.write(request.body);
    }
    requestHandle.end();
  });
};

export const createHttpPort = (options: HttpPortOptions = {}): Http => ({
  request: async (request, signal) =>
    performRequest(request, signal, options.allowPrivateNetworks === true),
});
