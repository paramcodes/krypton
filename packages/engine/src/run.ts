import type { Connection, JsonObject, NodeInstance, RetryPolicy, Workflow } from "@krypton/schema";

import {
  compileParameters,
  evaluateParameters,
  ExpressionError,
  type CompiledParameters,
} from "./expression.ts";
import {
  isNodeExecutionResult,
  RetryableNodeError,
  type NodeExecutionResult,
  type NodeOutput,
  type NodeRegistry,
} from "./node.ts";
import type { EnginePorts } from "./ports.ts";
import type { TraceLine } from "./trace.ts";

const DEFAULT_MAX_STEPS = 10_000;
const DEFAULT_MAX_QUEUED_ITEMS = 10_000;
const DEFAULT_PORT = "main";
const SUPPORTED_EXPRESSION_VERSION = 1;
const MAX_RETRY_ATTEMPTS = 10;
const MAX_RETRY_DELAY_MS = 60_000;

const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 1,
  delayMs: 0,
  backoff: "fixed",
};

const readRetryPolicy = (node: NodeInstance): RetryPolicy | string => {
  if (node.retry === undefined) {
    return defaultRetryPolicy;
  }

  const { maxAttempts, delayMs, backoff } = node.retry;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_RETRY_ATTEMPTS) {
    return `Retry maxAttempts must be an integer between 1 and ${MAX_RETRY_ATTEMPTS}.`;
  }
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > MAX_RETRY_DELAY_MS) {
    return `Retry delayMs must be an integer between 0 and ${MAX_RETRY_DELAY_MS}.`;
  }
  if (backoff !== "fixed" && backoff !== "exponential") {
    return 'Retry backoff must be "fixed" or "exponential".';
  }

  return { maxAttempts, delayMs, backoff };
};

const retryDelay = (policy: RetryPolicy, attempt: number): number => {
  if (policy.backoff === "fixed") {
    return policy.delayMs;
  }
  return Math.min(MAX_RETRY_DELAY_MS, policy.delayMs * 2 ** (attempt - 1));
};

const errorDetail = (error: unknown): string =>
  error instanceof Error ? error.message : "Node execution failed.";

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

  if (options.workflow.expressionVersion !== SUPPORTED_EXPRESSION_VERSION) {
    return fail(
      "workflow",
      `Unsupported expression version ${options.workflow.expressionVersion}.`,
    );
  }

  const compiledParameters = new Map<NodeInstance["id"], CompiledParameters>();
  const retryPolicies = new Map<NodeInstance["id"], RetryPolicy>();
  for (const node of options.workflow.nodes) {
    try {
      compiledParameters.set(node.id, compileParameters(node.parameters, "$.parameters"));
    } catch (error) {
      const detail =
        error instanceof ExpressionError ? error.message : "Could not compile node parameters.";
      return fail(node.id, detail);
    }

    const retryPolicy = readRetryPolicy(node);
    if (typeof retryPolicy === "string") {
      return fail(node.id, retryPolicy);
    }
    retryPolicies.set(node.id, retryPolicy);
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

    const compiled = compiledParameters.get(entry.node.id);
    if (compiled === undefined) {
      return fail(entry.node.id, "Node parameters were not compiled.");
    }

    let parameters: JsonObject;
    try {
      parameters = evaluateParameters(compiled, { item: entry.item, input: options.input });
    } catch (error) {
      const detail =
        error instanceof ExpressionError ? error.message : "Could not evaluate node parameters.";
      return fail(entry.node.id, detail);
    }

    const retryPolicy = retryPolicies.get(entry.node.id) ?? defaultRetryPolicy;
    let result: NodeExecutionResult | undefined;
    let attempts = 0;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
      if (options.signal.aborted) {
        return fail("workflow", "Run cancelled.");
      }
      attempts = attempt;

      try {
        const rawResult: unknown = await executor({
          nodeId: entry.node.id,
          nodeType: entry.node.type,
          item: entry.item,
          parameters,
          ports: options.ports,
          signal: options.signal,
        });

        if (options.signal.aborted) {
          return fail("workflow", "Run cancelled.");
        }

        if (!isNodeExecutionResult(rawResult)) {
          return fail(entry.node.id, "Node returned an invalid result.");
        }

        result = rawResult;
        break;
      } catch (error) {
        if (options.signal.aborted) {
          return fail("workflow", "Run cancelled.");
        }

        if (!(error instanceof RetryableNodeError)) {
          return fail(entry.node.id, errorDetail(error));
        }

        trace.push({
          atMs: elapsed(),
          node: entry.node.id,
          status: "fail",
          detail: `attempt ${attempt}/${retryPolicy.maxAttempts}: ${error.message}`,
        });

        if (attempt >= retryPolicy.maxAttempts) {
          return { status: "fail", trace, outputs };
        }

        try {
          await options.ports.clock.sleep(retryDelay(retryPolicy, attempt), options.signal);
        } catch (sleepError) {
          if (options.signal.aborted) {
            return fail("workflow", "Run cancelled.");
          }
          return fail(entry.node.id, errorDetail(sleepError));
        }

        if (options.signal.aborted) {
          return fail("workflow", "Run cancelled.");
        }
      }
    }

    if (result === undefined) {
      return fail(entry.node.id, "Node did not complete.");
    }

    const detail = result.detail ?? formatItemCount(countOutputItems(result.outputs));
    trace.push({
      atMs: elapsed(),
      node: entry.node.id,
      status: "ok",
      detail: attempts > 1 ? `attempt ${attempts}/${retryPolicy.maxAttempts}: ${detail}` : detail,
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
