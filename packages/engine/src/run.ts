import type {
  Connection,
  ErrorPolicy,
  JsonObject,
  NodeInstance,
  RetryPolicy,
  Workflow,
} from "@krypton/schema";

import {
  compileParameters,
  evaluateParameters,
  ExpressionError,
  type CompiledParameters,
} from "./expression.ts";
import {
  ERROR_PORT,
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
const MAX_NODE_TIMEOUT_MS = 120_000;

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

class NodeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Node timed out after ${timeoutMs}ms.`);
    this.name = "NodeTimeoutError";
  }
}

const readNodeTimeout = (node: NodeInstance): number | string | undefined => {
  const { timeoutMs } = node;
  if (timeoutMs === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_NODE_TIMEOUT_MS) {
    return `timeoutMs must be an integer between 1 and ${MAX_NODE_TIMEOUT_MS}.`;
  }
  return timeoutMs;
};

type ErrorPolicyRead =
  | { readonly valid: true; readonly policy: ErrorPolicy }
  | { readonly valid: false; readonly detail: string };

const readErrorPolicy = (node: NodeInstance): ErrorPolicyRead => {
  const value: unknown = node.errorPolicy;
  if (value === undefined || value === "fail") {
    return { valid: true, policy: "fail" };
  }
  if (value === "skip" || value === "route") {
    return { valid: true, policy: value };
  }
  return {
    valid: false,
    detail: 'errorPolicy must be "fail", "skip", or "route".',
  };
};

const executeWithTimeout = async (
  execute: (signal: AbortSignal) => Promise<unknown>,
  timeoutMs: number,
  clock: EnginePorts["clock"],
  runSignal: AbortSignal,
): Promise<unknown> => {
  if (runSignal.aborted) {
    throw new Error("Run cancelled.");
  }

  const attemptController = new AbortController();
  const timeoutController = new AbortController();
  const listeners: { onRunAbort?: () => void } = {};
  let timedOut = false;

  const cancellation = new Promise<never>((_resolve, reject) => {
    const onRunAbort = (): void => {
      attemptController.abort();
      reject(new Error("Run cancelled."));
    };
    listeners.onRunAbort = onRunAbort;
    runSignal.addEventListener("abort", onRunAbort, { once: true });
    if (runSignal.aborted) {
      onRunAbort();
    }
  });

  if (runSignal.aborted) {
    if (listeners.onRunAbort !== undefined) {
      runSignal.removeEventListener("abort", listeners.onRunAbort);
    }
    return await cancellation;
  }

  const timeout = Promise.resolve()
    .then(() => clock.sleep(timeoutMs, timeoutController.signal))
    .then(() => {
      if (timeoutController.signal.aborted) {
        throw new Error("Timeout sleep was cancelled.");
      }
      timedOut = true;
      attemptController.abort();
      throw new NodeTimeoutError(timeoutMs);
    });

  let execution: Promise<unknown>;
  try {
    execution = execute(attemptController.signal);
  } catch (error) {
    execution = Promise.reject(error);
  }
  const guardedExecution = execution.then(
    (result) => {
      if (timedOut) {
        throw new NodeTimeoutError(timeoutMs);
      }
      return result;
    },
    (error: unknown) => {
      if (timedOut) {
        throw new NodeTimeoutError(timeoutMs);
      }
      throw error;
    },
  );

  try {
    return await Promise.race([guardedExecution, timeout, cancellation]);
  } catch (error) {
    if (!timedOut && !runSignal.aborted) {
      attemptController.abort();
    }
    throw error;
  } finally {
    timeoutController.abort();
    if (listeners.onRunAbort !== undefined) {
      runSignal.removeEventListener("abort", listeners.onRunAbort);
    }
  }
};

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
  const errorPolicies = new Map<NodeInstance["id"], ErrorPolicy>();
  const timeouts = new Map<NodeInstance["id"], number>();
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

    const errorPolicy = readErrorPolicy(node);
    if (!errorPolicy.valid) {
      return fail(node.id, errorPolicy.detail);
    }
    errorPolicies.set(node.id, errorPolicy.policy);

    const timeoutMs = readNodeTimeout(node);
    if (typeof timeoutMs === "string") {
      return fail(node.id, timeoutMs);
    }
    if (timeoutMs !== undefined) {
      timeouts.set(node.id, timeoutMs);
    }
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

  const matchingEdges = (nodeId: NodeInstance["id"], port: string): readonly Connection[] =>
    (outgoing.get(nodeId) ?? []).filter(
      (connection) => (connection.fromPort ?? DEFAULT_PORT) === port,
    );

  const enqueueItems = (
    from: NodeInstance,
    edges: readonly Connection[],
    items: readonly JsonObject[],
  ): RunResult | undefined => {
    for (const item of items) {
      for (const connection of edges) {
        if (queue.length >= maxQueuedItems) {
          return fail("workflow", `Run exceeded ${maxQueuedItems} queued items.`);
        }
        const target = nodesById.get(connection.to);
        if (target === undefined) {
          return fail(from.id, `Connection points to unknown node "${connection.to}".`);
        }
        queue.push({ node: target, item });
      }
    }
    return undefined;
  };

  const handleNodeError = (
    entry: QueueEntry,
    message: string,
    attempts: number,
    retryable: boolean,
    traceDetail: string,
  ): RunResult | undefined => {
    const policy = errorPolicies.get(entry.node.id) ?? "fail";

    if (policy === "skip") {
      trace.push({
        atMs: elapsed(),
        node: entry.node.id,
        status: "skip",
        detail: `skipped: ${traceDetail}`,
      });
      return undefined;
    }

    if (policy === "route") {
      const edges = matchingEdges(entry.node.id, ERROR_PORT);
      if (edges.length === 0) {
        return fail(
          entry.node.id,
          `No "error" output is connected for a routed failure: ${traceDetail}`,
        );
      }

      const atMs = elapsed();
      trace.push({
        atMs,
        node: entry.node.id,
        status: "fail",
        detail: `route error: ${traceDetail}`,
      });
      const errorItem: JsonObject = {
        ...entry.item,
        error: {
          nodeId: entry.node.id,
          nodeType: entry.node.type,
          message,
          attempts,
          retryable,
          atMs,
        },
      };
      return enqueueItems(entry.node, edges, [errorItem]);
    }

    return fail(entry.node.id, traceDetail);
  };

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
    const timeoutMs = timeouts.get(entry.node.id);
    let result: NodeExecutionResult | undefined;
    let attempts = 0;
    let handled = false;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
      if (options.signal.aborted) {
        return fail("workflow", "Run cancelled.");
      }
      attempts = attempt;

      try {
        const execute = (signal: AbortSignal): Promise<unknown> =>
          executor({
            nodeId: entry.node.id,
            nodeType: entry.node.type,
            item: entry.item,
            parameters,
            ports: options.ports,
            signal,
          });
        const rawResult: unknown =
          timeoutMs === undefined
            ? await execute(options.signal)
            : await executeWithTimeout(execute, timeoutMs, options.ports.clock, options.signal);

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

        const retryable = error instanceof RetryableNodeError;
        if (retryable && attempt < retryPolicy.maxAttempts) {
          trace.push({
            atMs: elapsed(),
            node: entry.node.id,
            status: "fail",
            detail: `attempt ${attempt}/${retryPolicy.maxAttempts}: ${error.message}`,
          });

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
          continue;
        }

        const message = retryable ? error.message : errorDetail(error);
        const traceDetail =
          retryable || attempt > 1
            ? `attempt ${attempt}/${retryPolicy.maxAttempts}: ${message}`
            : message;
        const failure = handleNodeError(entry, message, attempt, retryable, traceDetail);
        if (failure !== undefined) {
          return failure;
        }
        handled = true;
        break;
      }
    }

    if (handled) {
      continue;
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

    for (const output of result.outputs) {
      const matching = matchingEdges(entry.node.id, output.port);

      if (matching.length === 0) {
        for (const item of output.items) {
          outputs.push(item);
        }
        continue;
      }

      const queueFailure = enqueueItems(entry.node, matching, output.items);
      if (queueFailure !== undefined) {
        return queueFailure;
      }
    }
  }

  return { status: "ok", trace, outputs };
};
