# Node catalog and UI parameter metadata

Status: accepted (2026-10-28)

## Problem

The Stage 3 editor needs to render a form and connection handles for every node
type. There is no editor yet, and node parameter rules currently live inside
each executor. Hard-coding those rules in React later would duplicate the node
contract and drift from the engine.

This slice adds a small, typed catalog that describes a node's ports and
parameters. It is the contract the editor will render; it is not a UI, and it
does not replace runtime validation.

## Contract

`@krypton/node-sdk` exports:

- `NodeCatalogEntry` — one node type's metadata.
- `NodePort` and `NodeDynamicOutputs` — fixed and author-defined output ports.
- `NodeParameterField` — a discriminated union of parameter field descriptors.
- `parseNodeCatalog` and `parseNodeCatalogEntry` — boundary validation for
  untrusted catalogs.

### Entries

```ts
type NodeCatalogEntry = {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly category: "trigger" | "flow" | "data" | "network";
  readonly inputs: readonly NodePort[];
  readonly outputs: readonly NodePort[];
  readonly dynamicOutputs?: NodeDynamicOutputs;
  readonly parameters: readonly NodeParameterField[];
};
```

- `type` matches `^[a-z][a-z0-9._-]*$`.
- Every entry has at least one fixed output. Inputs may be empty for triggers.
- Port names are non-empty, contain no control characters, and are unique
  within their list.
- `dynamicOutputs` describes ports whose names are defined by node parameters,
  such as Switch cases. It requires at least one fixed output, so a workflow
  always has a known fallback handle.

### Parameter fields

| Kind        | Payload                                                              |
| ----------- | -------------------------------------------------------------------- |
| `text`      | Optional placeholder and string default.                             |
| `number`    | Optional integer flag, minimum, maximum, and numeric default.        |
| `boolean`   | Optional boolean default.                                            |
| `select`    | Non-empty unique options and an optional default from those options. |
| `json`      | Any JSON default.                                                    |
| `key-value` | String or JSON values, with an object default.                       |
| `list`      | Recursive item fields, item label, minimum and maximum item counts.  |

All fields have a non-empty `key`, a non-empty `label`, an optional
`description`, and an optional `required` flag. Keys match
`^[A-Za-z][A-Za-z0-9_.-]*$`. A list has at least one field, unique child keys,
and no default. Defaults are validated against their field kind.

Parameter fields describe shape, not behaviour. Expressions are resolved before
execution, so the executor remains responsible for validating the resolved
value. For example, the Switch `value` field is `json`; the executor still
requires the resolved value to be a scalar.

### Core catalog

`@krypton/nodes-core` exports `coreNodeCatalog: readonly NodeCatalogEntry[]`.
It has exactly one entry per executor in `coreNodes`. A test enforces both
directions so a new node cannot land without metadata.

The future editor receives this catalog from the API and types it with
`@krypton/node-sdk`. `apps/web` must not import `@krypton/nodes-core`; keeping the
data behind the API preserves the existing package boundary.

The catalog covers the current core nodes:

- `manual-trigger` — trigger, no inputs, one `main` output.
- `set` — one input and one `main` output; `values` key-value field.
- `if` — `true` and `false` outputs; boolean `condition`.
- `switch` — fixed `default` output plus dynamic case ports; scalar `value` and
  a list of `{ value, port }` cases.
- `merge` — one input and one `main` output; appends incoming items in queue
  order without a wait barrier.
- `loop` — one input, `loop` and `done` outputs; required `items` JSON array and
  an optional integer `maxItems`.
- `http-request` — URL, method, headers, body, timeout, and response-size
  fields.

### CLI

`krypton nodes` prints a readable list. `krypton nodes --json` prints the same
catalog as JSON for tools. Neither command runs a workflow or needs a network.

## Out of scope

- React components, editor routing, icons, or design tokens.
- Runtime parameter validation against the catalog.
- Loading third-party catalogs or versioning node definitions.
- Dynamic field options loaded from credentials or remote services.
- Describing error routes or loop-body edges.

## Acceptance

- Parser tests reject malformed entries, duplicate types, ports, and keys,
  invalid defaults, and invalid list bounds.
- Core catalog tests prove every executor has one entry, every entry parses,
  and the JSON round trip is clean.
- CLI tests cover readable output, JSON output, and an unknown option.
- `bun run check`, `bun run build`, `bun run test:coverage`, and `bun run e2e`
  pass.
