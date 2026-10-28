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

describe("Merge expect tests", () => {
  it("appends items from two emitting branches in queue order", async () => {
    const workflow = parseWorkflow({
      id: "append-merge",
      name: "Append merge",
      nodes: [
        { id: "start", type: "manual-trigger" },
        { id: "first", type: "set", parameters: { values: { branch: "first" } } },
        { id: "second", type: "set", parameters: { values: { branch: "second" } } },
        { id: "join", type: "merge" },
        { id: "finish", type: "set", parameters: { values: { done: true } } },
      ],
      connections: [
        { from: "start", to: "first" },
        { from: "start", to: "second" },
        { from: "first", to: "join" },
        { from: "second", to: "join" },
        { from: "join", to: "finish" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: { id: 1 },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      { id: 1, branch: "first", done: true },
      { id: 1, branch: "second", done: true },
    ]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     first        ok    1 field
      t=0ms     second       ok    1 field
      t=0ms     join         ok    appended
      t=0ms     join         ok    appended
      t=0ms     finish       ok    1 field
      t=0ms     finish       ok    1 field"
    `);
  });

  it("does not wait for an unselected Switch branch", async () => {
    const workflow = parseWorkflow({
      id: "merge-switch",
      name: "Merge after Switch",
      nodes: [
        { id: "start", type: "manual-trigger" },
        {
          id: "route",
          type: "switch",
          parameters: {
            value: "{{ $json.status }}",
            cases: [
              { value: "paid", port: "paid" },
              { value: "refunded", port: "review" },
            ],
          },
        },
        { id: "paid", type: "set", parameters: { values: { handled: true } } },
        { id: "review", type: "set", parameters: { values: { reviewed: true } } },
        { id: "join", type: "merge" },
        { id: "finish", type: "set", parameters: { values: { done: true } } },
      ],
      connections: [
        { from: "start", to: "route" },
        { from: "route", fromPort: "paid", to: "paid" },
        { from: "route", fromPort: "review", to: "review" },
        { from: "paid", to: "join" },
        { from: "review", to: "join" },
        { from: "join", to: "finish" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: { id: 2, status: "paid" },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([{ id: 2, status: "paid", handled: true, done: true }]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     route        ok    switch paid
      t=0ms     paid         ok    1 field
      t=0ms     join         ok    appended
      t=0ms     finish       ok    1 field"
    `);
    expect(formatTrace(result.trace)).not.toContain("review");
  });
});
