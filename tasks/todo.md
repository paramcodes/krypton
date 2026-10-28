# Tasks: Bun typechecker

## Task 1: Verify checker parity

**Description:** Compare Bun's built-in checker with the pinned TypeScript
compiler on the current tree, including strict compiler flags.

**Acceptance criteria:**

- [x] Both checkers cover the same project files.
- [x] Probe errors are identical in code, message, and position.

**Verification:** Temporary probe under `scripts/`, both checkers run with
`--no-pretty`, output compared, probe removed.

**Dependencies:** None.

**Files likely touched:** None.

**Estimated scope:** Small.

## Task 2: Switch the fast-gate typecheck

**Description:** Point the `typecheck` script at Bun's checker and keep the
pinned compiler for the build gate.

**Acceptance criteria:**

- [x] `typecheck` is `bun check --no-script`.
- [x] `build` remains `tsc --noEmit`.

**Verification:** `bun run typecheck`, `bun run check`, `bun run build`.

**Dependencies:** Task 1.

**Files likely touched:**

- `package.json`

**Estimated scope:** Small.

## Task 3: Record the decision

**Description:** Add ADR 0017 and update the runtime constraints to name both
commands.

**Acceptance criteria:**

- [x] ADR records the split, alternatives, and drift risk.
- [x] `CONSTRAINTS.md` names the fast checker and authoritative build check.
- [x] Documentation links resolve.

**Verification:** `bun scripts/check-doc-links.ts` and final `bun run check`.

**Dependencies:** Tasks 1–2.

**Files likely touched:**

- `docs/adr/0017-bun-typechecker.md`
- `docs/adr/README.md`
- `CONSTRAINTS.md`

**Estimated scope:** Small.

## Checkpoint: Before PR

- [x] `BASE_SHA=main bun run check` passes.
- [x] `bun run build`, `bun run test:coverage`, and `bun run e2e` pass.
- [x] `BASE_SHA=main bun run guardrails:deleted-tests` is clean.
- [x] Review the diff; no node, package, or build-behavior changes are included.
