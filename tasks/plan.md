# Implementation Plan: Merge node

## Overview

Add an append-only `merge` node to `packages/nodes-core`: one `main` input that
accepts any number of branches, one `main` output, no parameters, and unchanged
items in deterministic queue order. The engine is not changed.

## Architecture Decisions

- Append now; do not pretend the engine has a wait-for-all barrier.
- Keep Merge as a normal executor; no engine special-casing.
- Document the absence of buffering, combining, and branch synchronization.
- Add the catalog entry in the same change so the metadata contract stays
  complete.

## Task List

### Phase 1: Contract

- [x] Task 1: Write the Merge spec and ADR 0019.

### Checkpoint: Contract

- [x] The spec says append-only, no barrier, and queue-order semantics.
- [x] The ADR records why wait-for-all is deferred.

### Phase 2: Implementation

- [x] Task 2: Add failing-first tests and the Merge executor.

### Checkpoint: Behavior

- [x] Two emitting branches produce items in deterministic order.
- [x] A Switch branch test proves Merge does not wait for an unselected branch.
- [x] Items are unchanged.

### Phase 3: Metadata and docs

- [x] Task 3: Add the `merge` catalog entry and CLI coverage.
- [x] Task 4: Add the node guide and index links.

### Checkpoint: Complete

- [x] `BASE_SHA=main bun run check`, `build`, `test:coverage`, and `e2e` pass.
- [x] Diff reviewed and ready for PR.

## Risks and Mitigations

| Risk                                         | Impact | Mitigation                                                        |
| -------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Users assume Merge waits for all branches.   | High   | Name it append-only in the spec, guide, ADR, and trace detail.    |
| Merge is mistaken for a no-op with no value. | Medium | Use it as an explicit join marker and future mode home; document. |
| Branch order is assumed to be grouped.       | Medium | Promise FIFO queue order, not grouping.                           |
| A future barrier needs a breaking change.    | Low    | Add a mode or a separate node; keep append behavior stable.       |

## Open Questions

- None for append mode. Wait-for-all remains a separate engine slice.
