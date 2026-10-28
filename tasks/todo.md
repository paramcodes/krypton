# Tasks: Node catalog

## Task 1: Add catalog types and parser

**Description:** Define the node metadata contract in `@krypton/node-sdk` and
validate untrusted catalog values at the boundary.

**Acceptance criteria:**

- [x] Catalog entries, ports, dynamic outputs, and all parameter kinds are typed.
- [x] Parser rejects duplicate types, ports, keys, invalid defaults, and bounds.
- [x] A JSON round trip of a valid catalog parses cleanly.

**Verification:** `bunx vitest run packages/node-sdk/src/catalog.test.ts`.

**Dependencies:** None.

**Files likely touched:**

- `packages/node-sdk/package.json`
- `packages/node-sdk/src/index.ts`
- `packages/node-sdk/src/catalog.ts`
- `packages/node-sdk/src/catalog.test.ts`

**Estimated scope:** Medium.

## Task 2: Add the core node catalog

**Description:** Describe every executor in `coreNodes`, including Switch's
dynamic case ports and HTTP's bounded numeric fields.

**Acceptance criteria:**

- [x] `coreNodeCatalog` has one entry per executor.
- [x] Every entry passes `parseNodeCatalog`.
- [x] Switch declares the fixed `default` port plus dynamic case ports.

**Verification:** `bunx vitest run packages/nodes-core/src/catalog.test.ts`.

**Dependencies:** Task 1.

**Files likely touched:**

- `packages/nodes-core/src/catalog.ts`
- `packages/nodes-core/src/catalog.test.ts`
- `packages/nodes-core/src/index.ts`

**Estimated scope:** Medium.

## Task 3: Add the `nodes` CLI command

**Description:** Print the core catalog in a readable form or as JSON.

**Acceptance criteria:**

- [x] `krypton nodes` lists node types, ports, and parameters.
- [x] `krypton nodes --json` prints a parseable catalog.
- [x] Unknown options fail with usage text.

**Verification:** `bunx vitest run apps/cli/src/main.test.ts`.

**Dependencies:** Task 2.

**Files likely touched:**

- `apps/cli/src/main.ts`
- `apps/cli/src/main.test.ts`

**Estimated scope:** Small.

## Task 4: Record the decision

**Description:** Add ADR 0018 and a short catalog guide, then update indexes.

**Acceptance criteria:**

- [x] ADR records the typed-catalog choice and rejected alternatives.
- [x] Guide explains the contract, CLI usage, and adding a node.
- [x] Documentation links resolve.

**Verification:** `bun scripts/check-doc-links.ts` and final `bun run check`.

**Dependencies:** Tasks 1–3.

**Files likely touched:**

- `docs/adr/0018-node-catalog.md`
- `docs/adr/README.md`
- `docs/nodes/catalog.md`
- `docs/README.md`
- `packages/node-sdk/README.md`
- `packages/nodes-core/README.md`

**Estimated scope:** Small.

## Checkpoint: Before PR

- [x] `BASE_SHA=main bun run check` passes.
- [x] `bun run build`, `bun run test:coverage`, and `bun run e2e` pass.
- [x] `BASE_SHA=main bun run guardrails:deleted-tests` is clean.
- [x] Review the diff; no engine, node behavior, or UI changes are included.
