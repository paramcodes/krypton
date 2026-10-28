import { parseWorkflow, SchemaError } from "@krypton/schema";
import {
  array,
  assert,
  asyncProperty,
  constant,
  constantFrom,
  integer,
  option,
  property,
  record,
  tuple,
  uniqueArray,
  type Arbitrary,
} from "fast-check";
import { describe, expect, it } from "vitest";

import type { NodeExecutor, NodeRegistry } from "./node";
import type { Clock, EnginePorts, Http } from "./ports";
import { runWorkflow } from "./run";

type RawNode = {
  readonly id: string;
  readonly type: string;
  readonly parameters: Record<string, unknown>;
};

type RawConnection = {
  readonly from: string;
  readonly to: string;
  readonly fromPort?: string;
};

type RawWorkflow = {
  readonly id: string;
  readonly name: string;
  readonly expressionVersion: number;
  readonly nodes: readonly RawNode[];
  readonly connections: readonly RawConnection[];
};

type ExpectedError = {
  readonly path: string;
  readonly message: string;
};

type InvalidCase = {
  readonly workflow: unknown;
  readonly expected: ExpectedError;
};

const nodeTypes = ["echo", "empty", "fan-out"] as const;
const mutationKinds = [
  "duplicate-id",
  "unknown-from",
  "unknown-to",
  "empty-nodes",
  "bad-expression-version",
  "bad-retry",
  "bad-timeout",
  "bad-error-policy",
  "bad-parameters",
  "control-id",
] as const;

type MutationKind = (typeof mutationKinds)[number];

const clock: Clock = {
  now: () => 0,
  sleep: async () => {},
};

const http: Http = {
  request: async () => {
    throw new Error("The property test HTTP port was not configured.");
  },
};

const ports: EnginePorts = { clock, http };

const echo: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item] }],
});

const empty: NodeExecutor = async () => ({ outputs: [] });

const fanOut: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item, { ...item, copy: true }] }],
});

const nodes: NodeRegistry = { echo, empty, "fan-out": fanOut };

const firstNode = (workflow: RawWorkflow): RawNode => {
  const node = workflow.nodes[0];
  if (node === undefined) {
    throw new Error("A generated workflow must contain at least one node.");
  }
  return node;
};

const absentNodeId = (workflow: RawWorkflow): string => {
  const ids = new Set(workflow.nodes.map((node) => node.id));
  let candidate = "missing";
  while (ids.has(candidate)) {
    candidate = `${candidate}-x`;
  }
  return candidate;
};

const replaceFirstNode = (workflow: RawWorkflow, patch: (node: RawNode) => unknown): unknown => ({
  ...workflow,
  nodes: [patch(firstNode(workflow)), ...workflow.nodes.slice(1)],
});

const mutate = (workflow: RawWorkflow, mutation: MutationKind): InvalidCase => {
  switch (mutation) {
    case "duplicate-id": {
      const node = firstNode(workflow);
      return {
        workflow: { ...workflow, nodes: [...workflow.nodes, { ...node }] },
        expected: {
          path: `$.nodes[${workflow.nodes.length}].id`,
          message: `Duplicate node id "${node.id}".`,
        },
      };
    }
    case "unknown-from": {
      const missing = absentNodeId(workflow);
      return {
        workflow: {
          ...workflow,
          connections: [...workflow.connections, { from: missing, to: firstNode(workflow).id }],
        },
        expected: {
          path: `$.connections[${workflow.connections.length}].from`,
          message: `Unknown node "${missing}".`,
        },
      };
    }
    case "unknown-to": {
      const missing = absentNodeId(workflow);
      return {
        workflow: {
          ...workflow,
          connections: [...workflow.connections, { from: firstNode(workflow).id, to: missing }],
        },
        expected: {
          path: `$.connections[${workflow.connections.length}].to`,
          message: `Unknown node "${missing}".`,
        },
      };
    }
    case "empty-nodes":
      return {
        workflow: { ...workflow, nodes: [] },
        expected: {
          path: "$.nodes",
          message: "A workflow needs at least one node.",
        },
      };
    case "bad-expression-version":
      return {
        workflow: { ...workflow, expressionVersion: 0 },
        expected: {
          path: "$.expressionVersion",
          message: "Expected a positive integer.",
        },
      };
    case "bad-retry":
      return {
        workflow: replaceFirstNode(workflow, (node) => ({
          ...node,
          retry: { maxAttempts: 0, delayMs: 0 },
        })),
        expected: {
          path: "$.nodes[0].retry.maxAttempts",
          message: "Expected an integer between 1 and 10.",
        },
      };
    case "bad-timeout":
      return {
        workflow: replaceFirstNode(workflow, (node) => ({ ...node, timeoutMs: 0 })),
        expected: {
          path: "$.nodes[0].timeoutMs",
          message: "Expected an integer between 1 and 120000.",
        },
      };
    case "bad-error-policy":
      return {
        workflow: replaceFirstNode(workflow, (node) => ({ ...node, errorPolicy: "explode" })),
        expected: {
          path: "$.nodes[0].errorPolicy",
          message: 'Expected "fail", "skip", or "route".',
        },
      };
    case "bad-parameters":
      return {
        workflow: replaceFirstNode(workflow, (node) => ({
          ...node,
          parameters: { value: undefined },
        })),
        expected: {
          path: "$.nodes[0].parameters.value",
          message: "Expected a JSON value.",
        },
      };
    case "control-id":
      return {
        workflow: replaceFirstNode(workflow, (node) => ({ ...node, id: "node\u0000" })),
        expected: {
          path: "$.nodes[0].id",
          message: "Expected a string without control characters.",
        },
      };
  }
};

