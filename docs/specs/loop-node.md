# Loop over items node

Status: accepted (2026-10-28)

## Problem

Workflows need to run a body once per array element and collect the results.
The engine executes one node at a time per item. It has no sub-workflow runtime,
no stateful executor, and no scheduler that can pause a graph in the middle of a
node. A loop must therefore carry its own position through the item queue while
staying deterministic and bounded.

## Contract

- Type: `loop`.
- Category: `flow`.
- Input: one `main` port for the initial item and for body returns.
- Outputs:
  - `loop`: the current iteration item, connected to the body.
  - `done`: one item after the last iteration.
- Parameters:
  - `items`: required array of JSON objects. It is read on the first call and
    ignored on continuation.
  - `maxItems`: optional integer from 1 to 4,998, default 1,000. It is stored in
    the loop state on the first call.
- On the first call with a non-empty array, emit
  `{ ...original, ...items[0], __krypton: state }` on `loop` with detail
  `loop 1/N`.
- The body must return exactly one item to the Loop node with the reserved
  `__krypton` state intact.
- On each continuation, append the returned item with all reserved state
  removed to `results`. If more items remain, emit the next iteration; otherwise
  emit `done`.
- The `done` item is `{ ...original, results }` with detail
  `done N result(s)`.
- An empty array emits `done` immediately with `results: []` and does not run
  the body.

## Item and state shape

Each iteration starts from the original item and adds the current element's
fields. Element fields win on collision:

```json
{
  "customer": "Ada",
  "orders": [{ "id": "A" }],
  "id": "A",
  "__krypton": {
    "loop-node": {
      "items": [{ "id": "A" }],
      "nextIndex": 1,
      "results": [],
      "original": { "customer": "Ada", "orders": [{ "id": "A" }] },
      "maxItems": 1000
    }
  }
}
```

The engine evaluates every parameter before every executor call, including
continuations. Spreading the original fields into each iteration keeps an
expression such as `{{ $json.orders }}` evaluable even though the executor
ignores the re-evaluated value after the first call. Keep the source field on the
item through the body; a body that removes it can make parameter evaluation fail
before the Loop executor runs.

- `__krypton` is reserved for node state. It is a map keyed by node ID, so nested
  loops and multiple Loop nodes do not overwrite each other. Do not read, modify,
  or remove it in the body. A malformed state map or state object fails the node
  rather than guessing. State stays on the iteration item and on the `done` item
  so an enclosing loop can continue; result snapshots strip every reserved state
  field, including enclosing loops' entries.

`maxItems` should be a literal. An expression that depends on a field removed by
the body can fail on continuation for the same reason as `items`.

## Results

Each result is a full snapshot of the body's returned item with every reserved
state field removed. It keeps the original item's fields and the current
element's fields, so results can repeat context such as the source array. The
output field `results` is set by the node and replaces any existing field with
that name on the `done` item. Stripping all state keeps nested result snapshots
from retaining an enclosing loop and growing without bound.

A body that fans out and returns several items produces several independent
continuations for the same state snapshot. A one-item loop can therefore emit
two `done` items and duplicate downstream side effects; larger loops can multiply
work until the step budget. A body that returns zero items never delivers a
continuation: no `done` item is emitted, the run can still finish `ok`, and
downstream nodes do not run. This slice supports one return per iteration; the
engine step budget remains the backstop.

## Trust boundary

The node validates state structure but cannot prove provenance: a structurally
valid `__krypton` entry is treated as a continuation. The manual trigger strips
all reserved state from run input so a forged entry cannot skip the body. Future
webhook, schedule, or API triggers must do the same, or the engine needs a
run-scoped provenance token. Do not feed an untrusted item directly to a Loop
node that is used as a start node.

## Bounds

`maxItems` is checked before the first iteration and revalidated from the stored
state. The engine's default 10,000-step budget still applies. The 4,998-item cap
is the largest value that fits the minimal documented workflow (trigger, Loop,
one body node, summary): the trigger and summary add one step each, Loop runs
`N + 1` times, and the body runs `N` times, for `2N + 3` steps. It is still a
ceiling, not a guarantee: larger bodies can reach the step budget first. Both
failures are visible in the trace.

Cycles are not otherwise validated in this slice. A workflow with an unrelated
cycle still fails at the step budget.

## Failure modes

- `items` is missing or not an array.
- An element is not a JSON object.
- The array is larger than `maxItems`.
- `maxItems` is not an integer in range.
- `__krypton` is present but not an object.
- The stored iteration state is malformed or inconsistent.
- A body return keeps `__krypton` but drops this loop's entry: the node treats
  it as a new loop. If the source expression is still evaluable, this restarts
  the loop and can repeat side effects; otherwise the engine fails parameter
  evaluation. The body must preserve the reserved state.
- A body removes the source field used by `items`: parameter evaluation fails
  before the Loop executor runs.

## Acceptance

- A two-item workflow runs the body twice, collects results, and emits one
  `done` item.
- An empty array emits `done` without running the body.
- A nested loop completes without leaking internal state into results.
- A zero-return body leaves the run `ok` with no `done` output, and a fan-out
  body can produce duplicate `done` items; both are documented limits.
- Forged loop state is stripped at the manual trigger.
- `maxItems`, non-object items, malformed state, and a non-object state map fail
  with clear errors.
- State is namespaced by node ID; `done` keeps enclosing state and results strip
  all reserved state.
- The core catalog describes both ports and both parameters.
- `bun run check`, `build`, `test:coverage`, and `e2e` pass.
