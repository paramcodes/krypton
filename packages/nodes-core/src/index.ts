import {
  HttpError,
  MAX_HTTP_RESPONSE_BYTES,
  MAX_HTTP_TIMEOUT_MS,
  RetryableNodeError,
  type HttpMethod,
  type HttpResponse,
  type NodeExecutor,
} from "@krypton/engine";
import {
  isJsonObject,
  parseJsonValue,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from "@krypton/schema";

import { DEFAULT_HTTP_MAX_RESPONSE_BYTES, DEFAULT_HTTP_TIMEOUT_MS } from "./defaults.ts";

const manualTrigger: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item] }],
});

const set: NodeExecutor = async ({ item, parameters }) => {
  const values = parameters["values"];
  const fields = values === undefined ? {} : values;
  if (!isJsonObject(fields)) {
    throw new Error("Set node parameter 'values' must be an object.");
  }

  const next: JsonObject = { ...item, ...fields };
  const count = Object.keys(fields).length;
  return {
    outputs: [{ port: "main", items: [next] }],
    detail: `${count} ${count === 1 ? "field" : "fields"}`,
  };
};

const branch: NodeExecutor = async ({ item, parameters }) => {
  const condition = parameters["condition"];
  if (typeof condition !== "boolean") {
    throw new Error("IF node parameter 'condition' must be a boolean.");
  }

  const port = condition ? "true" : "false";
  return {
    outputs: [{ port, items: [item] }],
    detail: `branch ${port}`,
  };
};

const isJsonPrimitive = (value: unknown): value is JsonPrimitive =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

const isSwitchPort = (value: unknown): value is string => {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))) {
      return false;
    }
  }
  return true;
};

const switchNode: NodeExecutor = async ({ item, parameters }) => {
  const value = parameters["value"];
  if (!isJsonPrimitive(value)) {
    throw new Error("Switch node parameter 'value' must be a JSON scalar.");
  }

  const cases = parameters["cases"];
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error("Switch node parameter 'cases' must be a non-empty array.");
  }

  const seenValues = new Set<JsonPrimitive>();
  let matchingPort: string | undefined;
  for (const [index, caseValue] of cases.entries()) {
    if (!isJsonObject(caseValue)) {
      throw new Error(`Switch node case ${index} must be an object.`);
    }

    const candidate = caseValue["value"];
    if (!isJsonPrimitive(candidate)) {
      throw new Error(`Switch node case ${index} value must be a JSON scalar.`);
    }
    if (seenValues.has(candidate)) {
      throw new Error("Switch node case values must be unique.");
    }
    seenValues.add(candidate);

    const port = caseValue["port"];
    if (!isSwitchPort(port)) {
      throw new Error(
        `Switch node case ${index} port must be a non-empty string without controls.`,
      );
    }
    if (value === candidate) {
      matchingPort = port;
    }
  }

  const port = matchingPort ?? "default";
  return {
    outputs: [{ port, items: [item] }],
    detail: `switch ${port}`,
  };
};

const httpMethods: readonly HttpMethod[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];
const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const retryableStatuses = new Set([408, 425, 429]);

const isHttpMethod = (value: string): value is HttpMethod =>
  httpMethods.some((method) => method === value);

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) {
      return true;
    }
  }
  return false;
};

const readHttpUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("HTTP Request parameter 'url' must be a non-empty URL.");
  }

  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("HTTP Request parameter 'url' must be a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("HTTP Request parameter 'url' must use the http or https URL scheme.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("HTTP Request parameter 'url' must not contain URL credentials.");
  }

  return url.toString();
};

const readHttpMethod = (value: unknown): HttpMethod => {
  if (value === undefined) {
    return "GET";
  }
  if (typeof value !== "string") {
    throw new Error("HTTP Request parameter 'method' must be a string.");
  }

  const method = value.trim().toUpperCase();
  if (!isHttpMethod(method)) {
    throw new Error(`HTTP Request parameter 'method' is not supported: "${value}".`);
  }
  return method;
};

const readHeaders = (value: unknown): Array<[string, string]> => {
  if (value === undefined) {
    return [];
  }
  if (!isJsonObject(value)) {
    throw new Error("HTTP Request parameter 'headers' must be an object.");
  }

  const entries: Array<[string, string]> = [];
  const names = new Set<string>();
  for (const [name, headerValue] of Object.entries(value)) {
    const normalizedName = name.toLowerCase();
    if (!headerNamePattern.test(name)) {
      throw new Error(`HTTP Request header name is invalid: "${name}".`);
    }
    if (names.has(normalizedName)) {
      throw new Error(`HTTP Request header "${name}" is duplicated with different casing.`);
    }
    if (["host", "content-length", "transfer-encoding"].includes(normalizedName)) {
      throw new Error(`HTTP Request header "${name}" is managed by the adapter.`);
    }
    if (typeof headerValue !== "string" || hasControlCharacter(headerValue)) {
      throw new Error(`HTTP Request header "${name}" must be a single-line string.`);
    }
    names.add(normalizedName);
    entries.push([normalizedName, headerValue]);
  }
  return entries;
};

