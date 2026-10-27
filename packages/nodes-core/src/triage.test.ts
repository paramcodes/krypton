import { formatTrace, runWorkflow, type Clock } from "@krypton/engine";
import { parseWorkflow } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import { coreNodes } from "./index";

const clock: Clock = { now: () => 0, sleep: async () => {} };

const ports = {
  clock,
  http: {
    request: async () => {
      throw new Error("The test HTTP port was not configured.");
    },
  },
};

const triageWorkflow = (condition: boolean | string): ReturnType<typeof parseWorkflow> =>
  parseWorkflow({
    id: "triage",
    name: "Triage",
    nodes: [
      { id: "start", type: "manual-trigger" },
      { id: "enrich", type: "set", parameters: { values: { status: "ready" } } },
      { id: "decide", type: "if", parameters: { condition } },
      { id: "approve", type: "set", parameters: { values: { route: "approve" } } },
      { id: "decline", type: "set", parameters: { values: { route: "decline" } } },
    ],
    connections: [
      { from: "start", to: "enrich" },
      { from: "enrich", to: "decide" },
      { from: "decide", fromPort: "true", to: "approve" },
      { from: "decide", fromPort: "false", to: "decline" },
    ],
  });

describe("triage workflow", () => {
  it("runs a manual trigger, Set, and IF with the real core nodes", async () => {
    const result = await runWorkflow({
      workflow: triageWorkflow(true),
      input: { customer: "Ada", plan: "trial" },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     enrich       ok    1 field
      t=0ms     decide       ok    branch true
      t=0ms     approve      ok    1 field"
    `);
    expect(result.outputs).toEqual([
      { customer: "Ada", plan: "trial", status: "ready", route: "approve" },
    ]);
  });

  it("evaluates an expression in the IF condition for each item", async () => {
    const result = await runWorkflow({
      workflow: triageWorkflow("{{ $json.plan === 'trial' }}"),
      input: { customer: "Ada", plan: "trial" },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      { customer: "Ada", plan: "trial", status: "ready", route: "approve" },
    ]);
  });

  it("takes the false branch when the IF condition is false", async () => {
    const result = await runWorkflow({
      workflow: triageWorkflow(false),
      input: { customer: "Ada", plan: "trial" },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      { customer: "Ada", plan: "trial", status: "ready", route: "decline" },
    ]);
  });
});