const validWorkflow: Arbitrary<RawWorkflow> = uniqueArray(integer({ min: 0, max: 20 }), {
  minLength: 1,
  maxLength: 8,
}).chain((ids) => {
  const nodeIds = ids.map((id) => `node-${id}`);
  const nodeArbitraries = nodeIds.map((id) =>
    record({
      id: constant(id),
      type: constantFrom(...nodeTypes),
      parameters: constant({}),
    }),
  );
  const nodesArbitrary = tuple(...nodeArbitraries);
  const connectionsArbitrary = array(
    record({
      from: constantFrom(...nodeIds),
      to: constantFrom(...nodeIds),
      fromPort: option(constantFrom("main", "true", "false", "error"), {
        nil: undefined,
      }),
    }),
    { maxLength: 12 },
  ).map((connections) =>
    connections.map((connection) =>
      connection.fromPort === undefined
        ? { from: connection.from, to: connection.to }
        : { from: connection.from, to: connection.to, fromPort: connection.fromPort },
    ),
  );

  return tuple(nodesArbitrary, connectionsArbitrary).map(([graphNodes, generatedConnections]) => ({
    id: "property-workflow",
    name: "Property workflow",
    expressionVersion: 1,
    nodes: graphNodes,
    connections: generatedConnections,
  }));
});

const invalidWorkflow = (mutation: MutationKind): Arbitrary<InvalidCase> =>
  validWorkflow.map((workflow) => mutate(workflow, mutation));

const parseRejection = (value: unknown): unknown => {
  try {
    parseWorkflow(value);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("graph property tests", () => {
  it("executes a deterministic valid graph to completion", async () => {
    const workflow = parseWorkflow({
      id: "deterministic-workflow",
      name: "Deterministic workflow",
      expressionVersion: 1,
      nodes: [
        { id: "start", type: "echo", parameters: {} },
        { id: "next", type: "echo", parameters: {} },
      ],
      connections: [{ from: "start", to: "next" }],
    });
    const result = await runWorkflow({
      workflow,
      input: { value: 1 },
      nodes,
      ports,
      signal: new AbortController().signal,
      maxSteps: 10,
      maxQueuedItems: 10,
    });

    expect(result.status).toBe("ok");
    expect(result.trace.map((line) => `${line.node}:${line.status}`)).toEqual([
      "start:ok",
      "next:ok",
    ]);
    expect(result.outputs).toEqual([{ value: 1 }]);
  });

  it("never throws for a random valid graph", async () => {
    await assert(
      asyncProperty(validWorkflow, async (raw) => {
        const workflow = parseWorkflow(raw);
        const result = await runWorkflow({
          workflow,
          input: {},
          nodes,
          ports,
          signal: new AbortController().signal,
          maxSteps: 50,
          maxQueuedItems: 100,
        });

        expect(["ok", "fail"]).toContain(result.status);
        expect(result.trace.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it.each(mutationKinds)(
    "rejects a random invalid graph with a clear schema error: %s",
    (mutation) => {
      assert(
        property(invalidWorkflow(mutation), ({ workflow, expected }) => {
          const error = parseRejection(workflow);
          expect(error).toBeInstanceOf(SchemaError);
          if (!(error instanceof SchemaError)) {
            throw new Error("Expected parseWorkflow to reject the invalid workflow.");
          }

          expect(error.path).toBe(expected.path);
          expect(error.message).toBe(`${expected.path}: ${expected.message}`);
        }),
        { numRuns: 100 },
      );
    },
  );
});
