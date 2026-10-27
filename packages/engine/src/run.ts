import type { Connection, JsonObject, NodeInstance, Workflow } from "@krypton/schema";

import { isNodeExecutionResult, type NodeOutput, type NodeRegistry } from "./node.ts";
import type { EnginePorts } from "./ports.ts";
import type { TraceLine } from "./trace.ts";

const DEFAULT_MAX_STEPS = 10_000;
const DEFAULT_MAX_QUEUED_ITEMS = 10_000;
const DEFAULT_PORT = "main";

export type RunStatus = "ok" | "fail";

export type RunResult = {
  readonly status: RunStatus;
  readonly trace: readonly TraceLine[];
  readonly outputs: readonly JsonObject[];
};

export type RunWorkflowOptions = {
  readonly workflow: Workflow;
  readonly input: JsonObject;
  readonly nodes: NodeRegistry;
  readonly ports: EnginePorts;
  readonly signal: AbortSignal;
  readonly maxSteps?: number;
  readonly maxQueuedItems?: number;
};

type QueueEntry = {
  readonly node: NodeInstance;
  readonly item: JsonObject;
};

const formatItemCount = (count: number): string => `${count} ${count === 1 ? "item" : "items"}`;

const countOutputItems = (outputs: readonly NodeOutput[]): number =>
  outputs.reduce((total, output) => total + output.items.length, 0);

const compareNodeIds = (left: NodeInstance, right: NodeInstance): number => {
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
};

/**
 * Run a workflow one item at a time in deterministic queue order.
 *
 * The engine does not know any built-in node types; callers inject the registry.
 * It returns a trace and the items that reached terminal ports. It does not
 * persist anything or log.
 */
export const runWorkflow = async (options: RunWorkflowOptions): Promise<RunResult> => {
  const trace: TraceLine[] = [];
  const outputs: JsonObject[] = [];
  const runStartedAt = options.ports.clock.now();
  const elapsed = (): number => Math.max(0, options.ports.clock.now() - runStartedAt);

  const fail = (node: string, detail: string): RunResult => {
    trace.push({ atMs: elapsed(), node, status: "fail", detail });
    return { status: "fail", trace, outputs };
  };

  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) {
    return fail("workflow", "maxSteps must be a positive integer.");
  }

  const maxQueuedItems = options.maxQueuedItems ?? DEFAULT_MAX_QUEUED_ITEMS;
  if (!Number.isSafeInteger(maxQueuedItems) || maxQueuedItems < 1) {
    return fail("workflow", "maxQueuedItems must be a positive integer.");
  }

  if (options.signal.aborted) {
    return fail("workflow", "Run cancelled.");
  }

  const nodesById = new Map<NodeInstance["id"], NodeInstance>();
  const incomingCounts = new Map<NodeInstance["id"], number>();
  for (const node of options.workflow.nodes) {
    nodesById.set(node.id, node);
    incomingCounts.set(node.id, 0);
  }

  const outgoing = new Map<NodeInstance["id"], Connection[]>();
  for (const node of options.workflow.nodes) {
    outgoing.set(node.id, []);
  }
  for (const connection of options.workflow.connections) {
    const counts = incomingCounts.get(connection.to);
    if (counts !== undefined) {
      incomingCounts.set(connection.to, counts + 1);
    }
    const edges = outgoing.get(connection.from);
    if (edges !== undefined) {
      edges.push(connection);
    }
  }

  const startNodes = options.workflow.nodes
    .filter((node) => (incomingCounts.get(node.id) ?? 0) === 0)
    .toSorted(compareNodeIds);

  if (startNodes.length === 0) {
    return fail("workflow", "No start node. A workflow needs a node with no incoming connections.");
  }

  const queue: QueueEntry[] = startNodes.map((node) => ({
    node,
    item: options.input,
  }));

  if (queue.length > maxQueuedItems) {
    return fail("workflow", `Run exceeded ${maxQueuedItems} queued items.`);
  }

  let steps = 0;

  for (const entry of queue) {
    if (steps >= maxSteps) {
      return fail("workflow", `Run exceeded ${maxSteps} steps.`);
    }
    steps += 1;

    const executor = Object.hasOwn(options.nodes, entry.node.type)
      ? options.nodes[entry.node.type]
      : undefined;
    if (executor === undefined) {
      return fail(entry.node.id, `Unknown node type "${entry.node.type}".`);
    }

    let rawResult: unknown;
    try {
      rawResult = await executor({
        nodeId: entry.node.id,
        nodeType: entry.node.type,
        item: entry.item,
        parameters: entry.node.parameters,
        ports: options.ports,
        signal: options.signal,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Node execution failed.";
      return fail(entry.node.id, detail);
    }

    if (options.signal.aborted) {
      return fail("workflow", "Run cancelled.");
    }

    if (!isNodeExecutionResult(rawResult)) {
      return fail(entry.node.id, "Node returned an invalid result.");
    }

    const result = rawResult;
    trace.push({
      atMs: elapsed(),
      node: entry.node.id,
      status: "ok",
      detail: result.detail ?? formatItemCount(countOutputItems(result.outputs)),
    });

    const edges = outgoing.get(entry.node.id) ?? [];
    for (const output of result.outputs) {
      const matching = edges.filter(
        (connection) => (connection.fromPort ?? DEFAULT_PORT) === output.port,
      );

      if (matching.length === 0) {
        for (const item of output.items) {
          outputs.push(item);
        }
        continue;
      }

      for (const item of output.items) {
        for (const connection of matching) {
          if (queue.length >= maxQueuedItems) {
            return fail("workflow", `Run exceeded ${maxQueuedItems} queued items.`);
          }
          const target = nodesById.get(connection.to);
          if (target === undefined) {
            return fail(entry.node.id, `Connection points to unknown node "${connection.to}".`);
          }
          queue.push({ node: target, item });
        }
      }
    }
  }

  return { status: "ok", trace, outputs };
};
