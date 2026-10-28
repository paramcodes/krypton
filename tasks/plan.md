# Implementation Plan: Graph property tests

## Overview

Add a property test for the engine's graph boundary. Random structurally valid
workflows must parse and run without throwing. Random invalid workflows must be
rejected with a `SchemaError` that names a path and a readable reason.

The test uses `fast-check`, pinned as a dev dependency of `@krypton/engine`, and
the existing fake ports. It complements the expect tests; it does not replace
them.

## Architecture Decisions

- Add `fast-check` at exact version `4.10.2` to `@krypton/engine`; it is a
  dev-only dependency.
- Keep the property test in `packages/engine/src/graph.property.test.ts` so it
  exercises both `parseWorkflow` and `runWorkflow`.
- Generate valid graphs with unique node IDs, known test node types, bounded
  nodes/connections, and optional named source ports. Run with bounded steps and
  queue size so cycles cannot hang the suite.
- Generate invalid workflows by mutating a valid base: duplicate IDs, unknown
  connection endpoints, empty nodes, invalid expression versions, invalid
  retry/timeout/policy values, non-JSON parameters, and control characters.
- Assert the parser throws `SchemaError` with the expected `$`-rooted field path
  and message for each mutation. A fast-check failure reports its seed and shrink
  path.
- Do not add a runtime generator, a new port, or a new engine behavior.

## Scope

### In

- Engine dev dependency and lockfile update.
- Valid-graph and invalid-graph property tests.
- ADR 0022, ADR index, test-strategy update, glossary, and learning path.
- Task plan and todo replacement.

### Out

- Crash-and-resume, durable persistence, or Stage 2 work.
- Expression property tests; the evaluator does not have a stable generator yet.
- Semantic port-aware graph generation based on the node catalog.
- Fuzz testing outside the engine/schema graph boundary.

## Testing Strategy

- Valid property: 100 generated workflows; parse and run each with fake ports,
  `maxSteps: 50`, and `maxQueuedItems: 100`; assert a valid status and trace.
- Invalid properties: one 100-run property per mutation kind; assert
  `SchemaError`, the expected `$` field path, and the expected message.
- Deterministic valid graph: a two-node chain must reach `ok`, execute both
  nodes in order, and return its item.
- Existing expect tests remain the primary readable coverage.
- Full gate: `bun run check`, `bun run build`, `bun run test:coverage`,
  `bun run e2e`, and the deleted-test guard.

## Risks and Mitigations

- **Nondeterministic failures:** fast-check reports the seed; tests use fake
  clocks and bounded execution.
- **Slow or exploding graphs:** cap nodes, connections, steps, and queue size.
- **Generator drift:** keep raw workflow shapes aligned with `parseWorkflow` and
  use the schema parser as the oracle.
- **Dependency creep:** pin exactly, keep it dev-only, and record the decision in
  ADR 0022.

## Definition of Done

- `bun run check` passes.
- The deterministic execution test and every mutation-specific property pass.
- ADR 0022 and the test-strategy docs describe the dependency and scope.
- The diff is small enough for a human to walk through.
