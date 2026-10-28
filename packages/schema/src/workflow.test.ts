import { describe, expect, it } from "vitest";

import { SchemaError } from "./errors";
import { parseJsonObject, parseJsonValue } from "./json";
import { parseWorkflow } from "./workflow";

describe("JSON boundary", () => {
  it("parses nested JSON objects and arrays", () => {
    const parsed = parseJsonObject({
      name: "Ada",
      tags: ["trial", "web"],
      profile: { active: true, score: 3 },
      missing: null,
    });

    expect(parsed).toEqual({
      name: "Ada",
      tags: ["trial", "web"],
      profile: { active: true, score: 3 },
      missing: null,
    });
  });

  it("rejects values that cannot survive a JSON round trip", () => {
    expect(() => parseJsonValue(undefined)).toThrow(SchemaError);
    expect(() => parseJsonValue(Number.NaN)).toThrow(/finite JSON number/);
    expect(() => parseJsonValue(() => "nope")).toThrow(/JSON value/);
    expect(() => parseJsonValue(new Date())).toThrow(/JSON value/);
  });

  it("keeps a __proto__ key as data instead of polluting the prototype", () => {
    const value: unknown = JSON.parse('{"__proto__":{"polluted":true},"safe":"yes"}');
    const parsed = parseJsonObject(value);

    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect("polluted" in Object.prototype).toBe(false);
  });

  it("rejects a non-object at the object boundary", () => {
    expect(() => parseJsonObject(["not", "an", "object"])).toThrow(/JSON object/);
  });

  it("rejects JSON nested beyond the depth budget", () => {
    let value: unknown = "leaf";
    for (let depth = 0; depth <= 65; depth += 1) {
      value = { next: value };
    }

    expect(() => parseJsonValue(value)).toThrow(/no deeper than/);
  });

  it("rejects symbol keys instead of silently dropping them", () => {
    const value: unknown = { [Symbol("hidden")]: true };

    expect(() => parseJsonValue(value)).toThrow(/keys must be strings/);
  });
});

