# Spec: Switch node

## Objective

Add a built-in `switch` node that routes one item to a named output port based on
the current value of a node parameter. This provides multi-way conditional
routing using the engine's existing named-port connections, without adding
branch logic to the engine.

## Contract

The node parameters are:

```json
{
  "value": "{{ $json.status }}",
  "cases": [
    { "value": "paid", "port": "paid" },
    { "value": "refunded", "port": "needs-review" }
  ]
}
```

- `value` is required and must resolve to a JSON scalar: string, number,
  boolean, or null.
- `cases` is a required, non-empty array of `{ value, port }` objects.
- Each case `value` must be a JSON scalar, and case values must be unique using
  strict, same-type equality (`===`). Objects and arrays are not compared.
- `port` must be a non-empty string without control characters. Different case
  values may target the same port.
- The first matching case routes the unchanged item to its `port`.
- If no case matches, the unchanged item routes to the fixed `default` port.
- The node emits one output containing the item and a readable detail describing
  the selected port. The engine continues to fan out through connections
  matching that port; the node does not inspect graph connections.
- Parameters keep the existing whole-field expression behavior. A selected
  value or case value resolving to an object/array is a visible node error.

## Project conventions

- TypeScript strict, no new dependencies, and no arbitrary code evaluation.
- Implement under `packages/nodes-core`; keep engine scheduling unchanged.
- Validate resolved node parameters inside the node executor, following the
  existing IF and HTTP Request node patterns.
- Write failing-first node tests and a fake-port engine expect test with an
  inline readable trace snapshot.

## Testing strategy

- Unit tests cover matching strings, numbers, booleans and null; unmatched
  defaults; strict type matching; shared output ports; malformed parameters;
  duplicate case values; invalid ports; and composite selected/case values.
- An expect test runs a workflow through the engine and proves the selected
  named port reaches only its connected downstream node.
- Run `bun run check`, `bun run build`, `bun run test:coverage`, and `bun run e2e`.

## Boundaries

- **Always:** Keep node execution pure except for injected ports; do not mutate
  input items; preserve existing named-port flow and trace behavior.
- **Ask first:** Changes to graph scheduling, public workflow structure, or
  adding expression operators/dependencies.
- **Never:** Add Merge, Loop, error-route, or UI-generated schema behavior in
  this slice; copy node definitions or terminology from another workflow tool.

## Success criteria

- `coreNodes.switch` routes to the first exact scalar match or to `default`.
- Invalid configuration fails visibly without emitting an output.
- Engine expect test snapshots the readable multi-way routing trace.
- The full local and CI quality gates pass.

## Open questions

- None proposed. Review whether the scalar matching and `default` port contract
  matches the intended v1 behavior before implementation.
