# Tasks: Switch node

## Task 1: Implement Switch routing

**Description:** Add the `switch` executor and validate its selected scalar,
non-empty cases, unique case values, and output port names.

**Acceptance criteria:**

- [x] The first strict scalar match selects its named port; unmatched values use
      `default`.
- [x] Different case values may share a port, while duplicate values fail.
- [x] Composite values, malformed cases, and invalid ports fail visibly.

**Verification:** `bunx vitest run packages/nodes-core/src/nodes.test.ts`.

**Dependencies:** None.

**Files likely touched:**

- `packages/nodes-core/src/index.ts`
- `packages/nodes-core/src/nodes.test.ts`

**Estimated scope:** Medium.

## Task 2: Add an engine expect test

**Description:** Exercise Switch through `runWorkflow` with fake ports and
connected routes; snapshot the readable trace inline.

**Acceptance criteria:**

- [x] Only the selected downstream node executes.
- [x] The input item is preserved and the trace records the chosen route.

**Verification:** `bunx vitest run packages/nodes-core/src/switch.test.ts`.

**Dependencies:** Task 1.

**Files likely touched:**

- `packages/nodes-core/src/switch.test.ts`

**Estimated scope:** Small.

## Task 3: Record and document Switch semantics

**Description:** Add ADR 0016 and a concise Switch node guide, then link them
from the documentation index and learning path.

**Acceptance criteria:**

- [x] ADR records scalar-only strict matching, case order, duplicate handling,
      shared ports, and the default route.
- [x] Node guide includes parameter shape, matching behavior, and an example.
- [x] Documentation links resolve.

**Verification:** `bun scripts/check-doc-links.ts` and final `bun run check`.

**Dependencies:** Tasks 1–2.

**Files likely touched:**

- `docs/adr/0016-switch-node.md`
- `docs/adr/README.md`
- `docs/nodes/switch.md`
- `docs/README.md`
- `docs/learn-by-reading/README.md`

**Estimated scope:** Medium.

## Checkpoint: Before PR

- [ ] `BASE_SHA=main bun run check` passes.
- [ ] `bun run build`, `bun run test:coverage`, and `bun run e2e` pass.
- [ ] `BASE_SHA=main bun run guardrails:deleted-tests` is clean.
- [ ] Review the diff; no unrelated toolchain changes are included.
