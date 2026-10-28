# Merge node (append)

Status: accepted (2026-10-28)

## Problem

Workflows need an explicit fan-in point after IF, Switch, or a manual fan-out.
The engine executes a node once per incoming item and has no join planner, item
lineage, or barrier. A Merge node that promised wait-for-all semantics would
deadlock or silently hang when a conditional branch is not taken.

This slice adds an append-only Merge: an explicit join marker that passes every
incoming item through unchanged in engine queue order. It does not wait for
other branches.

## Contract

- Type: `merge`.
- Category: `flow`.
- Inputs: one `main` port that may have any number of incoming connections.
- Outputs: one `main` port.
- Parameters: none.
- For each execution, emit the unchanged input item on `main` and report the
  trace detail `appended`.
- No buffering, combining, deduplication, correlation, or branch ordering
  guarantee beyond the engine's deterministic FIFO queue.
- No engine changes. The executor is a pass-through, and the engine's existing
  connection fan-in behavior supplies the items.

The node does not run when an unselected branch does not emit. A Switch that
selects `paid` sends only that item through Merge even if a `review` branch is
also connected. This is the append contract, not a barrier.

Ordering is deterministic for a fixed workflow but is not a promise that all
items from one branch are grouped. If a branch fans out or has a longer chain,
the FIFO queue may interleave items. A workflow that needs grouping must add a
future barrier or keyed-combine node.

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

With a `paid` item, the trace contains `route`, `paid`, `join`, and `finish`.
The `review` node never runs. With a manual fan-out where both branches emit,
Merge executes once per item in queue order.

## Out of scope

- Wait-for-all or "all live inputs" barriers.
- Merge by key, combine, choose-first, or deduplication modes.
- Item lineage or correlation IDs.
- Engine scheduler or planner changes.
- A Merge-specific parameter form.

## Acceptance

- Two emitting branches reach Merge and produce items in deterministic queue
  order.
- A Switch branch test proves Merge does not wait for an unselected branch.
- The item is unchanged.
- The core catalog has a `merge` entry with one input, one output, and no
  parameters.
- `bun run check`, `build`, `test:coverage`, and `e2e` pass.