const readBoundedInteger = (
  value: unknown,
  name: string,
  fallback: number,
  maximum: number,
): number => {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(
      `HTTP Request parameter '${name}' must be an integer between 1 and ${maximum}.`,
    );
  }
  return value;
};

const serializeBody = (
  value: unknown,
): { readonly body: string | undefined; readonly json: boolean } => {
  if (value === undefined) {
    return { body: undefined, json: false };
  }
  if (typeof value === "string") {
    return { body: value, json: false };
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("HTTP Request parameter 'body' must be JSON.");
  }
  return { body: serialized, json: true };
};

const responseHeader = (headers: Readonly<Record<string, string>>, name: string): string => {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1] ?? "";
};

const parseResponseJson = (
  body: string,
  headers: Readonly<Record<string, string>>,
): JsonValue | undefined => {
  if (body === "" || !responseHeader(headers, "content-type").toLowerCase().includes("json")) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(body);
    return parseJsonValue(parsed);
  } catch {
    return undefined;
  }
};

const isRetryableStatus = (status: number): boolean =>
  retryableStatuses.has(status) || (status >= 500 && status <= 599);

const isRetrySafeRequest = (method: HttpMethod, headers: readonly [string, string][]): boolean =>
  ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(method) ||
  headers.some(([name, value]) => name === "idempotency-key" && value.trim() !== "");

const httpRequest: NodeExecutor = async ({ item, parameters, ports, signal }) => {
  const url = readHttpUrl(parameters["url"]);
  const method = readHttpMethod(parameters["method"]);
  const headerEntries = readHeaders(parameters["headers"]);
  const timeoutMs = readBoundedInteger(
    parameters["timeoutMs"],
    "timeoutMs",
    DEFAULT_HTTP_TIMEOUT_MS,
    MAX_HTTP_TIMEOUT_MS,
  );
  const maxResponseBytes = readBoundedInteger(
    parameters["maxResponseBytes"],
    "maxResponseBytes",
    DEFAULT_HTTP_MAX_RESPONSE_BYTES,
    MAX_HTTP_RESPONSE_BYTES,
  );
  const serializedBody = serializeBody(parameters["body"]);
  const retrySafe = isRetrySafeRequest(method, headerEntries);

  if (
    serializedBody.json &&
    !headerEntries.some(([name]) => name.toLowerCase() === "content-type")
  ) {
    headerEntries.push(["content-type", "application/json"]);
  }

  const request =
    serializedBody.body === undefined
      ? {
          url,
          method,
          headers: Object.fromEntries(headerEntries),
          timeoutMs,
          maxResponseBytes,
        }
      : {
          url,
          method,
          headers: Object.fromEntries(headerEntries),
          body: serializedBody.body,
          timeoutMs,
          maxResponseBytes,
        };

  let response: HttpResponse;
  try {
    response = await ports.http.request(request, signal);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.retryable && retrySafe) {
        throw new RetryableNodeError(error.message, { cause: error });
      }
      throw error;
    }
    throw error;
  }

  if (!Number.isSafeInteger(response.status) || response.status < 100 || response.status > 599) {
    throw new Error("HTTP port returned an invalid status.");
  }

  if (response.status < 200 || response.status >= 400) {
    if (isRetryableStatus(response.status) && retrySafe) {
      throw new RetryableNodeError(`HTTP ${response.status}.`);
    }
    throw new Error(`HTTP ${response.status}.`);
  }

  const responseHeaders = Object.fromEntries(Object.entries(response.headers));
  const parsedJson = parseResponseJson(response.body, responseHeaders);
  const responseValue: JsonObject = {
    status: response.status,
    headers: responseHeaders,
    body: response.body,
  };
  const httpValue: JsonObject =
    parsedJson === undefined ? responseValue : { ...responseValue, json: parsedJson };

  return {
    outputs: [{ port: "main", items: [{ ...item, http: httpValue }] }],
    detail: `HTTP ${response.status}`,
  };
};

export const coreNodes: Readonly<Record<string, NodeExecutor>> = {
  "manual-trigger": manualTrigger,
  set,
  if: branch,
  switch: switchNode,
  "http-request": httpRequest,
};

export { coreNodeCatalog } from "./catalog.ts";
