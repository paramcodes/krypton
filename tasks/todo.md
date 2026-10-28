# Tasks: Node error policies and error routes

## Task 1: Define the contract and schema shape

**Description:** Record the decision and add the parsed `errorPolicy` field.

**Acceptance criteria:**

- [x] ADR 0021 records the policy, port, item, trace, and status decisions.
- [x] The error-route specification states exact behavior and exclusions.
- [x] `ErrorPolicy` is exported and `NodeInstance` accepts `errorPolicy`.
- [x] Schema tests cover omitted, `fail`, `skip`, `route`, and invalid values.

**Verification:** Targeted schema tests.

**Files touched:**

- `docs/adr/0021-node-error-routes.md`
- `docs/specs/error-routes.md`
- `packages/schema/src/workflow.ts`
- `packages/schema/src/index.ts`
- `packages/schema/src/workflow.test.ts`

**Estimated scope:** Small.

## Task 2: Implement policy handling in the engine

**Description:** Apply fail, skip, and route behavior to executor failures.

**Acceptance criteria:**

- [x] Policy is validated before node execution.
- [x] Ordinary errors and retry exhaustion use the policy.
- [x] Timeouts use the policy but are never retried.
- [x] Parameter, invalid-result, unknown-type, cancellation, retry-sleep, queue,
      malformed-connection, and budget failures bypass the policy.
- [x] Route creates the specified error item, fans out to every error edge, and
      fails visibly when no edge exists.
- [x] Trace and run status match the specification.

**Verification:** Targeted engine tests, typecheck, and lint.

**Dependencies:** Task 1.

**Files touched:**

- `packages/engine/src/run.ts`
- `packages/engine/src/node.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/run.test.ts`
- `packages/engine/src/node.test.ts`

**Estimated scope:** Medium.

## Task 3: Expose the standard error port

**Description:** Declare the engine-provided port and protect it from collision.

**Acceptance criteria:**

- [x] Every core catalog entry has exactly one `error` output.
- [x] The CLI lists `error (Error)`.
- [x] Switch rejects a case port named `error`.
- [x] A real HTTP node routes a failed request after retries.

**Verification:** Catalog, switch, CLI, and error-route expect tests.

**Dependencies:** Tasks 1 and 2.

**Files touched:**

- `packages/nodes-core/src/catalog.ts`
- `packages/nodes-core/src/index.ts`
- `packages/nodes-core/src/catalog.test.ts`
- `packages/nodes-core/src/nodes.test.ts`
- `packages/nodes-core/src/error-routes.test.ts`
- `apps/cli/src/main.test.ts`

**Estimated scope:** Small.

## Task 4: Update documentation and the learning path

**Description:** Make the new decision and behavior discoverable.

**Acceptance criteria:**

- [x] The user guide explains retries, error items, paths, and status.
- [x] ADR indexes and related ADRs point to ADR 0021.
- [x] Architecture, catalog, Switch, and timeout docs are consistent.
- [x] Glossary terms and the learn-by-reading path are updated.
- [x] The Loop-specific plan and todo files are replaced.

**Verification:** `bun scripts/check-doc-links.ts` and the full gate.

**Dependencies:** Tasks 1-3.

**Files touched:** Documentation listed in the specification.

**Estimated scope:** Medium.

## Task 5: Run the full quality gate

**Description:** Prove the slice meets the repository bar.

**Acceptance criteria:**

- [x] `bun run check` passes.
- [x] `bun run build` passes.
- [x] `bun run test:coverage` passes.
- [x] `bun run e2e` passes.
- [x] `BASE_SHA=main bun run guardrails:deleted-tests` passes.

**Verification:** Paste command output into the review.

**Result (2026-10-28):** `BASE_SHA=main bun run check` passed with 197
tests, clean guardrails, formatting, lint, and typecheck. `bun run build`
passed. Coverage passed at 96.76% statements, 93.31% branches, 98.73%
functions, and 96.7% lines. The Playwright smoke test and the deleted-test
guard passed.

**Dependencies:** Tasks 1-4.

**Estimated scope:** Small.

## Task 6: Review and prepare the PR

**Description:** Review the diff and open a PR without merging.

**Acceptance criteria:**

- [x] The diff is small enough for a human to walk through.
- [x] The review confirms boundaries, tests, docs, and AGPL compatibility.
- [ ] A PR is opened on `stage-1-error-routes`.
- [ ] No merge to `main` without explicit permission.

**Verification:** Review findings and PR link.

**Dependencies:** Task 5.

**Estimated scope:** Small.
