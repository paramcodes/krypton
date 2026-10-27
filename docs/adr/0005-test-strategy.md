# 0005 — Test strategy: expect tests, simulation, integration, browser

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

Workflow engines fail in ways that unit tests with heavy mocks miss: ordering,
retries, cancellation, partial failures, and persistence. At the same time,
end-to-end tests are slow and hard to debug. We need a layered strategy that
makes the common failure readable and the integration wiring visible.

## Decision

- **Engine:** expect tests. Run the pure engine against fake ports and snapshot
  the human-readable trace inline with Vitest's `toMatchInlineSnapshot`.
- **Pure helpers:** small unit tests for schema, expression evaluation, graph
  validation, and formatting.
- **API and persistence:** integration tests against a real Postgres instance in
  Podman. Do not replace the database with an in-memory fake for query behavior.
- **Browser:** Playwright for critical flows and accessibility checks. The
  Stage 0 smoke test proves the harness runs; real flows arrive with the editor.
- **Later:** property tests for graph invariants and expression evaluation once
  those modules exist.
- **Coverage:** engine thresholds are 90% lines, functions, branches, and
  statements. They are a tripwire, not a target. CI runs
  `bun run test:coverage`, so a local test run cannot hide a threshold drop.
- **Integrity:** no skipped/focused tests, deleted test files, renames out of the
  test suite, or removed assertions. Exceptions require a reviewed allowlist
  entry. The guardrail scripts themselves have temp-repo regression tests.

## Alternatives considered

- **Example tests only** — readable, but they tend to assert one happy path and
  miss ordering, retries, and error traces.
- **Heavy mocking** — fast, but mocks drift from the real adapters and hide
  serialization and transaction bugs.
- **Only end-to-end tests** — confidence in wiring, but slow, flaky, and poor at
  pinpointing an engine bug.
- **Only unit tests** — fast, but never proves the API, database, and worker
  agree on a run.

## Consequences

- Inline snapshots make trace changes visible in review. A snapshot update must
  be explained, not accepted blindly.
- The simulation grows with the node contract. It is product code, not a test
  helper afterthought.
- Integration tests need container lifecycle management in CI and locally.
- Coverage thresholds may need tuning when a module has unavoidable glue code.

## Revisit when

- Snapshot churn hides real regressions or makes refactors painful.
- The simulation diverges from the real adapters in a way that misses bugs.
- Integration tests become the slowest part of CI.
