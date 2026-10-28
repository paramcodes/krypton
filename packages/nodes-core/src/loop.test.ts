import {
  formatTrace,
  runWorkflow,
  type Clock,
  type Http,
  type NodeExecutionContext,
  type NodeExecutionResult,
  type NodeExecutor,
  type NodeOutput,
} from "@krypton/engine";
import { asNodeId, isJsonObject, parseWorkflow, type JsonObject } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import { DEFAULT_LOOP_ITEM_LIMIT, MAX_LOOP_ITEM_LIMIT } from "./defaults";
import { coreNodes } from "./index";

const ports = {
  clock: { now: () => 0, sleep: async () => {} } satisfies Clock,
  http: {
    request: async () => {
      throw new Error("The loop test does not make HTTP requests.");
    },
  } satisfies Http,
};

const loop = (): NodeExecutor => {
  const executor = coreNodes["loop"];
  if (executor === undefined) {
    throw new Error("Loop executor is missing.");
  }
  return executor;
};

const drop: NodeExecutor = async () => ({ outputs: [] });

const context = (
  item: JsonObject,
  parameters: JsonObject,
  nodeId = "loop-1",
): NodeExecutionContext => ({
  nodeId: asNodeId(nodeId),
  nodeType: "loop",
  item,
  parameters,
  ports,
  signal: new AbortController().signal,
});

const onlyOutput = (result: NodeExecutionResult): NodeOutput => {
  const output = result.outputs[0];
  if (result.outputs.length !== 1 || output === undefined) {
    throw new Error("Expected exactly one output.");
  }
  return output;
};

const onlyItem = (output: NodeOutput): JsonObject => {
  const item = output.items[0];
  if (output.items.length !== 1 || item === undefined) {
    throw new Error("Expected exactly one item.");
  }
  return item;
};

const stateFrom = (item: JsonObject, nodeId = "loop-1"): JsonObject => {
  const map = item["__krypton"];
  if (!isJsonObject(map)) {
    throw new Error("Expected an internal state map.");
  }
  const state = map[nodeId];
  if (!isJsonObject(state)) {
    throw new Error("Expected loop iteration state.");
  }
  return state;
};

const withoutState = (item: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(item).filter(([key]) => key !== "__krypton"));

