import { SchemaError } from "./errors.ts";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type JsonObject = { readonly [key: string]: JsonValue };

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const isJsonObject = (value: unknown): value is JsonObject => isRecord(value);

const MAX_JSON_DEPTH = 64;

/**
 * Convert an untrusted value into plain JSON. Rejects functions, undefined,
 * symbols, class instances, non-finite numbers, and anything else that cannot
 * survive a JSON round trip.
 */
export const parseJsonValue = (value: unknown, path = "$", depth = 0): JsonValue => {
  if (depth > MAX_JSON_DEPTH) {
    throw new SchemaError(path, `Expected a JSON value no deeper than ${MAX_JSON_DEPTH} levels.`);
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SchemaError(path, "Expected a finite JSON number.");
    }
    return value;
  }

  if (Array.isArray(value)) {
    const parsed: JsonValue[] = [];
    for (const [index, item] of value.entries()) {
      parsed.push(parseJsonValue(item, `${path}[${index}]`, depth + 1));
    }
    return parsed;
  }

  if (isRecord(value)) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new SchemaError(path, "JSON object keys must be strings.");
    }
    const entries: Array<readonly [string, JsonValue]> = [];
    for (const [key, item] of Object.entries(value)) {
      entries.push([key, parseJsonValue(item, `${path}.${key}`, depth + 1)]);
    }
    return Object.fromEntries(entries);
  }

  throw new SchemaError(path, "Expected a JSON value.");
};

export const parseJsonObject = (value: unknown, path = "$"): JsonObject => {
  const parsed = parseJsonValue(value, path);
  if (!isJsonObject(parsed)) {
    throw new SchemaError(path, "Expected a JSON object.");
  }
  return parsed;
};
