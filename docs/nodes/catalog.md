# Node catalog

The node catalog is the editor-facing description of each built-in node: its
label, category, input and output ports, and parameter fields. It lives in
`@krypton/node-sdk` and is populated by `@krypton/nodes-core`.

It is not a runtime validator. Node executors remain responsible for validating
resolved parameter values, because expressions are evaluated per item before the
executor runs.

## Inspecting the catalog

```bash
bun run cli -- nodes
bun run cli -- nodes --json
```

The readable form is for people; `--json` is the same data for tools and the
future editor. Neither command runs a workflow or makes a network request.

The editor will fetch this data from the API and type it with
`@krypton/node-sdk`; it must not import `@krypton/nodes-core` directly.

## Contract

A catalog entry has a stable `type`, a display `label`, a `description`, a
`category` (`trigger`, `flow`, `data`, or `network`), fixed `inputs` and
`outputs`, optional `dynamicOutputs`, and a list of `parameters`.

Parameter fields are one of:

| Kind        | Use                                                            |
| ----------- | -------------------------------------------------------------- |
| `text`      | Short strings such as URLs or port names.                      |
| `number`    | Numbers, optionally integers with bounds.                      |
| `boolean`   | Checkboxes and branch conditions.                              |
| `select`    | One of a fixed set of string options.                          |
| `json`      | Arbitrary JSON, including scalars and nested values.           |
| `key-value` | String or JSON values keyed by a name, such as headers.        |
| `list`      | Repeating objects with their own fields, such as Switch cases. |

Fields are validated at the catalog boundary: duplicate types, ports, and keys,
invalid defaults, control characters, and malformed bounds are rejected. See the
[specification](../specs/node-catalog.md) for the exact rules.

Switch is the first node with dynamic outputs. It declares one fixed `default`
port and a `dynamicOutputs` description; each configured case supplies another
port name. The editor can render the fixed handle plus one handle per case.

## Adding a node

1. Add the executor to `packages/nodes-core/src/index.ts`.
2. Add its entry to `packages/nodes-core/src/catalog.ts`.
3. Run the catalog tests. The completeness test fails if the registry and
   catalog disagree.

See [ADR 0018](../adr/0018-node-catalog.md) for why the catalog is a typed union
rather than JSON Schema or hard-coded React forms.
