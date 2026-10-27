import type { NodeExecutionContext, NodeExecutor } from "@krypton/engine";
import { asNodeId, type JsonObject } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import { coreNodes } from "./index";

const executor = (type: string): NodeExecutor => {
  const found = coreNodes[type];
  if (found === undefined) {
    throw new Error(`Missing core node: ${type}`);
  }
  return found;
};

const context = (
  parameters: JsonObject,
  item: JsonObject = { customer: "Ada" },
): NodeExecutionContext => ({
  nodeId: asNodeId("node"),
  nodeType: "test",
  item,
  parameters,
  ports: { clock: { now: () => 0 } },
  signal: new AbortController().signal,
});

describe("core node parameters", () => {
  it("merges Set values into the current item", async () => {
    const result = await executor("set")(context({ values: { status: "ready", score: 3 } }));

    expect(result.outputs).toEqual([
      { port: "main", items: [{ customer: "Ada", status: "ready", score: 3 }] },
    ]);
    expect(result.detail).toBe("2 fields");
  });

  it("rejects a non-object Set values parameter", async () => {
    await expect(executor("set")(context({ values: "not-an-object" }))).rejects.toThrow(
      /must be an object/,
    );
  });

  it("rejects a null Set values parameter", async () => {
    await expect(executor("set")(context({ values: null }))).rejects.toThrow(/must be an object/);
  });

  it("leaves the item unchanged when Set has no values", async () => {
    const result = await executor("set")(context({}));

    expect(result.outputs).toEqual([{ port: "main", items: [{ customer: "Ada" }] }]);
    expect(result.detail).toBe("0 fields");
  });

  it("routes the item to the true or false port", async () => {
    const trueResult = await executor("if")(context({ condition: true }));
    const falseResult = await executor("if")(context({ condition: false }));

    expect(trueResult.outputs).toEqual([{ port: "true", items: [{ customer: "Ada" }] }]);
    expect(falseResult.outputs).toEqual([{ port: "false", items: [{ customer: "Ada" }] }]);
  });

  it("rejects a non-boolean IF condition", async () => {
    await expect(executor("if")(context({ condition: "true" }))).rejects.toThrow(
      /must be a boolean/,
    );
  });
});
