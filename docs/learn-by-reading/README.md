# Learn by reading

This path is for someone new to workflow engines and to Krypton. Read in order;
each step builds on the previous one.

1. [`README.md`](../../README.md) — what the product is and how to run the gate.
2. [`docs/architecture/overview.md`](../architecture/overview.md) — the system
   shape and the package boundaries.
3. [`docs/GLOSSARY.md`](../GLOSSARY.md) — the vocabulary. Keep it open.
4. [`docs/adr/0001-clean-room-and-licence.md`](../adr/0001-clean-room-and-licence.md)
   and [`docs/adr/0002-monorepo-bun-node-turbo.md`](../adr/0002-monorepo-bun-node-turbo.md)
   — why the foundation looks like this.
5. [`packages/engine/src/trace.test.ts`](../../packages/engine/src/trace.test.ts) —
   the smallest example of an expect test.
6. [`packages/nodes-core/src/triage.test.ts`](../../packages/nodes-core/src/triage.test.ts)
   — a full expect test with the real nodes, an item queue, and branch ports.
7. [`packages/engine/src/expression.test.ts`](../../packages/engine/src/expression.test.ts)
   — parser and evaluator cases for the safe field language.
8. [`packages/nodes-core/src/http.test.ts`](../../packages/nodes-core/src/http.test.ts)
   — a flaky HTTP request, fake ports, retry attempts, and a readable trace.
9. [`packages/nodes-core/src/switch.test.ts`](../../packages/nodes-core/src/switch.test.ts)
   — exact scalar matching, named ports, and a readable branch trace.
10. [`packages/nodes-core/src/merge.test.ts`](../../packages/nodes-core/src/merge.test.ts)
    — append-only fan-in, queue order, and a non-waiting branch.
11. [`packages/nodes-core/src/loop.test.ts`](../../packages/nodes-core/src/loop.test.ts)
    — a body loop, state carried in the item, bounds, and a readable trace.
12. [`packages/node-sdk/src/catalog.test.ts`](../../packages/node-sdk/src/catalog.test.ts)
    and [`packages/nodes-core/src/catalog.test.ts`](../../packages/nodes-core/src/catalog.test.ts)
    — the editor-facing node contract and its boundary checks.
13. [`docs/adr/0005-test-strategy.md`](../adr/0005-test-strategy.md) — how the
    engine is tested.

## Exercises

1. In your own words, why is the engine not allowed to call `fetch`?
2. What does a port make easier to test?
3. Why does the repo reject a skipped test instead of accepting a green suite?
4. What would you add to the glossary after reading the architecture page?

## What comes next

Stage 1 adds the pure engine, a deterministic simulation, built-in nodes, safe
field expressions, bounded retries, HTTP requests, per-node timeouts, a Switch
node, an append Merge node, a Loop over items node, a node catalog for the future
editor, and readable execution traces. The CLI,
[`triage.test.ts`](../../packages/nodes-core/src/triage.test.ts),
[`expression.test.ts`](../../packages/engine/src/expression.test.ts), and
[`http.test.ts`](../../packages/nodes-core/src/http.test.ts) plus
[`switch.test.ts`](../../packages/nodes-core/src/switch.test.ts),
[`merge.test.ts`](../../packages/nodes-core/src/merge.test.ts),
[`loop.test.ts`](../../packages/nodes-core/src/loop.test.ts), and the
[`catalog`](../../packages/node-sdk/src/catalog.test.ts) tests show the current
slice.
