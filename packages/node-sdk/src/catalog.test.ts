import { describe, expect, it } from "vitest";

import { parseNodeCatalog, parseNodeCatalogEntry, type NodeCatalogEntry } from "./index";

const textField = {
  key: "text",
  label: "Text",
  kind: "text",
  placeholder: "Type here",
  defaultValue: "hello",
} as const;

const validEntry = {
  type: "demo",
  label: "Demo",
  description: "Exercises every parameter kind.",
  category: "data",
  inputs: [{ name: "main", label: "Main" }],
  outputs: [
    { name: "main", label: "Main" },
    { name: "other", label: "Other", description: "A second output." },
  ],
  dynamicOutputs: { label: "Dynamic ports", description: "One port per configured key." },
  parameters: [
    textField,
    {
      key: "count",
      label: "Count",
      kind: "number",
      integer: true,
      minimum: 1,
      maximum: 10,
      defaultValue: 3,
    },
    { key: "enabled", label: "Enabled", kind: "boolean", defaultValue: true },
    {
      key: "mode",
      label: "Mode",
      kind: "select",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      defaultValue: "a",
    },
    {
      key: "payload",
      label: "Payload",
      kind: "json",
      defaultValue: { nested: [1, true, null] },
    },
    {
      key: "headers",
      label: "Headers",
      kind: "key-value",
      valueKind: "string",
      defaultValue: { accept: "application/json" },
    },
    {
      key: "metadata",
      label: "Metadata",
      kind: "key-value",
      valueKind: "json",
      defaultValue: { nested: [1, true, null] },
    },
    {
      key: "cases",
      label: "Cases",
      kind: "list",
      itemLabel: "Case",
      minItems: 1,
      maxItems: 5,
      fields: [
        { key: "value", label: "Value", kind: "json", required: true },
        { key: "port", label: "Port", kind: "text", required: true },
      ],
    },
  ],
} satisfies NodeCatalogEntry;

const validCatalog: readonly NodeCatalogEntry[] = [validEntry];

const withParameters = (parameters: readonly unknown[]): readonly unknown[] => [
  { ...validEntry, parameters },
];

describe("node catalog parsing", () => {
  it("parses a catalog containing every parameter kind", () => {
    expect(parseNodeCatalog(validCatalog)).toEqual(validCatalog);
  });

  it("parses a JSON round trip of a valid catalog", () => {
    const roundTrip: unknown = JSON.parse(JSON.stringify(validCatalog));

    expect(parseNodeCatalog(roundTrip)).toEqual(validCatalog);
  });

  it("parses a single entry and allows a trigger with no inputs", () => {
    const trigger = { ...validEntry, inputs: [], parameters: [] };

    expect(parseNodeCatalogEntry(trigger)).toEqual(trigger);
  });

  it("rejects a non-array catalog", () => {
    expect(() => parseNodeCatalog({})).toThrow(/array/i);
  });

  it("rejects duplicate node types", () => {
    expect(() => parseNodeCatalog([validEntry, validEntry])).toThrow(/duplicate/i);
  });

  it("rejects malformed entries", () => {
    const entries: readonly unknown[] = [
      {},
      { ...validEntry, type: "Bad Type" },
      { ...validEntry, type: "" },
      { ...validEntry, label: "" },
      { ...validEntry, description: "" },
      { ...validEntry, description: "bad\u0000text" },
      { ...validEntry, category: "unknown" },
      { ...validEntry, outputs: [] },
      { ...validEntry, inputs: "main" },
      {
        ...validEntry,
        inputs: [
          { name: "main", label: "One" },
          { name: "main", label: "Two" },
        ],
      },
      { ...validEntry, outputs: [{ name: "bad\nname", label: "Bad" }] },
      { ...validEntry, dynamicOutputs: { label: "", description: "Dynamic." } },
      { ...validEntry, dynamicOutputs: { label: "Dynamic", description: "" } },
    ];

    for (const entry of entries) {
      expect(() => parseNodeCatalog([entry])).toThrow(/^\$/);
    }
  });

  it("rejects malformed parameter fields", () => {
    const parameters: readonly unknown[] = [
      { label: "Missing key", kind: "text" },
      { key: "", label: "Empty key", kind: "text" },
      { key: "bad key", label: "Spaced key", kind: "text" },
      { key: "text", label: "", kind: "text" },
      { key: "text", label: "Text", kind: "unknown" },
      { key: "text", label: "Text", kind: "text", defaultValue: 1 },
      { key: "text", label: "Text", kind: "number", defaultValue: "1" },
      {
        key: "count",
        label: "Count",
        kind: "number",
        integer: true,
        defaultValue: 1.5,
      },
      {
        key: "count",
        label: "Count",
        kind: "number",
        minimum: 5,
        maximum: 1,
      },
      {
        key: "count",
        label: "Count",
        kind: "number",
        maximum: 5,
        defaultValue: 9,
      },
      { key: "enabled", label: "Enabled", kind: "boolean", defaultValue: "true" },
      { key: "mode", label: "Mode", kind: "select", options: [], defaultValue: "a" },
      {
        key: "mode",
        label: "Mode",
        kind: "select",
        options: [{ value: "a", label: "A" }],
        defaultValue: "b",
      },
      {
        key: "mode",
        label: "Mode",
        kind: "select",
        options: [
          { value: "a", label: "A" },
          { value: "a", label: "B" },
        ],
      },
      { key: "payload", label: "Payload", kind: "json", defaultValue: () => {} },
      {
        key: "headers",
        label: "Headers",
        kind: "key-value",
        valueKind: "string",
        defaultValue: { accept: 1 },
      },
      {
        key: "metadata",
        label: "Metadata",
        kind: "key-value",
        valueKind: "json",
        defaultValue: { invalid: () => {} },
      },
      { key: "headers", label: "Headers", kind: "key-value", valueKind: "unknown" },
      { key: "cases", label: "Cases", kind: "list", fields: [] },
      {
        key: "cases",
        label: "Cases",
        kind: "list",
        fields: [{ key: "value", label: "Value", kind: "text" }],
        minItems: 3,
        maxItems: 1,
      },
      {
        key: "cases",
        label: "Cases",
        kind: "list",
        fields: [
          { key: "value", label: "Value", kind: "text" },
          { key: "value", label: "Other", kind: "text" },
        ],
      },
      {
        key: "cases",
        label: "Cases",
        kind: "list",
        fields: [{ key: "value", label: "Value", kind: "text" }],
        defaultValue: [],
      },
    ];

    for (const parameter of parameters) {
      expect(() => parseNodeCatalog(withParameters([parameter]))).toThrow(/^\$/);
    }
  });

  it("rejects duplicate parameter keys at the same level", () => {
    const duplicate = [
      { key: "text", label: "One", kind: "text" },
      { key: "text", label: "Two", kind: "text" },
    ];

    expect(() => parseNodeCatalog(withParameters(duplicate))).toThrow(/duplicate/i);
  });

  it("rejects a non-object entry", () => {
    expect(() => parseNodeCatalogEntry(null)).toThrow(/^\$/);
  });
});