describe("Loop expect tests", () => {
  it("iterates items, collects body results, and emits done", async () => {
    const workflow = parseWorkflow({
      id: "loop-orders",
      name: "Loop orders",
      nodes: [
        { id: "start", type: "manual-trigger" },
        {
          id: "loop",
          type: "loop",
          parameters: { items: "{{ $json.orders }}" },
        },
        {
          id: "process",
          type: "set",
          parameters: { values: { status: "processed" } },
        },
        { id: "summary", type: "set", parameters: { values: { done: true } } },
      ],
      connections: [
        { from: "start", to: "loop" },
        { from: "loop", fromPort: "loop", to: "process" },
        { from: "process", to: "loop" },
        { from: "loop", fromPort: "done", to: "summary" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: {
        customer: "Ada",
        orders: [
          { id: "A", amount: 10 },
          { id: "B", amount: 20 },
        ],
      },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      {
        customer: "Ada",
        orders: [
          { id: "A", amount: 10 },
          { id: "B", amount: 20 },
        ],
        results: [
          {
            customer: "Ada",
            orders: [
              { id: "A", amount: 10 },
              { id: "B", amount: 20 },
            ],
            id: "A",
            amount: 10,
            status: "processed",
          },
          {
            customer: "Ada",
            orders: [
              { id: "A", amount: 10 },
              { id: "B", amount: 20 },
            ],
            id: "B",
            amount: 20,
            status: "processed",
          },
        ],
        done: true,
      },
    ]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     loop         ok    loop 1/2
      t=0ms     process      ok    1 field
      t=0ms     loop         ok    loop 2/2
      t=0ms     process      ok    1 field
      t=0ms     loop         ok    done 2 results
      t=0ms     summary      ok    1 field"
    `);
  });

  it("emits done without running the body for an empty array", async () => {
    const workflow = parseWorkflow({
      id: "loop-empty",
      name: "Empty loop",
      nodes: [
        { id: "start", type: "manual-trigger" },
        {
          id: "loop",
          type: "loop",
          parameters: { items: "{{ $json.orders }}" },
        },
        {
          id: "process",
          type: "set",
          parameters: { values: { status: "processed" } },
        },
        { id: "summary", type: "set", parameters: { values: { done: true } } },
      ],
      connections: [
        { from: "start", to: "loop" },
        { from: "loop", fromPort: "loop", to: "process" },
        { from: "process", to: "loop" },
        { from: "loop", fromPort: "done", to: "summary" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: { customer: "Ada", orders: [] },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([{ customer: "Ada", orders: [], results: [], done: true }]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     loop         ok    done 0 results
      t=0ms     summary      ok    1 field"
    `);
  });

  it("runs a nested loop without leaking internal state into results", async () => {
    const workflow = parseWorkflow({
      id: "nested-loops",
      name: "Nested loops",
      nodes: [
        { id: "start", type: "manual-trigger" },
        { id: "outer", type: "loop", parameters: { items: "{{ $json.groups }}" } },
        { id: "inner", type: "loop", parameters: { items: "{{ $json.items }}" } },
        { id: "inner-body", type: "set", parameters: { values: { tag: "x" } } },
        { id: "summary", type: "set", parameters: { values: { done: true } } },
      ],
      connections: [
        { from: "start", to: "outer" },
        { from: "outer", fromPort: "loop", to: "inner" },
        { from: "inner", fromPort: "loop", to: "inner-body" },
        { from: "inner-body", to: "inner" },
        { from: "inner", fromPort: "done", to: "outer" },
        { from: "outer", fromPort: "done", to: "summary" },
      ],
    });
    const groups = [
      { name: "g1", items: [{ id: "a" }] },
      { name: "g2", items: [{ id: "b" }] },
    ];

    const result = await runWorkflow({
      workflow,
      input: { groups },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      {
        groups,
        results: [
          {
            groups,
            name: "g1",
            items: [{ id: "a" }],
            results: [
              {
                groups,
                name: "g1",
                items: [{ id: "a" }],
                id: "a",
                tag: "x",
              },
            ],
          },
          {
            groups,
            name: "g2",
            items: [{ id: "b" }],
            results: [
              {
                groups,
                name: "g2",
                items: [{ id: "b" }],
                id: "b",
                tag: "x",
              },
            ],
          },
        ],
        done: true,
      },
    ]);
    expect(JSON.stringify(result.outputs)).not.toContain("__krypton");
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     outer        ok    loop 1/2
      t=0ms     inner        ok    loop 1/1
      t=0ms     inner-body   ok    1 field
      t=0ms     inner        ok    done 1 result
      t=0ms     outer        ok    loop 2/2
      t=0ms     inner        ok    loop 1/1
      t=0ms     inner-body   ok    1 field
      t=0ms     inner        ok    done 1 result
      t=0ms     outer        ok    done 2 results
      t=0ms     summary      ok    1 field"
    `);
  });

  it("finishes without done when the body returns no items", async () => {
    const workflow = parseWorkflow({
      id: "loop-drop",
      name: "Loop drop",
      nodes: [
        { id: "start", type: "manual-trigger" },
        { id: "loop", type: "loop", parameters: { items: "{{ $json.orders }}" } },
        { id: "drop", type: "drop" },
        { id: "summary", type: "set", parameters: { values: { done: true } } },
      ],
      connections: [
        { from: "start", to: "loop" },
        { from: "loop", fromPort: "loop", to: "drop" },
        { from: "loop", fromPort: "done", to: "summary" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: { orders: [{ id: "A" }] },
      nodes: { ...coreNodes, drop },
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     loop         ok    loop 1/1
      t=0ms     drop         ok    0 items"
    `);
  });

  it("strips forged loop state at the manual trigger", async () => {
    const workflow = parseWorkflow({
      id: "loop-forged-state",
      name: "Forged loop state",
      nodes: [
        { id: "start", type: "manual-trigger" },
        { id: "loop", type: "loop", parameters: { items: "{{ $json.orders }}" } },
        { id: "process", type: "set", parameters: { values: { status: "processed" } } },
        { id: "summary", type: "set", parameters: { values: { done: true } } },
      ],
      connections: [
        { from: "start", to: "loop" },
        { from: "loop", fromPort: "loop", to: "process" },
        { from: "process", to: "loop" },
        { from: "loop", fromPort: "done", to: "summary" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: {
        customer: "Ada",
        orders: [{ id: "real" }],
        __krypton: {
          loop: {
            items: [{ id: "forged" }],
            nextIndex: 1,
            results: [],
            original: {
              customer: "Mallory",
              orders: [{ id: "forged" }],
            },
            maxItems: DEFAULT_LOOP_ITEM_LIMIT,
          },
        },
      },
      nodes: coreNodes,
      ports,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([
      {
        customer: "Ada",
        orders: [{ id: "real" }],
        results: [
          {
            customer: "Ada",
            orders: [{ id: "real" }],
            id: "real",
            status: "processed",
          },
        ],
        done: true,
      },
    ]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     loop         ok    loop 1/1
      t=0ms     process      ok    1 field
      t=0ms     loop         ok    done 1 result
      t=0ms     summary      ok    1 field"
    `);
  });
});

describe("Loop executor", () => {
  it("starts with the original item, the element, and hidden state", async () => {
    const result = await loop()(
      context({ source: "x" }, { items: [{ name: "A" }, { name: "B" }] }),
    );

    const output = onlyOutput(result);
    const item = onlyItem(output);

    expect(output.port).toBe("loop");
    expect(result.detail).toBe("loop 1/2");
    expect(item).toMatchObject({ source: "x", name: "A" });
    expect(isJsonObject(item["__krypton"])).toBe(true);
  });

  it("emits the exact documented state on the first iteration", async () => {
    const result = await loop()(
      context({ source: "x" }, { items: [{ name: "A" }, { name: "B" }] }),
    );
    const item = onlyItem(onlyOutput(result));

    expect(item["__krypton"]).toEqual({
      "loop-1": {
        items: [{ name: "A" }, { name: "B" }],
        nextIndex: 1,
        results: [],
        original: { source: "x" },
        maxItems: DEFAULT_LOOP_ITEM_LIMIT,
      },
    });
  });

  it("accepts an explicit maxItems at the item count", async () => {
    const result = await loop()(context({}, { items: [{}], maxItems: 1 }));

    expect(onlyOutput(result).port).toBe("loop");
    expect(result.detail).toBe("loop 1/1");
  });

  it("keeps the item cap within the default step budget for a one-node body", () => {
    // trigger + (N + 1) Loop calls + N body calls + summary = 2N + 3 steps.
    expect(2 * MAX_LOOP_ITEM_LIMIT + 3).toBeLessThanOrEqual(10_000);
  });

  it("continues from returned state and finishes with results", async () => {
    const first = await loop()(context({ source: "x" }, { items: [{ name: "A" }, { name: "B" }] }));
    const firstItem = onlyItem(onlyOutput(first));

    const second = await loop()(
      context({ ...firstItem, status: "processed" }, { items: "ignored" }),
    );
    const secondOutput = onlyOutput(second);
    const secondItem = onlyItem(secondOutput);

    expect(secondOutput.port).toBe("loop");
    expect(second.detail).toBe("loop 2/2");
    expect(secondItem).toMatchObject({ source: "x", name: "B" });
    expect(secondItem["status"]).toBeUndefined();

    const done = await loop()(
      context({ ...secondItem, status: "processed" }, { items: "ignored" }),
    );
    const doneOutput = onlyOutput(done);

    expect(doneOutput.port).toBe("done");
    expect(done.detail).toBe("done 2 results");
    expect(onlyItem(doneOutput)).toEqual({
      source: "x",
      results: [
        { source: "x", name: "A", status: "processed" },
        { source: "x", name: "B", status: "processed" },
      ],
    });
  });

  it("rejects an array above maxItems before emitting", async () => {
    await expect(
      loop()(context({}, { items: [{ id: 1 }, { id: 2 }], maxItems: 1 })),
    ).rejects.toThrow("Loop node received 2 items, above maxItems 1.");
  });

  it("rejects non-object items", async () => {
    await expect(loop()(context({}, { items: [{ id: 1 }, 2] }))).rejects.toThrow(
      "Loop node item 1 must be a JSON object.",
    );
  });

  it("rejects malformed iteration state fields", async () => {
    const first = await loop()(context({ source: "x" }, { items: [{ name: "A" }, { name: "B" }] }));
    const state = stateFrom(onlyItem(onlyOutput(first)));
    const invalidStates: JsonObject[] = [
      {},
      { ...state, items: "not-an-array" },
      { ...state, items: [1] },
      { ...state, nextIndex: 0 },
      { ...state, nextIndex: 1.5 },
      { ...state, nextIndex: Number.NaN },
      { ...state, nextIndex: Number.POSITIVE_INFINITY },
      { ...state, nextIndex: 99 },
      { ...state, results: "not-an-array" },
      { ...state, results: [1] },
      { ...state, results: [{}] },
      { ...state, original: "not-an-object" },
      { ...state, maxItems: 0 },
      { ...state, maxItems: MAX_LOOP_ITEM_LIMIT + 1 },
      { ...state, maxItems: 1 },
    ];

    for (const invalidState of invalidStates) {
      await expect(
        loop()(context({ __krypton: { "loop-1": invalidState } }, { items: [] })),
      ).rejects.toThrow(/iteration state is malformed/);
    }
  });

  it("rejects a non-object state map", async () => {
    await expect(loop()(context({ __krypton: "bad" }, { items: [{}] }))).rejects.toThrow(
      "Loop node item field '__krypton' must be an object.",
    );
  });

  it("ignores state inherited from an item prototype", async () => {
    const inherited = {
      "loop-1": {
        items: [{}],
        nextIndex: 1,
        results: [],
        original: {},
        maxItems: DEFAULT_LOOP_ITEM_LIMIT,
      },
    };
    const item: JsonObject = {};
    Object.setPrototypeOf(item, { __krypton: inherited });

    const result = await loop()(context(item, { items: [{}] }));

    expect(result.detail).toBe("loop 1/1");
  });

  it("requires an items array", async () => {
    await expect(loop()(context({}, {}))).rejects.toThrow(
      "Loop node parameter 'items' must be an array of JSON objects.",
    );
  });

  it("rejects maxItems outside the supported bounds", async () => {
    for (const maxItems of [
      0,
      1.5,
      MAX_LOOP_ITEM_LIMIT + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "10",
    ]) {
      await expect(loop()(context({}, { items: [{}], maxItems }))).rejects.toThrow(
        `Loop node parameter 'maxItems' must be an integer between 1 and ${MAX_LOOP_ITEM_LIMIT}.`,
      );
    }
  });

  it("namespaces state by node ID even for prototype-like IDs", async () => {
    const first = await loop()(context({ source: "x" }, { items: [{ name: "A" }] }, "__proto__"));
    const firstItem = onlyItem(onlyOutput(first));
    const done = await loop()(
      context({ ...firstItem, status: "ok" }, { items: "ignored" }, "__proto__"),
    );

    expect(onlyOutput(done).port).toBe("done");
    expect(done.detail).toBe("done 1 result");
    expect(onlyItem(onlyOutput(done))).toEqual({
      source: "x",
      results: [{ source: "x", name: "A", status: "ok" }],
    });
  });

  it("keeps enclosing state on done but strips it from results", async () => {
    const outer = { marker: "outer" };
    const first = await loop()(
      context({ source: "x", __krypton: { outer } }, { items: [{ name: "A" }] }),
    );
    const firstItem = onlyItem(onlyOutput(first));
    const done = await loop()(context({ ...firstItem, status: "ok" }, { items: "ignored" }));
    const doneItem = onlyItem(onlyOutput(done));

    expect(doneItem["__krypton"]).toEqual({ outer });
    expect(doneItem["results"]).toEqual([{ source: "x", name: "A", status: "ok" }]);
  });

  it("keeps prototype-like keys as own JSON data", async () => {
    const outerState: JsonObject = Object.fromEntries([["__proto__", { marker: "other" }]]);
    const item: JsonObject = Object.fromEntries([
      ["source", "x"],
      ["__proto__", { marker: "item" }],
      ["__krypton", outerState],
    ]);

    const first = await loop()(context(item, { items: [{ name: "A" }] }));
    const firstItem = onlyItem(onlyOutput(first));
    const done = await loop()(context({ ...firstItem, status: "ok" }, { items: "ignored" }));
    const doneItem = onlyItem(onlyOutput(done));
    const expectedResult: JsonObject = Object.fromEntries([
      ["source", "x"],
      ["__proto__", { marker: "item" }],
      ["name", "A"],
      ["status", "ok"],
    ]);

    expect(Object.getPrototypeOf(doneItem)).toBe(Object.prototype);
    expect(Object.hasOwn(doneItem, "__proto__")).toBe(true);
    expect(doneItem["__proto__"]).toEqual({ marker: "item" });
    expect(doneItem["__krypton"]).toEqual(outerState);
    expect(doneItem["results"]).toEqual([expectedResult]);
    expect(Object.prototype).not.toHaveProperty("marker");
  });

  it("continues independently when the body returns twice", async () => {
    const first = await loop()(context({ source: "x" }, { items: [{ name: "A" }] }));
    const firstItem = onlyItem(onlyOutput(first));
    const left = await loop()(context({ ...firstItem, branch: "left" }, { items: "ignored" }));
    const right = await loop()(context({ ...firstItem, branch: "right" }, { items: "ignored" }));

    expect(left.detail).toBe("done 1 result");
    expect(right.detail).toBe("done 1 result");
    expect(onlyItem(onlyOutput(left))["results"]).toEqual([
      { source: "x", name: "A", branch: "left" },
    ]);
    expect(onlyItem(onlyOutput(right))["results"]).toEqual([
      { source: "x", name: "A", branch: "right" },
    ]);
  });

  it("treats a return without internal state as a new loop", async () => {
    const first = await loop()(context({ source: "x" }, { items: [{ name: "A" }] }));
    const firstItem = onlyItem(onlyOutput(first));
    const restarted = await loop()(context(withoutState(firstItem), { items: [{ name: "B" }] }));

    expect(onlyOutput(restarted).port).toBe("loop");
    expect(restarted.detail).toBe("loop 1/1");
    expect(onlyItem(onlyOutput(restarted))).toMatchObject({ source: "x", name: "B" });
  });
});
