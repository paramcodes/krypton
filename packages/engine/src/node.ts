import { isJsonObject, isRecord, type JsonObject, type NodeId } from "@krypton/schema";

import type { EnginePorts } from "./ports.ts";

/**
 * Context for one node execution. Parameters have already had their whole-field
 * expressions resolved for this item. Executors must treat the item, parameters,
 * and ports as immutable, and should return new objects instead of mutating
 * their input. The engine may reuse the input object for several start nodes.
 */
export type NodeExecutionContext = {
  readonly nodeId: NodeId;
  readonly nodeType: string;
  readonly item: JsonObject;
  readonly parameters: JsonObject;
  readonly ports: EnginePorts;
  readonly signal: AbortSignal;
};

export type NodeOutput = {
  readonly port: string;
  readonly items: readonly JsonObject[];
};

export type NodeExecutionResult = {
  readonly outputs: readonly NodeOutput[];
  readonly detail?: string;
};

export type NodeExecutor = (context: NodeExecutionContext) => Promise<NodeExecutionResult>;

export type NodeRegistry = Readonly<Record<string, NodeExecutor>>;

/**
 * Mark a failure as safe to retry under the node instance's retry policy.
 * Validation errors and ordinary node errors deliberately do not opt in.
 */
export class RetryableNodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetryableNodeError";
  }
}

const isNodeOutput = (value: unknown): value is NodeOutput => {
  if (!isRecord(value)) {
    return false;
  }
  const port = value["port"];
  const items = value["items"];
  if (typeof port !== "string" || port.trim() === "" || !Array.isArray(items)) {
    return false;
  }
  for (const item of items) {
    if (!isJsonObject(item)) {
      return false;
    }
  }
  return true;
};

/**
 * Validate a node result at the engine boundary. Node executors are injected,
 * so their runtime shape is untrusted even when the template types agree.
 */
export const isNodeExecutionResult = (value: unknown): value is NodeExecutionResult => {
  if (!isRecord(value)) {
    return false;
  }
  const outputs = value["outputs"];
  const detail = value["detail"];
  if (!Array.isArray(outputs)) {
    return false;
  }
  for (const output of outputs) {
    if (!isNodeOutput(output)) {
      return false;
    }
  }
  return detail === undefined || typeof detail === "string";
};
