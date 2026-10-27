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
7. [`docs/adr/0005-test-strategy.md`](../adr/0005-test-strategy.md) — how the
   engine is tested.

## Exercises

1. In your own words, why is the engine not allowed to call `fetch`?
2. What does a port make easier to test?
3. Why does the repo reject a skipped test instead of accepting a green suite?
4. What would you add to the glossary after reading the architecture page?

## What comes next

Stage 1 adds the pure engine, a deterministic simulation, the first nodes, and a
readable execution trace. The first slice is in place: the CLI and
[`triage.test.ts`](../../packages/nodes-core/src/triage.test.ts) show a real run.
