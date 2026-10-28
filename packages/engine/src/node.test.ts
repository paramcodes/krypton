import { describe, expect, it } from "vitest";

import { ERROR_PORT, isNodeExecutionResult } from "./node";

describe("node result validation", () => {
  it("accepts a result with named ports, JSON items, and optional detail", () => {
    const result: unknown = {
      outputs: [{ port: "main", items: [{ id: 1 }] }],
      detail: "1 item",
    };

    expect(isNodeExecutionResult(result)).toBe(true);
  });

  it("rejects malformed ports, items, and detail", () => {
    expect(isNodeExecutionResult(null)).toBe(false);
    expect(isNodeExecutionResult("not-a-result")).toBe(false);
    expect(isNodeExecutionResult({ outputs: [{ port: "", items: [] }] })).toBe(false);
    expect(isNodeExecutionResult({ outputs: [{ port: ERROR_PORT, items: [] }] })).toBe(false);
    expect(isNodeExecutionResult({ outputs: [{ port: "main", items: "nope" }] })).toBe(false);
    expect(isNodeExecutionResult({ outputs: ["nope"] })).toBe(false);
    expect(isNodeExecutionResult({ outputs: [{ port: "main", items: [new Map()] }] })).toBe(false);
    expect(isNodeExecutionResult({ outputs: [], detail: 42 })).toBe(false);
    expect(isNodeExecutionResult({ outputs: "nope" })).toBe(false);
  });

  it("rejects sparse output and item arrays", () => {
    const sparseOutputs: unknown[] = [];
    sparseOutputs[1] = { port: "main", items: [] };
    const sparseItems: unknown[] = [];
    sparseItems[1] = {};

    expect(isNodeExecutionResult({ outputs: sparseOutputs })).toBe(false);
    expect(isNodeExecutionResult({ outputs: [{ port: "main", items: sparseItems }] })).toBe(false);
  });
});
