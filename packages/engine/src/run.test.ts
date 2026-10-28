import { asNodeId, asWorkflowId, parseWorkflow, type Workflow } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import {
  RetryableNodeError,
  type NodeExecutionResult,
  type NodeExecutor,
  type NodeRegistry,
} from "./node";
import type { Clock, EnginePorts, Http } from "./ports";
import { runWorkflow } from "./run";

const clock: Clock = { now: () => 0, sleep: async () => {} };

const http: Http = {
  request: async () => {
    throw new Error("The test HTTP port was not configured.");
  },
};

const basePorts: EnginePorts = { clock, http };

const advancingClock = (): { readonly clock: Clock; readonly sleeps: number[] } => {
  let time = 0;
  const sleeps: number[] = [];
  return {
    clock: {
      now: () => time,
      sleep: async (ms, signal) => {
        if (signal.aborted) {
          throw new Error("sleep aborted");
        }
        sleeps.push(ms);
        time += ms;
      },
    },
    sleeps,
  };
};

const newSignal = (): AbortSignal => new AbortController().signal;

const echo: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item] }],
});

const empty: NodeExecutor = async () => ({ outputs: [] });

const explode: NodeExecutor = async () => {
  throw new Error("boom");
};

const transient: NodeExecutor = async () => {
  throw new RetryableNodeError("HTTP 503.");
};

const neverFinishes: NodeExecutor = () => new Promise<NodeExecutionResult>(() => {});

const tag: NodeExecutor = async ({ item, nodeId }) => ({
  outputs: [{ port: "main", items: [{ ...item, start: nodeId }] }],
});

const parameterEcho: NodeExecutor = async ({ item, parameters }) => ({
  outputs: [{ port: "main", items: [{ ...item, parameters }] }],
});

const fanOut: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item, { ...item, copy: true }] }],
});

const fanOutValues: NodeExecutor = async ({ item }) => ({
  outputs: [
    {
      port: "main",
      items: [
        { ...item, value: 1 },
        { ...item, value: 2 },
      ],
    },
  ],
});

const split: NodeExecutor = async ({ item }) => ({
  outputs: [
    { port: "true", items: [item] },
    { port: "false", items: [item] },
  ],
});

class PlainFailure {
  readonly message = "plain";
}

const throwPlain: NodeExecutor = async () => {
  throw new PlainFailure();
};

const invalidResult: NodeExecutor = async () => {
  const result: NodeExecutionResult = { outputs: [] };
  Object.defineProperty(result, "outputs", { value: "not-an-array" });
  return result;
};

const reservedErrorResult: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "error", items: [item] }],
});

const nodes: NodeRegistry = {
  "manual-trigger": echo,
  echo,
  empty,
  explode,
  tag,
  "parameter-echo": parameterEcho,
  "fan-out": fanOut,
  "fan-out-values": fanOutValues,
  split,
  "throw-plain": throwPlain,
  "invalid-result": invalidResult,
  "reserved-error": reservedErrorResult,
};

const workflow = (value: unknown): Workflow => parseWorkflow(value);

