# 0019 — Merge node: append-only fan-in

- Status: accepted
- Date: 2026-10-28
- Deciders: project owner

## Context

The engine queues one execution per incoming item. It has no planner that knows
which branches are live, no item lineage, and no per-edge completion signal. The
target architecture calls for fan-in nodes to wait for all live inputs, but that
needs an engine scheduler that does not exist yet.

Workflows still need an explicit join point after IF, Switch, and manual
fan-out. The first step should be honest about the current execution model and
useful for conditional routing, where only one branch emits.

## Decision

- Add a built-in `merge` node in `packages/nodes-core`.
- It has one `main` input that accepts any number of connections, one `main`
  output, and no parameters.
- Each execution emits the unchanged item and reports `appended`.
- It does not buffer, wait, combine, deduplicate, or correlate items. Ordering is
  the engine's deterministic FIFO queue order.
- Do not change the engine. Existing connection fan-in already supplies the
  items.
- Document the limitation in the node guide and this ADR.

## Alternatives considered

- **Wait for all live inputs now** — requires per-edge liveness, item lineage,
  buffering, and a scheduler that can distinguish "branch finished" from
  "branch has not run yet." That is a separate engine change, not a node.
- **Merge by key or combine** — requires buffering and a key contract, and has
  ambiguous behavior when branches emit different numbers of items. Defer.
- **No Merge node** — users can connect both branches directly to a downstream
  node, but there is no explicit join marker, no place for a future mode, and no
  readable trace label for the fan-in.
- **Special-case Merge in the engine** — couples the engine to a built-in node
  type and violates the injected registry boundary.
- **Add a `mode` parameter for future options** — speculative config with no
  consumer; add modes with their behavior.

## Consequences

- Merge is useful today as an explicit append join, especially after Switch,
  where only the selected branch emits.
- It does not synchronize branches. A workflow that needs every branch to finish
  before continuing must wait for the future barrier.
- Branch items may interleave; the contract promises queue order, not grouping.
- The future barrier can add a mode or a separate node without breaking this
  node's append contract.
- The catalog describes Merge with one input, one output, and no parameters.

## Revisit when

- The engine gains a planner with fan-in liveness and item lineage.
- Workflows need wait-for-all, choose-first, merge-by-key, or deduplication.
- The editor needs a Merge mode selector.
