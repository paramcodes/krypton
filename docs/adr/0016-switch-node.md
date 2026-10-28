# 0016 — Switch node: strict scalar matching over named ports

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner, node implementation owner

> [ADR 0019](0019-merge-node.md) and [ADR 0020](0020-loop-node.md) later add
> Merge and Loop over items. [ADR 0021](0021-node-error-routes.md) later adds
> per-node error policies and reserves the standard `error` output, so a Switch
> case port may not be named `error`.

## Context

The IF node routes on one boolean condition. Workflows also need more than two
routes for a single item, while the engine already supports arbitrary named
output ports. Matching full JSON objects would require an equality contract for
property order, nested values, and arrays that the Stage 1 expression language
does not provide.

## Decision

- Add a built-in `switch` node in `packages/nodes-core`; do not add node-specific
  behavior to the engine.
- Parameters are `value` and a required, non-empty `cases` array of
  `{ value, port }` objects. The existing expression evaluator resolves these
  parameters per item before execution.
- The selected value and each case value must be JSON scalars: strings, finite
  numbers, booleans, or null. Matching uses strict same-type equality.
- Case values must be unique. This avoids order-dependent duplicates. Distinct
  values may route to the same port.
- A port is a non-empty string without control characters. The first equal case
  (the only one possible after duplicate validation) selects its port. An
  unmatched value selects the fixed `default` port.
- The node emits the unchanged input item on exactly one selected output port.
  Named connection matching and fan-out remain engine responsibilities.
- Invalid configuration or a composite selected/case value fails the node
  visibly; it does not silently choose `default`.

## Alternatives considered

- **Evaluate a condition expression for each case** — adds a rule language and
  precedence behavior when several conditions match. Exact scalar matching is
  smaller and consistent with current parameter expressions.
- **Deep equality for objects and arrays** — introduces a new data-equality
  contract with little Stage 1 value. Keep the supported match values explicit.
- **Allow duplicate case values and use the first** — makes route selection
  depend on case order despite duplicate configuration. Reject duplicates and
  let authors group distinct values by reusing a port.
- **Add a Switch branch in the engine** — couples the engine to a built-in node
  type and violates the injected node-registry boundary.

## Consequences

- A workflow can route one item to multiple named paths without changing engine
  scheduling or connection semantics.
- Case values and ports are validated at execution time, after expressions are
  resolved, so expression-produced duplicates or composite values fail visibly.
- The `default` output is stable and requires no configurable fallback field.
- Merge, Loop, and error routes are added by ADRs 0019, 0020, and 0021; true
  joins and UI-generated schemas remain separate work.

## Revisit when

- The editor introduces node parameter schemas and needs a generated Switch form.
- Workflows need range comparisons, predicates, or composite-value matching.
- A Switch node needs multiple matching outputs rather than one selected route.
