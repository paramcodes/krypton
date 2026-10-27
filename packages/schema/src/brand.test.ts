import { describe, expect, it } from "vitest";

import { asExecutionId, asNodeId, asWorkflowId } from "./brand";

describe("branded IDs", () => {
  it("preserve the underlying value", () => {
    expect(asWorkflowId("workflow-1")).toBe("workflow-1");
    expect(asNodeId("node-1")).toBe("node-1");
    expect(asExecutionId("execution-1")).toBe("execution-1");
  });
});
