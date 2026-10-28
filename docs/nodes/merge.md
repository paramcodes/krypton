# Merge node

The `merge` node is an explicit append join. It passes every incoming item
through unchanged on one `main` output. It has no parameters and does not wait
for other branches.

## Behavior

- Connect any number of branches to its `main` input.
- Each incoming item produces one Merge execution and one output item.
- Items leave in the engine's deterministic queue order.
- An unselected conditional branch contributes nothing; Merge does not wait for
  it.
- Merge does not buffer, combine, deduplicate, or correlate items.

The trace detail is `appended`.

## Example

```json
{
  "nodes": [
    { "id": "start", "type": "manual-trigger" },
    {
      "id": "route",
      "type": "switch",
      "parameters": {
        "value": "{{ $json.status }}",
        "cases": [
          { "value": "paid", "port": "paid" },
          { "value": "refunded", "port": "review" }
        ]
      }
    },
    { "id": "paid", "type": "set", "parameters": { "values": { "handled": true } } },
    { "id": "review", "type": "set", "parameters": { "values": { "reviewed": true } } },
    { "id": "join", "type": "merge" },
    { "id": "finish", "type": "set", "parameters": { "values": { "done": true } } }
  ],
  "connections": [
    { "from": "start", "to": "route" },
    { "from": "route", "fromPort": "paid", "to": "paid" },
    { "from": "route", "fromPort": "review", "to": "review" },
    { "from": "paid", "to": "join" },
    { "from": "review", "to": "join" },
    { "from": "join", "to": "finish" }
  ]
}
```

With a `paid` item, only the paid branch runs. Merge receives one item and the
workflow finishes with one output. It does not wait for the review branch.

## Limits

This is not a wait-for-all barrier. If two branches both emit, Merge executes
twice; there is no single combined invocation. Use it to make a join explicit
and to label the fan-in, not to synchronize concurrent work.

Wait-for-all, merge-by-key, choose-first, and deduplication are future work. See
[ADR 0019](../adr/0019-merge-node.md) and the
[specification](../specs/merge-node.md).
