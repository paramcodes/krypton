# Tasks: Graph property tests

## Task 1: Add the pinned property-test dependency

**Description:** Add `fast-check` as a dev dependency of `@krypton/engine` without
changing runtime packages.

**Acceptance criteria:**

- [x] `fast-check` is pinned exactly at `4.10.2`.
- [x] The release is older than two weeks and the lockfile records the package.
- [x] The dependency is dev-only.
- [x] The test-only import has a reviewed guardrail exception.
- [x] ADR 0022 records the decision, exception, and alternatives.

**Verification:** `package.json`, `bun.lock`, and ADR 0022 review.

**Files touched:**

- `packages/engine/package.json`
- `bun.lock`
- `scripts/guardrails-allowlist.json`
- `docs/adr/0022-property-tests-with-fast-check.md`
- `docs/adr/README.md`

**Estimated scope:** Small.

## Task 2: Generate valid graphs and prove the engine never throws

**Description:** Build structurally valid raw workflows from a bounded generator and
run them through the parser and engine with fake ports.

**Acceptance criteria:**

- [x] The generator creates one to eight unique node IDs.
- [x] Nodes use known test types and JSON objects for parameters.
- [x] Connections use existing endpoints and optional named source ports.
- [x] Parsing and running never throw.
- [x] Execution uses bounded steps and queue size, fake ports, and a trace assertion.

**Verification:** Targeted property test.

**Files touched:**

- `packages/engine/src/graph.property.test.ts`

**Estimated scope:** Medium.

## Task 3: Reject invalid graphs with clear schema errors

**Description:** Mutate valid workflows into known invalid shapes and assert the
parser rejects each with a useful error.

**Acceptance criteria:**

- [x] Duplicate IDs, unknown endpoints, empty nodes, and invalid expression versions are covered.
- [x] Invalid retry, timeout, and error-policy values are covered.
- [x] Non-JSON parameters and control characters in IDs are covered.
- [x] Every case throws `SchemaError`.
- [x] Each mutation kind gets its own 100-run property.
- [x] Every error has the expected `$`-rooted field path and message.

**Verification:** Targeted property test.

**Files touched:**

- `packages/engine/src/graph.property.test.ts`

**Estimated scope:** Small.

## Task 4: Update documentation and the learning path

**Description:** Make the dependency decision, property-test scope, and vocabulary
discoverable.

**Acceptance criteria:**

- [x] ADR 0022 and the ADR index describe the decision.
- [x] The test-strategy ADR points to the property-test decision.
- [x] The glossary defines a property test.
- [x] The learn-by-reading path includes the new test.
- [x] This plan and todo replace the merged error-route slice.

**Verification:** Documentation review and the full gate.

**Dependencies:** Tasks 1-3.

**Files touched:**

- `docs/adr/0022-property-tests-with-fast-check.md`
- `docs/adr/README.md`
- `docs/adr/0005-test-strategy.md`
- `docs/GLOSSARY.md`
- `docs/learn-by-reading/README.md`
- `tasks/plan.md`
- `tasks/todo.md`

**Estimated scope:** Small.

## Task 5: Run the full quality gate

**Description:** Prove the slice meets the repository bar.

**Acceptance criteria:**

- [x] `bun run format` leaves the tree clean.
- [x] The targeted property test passes.
- [x] `bun run check` passes.
- [x] `bun run build` passes.
- [x] `bun run test:coverage` passes.
- [x] `bun run e2e` passes.
- [x] `BASE_SHA=main bun run guardrails:deleted-tests` passes.

**Result (2026-10-28):** The targeted property test passed with 12 tests.
`bun run check` passed with 209 tests, clean guardrails, formatting, lint, and
typecheck. `bun run build` passed. Coverage passed at 96.76% statements, 93.31%
branches, 98.73% functions, and 96.7% lines. The Playwright smoke test and the
deleted-test guard passed.

**Verification:** Paste command output into the review.

**Dependencies:** Tasks 1-4.

**Estimated scope:** Small.

## Task 6: Review and prepare the PR

**Description:** Review the diff and open a PR without merging.

**Acceptance criteria:**

- [x] The diff is small enough for a human to walk through.
- [x] The review confirms boundaries, tests, docs, and AGPL compatibility.
- [x] A PR is opened on `stage-1-graph-property-test`.
- [x] No merge to `main` without explicit permission.

**Verification:** Review findings and PR link: [#11](https://github.com/paramcodes/krypton/pull/11).
The independent review required field-specific schema assertions; the final test
asserts the exact path and message for every mutation kind.

**Dependencies:** Task 5.

**Estimated scope:** Small.
