import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type AllowEntry = {
  readonly file: string;
  readonly rule: string;
  readonly reason: string;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNodeError = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const stringField = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  context: string,
): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: "${key}" must be a non-empty string.`);
  }
  return value;
};

/** Read the reviewed exception list. A malformed list is a hard failure. */
export const readAllowlist = async (root: string): Promise<readonly AllowEntry[]> => {
  const path = join(root, "scripts/guardrails-allowlist.json");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return [];
    }
    throw error;
  }

  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new Error(`${path} must contain a JSON object.`);
  }

  const raw = parsed["allow"];
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: "allow" must be an array.`);
  }

  return raw.map((entry, index) => {
    const context = `${path}: allow[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`${context} must be an object.`);
    }
    return {
      file: stringField(entry, "file", context),
      rule: stringField(entry, "rule", context),
      reason: stringField(entry, "reason", context),
    };
  });
};

export const isAllowed = (allowlist: readonly AllowEntry[], file: string, rule: string): boolean =>
  allowlist.some((entry) => entry.file === file && entry.rule === rule);
