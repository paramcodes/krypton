import { asNodeId, asWorkflowId, type NodeId, type WorkflowId } from "./brand.ts";
import { SchemaError } from "./errors.ts";
import { isRecord, parseJsonObject, type JsonObject } from "./json.ts";

export type NodeInstance = {
  readonly id: NodeId;
  readonly type: string;
  readonly parameters: JsonObject;
};

export type Connection = {
  readonly from: NodeId;
  readonly to: NodeId;
  readonly fromPort?: string;
};

export type Workflow = {
  readonly id: WorkflowId;
  readonly name: string;
  readonly expressionVersion: number;
  readonly nodes: readonly NodeInstance[];
  readonly connections: readonly Connection[];
};

const readObject = (value: unknown, path: string): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) {
    throw new SchemaError(path, "Expected an object.");
  }
  return value;
};

const readArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new SchemaError(path, "Expected an array.");
  }
  return Array.from(value);
};

const MAX_WORKFLOW_NODES = 1_000;
const MAX_WORKFLOW_CONNECTIONS = 5_000;

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || (code >= 0x7f && code <= 0x9f))) {
      return true;
    }
  }
  return false;
};

const readString = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new SchemaError(`${path}.${key}`, "Expected a non-empty string.");
  }
  if (hasControlCharacter(value)) {
    throw new SchemaError(`${path}.${key}`, "Expected a string without control characters.");
  }
  return value;
};

const readPositiveInteger = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new SchemaError(`${path}.${key}`, "Expected a positive integer.");
  }
  return value;
};

const readOptionalString = (
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): string | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new SchemaError(`${path}.${key}`, "Expected a non-empty string when present.");
  }
  if (hasControlCharacter(value)) {
    throw new SchemaError(`${path}.${key}`, "Expected a string without control characters.");
  }
  return value;
};

const parseNode = (value: unknown, path: string): NodeInstance => {
  const record = readObject(value, path);
  const id = readString(record, "id", path);
  const type = readString(record, "type", path);
  const parametersValue = record["parameters"];
  const parameters =
    parametersValue === undefined ? {} : parseJsonObject(parametersValue, `${path}.parameters`);

  return { id: asNodeId(id), type, parameters };
};

const parseConnection = (
  value: unknown,
  path: string,
  nodeIds: ReadonlySet<NodeId>,
): Connection => {
  const record = readObject(value, path);
  const fromId = asNodeId(readString(record, "from", path));
  const toId = asNodeId(readString(record, "to", path));

  if (!nodeIds.has(fromId)) {
    throw new SchemaError(`${path}.from`, `Unknown node "${fromId}".`);
  }
  if (!nodeIds.has(toId)) {
    throw new SchemaError(`${path}.to`, `Unknown node "${toId}".`);
  }

  const fromPort = readOptionalString(record, "fromPort", path);
  return fromPort === undefined ? { from: fromId, to: toId } : { from: fromId, to: toId, fromPort };
};

/**
 * Validate an untrusted workflow value and brand its identifiers. Call this
 * once at the boundary; the engine works with the typed result.
 */
export const parseWorkflow = (value: unknown): Workflow => {
  const record = readObject(value, "$");
  const id = readString(record, "id", "$");
  const name = readString(record, "name", "$");
  const expressionVersion =
    record["expressionVersion"] === undefined
      ? 1
      : readPositiveInteger(record, "expressionVersion", "$");
  const nodeValues = readArray(record["nodes"], "$.nodes");

  if (nodeValues.length === 0) {
    throw new SchemaError("$.nodes", "A workflow needs at least one node.");
  }
  if (nodeValues.length > MAX_WORKFLOW_NODES) {
    throw new SchemaError("$.nodes", `A workflow may have at most ${MAX_WORKFLOW_NODES} nodes.`);
  }

  const nodes = nodeValues.map((node, index) => parseNode(node, `$.nodes[${index}]`));
  const nodeIds = new Set<NodeId>();
  for (const [index, node] of nodes.entries()) {
    if (nodeIds.has(node.id)) {
      throw new SchemaError(`$.nodes[${index}].id`, `Duplicate node id "${node.id}".`);
    }
    nodeIds.add(node.id);
  }

  const connectionsValue = record["connections"];
  const connectionValues =
    connectionsValue === undefined ? [] : readArray(connectionsValue, "$.connections");
  if (connectionValues.length > MAX_WORKFLOW_CONNECTIONS) {
    throw new SchemaError(
      "$.connections",
      `A workflow may have at most ${MAX_WORKFLOW_CONNECTIONS} connections.`,
    );
  }
  const connections = connectionValues.map((connection, index) =>
    parseConnection(connection, `$.connections[${index}]`, nodeIds),
  );

  return {
    id: asWorkflowId(id),
    name,
    expressionVersion,
    nodes,
    connections,
  };
};
