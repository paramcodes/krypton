# 0022 — Property tests with fast-check

- Status: accepted
- Date: 2026-10-28
- Deciders: project owner, engine and test owners

## Context

The Stage 1 exit criteria require a property test: random valid graphs must never
throw, and random invalid graphs must be rejected with a clear error. Example
tests cover the expected paths, but they cannot enumerate the shapes that a graph
author or importer can produce. A property test is a better fit for graph
invariants because it can generate many valid shapes, shrink a failing input, and
report the seed and counterexample.

The project has no property-testing dependency yet. The engine must stay pure and
deterministic; test dependencies must not become runtime dependencies or add
network, time, or persistence behavior.

## Decision

- Add `fast-check` as an exact dev dependency of `@krypton/engine` at `4.10.2`.
  It was published on 2026-09-19, outside the project's two-week dependency
  cooling-off window.
- Put the property test in `packages/engine/src/graph.property.test.ts`:
  - Generate structurally valid raw workflows with one to eight unique node IDs,
    known node types, zero to twelve connections, and optional named source
    ports. Parse each with `parseWorkflow` and run it through `runWorkflow` with
    fake ports, bounded steps, and a bounded queue. Assert that parsing and
    running never throw and that the result has a valid status and a trace.
  - Generate invalid workflows by mutating a valid one: duplicate IDs, unknown
    connection endpoints, empty node lists, invalid expression versions, invalid
    retry or timeout values, invalid error policies, non-JSON parameters, and
    control characters in IDs. Each mutation kind gets its own 100-run property.
    Assert that `parseWorkflow` throws a `SchemaError` with the expected
    `$`-rooted field path and message for that mutation.
- Keep property runs bounded (`numRuns: 100`) and use only the existing fake
  `Clock` and `Http` ports. Property tests do not replace the expect tests; they
  add invariant coverage around them.
- A fast-check failure is reproducible from its printed seed and shrink path.
  Tests must not fix a seed just to hide a failure.
- The property test file has a reviewed `scripts/guardrails-allowlist.json`
  `pure-import` exception because it is test-only and imports `fast-check`.
  Runtime modules in `@krypton/engine` remain restricted to relative imports
  and `@krypton/schema`.

## Alternatives considered

- **A hand-written seeded generator** — no dependency, but it would need its own
  shrinking, edge-case reporting, and maintenance, and would duplicate a mature
  library.
- **No property test** — leaves the Stage 1 exit criterion unmet and relies on
  example tests to cover arbitrary graph shapes.
- **A runtime graph generator** — adds code and a contract to the product for a
  test-only need.

## Consequences

- `fast-check` is a dev-only dependency (MIT), so the runtime packages and their
  boundaries are unchanged.
- Random runs can surface a real edge case that example tests miss; the printed
  seed makes it reproducible. If the suite becomes flaky, fix the generator or
  the engine rather than weakening the invariant.
- The property test is deliberately structural. Semantic node behavior still
  needs focused expect tests and, later, the node catalog for port-aware graph
  generation.
- The test suite gains a small, bounded runtime cost and one more dependency to
  review on upgrades.

## Revisit when

- `fast-check` has a major upgrade or a security advisory.
- The property test becomes slow or flaky enough to hurt the normal gate.
- Graph generation needs semantic port or node-catalog knowledge.