describe("runWorkflow", () => {
  it("fails a graph with no start node instead of hanging", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "cycle",
        name: "Cycle",
        nodes: [
          { id: "a", type: "echo" },
          { id: "b", type: "echo" },
        ],
        connections: [
          { from: "a", to: "b" },
          { from: "b", to: "a" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]?.detail).toContain("No start node");
  });

  it("fails on an unknown node type", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "unknown",
        name: "Unknown",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "mystery", type: "not-registered", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "mystery" },
          { from: "mystery", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => line.node)).toEqual(["start", "mystery"]);
    expect(result.trace.at(-1)).toMatchObject({
      node: "mystery",
      status: "fail",
      detail: 'Unknown node type "not-registered".',
    });
  });

  it("does not resolve inherited object properties as node executors", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "prototype",
        name: "Prototype",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "prototype", type: "toString" },
        ],
        connections: [{ from: "start", to: "prototype" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.at(-1)?.detail).toBe('Unknown node type "toString".');
  });

  it("resolves node parameters per item from $json and $input", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "expressions",
        name: "Expressions",
        nodes: [
          {
            id: "start",
            type: "parameter-echo",
            parameters: {
              name: "{{ $json.customer }}",
              plan: "{{ $input.plan }}",
              count: "{{ $json.tags[0] }}",
              nested: { active: "{{ $input.plan === 'trial' }}" },
            },
          },
        ],
      }),
      input: { customer: "Ada", plan: "trial", tags: ["web"] },
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      {
        customer: "Ada",
        plan: "trial",
        tags: ["web"],
        parameters: {
          name: "Ada",
          plan: "trial",
          count: "web",
          nested: { active: true },
        },
      },
    ]);
  });

  it("evaluates parameters for every queued item with a stable $input", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "per-item-expressions",
        name: "Per-item expressions",
        nodes: [
          { id: "start", type: "fan-out-values" },
          {
            id: "echo",
            type: "parameter-echo",
            parameters: {
              value: "{{ $json.value }}",
              source: "{{ $input.source }}",
            },
          },
        ],
        connections: [{ from: "start", to: "echo" }],
      }),
      input: { source: "web" },
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      {
        source: "web",
        value: 1,
        parameters: { value: 1, source: "web" },
      },
      {
        source: "web",
        value: 2,
        parameters: { value: 2, source: "web" },
      },
    ]);
  });

  it("compiles every node's parameters before executing any node", async () => {
    const executed: string[] = [];
    const tracking: NodeExecutor = async ({ item, nodeId }) => {
      executed.push(nodeId);
      return { outputs: [{ port: "main", items: [item] }] };
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "preflight",
        name: "Preflight",
        nodes: [
          { id: "start", type: "tracking" },
          {
            id: "bad",
            type: "tracking",
            errorPolicy: "route",
            parameters: { value: "{{ $json. }}" },
          },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "bad" },
          { from: "bad", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes: { ...nodes, tracking },
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(executed).toEqual([]);
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]).toMatchObject({ node: "bad", status: "fail" });
    expect(result.trace[0]?.detail).toContain("Expected a field name");
  });

  it("fails the node with a typed error when an expression cannot be evaluated", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "evaluation-error",
        name: "Evaluation error",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "bad", type: "parameter-echo", parameters: { value: "{{ $json.missing }}" } },
        ],
        connections: [{ from: "start", to: "bad" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.map((line) => line.node)).toEqual(["start", "bad"]);
    expect(result.trace.at(-1)?.detail).toContain("$.parameters.value:");
    expect(result.trace.at(-1)?.detail).toContain('Unknown field "missing"');
  });

  it("rejects an unsupported expression version before executing nodes", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "version",
        name: "Version",
        expressionVersion: 2,
        nodes: [{ id: "start", type: "manual-trigger" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace[0]?.detail).toBe("Unsupported expression version 2.");
  });

  it("fails when an executor returns an invalid result", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "invalid-result",
        name: "Invalid result",
        nodes: [{ id: "start", type: "invalid-result" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.at(-1)).toMatchObject({
      node: "start",
      status: "fail",
      detail: "Node returned an invalid result.",
    });
  });

  it("rejects a successful result that claims the reserved error port", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "reserved-error-port",
        name: "Reserved error port",
        nodes: [
          { id: "invalid", type: "reserved-error", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "invalid", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "invalid",
        status: "fail",
        detail: "Node returned an invalid result.",
      },
    ]);
  });

  it("turns a thrown node error into a failed trace line", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "explode",
        name: "Explode",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "explode", type: "explode" },
        ],
        connections: [{ from: "start", to: "explode" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.at(-1)).toMatchObject({
      node: "explode",
      status: "fail",
      detail: "boom",
    });
  });

  it("fails without routing when the policy is explicitly fail", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "fail-error",
        name: "Fail error",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "explode", type: "explode", errorPolicy: "fail" },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "explode" },
          { from: "explode", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => line.node)).toEqual(["start", "explode"]);
    expect(result.trace.at(-1)).toMatchObject({
      node: "explode",
      status: "fail",
      detail: "boom",
    });
  });

  it("stops before the first node when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runWorkflow({
      workflow: workflow({
        id: "cancelled",
        name: "Cancelled",
        nodes: [
          { id: "start", type: "manual-trigger", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "start", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: controller.signal,
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace).toEqual([
      { atMs: 0, node: "workflow", status: "fail", detail: "Run cancelled." },
    ]);
  });

  it("fails with a readable trace when the step budget is exhausted", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "loop",
        name: "Loop",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "loop", type: "echo", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "loop" },
          { from: "loop", to: "loop" },
          { from: "loop", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
      maxSteps: 2,
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => [line.node, line.status])).toEqual([
      ["start", "ok"],
      ["loop", "ok"],
      ["workflow", "fail"],
    ]);
    expect(result.trace.at(-1)?.detail).toBe("Run exceeded 2 steps.");
  });

  it("rejects an invalid step budget", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "budget",
        name: "Budget",
        nodes: [{ id: "start", type: "manual-trigger" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
      maxSteps: 0,
    });

    expect(result.status).toBe("fail");
    expect(result.trace[0]?.detail).toBe("maxSteps must be a positive integer.");
  });

  it("rejects an invalid queue budget", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "queue-budget",
        name: "Queue budget",
        nodes: [{ id: "start", type: "manual-trigger" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
      maxQueuedItems: 0,
    });

    expect(result.status).toBe("fail");
    expect(result.trace[0]?.detail).toBe("maxQueuedItems must be a positive integer.");
  });

  it("rejects a start queue larger than the queue budget", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "start-queue",
        name: "Start queue",
        nodes: [
          { id: "a", type: "echo", errorPolicy: "route" },
          { id: "b", type: "echo" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "a", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
      maxQueuedItems: 1,
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => line.node)).toEqual(["workflow"]);
    expect(result.trace[0]?.detail).toBe("Run exceeded 1 queued items.");
  });

  it("runs multiple start nodes in deterministic ID order", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "starts",
        name: "Starts",
        nodes: [
          { id: "z-start", type: "tag" },
          { id: "a-start", type: "tag" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([{ start: "a-start" }, { start: "z-start" }]);
  });

  it("stops when the signal is aborted during a node", async () => {
    const controller = new AbortController();
    const aborting: NodeExecutor = async ({ item }) => {
      controller.abort();
      return { outputs: [{ port: "main", items: [item] }] };
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "abort-during",
        name: "Abort during",
        nodes: [
          { id: "start", type: "aborting", errorPolicy: "route" },
          { id: "next", type: "echo" },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "next" },
          { from: "start", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes: { ...nodes, aborting },
      ports: basePorts,
      signal: controller.signal,
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => line.status)).toEqual(["fail"]);
    expect(result.trace.at(-1)?.detail).toBe("Run cancelled.");
  });

  it("fails if the signal is aborted during the final execution", async () => {
    const controller = new AbortController();
    const aborting: NodeExecutor = async ({ item }) => {
      controller.abort();
      return { outputs: [{ port: "main", items: [item] }] };
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "abort-final",
        name: "Abort final",
        nodes: [{ id: "start", type: "aborting" }],
      }),
      input: {},
      nodes: { ...nodes, aborting },
      ports: basePorts,
      signal: controller.signal,
    });

    expect(result.status).toBe("fail");
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]?.detail).toBe("Run cancelled.");
  });

  it("fans one output item out to every matching connection", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "fan-out",
        name: "Fan out",
        nodes: [
          { id: "start", type: "echo" },
          { id: "a", type: "tag" },
          { id: "b", type: "tag" },
        ],
        connections: [
          { from: "start", to: "a" },
          { from: "start", to: "b" },
        ],
      }),
      input: { source: "web" },
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      { source: "web", start: "a" },
      { source: "web", start: "b" },
    ]);
  });

  it("executes a node once per incoming item", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "fan-in",
        name: "Fan in",
        nodes: [
          { id: "a", type: "tag" },
          { id: "b", type: "tag" },
          { id: "merge", type: "echo" },
        ],
        connections: [
          { from: "a", to: "merge" },
          { from: "b", to: "merge" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([{ start: "a" }, { start: "b" }]);
  });

  it("collects a terminal output port while following a connected port", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "mixed-ports",
        name: "Mixed ports",
        nodes: [
          { id: "start", type: "split" },
          { id: "target", type: "tag" },
        ],
        connections: [{ from: "start", fromPort: "true", to: "target" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([{}, { start: "target" }]);
  });

  it("uses the injected clock for trace timestamps", async () => {
    let tick = 0;
    const tickingClock: Clock = {
      now: () => {
        tick += 10;
        return tick;
      },
      sleep: async () => {},
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "clock",
        name: "Clock",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "next", type: "tag" },
        ],
        connections: [{ from: "start", to: "next" }],
      }),
      input: {},
      nodes,
      ports: { clock: tickingClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace.map((line) => line.atMs)).toEqual([10, 20]);
  });

  it("turns a non-Error node failure into a failed trace line", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "plain-failure",
        name: "Plain failure",
        nodes: [{ id: "start", type: "throw-plain" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace[0]?.detail).toBe("Node execution failed.");
  });

  it("caps the number of queued items", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "queue-budget",
        name: "Queue budget",
        nodes: [
          { id: "start", type: "fan-out", errorPolicy: "route" },
          { id: "target", type: "tag" },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "target" },
          { from: "start", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
      maxQueuedItems: 1,
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => line.node)).toEqual(["start", "workflow"]);
    expect(result.trace.at(-1)?.detail).toBe("Run exceeded 1 queued items.");
  });

  it("records zero items and returns no outputs for a terminal empty result", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "empty",
        name: "Empty",
        nodes: [{ id: "start", type: "empty" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace[0]?.detail).toBe("0 items");
    expect(result.outputs).toEqual([]);
  });

  it("fails defensively if a connection points to a node outside the graph", async () => {
    const malformed: Workflow = {
      id: asWorkflowId("malformed"),
      name: "Malformed",
      expressionVersion: 1,
      nodes: [
        {
          id: asNodeId("start"),
          type: "manual-trigger",
          parameters: {},
          errorPolicy: "route",
        },
        {
          id: asNodeId("handler"),
          type: "tag",
          parameters: {},
        },
      ],
      connections: [
        { from: asNodeId("start"), to: asNodeId("missing") },
        { from: asNodeId("start"), fromPort: "error", to: asNodeId("handler") },
      ],
    };

    const result = await runWorkflow({
      workflow: malformed,
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => line.node)).toEqual(["start", "start"]);
    expect(result.trace.at(-1)?.detail).toBe('Connection points to unknown node "missing".');
  });

  it("retries a retryable failure with exponential backoff and records each attempt", async () => {
    const { clock: retryClock, sleeps } = advancingClock();
    let attempts = 0;
    const flaky: NodeExecutor = async ({ item }) => {
      attempts += 1;
      if (attempts < 3) {
        throw new RetryableNodeError("HTTP 503.");
      }
      return { outputs: [{ port: "main", items: [item] }], detail: "HTTP 200" };
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "retry-success",
        name: "Retry success",
        nodes: [
          {
            id: "request",
            type: "flaky",
            retry: { maxAttempts: 3, delayMs: 1_000, backoff: "exponential" },
          },
        ],
      }),
      input: {},
      nodes: { flaky },
      ports: { clock: retryClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "attempt 1/3: HTTP 503.",
      },
      {
        atMs: 1_000,
        node: "request",
        status: "fail",
        detail: "attempt 2/3: HTTP 503.",
      },
      {
        atMs: 3_000,
        node: "request",
        status: "ok",
        detail: "attempt 3/3: HTTP 200",
      },
    ]);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("fails visibly after the final retryable attempt", async () => {
    const { clock: retryClock, sleeps } = advancingClock();
    let attempts = 0;
    const alwaysTransient: NodeExecutor = async () => {
      attempts += 1;
      throw new RetryableNodeError("HTTP 503.");
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "retry-exhausted",
        name: "Retry exhausted",
        nodes: [
          {
            id: "request",
            type: "always-transient",
            retry: { maxAttempts: 3, delayMs: 500 },
          },
        ],
      }),
      input: {},
      nodes: { "always-transient": alwaysTransient },
      ports: { clock: retryClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(attempts).toBe(3);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "attempt 1/3: HTTP 503.",
      },
      {
        atMs: 500,
        node: "request",
        status: "fail",
        detail: "attempt 2/3: HTTP 503.",
      },
      {
        atMs: 1_000,
        node: "request",
        status: "fail",
        detail: "attempt 3/3: HTTP 503.",
      },
    ]);
    expect(sleeps).toEqual([500, 500]);
  });

  it("does not retry an ordinary node error", async () => {
    const { clock: retryClock, sleeps } = advancingClock();
    let attempts = 0;
    const invalid: NodeExecutor = async () => {
      attempts += 1;
      throw new Error("Invalid parameter.");
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "no-retry",
        name: "No retry",
        nodes: [
          {
            id: "request",
            type: "invalid",
            retry: { maxAttempts: 3, delayMs: 500 },
          },
        ],
      }),
      input: {},
      nodes: { invalid },
      ports: { clock: retryClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(attempts).toBe(1);
    expect(result.trace).toEqual([
      { atMs: 0, node: "request", status: "fail", detail: "Invalid parameter." },
    ]);
    expect(sleeps).toEqual([]);
  });

  it("cancels a retry while it is waiting to try again", async () => {
    const controller = new AbortController();
    const retryClock: Clock = {
      now: () => 0,
      sleep: async () => {
        controller.abort();
        throw new Error("sleep aborted");
      },
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "cancel-retry",
        name: "Cancel retry",
        nodes: [
          {
            id: "request",
            type: "transient",
            errorPolicy: "route",
            retry: { maxAttempts: 3, delayMs: 1_000 },
          },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "request", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes: { transient, tag },
      ports: { clock: retryClock, http },
      signal: controller.signal,
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "attempt 1/3: HTTP 503.",
      },
      {
        atMs: 0,
        node: "workflow",
        status: "fail",
        detail: "Run cancelled.",
      },
    ]);
  });

  it("does not apply an error policy to a retry sleep failure", async () => {
    const failingClock: Clock = {
      now: () => 0,
      sleep: async () => {
        throw new Error("clock down");
      },
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "retry-sleep-failure",
        name: "Retry sleep failure",
        nodes: [
          {
            id: "request",
            type: "transient",
            errorPolicy: "route",
            retry: { maxAttempts: 3, delayMs: 1_000 },
          },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "request", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes: { transient, tag },
      ports: { clock: failingClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "attempt 1/3: HTTP 503.",
      },
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "clock down",
      },
    ]);
  });

  it("rejects an invalid retry policy before executing a node", async () => {
    let attempts = 0;
    const tracking: NodeExecutor = async ({ item }) => {
      attempts += 1;
      return { outputs: [{ port: "main", items: [item] }] };
    };

    const invalidRetry: Workflow = {
      id: asWorkflowId("invalid-retry"),
      name: "Invalid retry",
      expressionVersion: 1,
      nodes: [
        {
          id: asNodeId("request"),
          type: "tracking",
          parameters: {},
          errorPolicy: "route",
          retry: { maxAttempts: 0, delayMs: 1, backoff: "fixed" },
        },
        {
          id: asNodeId("handler"),
          type: "tag",
          parameters: {},
        },
      ],
      connections: [{ from: asNodeId("request"), fromPort: "error", to: asNodeId("handler") }],
    };

    const result = await runWorkflow({
      workflow: invalidRetry,
      input: {},
      nodes: { tracking, tag },
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(attempts).toBe(0);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "Retry maxAttempts must be an integer between 1 and 10.",
      },
    ]);
  });

  it("times out an attempt, aborts its signal, and ignores its late result", async () => {
    let time = 0;
    let attempts = 0;
    let observedAbort = false;
    let downstreamExecutions = 0;
    const timeoutClock: Clock = {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    };
    const lateNode: NodeExecutor = ({ signal }) => {
      attempts += 1;
      return new Promise((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            resolve({ outputs: [{ port: "main", items: [{ late: true }] }] });
          },
          { once: true },
        );
      });
    };
    const downstream: NodeExecutor = async ({ item }) => {
      downstreamExecutions += 1;
      return { outputs: [{ port: "main", items: [item] }] };
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "node-timeout",
        name: "Node timeout",
        nodes: [
          {
            id: "slow",
            type: "late",
            timeoutMs: 10,
            retry: { maxAttempts: 3, delayMs: 1 },
          },
          { id: "after", type: "downstream" },
        ],
        connections: [{ from: "slow", to: "after" }],
      }),
      input: {},
      nodes: { late: lateNode, downstream },
      ports: { clock: timeoutClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace).toEqual([
      { atMs: 10, node: "slow", status: "fail", detail: "Node timed out after 10ms." },
    ]);
    expect(observedAbort).toBe(true);
    expect(attempts).toBe(1);
    expect(downstreamExecutions).toBe(0);
    expect(result.outputs).toEqual([]);
  });

  it("cancels the pending timeout sleep when an attempt completes", async () => {
    let sleepCancelled = false;
    const timeoutClock: Clock = {
      now: () => 0,
      sleep: (_ms, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              sleepCancelled = true;
              reject(new Error("timeout sleep cancelled"));
            },
            { once: true },
          );
        }),
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "timeout-success",
        name: "Timeout success",
        nodes: [{ id: "start", type: "echo", timeoutMs: 100 }],
      }),
      input: { value: "done" },
      nodes: { echo },
      ports: { clock: timeoutClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([{ value: "done" }]);
    expect(sleepCancelled).toBe(true);
  });

  it("reports workflow cancellation instead of timing out a non-cooperative node", async () => {
    const controller = new AbortController();
    const timeoutClock: Clock = {
      now: () => 0,
      sleep: (_ms, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("timeout sleep cancelled")), {
            once: true,
          });
        }),
    };
    const pending = runWorkflow({
      workflow: workflow({
        id: "cancel-timeout",
        name: "Cancel timeout",
        nodes: [
          { id: "start", type: "never", timeoutMs: 100, errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "start", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes: { never: neverFinishes, tag },
      ports: { clock: timeoutClock, http },
      signal: controller.signal,
    });
    controller.abort();

    const result = await pending;
    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace).toEqual([
      { atMs: 0, node: "workflow", status: "fail", detail: "Run cancelled." },
    ]);
  });

  it("rejects invalid in-memory timeout values before node execution", async () => {
    let executions = 0;
    const invalidTimeout: Workflow = {
      id: asWorkflowId("invalid-timeout"),
      name: "Invalid timeout",
      expressionVersion: 1,
      nodes: [
        {
          id: asNodeId("start"),
          type: "tracking",
          parameters: {},
          errorPolicy: "route",
          timeoutMs: 120_001,
        },
        {
          id: asNodeId("handler"),
          type: "tag",
          parameters: {},
        },
      ],
      connections: [{ from: asNodeId("start"), fromPort: "error", to: asNodeId("handler") }],
    };
    const tracking: NodeExecutor = async ({ item }) => {
      executions += 1;
      return { outputs: [{ port: "main", items: [item] }] };
    };

    const result = await runWorkflow({
      workflow: invalidTimeout,
      input: {},
      nodes: { tracking, tag },
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(executions).toBe(0);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "start",
        status: "fail",
        detail: "timeoutMs must be an integer between 1 and 120000.",
      },
    ]);
  });

  it("routes a failed item to the error port and continues", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "route-error",
        name: "Route error",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "explode", type: "explode", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "explode" },
          { from: "explode", fromPort: "error", to: "handler" },
        ],
      }),
      input: { order: "A-104", error: "old value" },
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace).toEqual([
      { atMs: 0, node: "start", status: "ok", detail: "1 item" },
      { atMs: 0, node: "explode", status: "fail", detail: "route error: boom" },
      { atMs: 0, node: "handler", status: "ok", detail: "1 item" },
    ]);
    expect(result.outputs).toEqual([
      {
        order: "A-104",
        error: {
          nodeId: "explode",
          nodeType: "explode",
          message: "boom",
          attempts: 1,
          retryable: false,
          atMs: 0,
        },
        start: "handler",
      },
    ]);
  });

  it("preserves reserved state and does not mutate the failed item", async () => {
    const input = {
      order: "A-113",
      error: "old value",
      __krypton: { keep: true },
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "route-immutability",
        name: "Route immutability",
        nodes: [
          { id: "explode", type: "explode", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "explode", fromPort: "error", to: "handler" }],
      }),
      input,
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(input).toEqual({
      order: "A-113",
      error: "old value",
      __krypton: { keep: true },
    });
    expect(result.status).toBe("ok");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.["__krypton"]).toEqual({ keep: true });
    expect(result.outputs[0]?.["error"]).toEqual({
      nodeId: "explode",
      nodeType: "explode",
      message: "boom",
      attempts: 1,
      retryable: false,
      atMs: 0,
    });
    expect(result.outputs[0]?.["start"]).toBe("handler");
  });

  it("exposes routed error fields to normal expressions", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "route-expression",
        name: "Route expression",
        nodes: [
          { id: "explode", type: "explode", errorPolicy: "route" },
          {
            id: "handler",
            type: "parameter-echo",
            parameters: {
              message: "{{ $json.error.message }}",
              retryable: "{{ $json.error.retryable }}",
            },
          },
        ],
        connections: [{ from: "explode", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.["parameters"]).toEqual({
      message: "boom",
      retryable: false,
    });
  });

  it("applies the policy per node instance", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "per-instance-policy",
        name: "Per-instance policy",
        nodes: [
          { id: "a", type: "explode", errorPolicy: "route" },
          { id: "b", type: "explode", errorPolicy: "skip" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "a", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace.map((line) => [line.node, line.status])).toEqual([
      ["a", "fail"],
      ["b", "skip"],
      ["handler", "ok"],
    ]);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]?.["start"]).toBe("handler");
  });

  it("handles each failed item independently", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "per-item-policy",
        name: "Per-item policy",
        nodes: [
          { id: "start", type: "fan-out-values" },
          { id: "explode", type: "explode", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "explode" },
          { from: "explode", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace.map((line) => [line.node, line.status])).toEqual([
      ["start", "ok"],
      ["explode", "fail"],
      ["explode", "fail"],
      ["handler", "ok"],
      ["handler", "ok"],
    ]);
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs.every((item) => item["start"] === "handler")).toBe(true);
  });

  it("fans a routed error out to every error connection", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "route-error-fan-out",
        name: "Route error fan out",
        nodes: [
          { id: "explode", type: "explode", errorPolicy: "route" },
          { id: "handler-a", type: "tag" },
          { id: "handler-b", type: "tag" },
        ],
        connections: [
          { from: "explode", fromPort: "error", to: "handler-a" },
          { from: "explode", fromPort: "error", to: "handler-b" },
        ],
      }),
      input: { order: "A-108" },
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs.map((item) => item["start"])).toEqual(["handler-a", "handler-b"]);
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0]?.["error"]).toEqual({
      nodeId: "explode",
      nodeType: "explode",
      message: "boom",
      attempts: 1,
      retryable: false,
      atMs: 0,
    });
    expect(result.outputs[1]?.["error"]).toEqual(result.outputs[0]?.["error"]);
    expect(result.trace.map((line) => [line.node, line.status])).toEqual([
      ["explode", "fail"],
      ["handler-a", "ok"],
      ["handler-b", "ok"],
    ]);
  });

  it("skips a failed item and continues unrelated queued work", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "skip-error",
        name: "Skip error",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "explode", type: "explode", errorPolicy: "skip" },
          { id: "after", type: "tag" },
        ],
        connections: [
          { from: "start", to: "explode" },
          { from: "start", to: "after" },
        ],
      }),
      input: { order: "A-105" },
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace).toEqual([
      { atMs: 0, node: "start", status: "ok", detail: "1 item" },
      { atMs: 0, node: "explode", status: "skip", detail: "skipped: boom" },
      { atMs: 0, node: "after", status: "ok", detail: "1 item" },
    ]);
    expect(result.outputs).toEqual([{ order: "A-105", start: "after" }]);
  });

  it("routes after retry exhaustion and keeps the failure visible", async () => {
    const { clock: retryClock, sleeps } = advancingClock();

    const result = await runWorkflow({
      workflow: workflow({
        id: "route-retry-exhausted",
        name: "Route retry exhausted",
        nodes: [
          {
            id: "request",
            type: "transient",
            errorPolicy: "route",
            retry: { maxAttempts: 2, delayMs: 100 },
          },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "request", fromPort: "error", to: "handler" }],
      }),
      input: { order: "A-106" },
      nodes: { transient, tag },
      ports: { clock: retryClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(sleeps).toEqual([100]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "attempt 1/2: HTTP 503.",
      },
      {
        atMs: 100,
        node: "request",
        status: "fail",
        detail: "route error: attempt 2/2: HTTP 503.",
      },
      { atMs: 100, node: "handler", status: "ok", detail: "1 item" },
    ]);
    expect(result.outputs).toEqual([
      {
        order: "A-106",
        error: {
          nodeId: "request",
          nodeType: "transient",
          message: "HTTP 503.",
          attempts: 2,
          retryable: true,
          atMs: 100,
        },
        start: "handler",
      },
    ]);
  });

  it("skips after retry exhaustion and records the final attempt", async () => {
    const { clock: retryClock, sleeps } = advancingClock();

    const result = await runWorkflow({
      workflow: workflow({
        id: "skip-retry-exhausted",
        name: "Skip retry exhausted",
        nodes: [
          {
            id: "request",
            type: "transient",
            errorPolicy: "skip",
            retry: { maxAttempts: 2, delayMs: 100 },
          },
        ],
      }),
      input: { order: "A-111" },
      nodes: { transient },
      ports: { clock: retryClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([]);
    expect(sleeps).toEqual([100]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "attempt 1/2: HTTP 503.",
      },
      {
        atMs: 100,
        node: "request",
        status: "skip",
        detail: "skipped: attempt 2/2: HTTP 503.",
      },
    ]);
  });

  it("uses the final error class for a routed item after retries", async () => {
    const { clock: retryClock, sleeps } = advancingClock();
    let attempts = 0;
    const mixed: NodeExecutor = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new RetryableNodeError("HTTP 503.");
      }
      throw new Error("bad payload");
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "route-final-error-class",
        name: "Route final error class",
        nodes: [
          {
            id: "request",
            type: "mixed",
            errorPolicy: "route",
            retry: { maxAttempts: 2, delayMs: 100 },
          },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "request", fromPort: "error", to: "handler" }],
      }),
      input: { order: "A-112" },
      nodes: { mixed, tag },
      ports: { clock: retryClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([100]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "request",
        status: "fail",
        detail: "attempt 1/2: HTTP 503.",
      },
      {
        atMs: 100,
        node: "request",
        status: "fail",
        detail: "route error: attempt 2/2: bad payload",
      },
      { atMs: 100, node: "handler", status: "ok", detail: "1 item" },
    ]);
    expect(result.outputs).toEqual([
      {
        order: "A-112",
        error: {
          nodeId: "request",
          nodeType: "mixed",
          message: "bad payload",
          attempts: 2,
          retryable: false,
          atMs: 100,
        },
        start: "handler",
      },
    ]);
  });

  it("fails a routed error when no error output is connected", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "missing-error-route",
        name: "Missing error route",
        nodes: [
          { id: "explode", type: "explode", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "explode", to: "handler" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace.map((line) => line.node)).toEqual(["explode"]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "explode",
        status: "fail",
        detail: 'No "error" output is connected for a routed failure: boom',
      },
    ]);
  });

  it("routes a timeout as a node failure", async () => {
    let time = 0;
    const timeoutClock: Clock = {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "route-timeout",
        name: "Route timeout",
        nodes: [
          { id: "slow", type: "never", timeoutMs: 5, errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "slow", fromPort: "error", to: "handler" }],
      }),
      input: { order: "A-107" },
      nodes: { never: neverFinishes, tag },
      ports: { clock: timeoutClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.trace).toEqual([
      {
        atMs: 5,
        node: "slow",
        status: "fail",
        detail: "route error: Node timed out after 5ms.",
      },
      { atMs: 5, node: "handler", status: "ok", detail: "1 item" },
    ]);
    expect(result.outputs).toEqual([
      {
        order: "A-107",
        error: {
          nodeId: "slow",
          nodeType: "never",
          message: "Node timed out after 5ms.",
          attempts: 1,
          retryable: false,
          atMs: 5,
        },
        start: "handler",
      },
    ]);
  });

  it("skips a timed-out attempt", async () => {
    let time = 0;
    const timeoutClock: Clock = {
      now: () => time,
      sleep: async (ms) => {
        time += ms;
      },
    };

    const result = await runWorkflow({
      workflow: workflow({
        id: "skip-timeout",
        name: "Skip timeout",
        nodes: [{ id: "slow", type: "never", timeoutMs: 5, errorPolicy: "skip" }],
      }),
      input: { order: "A-110" },
      nodes: { never: neverFinishes },
      ports: { clock: timeoutClock, http },
      signal: newSignal(),
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([]);
    expect(result.trace).toEqual([
      {
        atMs: 5,
        node: "slow",
        status: "skip",
        detail: "skipped: Node timed out after 5ms.",
      },
    ]);
  });

  it("does not apply an error policy to parameter evaluation failures", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "route-evaluation-error",
        name: "Route evaluation error",
        nodes: [
          { id: "start", type: "manual-trigger" },
          {
            id: "bad",
            type: "parameter-echo",
            errorPolicy: "route",
            parameters: { value: "{{ $json.missing }}" },
          },
          { id: "handler", type: "tag" },
        ],
        connections: [
          { from: "start", to: "bad" },
          { from: "bad", fromPort: "error", to: "handler" },
        ],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.map((line) => line.node)).toEqual(["start", "bad"]);
    expect(result.trace.at(-1)?.detail).toContain('Unknown field "missing"');
  });

  it("does not apply an error policy to an invalid executor result", async () => {
    const result = await runWorkflow({
      workflow: workflow({
        id: "route-invalid-result",
        name: "Route invalid result",
        nodes: [
          { id: "invalid", type: "invalid-result", errorPolicy: "route" },
          { id: "handler", type: "tag" },
        ],
        connections: [{ from: "invalid", fromPort: "error", to: "handler" }],
      }),
      input: {},
      nodes,
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "invalid",
        status: "fail",
        detail: "Node returned an invalid result.",
      },
    ]);
  });

  it("rejects an invalid in-memory error policy before node execution", async () => {
    let executions = 0;
    const tracking: NodeExecutor = async ({ item }) => {
      executions += 1;
      return { outputs: [{ port: "main", items: [item] }] };
    };
    const invalidWorkflow = workflow({
      id: "invalid-error-policy",
      name: "Invalid error policy",
      nodes: [
        { id: "start", type: "tracking" },
        { id: "invalid", type: "tracking" },
      ],
      connections: [{ from: "start", to: "invalid" }],
    });
    const invalid = invalidWorkflow.nodes[1];
    if (invalid === undefined) {
      throw new Error("Expected an invalid-policy node.");
    }
    Object.defineProperty(invalid, "errorPolicy", { value: "explode" });

    const result = await runWorkflow({
      workflow: invalidWorkflow,
      input: {},
      nodes: { tracking },
      ports: basePorts,
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.outputs).toEqual([]);
    expect(executions).toBe(0);
    expect(result.trace).toEqual([
      {
        atMs: 0,
        node: "invalid",
        status: "fail",
        detail: 'errorPolicy must be "fail", "skip", or "route".',
      },
    ]);
  });
});
