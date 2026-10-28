import type { NodeExecutionResult, NodeExecutor } from "@krypton/engine";
import { isJsonObject, type JsonObject, type JsonValue } from "@krypton/schema";

import { DEFAULT_LOOP_ITEM_LIMIT, MAX_LOOP_ITEM_LIMIT } from "./defaults.ts";

/** Reserved item field for internal node state. Entry points strip it. */
export const INTERNAL_STATE_KEY = "__krypton";

const LOOP_PORT = "loop";
const DONE_PORT = "done";

type LoopState = {
  readonly items: readonly JsonObject[];
  readonly nextIndex: number;
  readonly results: readonly JsonObject[];
  readonly original: JsonObject;
  readonly maxItems: number;
};

const malformedState = (field: string): Error =>
  new Error(`Loop node iteration state is malformed (field '${field}').`);

const readStateMap = (item: JsonObject): JsonObject => {
  if (!Object.hasOwn(item, INTERNAL_STATE_KEY)) {
    return {};
  }

  const value = item[INTERNAL_STATE_KEY];
  if (value === undefined) {
    return {};
  }
  if (!isJsonObject(value)) {
    throw new Error(`Loop node item field '${INTERNAL_STATE_KEY}' must be an object.`);
  }
  return value;
};

const readItems = (value: JsonValue | undefined, maxItems: number): readonly JsonObject[] => {
  if (!Array.isArray(value)) {
    throw new Error("Loop node parameter 'items' must be an array of JSON objects.");
  }
  if (value.length > maxItems) {
    throw new Error(`Loop node received ${value.length} items, above maxItems ${maxItems}.`);
  }

  const items: JsonObject[] = [];
  for (const [index, element] of value.entries()) {
    if (!isJsonObject(element)) {
      throw new Error(`Loop node item ${index} must be a JSON object.`);
    }
    items.push(element);
  }
  return items;
};

const readMaxItems = (value: JsonValue | undefined): number => {
  if (value === undefined) {
    return DEFAULT_LOOP_ITEM_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_LOOP_ITEM_LIMIT
  ) {
    throw new Error(
      `Loop node parameter 'maxItems' must be an integer between 1 and ${MAX_LOOP_ITEM_LIMIT}.`,
    );
  }
  return value;
};

const isJsonObjectArray = (value: JsonValue | undefined): value is readonly JsonObject[] => {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((element) => isJsonObject(element));
};

const readStateObjects = (value: JsonValue | undefined, field: string): readonly JsonObject[] => {
  if (!isJsonObjectArray(value)) {
    throw malformedState(field);
  }
  return value;
};

const readLoopState = (value: JsonValue | undefined): LoopState => {
  if (!isJsonObject(value)) {
    throw malformedState("state");
  }

  const items = readStateObjects(value["items"], "items");
  const results = readStateObjects(value["results"], "results");
  const nextIndex = value["nextIndex"];
  if (
    typeof nextIndex !== "number" ||
    !Number.isSafeInteger(nextIndex) ||
    nextIndex < 1 ||
    nextIndex > items.length
  ) {
    throw malformedState("nextIndex");
  }
  if (results.length !== nextIndex - 1) {
    throw malformedState("results");
  }

  const original = value["original"];
  if (!isJsonObject(original)) {
    throw malformedState("original");
  }

  const maxItems = value["maxItems"];
  if (
    typeof maxItems !== "number" ||
    !Number.isSafeInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > MAX_LOOP_ITEM_LIMIT ||
    items.length > maxItems
  ) {
    throw malformedState("maxItems");
  }

  return { items, nextIndex, results, original, maxItems };
};

const withoutInternalState = (item: JsonObject): JsonObject =>
  Object.fromEntries(Object.entries(item).filter(([key]) => key !== INTERNAL_STATE_KEY));

const toStateValue = (state: LoopState): JsonObject => ({
  items: state.items,
  nextIndex: state.nextIndex,
  results: state.results,
  original: state.original,
  maxItems: state.maxItems,
});

const withLoopState = (
  original: JsonObject,
  element: JsonObject,
  map: JsonObject,
  nodeId: string,
  state: LoopState,
): JsonObject => ({
  ...original,
  ...element,
  [INTERNAL_STATE_KEY]: { ...map, [nodeId]: toStateValue(state) },
});

const startLoop = (
  item: JsonObject,
  parameters: JsonObject,
  nodeId: string,
  map: JsonObject,
): NodeExecutionResult => {
  const maxItems = readMaxItems(parameters["maxItems"]);
  const items = readItems(parameters["items"], maxItems);
  if (items.length === 0) {
    return {
      outputs: [{ port: DONE_PORT, items: [{ ...item, results: [] }] }],
      detail: "done 0 results",
    };
  }

  const first = items[0];
  if (first === undefined) {
    throw malformedState("items");
  }

  const state: LoopState = {
    items,
    nextIndex: 1,
    results: [],
    original: item,
    maxItems,
  };
  return {
    outputs: [{ port: LOOP_PORT, items: [withLoopState(item, first, map, nodeId, state)] }],
    detail: `loop 1/${items.length}`,
  };
};

const continueLoop = (
  item: JsonObject,
  map: JsonObject,
  state: LoopState,
  nodeId: string,
): NodeExecutionResult => {
  const result = withoutInternalState(item);
  const results = [...state.results, result];

  if (state.nextIndex >= state.items.length) {
    return {
      outputs: [{ port: DONE_PORT, items: [{ ...state.original, results }] }],
      detail: `done ${results.length} ${results.length === 1 ? "result" : "results"}`,
    };
  }

  const next = state.items[state.nextIndex];
  if (next === undefined) {
    throw malformedState("nextIndex");
  }

  const nextState: LoopState = {
    items: state.items,
    nextIndex: state.nextIndex + 1,
    results,
    original: state.original,
    maxItems: state.maxItems,
  };
  return {
    outputs: [
      {
        port: LOOP_PORT,
        items: [withLoopState(state.original, next, map, nodeId, nextState)],
      },
    ],
    detail: `loop ${nextState.nextIndex}/${state.items.length}`,
  };
};

/**
 * Stateless loop-over-items executor.
 *
 * The loop state travels in the reserved `__krypton` field, keyed by node ID,
 * so the engine stays pure and the body can be any connected node or chain.
 * The body must return exactly one item per iteration with that state intact.
 * Result snapshots strip all reserved state so nested loops do not leak it.
 */
export const loopOverItems: NodeExecutor = async ({ item, parameters, nodeId }) => {
  const map = readStateMap(item);
  const existing = Object.hasOwn(map, nodeId) ? map[nodeId] : undefined;
  if (existing === undefined) {
    return startLoop(item, parameters, nodeId, map);
  }
  return continueLoop(item, map, readLoopState(existing), nodeId);
};
