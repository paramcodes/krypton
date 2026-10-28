# 0018 — Node catalog and UI parameter metadata

- Status: accepted
- Date: 2026-10-28
- Deciders: project owner

## Context

The Stage 3 editor will render a form and connection handles for each node type.
There is no editor yet. Today each executor validates its own parameters and the
only description of a node is its implementation, so the editor would either
hard-code node knowledge in React or import engine/executor code it must not
depend on.

Switch also shows why a flat key/value description is not enough: it has nested
case objects and output ports whose names come from those cases. The contract
needs recursion and dynamic ports without adopting a full JSON Schema
implementation and without a new dependency.

## Decision

- Add a typed node catalog to `@krypton/node-sdk`: entry metadata, fixed and
  dynamic ports, and a recursive discriminated union of parameter fields.
- Validate untrusted catalogs with `parseNodeCatalog` and
  `parseNodeCatalogEntry`, using the same boundary discipline as workflow JSON.
- Export `coreNodeCatalog` from `@krypton/nodes-core`, with exactly one entry per
  executor. A test enforces both directions.
- Keep the editor's runtime import boundary intact: `apps/web` may import the
  catalog types from `@krypton/node-sdk`, but not `@krypton/nodes-core`. The API
  will serve `coreNodeCatalog` as JSON when the editor lands.
- Keep executors authoritative for resolved parameter validation. The catalog
  describes shape for forms and tooling; it does not execute expressions or
  replace runtime checks.
- Prove consumption with `krypton nodes` and `krypton nodes --json`.
- Do not add a React editor in this slice.

## Alternatives considered

- **JSON Schema plus a generic form renderer** — a larger vocabulary and a
  renderer we do not need yet, with awkward support for expression-bearing fields
  and author-defined ports.
- **Zod or TypeBox** — adds a dependency and a second schema definition; the
  catalog is small enough to parse explicitly.
- **Hard-code node forms in the React app** — duplicates node knowledge across
  packages, drifts from executors, and forces the editor to depend on internals
  it is not allowed to import.
- **Generate metadata from executor code** — TypeScript has no runtime
  introspection for this, so it would need decorators or a code-generation step.
  An explicit catalog is easier to review.
- **Include runtime validation in the catalog** — expressions resolve after
  static validation, so a catalog can only validate shape. Keeping the executor
  authoritative avoids a second, weaker validation layer.

## Consequences

- A new core node must add an executor and a catalog entry; the completeness test
  fails otherwise.
- Metadata can still drift semantically from an executor. Tests cover ports and
  important fields, and the executor remains the source of truth for behavior.
- The editor can type its forms with `@krypton/node-sdk` and receive
  `coreNodeCatalog` from the API, without importing engine or built-in node
  code. The API already depends on `@krypton/nodes-core`, so the endpoint can be
  added without a new boundary.
- Switch can expose its fixed `default` handle plus dynamic case handles.
- New field kinds are added with their first consumer, so the union stays small.
- Third-party node catalogs can reuse the parser when that surface lands.

## Revisit when

- The Stage 3 editor starts consuming the catalog.
- Third-party node definitions are loaded from a registry.
- A node needs a field kind the union cannot express.
- Parameter validation moves from executors into a shared runtime validator.
