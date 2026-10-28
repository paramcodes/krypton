# Implementation Plan: Bun typechecker

## Overview

Use Bun 1.4.4's built-in checker for the fast-gate `typecheck` command. Keep the
pinned `tsc --noEmit` as the build gate so the authoritative compiler check is
unchanged. No bundling or artifact changes are part of this slice.

## Architecture Decisions

- `typecheck` runs `bun check --no-script`; the flag prevents recursion into the
  root `check` script.
- `build` stays `tsc --noEmit`. CI continues to verify with the pinned
  TypeScript 7.0.2.
- `bun build` is out of scope: the current build is a no-emit verification, not
  artifact production.
- The Bun and TypeScript pins move together.

## Task List

### Phase 1: Verify parity

- [x] Task 1: Compare checked-file coverage and strict diagnostics against tsc.

### Checkpoint: Parity

- [x] Both checkers cover the same 37 project files.
- [x] Probe errors for strict flags match tsc exactly.

### Phase 2: Switch the fast gate

- [x] Task 2: Update the `typecheck` script and run it.

### Checkpoint: Fast gate

- [x] `bun run typecheck`, `bun run check`, and `bun run build` pass.

### Phase 3: Record the decision

- [x] Task 3: Add ADR 0017 and update the runtime constraints.

### Checkpoint: Complete

- [x] Documentation links resolve.
- [x] `BASE_SHA=main bun run check`, `build`, `test:coverage`, and `e2e` pass.
- [x] Diff reviewed and ready for PR.

## Risks and Mitigations

| Risk                                           | Impact | Mitigation                                                   |
| ---------------------------------------------- | ------ | ------------------------------------------------------------ |
| Bun's embedded TypeScript drifts from the pin. | Medium | `build` still runs `tsc --noEmit`; bump both pins together.  |
| `bun check` resolves to the package script.    | Low    | Use `--no-script`; the gate exercises the exact command.     |
| The checker skips files that tsc includes.     | Medium | File-set and diagnostic parity verified; build gate remains. |

## Open Questions

- None. A real build and artifact pipeline remains separate work.
