# Tasks: Loop over items node

## Task 1: Write the Loop spec and ADR

**Description:** Define the graph cycle, state shape, result shape, and bounds.

**Acceptance criteria:**

- [x] Spec covers ports, parameters, state, results, empty arrays, and failures.
- [x] ADR records alternatives: sub-workflow runtime, stateful executor,
      iterator/collector split, and top-level state.
- [x] Re-evaluation of `items` on continuation is documented.

**Verification:** `bun scripts/check-doc-links.ts`.

**Dependencies:** Merge slice merged.

**Files likely touched:**

- `docs/specs/loop-node.md`
- `docs/adr/0020-loop-node.md`

**Estimated scope:** Medium.

## Task 2: Add failing-first expect tests

**Description:** Prove the full graph cycle with the real core nodes.

**Acceptance criteria:**

- [x] Two items run the body twice and produce two results and one done item.
- [x] The trace reads `loop 1/2`, `loop 2/2`, `done 2 results`.
- [x] An empty array emits `done 0 results` without running the body.
- [x] A nested loop does not leak internal state into results.
- [x] A zero-return body leaves the run successful with no `done` output.
- [x] Forged state is stripped at the manual trigger.

**Verification:** `bunx vitest run packages/nodes-core/src/loop.test.ts`.

**Dependencies:** Task 1.

**Files likely touched:**

- `packages/nodes-core/src/loop.test.ts`

**Estimated scope:** Medium.

## Task 3: Add executor edge-case tests

**Description:** Cover continuation, bounds, malformed state, and namespacing.

**Acceptance criteria:**

- [x] Continuation ignores a re-evaluated `items` value.
- [x] `maxItems`, non-object items, non-object `__krypton`, and malformed state
      fail with clear errors.
- [x] Results strip every reserved state field; `done` keeps enclosing state.
- [x] Prototype-like node IDs and item keys do not hit object prototypes.
- [x] Nested loops, fan-out, zero-return, and state removal are covered.

**Verification:** `bunx vitest run packages/nodes-core/src/loop.test.ts`.

**Dependencies:** Task 2.

**Files likely touched:**

- `packages/nodes-core/src/loop.test.ts`
- `packages/nodes-core/src/loop.ts`

**Estimated scope:** Medium.

## Task 4: Implement and register the executor

**Description:** Add the stateless executor and wire it into the core registry.

**Acceptance criteria:**

- [x] Initial call emits the first item on `loop`.
- [x] Continuation appends a result and emits the next item or `done`.
- [x] Original fields, current element, and `__krypton` state are combined.
- [x] Empty arrays and bounds behave as specified.
- [x] `coreNodes` exposes `loop`.

**Verification:** `bunx vitest run packages/nodes-core/src/loop.test.ts packages/nodes-core/src/catalog.test.ts`.

**Dependencies:** Tasks 1–3.

**Files likely touched:**

- `packages/nodes-core/src/defaults.ts`
- `packages/nodes-core/src/loop.ts`
- `packages/nodes-core/src/index.ts`
- `packages/nodes-core/src/catalog.ts`

**Estimated scope:** Medium.

## Task 5: Add catalog and CLI coverage

**Description:** Describe both ports and parameters, and prove the listing.

**Acceptance criteria:**

- [x] Catalog has one `loop` entry.
- [x] `loop`/`done` output ports are declared.
- [x] `items` is required JSON; `maxItems` is an integer with bounds and default.
- [x] The 4,998 cap is tested against the default `2N + 3` step budget.
- [x] `krypton nodes` lists Loop Over Items.
- [x] Registry/catalog completeness and parser round-trip pass.

**Verification:** `bunx vitest run packages/nodes-core/src/catalog.test.ts apps/cli/src/main.test.ts`.

**Dependencies:** Task 4.

**Files likely touched:**

- `packages/nodes-core/src/catalog.ts`
- `packages/nodes-core/src/catalog.test.ts`
- `apps/cli/src/main.test.ts`

**Estimated scope:** Small.

## Task 6: Documentation and indexes

**Description:** Add the user guide, links, glossary terms, and reading path.

**Acceptance criteria:**

- [x] Guide explains the body cycle, reserved state, results, and limits.
- [x] Guide and ADR state the trigger trust boundary and run-status limits.
- [x] ADR 0013, 0014, and 0016 cross-reference Merge and Loop.
- [x] Docs and ADR indexes link the new pages.
- [x] Glossary defines loop over items and loop state.
- [x] Learn-by-reading links the loop test.

**Verification:** `bun scripts/check-doc-links.ts`.

**Dependencies:** Tasks 1–5.

**Files likely touched:**

- `docs/nodes/loop.md`
- `docs/README.md`
- `docs/adr/README.md`
- `docs/GLOSSARY.md`
- `docs/learn-by-reading/README.md`
- `packages/nodes-core/README.md`

**Estimated scope:** Small.

## Checkpoint: Before PR

- [x] `BASE_SHA=main bun run check` passes.
- [x] `bun run build`, `bun run test:coverage`, and `bun run e2e` pass.
- [x] `BASE_SHA=main bun run guardrails:deleted-tests` is clean.
- [x] Review the diff; no engine behavior changes.
