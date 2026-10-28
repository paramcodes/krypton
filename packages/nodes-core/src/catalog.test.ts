import { parseNodeCatalog } from "@krypton/node-sdk";
import { describe, expect, it } from "vitest";

import { coreNodeCatalog, coreNodes } from "./index";

const entry = (type: string) => {
  const found = coreNodeCatalog.find((node) => node.type === type);
  if (found === undefined) {
    throw new Error(`Missing node catalog entry: ${type}`);
  }
  return found;
};

describe("core node catalog", () => {
  it("has exactly one definition for every executor", () => {
    expect(coreNodeCatalog.map((node) => node.type).toSorted()).toEqual(
      Object.keys(coreNodes).toSorted(),
    );
  });

  it("parses as a catalog and survives a JSON round trip", () => {
    expect(parseNodeCatalog(coreNodeCatalog)).toEqual(coreNodeCatalog);

    const roundTrip: unknown = JSON.parse(JSON.stringify(coreNodeCatalog));
    expect(parseNodeCatalog(roundTrip)).toEqual(coreNodeCatalog);
  });

  it("declares trigger, branch, switch, and HTTP metadata", () => {
    const trigger = entry("manual-trigger");
    expect(trigger.category).toBe("trigger");
    expect(trigger.inputs).toEqual([]);
    expect(trigger.outputs.map((port) => port.name)).toEqual(["main"]);

    const branch = entry("if");
    expect(branch.category).toBe("flow");
    expect(branch.outputs.map((port) => port.name)).toEqual(["true", "false"]);
    expect(branch.parameters).toMatchObject([
      { key: "condition", kind: "boolean", required: true },
    ]);

    const switchNode = entry("switch");
    expect(switchNode.category).toBe("flow");
    expect(switchNode.outputs.map((port) => port.name)).toEqual(["default"]);
    expect(switchNode.dynamicOutputs).toBeDefined();
    expect(switchNode.parameters).toMatchObject([
      { key: "value", kind: "json", required: true },
      { key: "cases", kind: "list", required: true, minItems: 1 },
    ]);

    const merge = entry("merge");
    expect(merge.category).toBe("flow");
    expect(merge.inputs.map((port) => port.name)).toEqual(["main"]);
    expect(merge.inputs[0]?.description).toContain("any number");
    expect(merge.outputs.map((port) => port.name)).toEqual(["main"]);
    expect(merge.parameters).toEqual([]);

    const http = entry("http-request");
    expect(http.category).toBe("network");
    expect(http.parameters.find((field) => field.key === "url")).toMatchObject({
      kind: "text",
      required: true,
    });
    expect(http.parameters.find((field) => field.key === "method")).toMatchObject({
      kind: "select",
      defaultValue: "GET",
    });
    expect(http.parameters.find((field) => field.key === "timeoutMs")).toMatchObject({
      kind: "number",
      integer: true,
      defaultValue: 30_000,
    });
  });

  it("declares the Switch case fields and the Set value map", () => {
    const cases = entry("switch").parameters.find((field) => field.key === "cases");
    expect(cases?.kind).toBe("list");
    if (cases?.kind !== "list") {
      throw new Error("Switch cases must be a list.");
    }
    expect(cases.fields.map((field) => [field.key, field.kind, field.required])).toEqual([
      ["value", "json", true],
      ["port", "text", true],
    ]);

    const values = entry("set").parameters.find((field) => field.key === "values");
    expect(values).toMatchObject({ kind: "key-value", valueKind: "json" });
  });

  it("gives every non-trigger node one main input", () => {
    const inputs = coreNodeCatalog.map((node) => ({
      category: node.category,
      names: node.inputs.map((port) => port.name),
    }));

    expect(
      inputs.filter((node) => node.category === "trigger").every((node) => node.names.length === 0),
    ).toBe(true);
    expect(
      inputs
        .filter((node) => node.category !== "trigger")
        .every((node) => node.names.length === 1 && node.names[0] === "main"),
    ).toBe(true);
  });
});
