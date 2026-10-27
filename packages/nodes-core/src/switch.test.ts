import { formatTrace, runWorkflow, type Clock, type Http } from "@krypton/engine";
import { parseWorkflow } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import { coreNodes } from "./index";

const ports = {
  clock: { now: () => 0, sleep: async () => {} } satisfies Clock,
  http: {
    request: async () => {
      throw new Error("The expect test does not make HTTP requests.");
    },
  } satisfies Http,
};

describe("Switch expect test", () => {
  it("routes one item through only the matching named-port branch", async () => {
    const workflow = parseWorkflow({
      id: "switch-routes",
      name: "Switch routes",
      nodes: [
        { id: "start", type: "manual-trigger" },
        {
          id: "switch",
          type: "switch",
          parameters: {
            value: "{{ $json.status }}",
            cases: [
              { value: "paid", port: "paid" },
              { value: "refunded", port: "review" },
            ],
          },
        },
        {
          id: "paid-route",
          type: "set",
          parameters: { values: { outcome: "paid" } },
        },
        {
          id: "review-route",
          type: "set",
          parameters: { values: { outcome: "review" } },
        },
        {
          id: "default-route",
          type: "set",
          parameters: { values: { outcome: "default" } },
        },
      ],
      connections: [
        { from: "start", to: "switch" },
        { from: "switch", fromPort: "paid", to: "paid-route" },
        { from: "switch", fromPort: "review", to: "review-route" },
        { from: "switch", fromPort: "default", to: "default-route" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: { status: "paid", invoice: "INV-1" },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([{ status: "paid", invoice: "INV-1", outcome: "paid" }]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     switch       ok    switch paid
      t=0ms     paid-route   ok    1 field"
    `);
  });
});
