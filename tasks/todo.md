# Tasks: Merge node

## Task 1: Write the Merge spec and ADR

**Description:** Define append-only fan-in and record why the engine has no
barrier yet.

**Acceptance criteria:**

- [x] Spec covers inputs, output, ordering, non-waiting behavior, and limits.
- [x] ADR records alternatives and revisit triggers.

**Verification:** `bun scripts/check-doc-links.ts`.

**Dependencies:** Catalog slice merged.

**Files likely touched:**

- `docs/specs/merge-node.md`
- `docs/adr/0019-merge-node.md`

**Estimated scope:** Small.

## Task 2: Add failing-first tests and the Merge executor

**Description:** Implement a pass-through executor and prove append ordering and
non-waiting behavior with the real core nodes.

**Acceptance criteria:**

- [x] Two branches fan into Merge and produce items in queue order.
- [x] A Switch route reaches Merge without waiting for the other branch.
- [x] The input item is unchanged and the trace detail is `appended`.

**Verification:** `bunx vitest run packages/nodes-core/src/merge.test.ts`.

**Dependencies:** Task 1.

**Files likely touched:**

- `packages/nodes-core/src/index.ts`
- `packages/nodes-core/src/merge.test.ts`

**Estimated scope:** Small.

## Task 3: Add catalog and CLI coverage

**Description:** Describe Merge in `coreNodeCatalog` and prove it appears in the
CLI.

**Acceptance criteria:**

- [x] Catalog has one `merge` entry with one input, one output, no parameters.
- [x] Registry/catalog completeness still passes.
- [x] `krypton nodes` lists Merge.

**Verification:** `bunx vitest run packages/nodes-core/src/catalog.test.ts apps/cli/src/main.test.ts`.

**Dependencies:** Task 2.

**Files likely touched:**

- `packages/nodes-core/src/catalog.ts`
- `packages/nodes-core/src/catalog.test.ts`
- `apps/cli/src/main.test.ts`

**Estimated scope:** Small.

## Task 4: Documentation

**Description:** Add the node guide and update indexes and the glossary.

**Acceptance criteria:**

- [x] Guide explains append behavior and the no-barrier limit.
- [x] Docs index and ADR index link the new pages.
- [x] Glossary defines append merge.

**Verification:** `bun scripts/check-doc-links.ts`.

**Dependencies:** Tasks 1–3.

**Files likely touched:**

- `docs/nodes/merge.md`
- `docs/README.md`
- `docs/adr/README.md`
- `docs/GLOSSARY.md`

**Estimated scope:** Small.

## Checkpoint: Before PR

- [x] `BASE_SHA=main bun run check` passes.
- [x] `bun run build`, `bun run test:coverage`, and `bun run e2e` pass.
- [x] `BASE_SHA=main bun run guardrails:deleted-tests` is clean.
- [x] Review the diff; no engine behavior changes.
