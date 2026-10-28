# Loop over items node

The `loop` node runs a connected body once for each object in an array, collects
each body return, then continues once with a `results` array.

## Ports and parameters

- Input: `main` for the initial item and for body returns.
- Output `loop`: the current item for the body.
- Output `done`: the original item plus `results`.
- `items`: required array of JSON objects.
- `maxItems`: optional integer from 1 to 4,998, default 1,000.

Connect `loop` to the body and connect the body's end back to the Loop node's
`main` input. Connect `done` to the node that should run after the loop.

## Example

```json
{
  "nodes": [
    { "id": "start", "type": "manual-trigger" },
    {
      "id": "loop",
      "type": "loop",
      "parameters": { "items": "{{ $json.orders }}" }
    },
    {
      "id": "process",
      "type": "set",
      "parameters": { "values": { "status": "processed" } }
    },
    { "id": "summary", "type": "set", "parameters": { "values": { "done": true } } }
  ],
  "connections": [
    { "from": "start", "to": "loop" },
    { "from": "loop", "fromPort": "loop", "to": "process" },
    { "from": "process", "to": "loop" },
    { "from": "loop", "fromPort": "done", "to": "summary" }
  ]
}
```

With input:

```json
{
  "customer": "Ada",
  "orders": [
    { "id": "A", "amount": 10 },
    { "id": "B", "amount": 20 }
  ]
}
```

the body runs twice. Each run sees the original fields plus one order, for
example `{ "customer": "Ada", "orders": [...], "id": "A", "amount": 10 }`.
The Loop node's `done` output is:

```json
{
  "customer": "Ada",
  "orders": [
    { "id": "A", "amount": 10 },
    { "id": "B", "amount": 20 }
  ],
  "results": [
    {
      "customer": "Ada",
      "orders": [
        { "id": "A", "amount": 10 },
        { "id": "B", "amount": 20 }
      ],
      "id": "A",
      "amount": 10,
      "status": "processed"
    },
    {
      "customer": "Ada",
      "orders": [
        { "id": "A", "amount": 10 },
        { "id": "B", "amount": 20 }
      ],
      "id": "B",
      "amount": 20,
      "status": "processed"
    }
  ]
}
```

The trace shows `loop 1/2`, `loop 2/2`, and `done 2 results`.

## Reserved state

The node carries its position in the item under `__krypton`. The body must pass
that field through unchanged. Built-in nodes such as Set, IF, Switch, Merge, and
HTTP Request preserve it. Do not edit it with Set values or a future Code node.

The engine evaluates `items` again on every body return, even though the node
ignores the new value after the first call. Spreading the original fields into
each iteration keeps expressions like `{{ $json.orders }}` evaluable. Keep the
source field on the item through the body, and prefer a literal `maxItems`.

Results strip all reserved state before they are stored, so a nested loop does
not leak an enclosing loop's `__krypton` entry. The `done` item keeps enclosing
state at the top level so an outer loop can continue.

The manual trigger strips reserved state from run input, so a forged state cannot
skip the body. Treat the state as trusted only between nodes in the same run.
Future webhook or API triggers must sanitize it too, or use a run-scoped
provenance token.

## Limits

- The body must return exactly one item per iteration. Fan-out is not supported;
  each return continues independently, which can emit duplicate `done` items and
  repeat downstream side effects.
- A return of zero items ends the loop without a `done` item. The run can still
  finish `ok`, and downstream nodes do not run.
- An empty array emits `done` immediately and does not run the body.
- `results` are full snapshots with reserved state removed; they can repeat the
  original context.
- `maxItems` and the engine's 10,000-step budget both bound a run. The 4,998 cap
  fits the minimal one-body workflow, but a multi-node body can hit the step
  budget first.
- Removing the reserved state can restart the loop if the source expression is
  still evaluable and can repeat side effects.
- Nested loops namespace their state by node ID. The body contract is the same.

See [ADR 0020](../adr/0020-loop-node.md) and the
[specification](../specs/loop-node.md) for the exact contract.
