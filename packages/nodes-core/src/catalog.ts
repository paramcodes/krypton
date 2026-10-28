import { MAX_HTTP_RESPONSE_BYTES, MAX_HTTP_TIMEOUT_MS } from "@krypton/engine";
import type { NodeCatalogEntry } from "@krypton/node-sdk";

import { DEFAULT_HTTP_MAX_RESPONSE_BYTES, DEFAULT_HTTP_TIMEOUT_MS } from "./defaults.ts";

/**
 * Editor-facing metadata for the built-in nodes. Executors remain authoritative
 * for resolved parameter validation; this catalog describes ports and forms.
 */
export const coreNodeCatalog: readonly NodeCatalogEntry[] = [
  {
    type: "manual-trigger",
    label: "Manual Trigger",
    description: "Starts a run with the workflow input item.",
    category: "trigger",
    inputs: [],
    outputs: [{ name: "main", label: "Main" }],
    parameters: [],
  },
  {
    type: "set",
    label: "Set",
    description: "Adds or replaces fields on each item.",
    category: "data",
    inputs: [{ name: "main", label: "Main" }],
    outputs: [{ name: "main", label: "Main" }],
    parameters: [
      {
        key: "values",
        label: "Values",
        description: "Fields to add or replace. Values may be expressions.",
        kind: "key-value",
        valueKind: "json",
      },
    ],
  },
  {
    type: "if",
    label: "IF",
    description: "Routes each item to true or false based on a boolean condition.",
    category: "flow",
    inputs: [{ name: "main", label: "Main" }],
    outputs: [
      { name: "true", label: "True" },
      { name: "false", label: "False" },
    ],
    parameters: [
      {
        key: "condition",
        label: "Condition",
        description: "Boolean condition evaluated for each item.",
        kind: "boolean",
        required: true,
      },
    ],
  },
  {
    type: "switch",
    label: "Switch",
    description: "Routes each item to the first matching scalar case port, or default.",
    category: "flow",
    inputs: [{ name: "main", label: "Main" }],
    outputs: [{ name: "default", label: "Default" }],
    dynamicOutputs: {
      label: "Case ports",
      description: "Ports named by the cases list. The first matching case selects its port.",
    },
    parameters: [
      {
        key: "value",
        label: "Value",
        description: "Scalar value to match against the cases.",
        kind: "json",
        required: true,
      },
      {
        key: "cases",
        label: "Cases",
        description: "Ordered cases. Each case has a scalar value and an output port name.",
        kind: "list",
        itemLabel: "Case",
        minItems: 1,
        required: true,
        fields: [
          {
            key: "value",
            label: "Value",
            description: "Scalar value to match.",
            kind: "json",
            required: true,
          },
          {
            key: "port",
            label: "Port",
            description: "Output port for this case.",
            kind: "text",
            required: true,
          },
        ],
      },
    ],
  },
  {
    type: "http-request",
    label: "HTTP Request",
    description: "Sends an HTTP request and adds the response to the item.",
    category: "network",
    inputs: [{ name: "main", label: "Main" }],
    outputs: [{ name: "main", label: "Main" }],
    parameters: [
      {
        key: "url",
        label: "URL",
        description: "Absolute http or https URL.",
        kind: "text",
        placeholder: "https://api.example.com/items",
        required: true,
      },
      {
        key: "method",
        label: "Method",
        description: "HTTP request method.",
        kind: "select",
        options: [
          { value: "GET", label: "GET" },
          { value: "HEAD", label: "HEAD" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "PATCH", label: "PATCH" },
          { value: "DELETE", label: "DELETE" },
          { value: "OPTIONS", label: "OPTIONS" },
        ],
        defaultValue: "GET",
      },
      {
        key: "headers",
        label: "Headers",
        description: "Request headers. Header names must be valid HTTP tokens.",
        kind: "key-value",
        valueKind: "string",
      },
      {
        key: "body",
        label: "Body",
        description: "JSON body. String bodies are sent unchanged.",
        kind: "json",
      },
      {
        key: "timeoutMs",
        label: "Timeout (ms)",
        description: "Request deadline in milliseconds.",
        kind: "number",
        integer: true,
        minimum: 1,
        maximum: MAX_HTTP_TIMEOUT_MS,
        defaultValue: DEFAULT_HTTP_TIMEOUT_MS,
      },
      {
        key: "maxResponseBytes",
        label: "Max response bytes",
        description: "Maximum response body size in bytes.",
        kind: "number",
        integer: true,
        minimum: 1,
        maximum: MAX_HTTP_RESPONSE_BYTES,
        defaultValue: DEFAULT_HTTP_MAX_RESPONSE_BYTES,
      },
    ],
  },
];
