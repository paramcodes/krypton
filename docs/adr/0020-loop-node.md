# 0020 — Loop over items: state carried in the item

- Status: accepted
- Date: 2026-10-28
- Deciders: project owner

## Context

The engine has no sub-workflow runtime, no per-node state across calls, and no
planner that can pause a graph. It executes a node once per queued item, allows
cycles, and bounds every run with a step budget. Workflows still need to iterate
an array, run a connected body for each element, collect the body's returns, and
continue once with the results.

The design must keep the engine pure and deterministic. A loop cannot hold
mutable state in the executor process because that would break replay and make
two runs of the same workflow diverge.

## Decision

- Add one built-in `loop` node with `loop` and `done` output ports.
- Wire the body from `loop` back to the Loop node's `main` input. The body can be
  any node or chain, not a nested workflow.
- Carry iteration state in the item under the reserved `__krypton` object,
  keyed by node ID:
  `{ items, nextIndex, results, original, maxItems }`.
- Each iteration item is `{ ...original, ...items[nextIndex], __krypton: state }`.
  Spreading the original fields keeps source expressions evaluable on
  continuation; spreading the element makes its fields directly available to
  the body.
- The body must return exactly one item with the state intact. On return, store
  the item with all reserved state removed in `results`.
- The `done` item is `{ ...original, results }`; it keeps enclosing state at the
  top level so an outer loop can continue, but result snapshots do not keep it.
- Bound iterations with `maxItems` (default 1,000, maximum 4,998) and the existing
  engine step budget. The cap is the largest that fits the minimal documented
  workflow's `2N + 3` steps. An empty array emits `done` immediately.
- Reject malformed state instead of guessing. The manual trigger strips reserved
  state from run input; a future untrusted trigger needs a run-scoped provenance
  token or the same sanitization.

## Alternatives considered

- **Engine sub-workflow executor** — a cleaner long-term model, but it needs a
  scheduler, nested execution state, durable checkpoints, and a much larger
  engine change. Defer.
- **Stateful executor closure keyed by run** — easy to write, but violates the
  pure executor contract, breaks replay, and leaks state between runs.
- **Separate iterator and collect nodes** — spreads the protocol across two
  nodes, needs another state channel, and still has to return through the
  iterator. One node owns the contract.
- **Store the index in a top-level field** — collides with user data. A reserved
  map keyed by node ID supports nested loops and multiple Loop nodes.
- **Recompute the array from the expression every iteration** — the engine
  evaluates parameters before the executor, so the executor cannot prevent it.
  The original fields are spread into each item to keep common expressions
  evaluable; the executor still ignores the re-evaluated array after the first
  call.
- **Emit only one item with all results on `done` and no per-item body** — that is
  a map operation, not a loop, and cannot change behavior per element.

## Consequences

- The engine stays pure and the node contract stays small. The state is visible
  in the item and will be visible in a future journal unless the worker
  serializes it as internal data.
- The body must preserve reserved state and return exactly one item per
  iteration. Fan-out is unsupported: it creates independent continuations and
  can emit duplicate `done` items and downstream effects. A zero-return body
  ends the loop without a `done` output; the run can still finish `ok`.
- Results are full snapshots with all reserved state removed, so context can be
  duplicated but nested loops do not leak state or grow without bound. Memory is
  still heavy near the 4,998-item ceiling.
- A large loop can hit the engine step budget before `maxItems`. Both limits are
  visible and bounded; neither is silent.
- Removing the state can restart the loop if the source expression still
  evaluates and can repeat side effects. This is documented as a body-author
  error, not detected.
- Nested loops and multiple Loop nodes namespace their state by node ID. `done`
  keeps enclosing state, while results strip every reserved state field.
- A structurally valid forged state is trusted as a continuation. The manual
  trigger sanitizes run input, but other or direct start nodes need the same
  treatment until a run-scoped token exists.
- No engine changes, so unrelated cycles are still bounded only by the step
  budget.

## Revisit when

- A real sub-workflow or scheduler exists.
- Bodies need to fan out, return zero items, or collect asynchronously.
- Durable runs need to persist and resume mid-loop.
- Loop state size or result duplication becomes a practical problem.
- The editor needs loop-specific validation for body connections.
- An untrusted trigger needs a run-scoped provenance token instead of a
  reserved-field convention.
- The engine gains general cycle validation.
