import { asNodeId, asWorkflowId, parseWorkflow, type Workflow } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import type { NodeExecutionResult, NodeExecutor, NodeRegistry } from "./node";
import type { Clock } from "./ports";
import { runWorkflow } from "./run";

const clock: Clock = { now: () => 0 };

const newSignal = (): AbortSignal => new AbortController().signal;

const echo: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item] }],
});

const empty: NodeExecutor = async () => ({ outputs: [] });

const explode: NodeExecutor = async () => {
  throw new Error("boom");
};

const tag: NodeExecutor = async ({ item, nodeId }) => ({
  outputs: [{ port: "main", items: [{ ...item, start: nodeId }] }],
});

const fanOut: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item, { ...item, copy: true }] }],
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

const nodes: NodeRegistry = {
  "manual-trigger": echo,
  echo,
  empty,
  explode,
  tag,
  "fan-out": fanOut,
  split,
  "throw-plain": throwPlain,
  "invalid-result": invalidResult,
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
      ports: { clock },
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
          { id: "mystery", type: "not-registered" },
        ],
        connections: [{ from: "start", to: "mystery" }],
      }),
      input: {},
      nodes,
      ports: { clock },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
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
      ports: { clock },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.at(-1)?.detail).toBe('Unknown node type "toString".');
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
      ports: { clock },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.at(-1)).toMatchObject({
      node: "start",
      status: "fail",
      detail: "Node returned an invalid result.",
    });
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
      ports: { clock },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
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
        nodes: [{ id: "start", type: "manual-trigger" }],
      }),
      input: {},
      nodes,
      ports: { clock },
      signal: controller.signal,
    });

    expect(result.status).toBe("fail");
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
          { id: "loop", type: "echo" },
        ],
        connections: [
          { from: "start", to: "loop" },
          { from: "loop", to: "loop" },
        ],
      }),
      input: {},
      nodes,
      ports: { clock },
      signal: newSignal(),
      maxSteps: 2,
    });

    expect(result.status).toBe("fail");
    expect(result.trace.map((line) => line.status)).toEqual(["ok", "ok", "fail"]);
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
      ports: { clock },
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
      ports: { clock },
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
          { id: "a", type: "echo" },
          { id: "b", type: "echo" },
        ],
      }),
      input: {},
      nodes,
      ports: { clock },
      signal: newSignal(),
      maxQueuedItems: 1,
    });

    expect(result.status).toBe("fail");
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
      ports: { clock },
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
          { id: "start", type: "aborting" },
          { id: "next", type: "echo" },
        ],
        connections: [{ from: "start", to: "next" }],
      }),
      input: {},
      nodes: { ...nodes, aborting },
      ports: { clock },
      signal: controller.signal,
    });

    expect(result.status).toBe("fail");
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
      ports: { clock },
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
      ports: { clock },
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
      ports: { clock },
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
      ports: { clock },
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
      ports: { clock: tickingClock },
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
      ports: { clock },
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
          { id: "start", type: "fan-out" },
          { id: "target", type: "tag" },
        ],
        connections: [{ from: "start", to: "target" }],
      }),
      input: {},
      nodes,
      ports: { clock },
      signal: newSignal(),
      maxQueuedItems: 1,
    });

    expect(result.status).toBe("fail");
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
      ports: { clock },
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
      nodes: [
        {
          id: asNodeId("start"),
          type: "manual-trigger",
          parameters: {},
        },
      ],
      connections: [{ from: asNodeId("start"), to: asNodeId("missing") }],
    };

    const result = await runWorkflow({
      workflow: malformed,
      input: {},
      nodes,
      ports: { clock },
      signal: newSignal(),
    });

    expect(result.status).toBe("fail");
    expect(result.trace.at(-1)?.detail).toBe('Connection points to unknown node "missing".');
  });
});
