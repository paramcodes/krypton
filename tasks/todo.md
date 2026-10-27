# Tasks: Generic node execution timeouts

## Task 1: Parse bounded node timeouts

**Description:** Add optional `NodeInstance.timeoutMs` parsing and preserve it in
the shared workflow type.

**Acceptance criteria:**

- [x] Omitted timeout stays omitted.
- [x] Integers from 1 through 120,000 are accepted.
- [x] Zero, negative, non-integer, over-limit, and non-number values are rejected
      with a path-aware `SchemaError`.

**Verification:** `bunx vitest run packages/schema/src/workflow.test.ts`.

**Dependencies:** None.

**Files likely touched:**

- `packages/schema/src/workflow.ts`
- `packages/schema/src/workflow.test.ts`

**Estimated scope:** Small.

## Task 2: Enforce per-attempt engine timeouts

**Description:** Validate manually constructed timeout values, race timed node
execution against `Clock.sleep`, use an attempt-scoped signal, and fail
terminally with a readable trace when the timeout wins.

**Acceptance criteria:**

- [x] Successful execution cancels the pending timeout sleep.
- [x] Timeout aborts the attempt signal, fails the run, and prevents its late
      result from advancing the graph.
- [x] Timeout is not retried, even with a retry policy; workflow cancellation
      remains distinguishable.
- [x] Existing retries and untimed node execution remain unchanged.

**Verification:** `bunx vitest run packages/engine/src/run.test.ts`; then full
coverage gate.

**Dependencies:** Task 1.

**Files likely touched:**

- `packages/engine/src/run.ts`
- `packages/engine/src/run.test.ts`

**Estimated scope:** Medium.

## Task 3: Record decision and update docs

**Description:** Add ADR 0015 and document the new per-node timeout contract and
the difference from HTTP request timeouts.

**Acceptance criteria:**

- [x] ADR 0015 explains timeout, cancellation, retry, and cooperative-executor
      semantics.
- [x] Architecture overview and HTTP guide distinguish generic node deadlines
      from the HTTP adapter timeout.
- [x] ADR index and relevant cross-references are current.

**Verification:** `bun scripts/check-doc-links.ts` and final `bun run check`.

**Dependencies:** Task 2.

**Files likely touched:**

- `docs/adr/0015-node-execution-timeouts.md`
- `docs/adr/README.md`
- `docs/adr/0014-http-request-and-retries.md`
- `docs/architecture/overview.md`
- `docs/http-requests.md`

**Estimated scope:** Medium.

## Checkpoint: Before PR

- [ ] `BASE_SHA=main bun run check` passes.
- [ ] `bun run build`, `bun run test:coverage`, and `bun run e2e` pass.
- [ ] `BASE_SHA=main bun run guardrails:deleted-tests` is clean.
- [ ] Review the diff and confirm no suppression or weakened test was added.
