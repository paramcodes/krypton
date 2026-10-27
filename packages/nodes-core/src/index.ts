import type { NodeExecutor } from "@krypton/engine";
import { isJsonObject, type JsonObject } from "@krypton/schema";

const manualTrigger: NodeExecutor = async ({ item }) => ({
  outputs: [{ port: "main", items: [item] }],
});

const set: NodeExecutor = async ({ item, parameters }) => {
  const values = parameters["values"];
  const fields = values === undefined ? {} : values;
  if (!isJsonObject(fields)) {
    throw new Error("Set node parameter 'values' must be an object.");
  }

  const next: JsonObject = { ...item, ...fields };
  const count = Object.keys(fields).length;
  return {
    outputs: [{ port: "main", items: [next] }],
    detail: `${count} ${count === 1 ? "field" : "fields"}`,
  };
};

const branch: NodeExecutor = async ({ item, parameters }) => {
  const condition = parameters["condition"];
  if (typeof condition !== "boolean") {
    throw new Error("IF node parameter 'condition' must be a boolean.");
  }

  const port = condition ? "true" : "false";
  return {
    outputs: [{ port, items: [item] }],
    detail: `branch ${port}`,
  };
};

export const coreNodes: Readonly<Record<string, NodeExecutor>> = {
  "manual-trigger": manualTrigger,
  set,
  if: branch,
};