describe("workflow parsing", () => {
  it("parses a workflow and brands its identifiers", () => {
    const workflow = parseWorkflow({
      id: "triage",
      name: "Triage",
      nodes: [
        { id: "start", type: "manual-trigger" },
        {
          id: "enrich",
          type: "set",
          parameters: { values: { status: "ready" } },
        },
      ],
      connections: [{ from: "start", to: "enrich" }],
    });

    expect(workflow.id).toBe("triage");
    expect(workflow.expressionVersion).toBe(1);
    expect(workflow.nodes[0]?.id).toBe("start");
    expect(workflow.nodes[1]?.parameters).toEqual({ values: { status: "ready" } });
    expect(workflow.connections[0]).toEqual({ from: "start", to: "enrich" });
  });

  it("accepts an explicit expression version and defaults it to 1", () => {
    const defaulted = parseWorkflow({
      id: "defaulted",
      name: "Defaulted",
      nodes: [{ id: "start", type: "manual-trigger" }],
    });
    const explicit = parseWorkflow({
      id: "explicit",
      name: "Explicit",
      expressionVersion: 1,
      nodes: [{ id: "start", type: "manual-trigger" }],
    });

    expect(defaulted.expressionVersion).toBe(1);
    expect(explicit.expressionVersion).toBe(1);
  });

  it("rejects an invalid expression version", () => {
    for (const expressionVersion of [0, -1, 1.5, "1", null]) {
      expect(() =>
        parseWorkflow({
          id: "bad-version",
          name: "Bad version",
          expressionVersion,
          nodes: [{ id: "start", type: "manual-trigger" }],
        }),
      ).toThrow(/expressionVersion/);
    }
  });

  it("defaults missing parameters and connections", () => {
    const workflow = parseWorkflow({
      id: "solo",
      name: "Solo",
      nodes: [{ id: "start", type: "manual-trigger" }],
    });

    expect(workflow.nodes[0]?.parameters).toEqual({});
    expect(workflow.connections).toEqual([]);
  });

  it("rejects duplicate node identifiers", () => {
    expect(() =>
      parseWorkflow({
        id: "duplicate",
        name: "Duplicate",
        nodes: [
          { id: "start", type: "manual-trigger" },
          { id: "start", type: "set" },
        ],
      }),
    ).toThrow(/Duplicate node id/);
  });

  it("rejects connections to unknown nodes", () => {
    expect(() =>
      parseWorkflow({
        id: "broken",
        name: "Broken",
        nodes: [{ id: "start", type: "manual-trigger" }],
        connections: [{ from: "start", to: "missing" }],
      }),
    ).toThrow(/Unknown node "missing"/);
  });

  it("rejects parameters that are not JSON", () => {
    expect(() =>
      parseWorkflow({
        id: "broken",
        name: "Broken",
        nodes: [
          {
            id: "start",
            type: "set",
            parameters: { value: undefined },
          },
        ],
      }),
    ).toThrow(SchemaError);
  });

  it("rejects control characters in identifiers", () => {
    expect(() =>
      parseWorkflow({
        id: "bad",
        name: "Bad",
        nodes: [{ id: "start\u0000", type: "manual-trigger" }],
      }),
    ).toThrow(/control characters/);
  });

  it("rejects a sparse node array as invalid input", () => {
    const nodes: unknown[] = [];
    nodes[1] = { id: "start", type: "manual-trigger" };

    expect(() =>
      parseWorkflow({
        id: "sparse",
        name: "Sparse",
        nodes,
      }),
    ).toThrow(SchemaError);
  });

  it("bounds the number of nodes", () => {
    const nodes = Array.from({ length: 1_001 }, (_, index) => ({
      id: `node-${index}`,
      type: "set",
    }));

    expect(() =>
      parseWorkflow({
        id: "too-many",
        name: "Too many",
        nodes,
      }),
    ).toThrow(/at most 1000 nodes/);
  });

  it("bounds the number of connections", () => {
    const connections = Array.from({ length: 5_001 }, () => ({
      from: "start",
      to: "start",
    }));

    expect(() =>
      parseWorkflow({
        id: "too-many",
        name: "Too many",
        nodes: [{ id: "start", type: "manual-trigger" }],
        connections,
      }),
    ).toThrow(/at most 5000 connections/);
  });

  it("rejects an empty source port", () => {
    expect(() =>
      parseWorkflow({
        id: "bad-port",
        name: "Bad port",
        nodes: [{ id: "start", type: "manual-trigger" }],
        connections: [{ from: "start", to: "start", fromPort: "" }],
      }),
    ).toThrow(/non-empty string/);
  });

  it("parses a bounded retry policy and defaults backoff to fixed", () => {
    const workflow = parseWorkflow({
      id: "retry",
      name: "Retry",
      nodes: [
        {
          id: "request",
          type: "http-request",
          retry: { maxAttempts: 3, delayMs: 1_000 },
        },
      ],
    });

    expect(workflow.nodes[0]?.retry).toEqual({
      maxAttempts: 3,
      delayMs: 1_000,
      backoff: "fixed",
    });
  });

  it("parses an exponential retry policy", () => {
    const workflow = parseWorkflow({
      id: "retry",
      name: "Retry",
      nodes: [
        {
          id: "request",
          type: "http-request",
          retry: { maxAttempts: 4, delayMs: 250, backoff: "exponential" },
        },
      ],
    });

    expect(workflow.nodes[0]?.retry).toEqual({
      maxAttempts: 4,
      delayMs: 250,
      backoff: "exponential",
    });
  });

  it("rejects retry policies outside their bounds", () => {
    const invalid = [
      { maxAttempts: 0, delayMs: 1 },
      { maxAttempts: 11, delayMs: 1 },
      { maxAttempts: 1.5, delayMs: 1 },
      { maxAttempts: 2, delayMs: -1 },
      { maxAttempts: 2, delayMs: 60_001 },
      { maxAttempts: 2, delayMs: 1, backoff: "random" },
      "not-an-object",
    ];

    for (const retry of invalid) {
      expect(() =>
        parseWorkflow({
          id: "bad-retry",
          name: "Bad retry",
          nodes: [{ id: "request", type: "http-request", retry }],
        }),
      ).toThrow(SchemaError);
    }
  });

  it("keeps an omitted node timeout absent and accepts both bounds", () => {
    const workflow = parseWorkflow({
      id: "timeouts",
      name: "Timeouts",
      nodes: [
        { id: "untimed", type: "manual-trigger" },
        { id: "minimum", type: "set", timeoutMs: 1 },
        { id: "maximum", type: "set", timeoutMs: 120_000 },
      ],
    });

    expect(workflow.nodes[0]).not.toHaveProperty("timeoutMs");
    expect(workflow.nodes[1]?.timeoutMs).toBe(1);
    expect(workflow.nodes[2]?.timeoutMs).toBe(120_000);
  });

  it("rejects node timeouts outside their bounds", () => {
    for (const timeoutMs of [0, -1, 1.5, 120_001, "1000", null]) {
      expect(() =>
        parseWorkflow({
          id: "bad-timeout",
          name: "Bad timeout",
          nodes: [{ id: "node", type: "set", timeoutMs }],
        }),
      ).toThrow(SchemaError);
    }
  });

  it("keeps an omitted error policy absent and parses each supported value", () => {
    const workflow = parseWorkflow({
      id: "error-policies",
      name: "Error policies",
      nodes: [
        { id: "default", type: "set" },
        { id: "explicit-fail", type: "set", errorPolicy: "fail" },
        { id: "skip", type: "set", errorPolicy: "skip" },
        { id: "route", type: "set", errorPolicy: "route" },
      ],
    });

    expect(workflow.nodes[0]).not.toHaveProperty("errorPolicy");
    expect(workflow.nodes[1]?.errorPolicy).toBe("fail");
    expect(workflow.nodes[2]?.errorPolicy).toBe("skip");
    expect(workflow.nodes[3]?.errorPolicy).toBe("route");
  });

  it("rejects unknown error policies", () => {
    for (const errorPolicy of ["stop", "continue", "", "ROUTE", 1, null, true, {}]) {
      expect(() =>
        parseWorkflow({
          id: "bad-error-policy",
          name: "Bad error policy",
          nodes: [{ id: "node", type: "set", errorPolicy }],
        }),
      ).toThrow(SchemaError);
    }
  });
});
