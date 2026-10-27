# Implementation Plan: Switch node

## Overview

Implement the approved contract in `docs/specs/switch-node.md`: a pure
`packages/nodes-core` node that routes an item by strict scalar equality to the
first matching named port, or to `default` when no case matches.

## Architecture Decisions

- Keep Switch logic in `nodes-core`; the engine already routes outputs by named
  port and does not need changes.
- Match only JSON scalar values using strict same-type equality. Reject
  composite values and duplicate case values instead of defining deep equality.
- Preserve case order for matching and allow multiple distinct case values to
  share a port.
- Fix the unmatched output name as `default`; do not add a configurable default
  port or generated UI schema in this slice.
- The Bun typecheck/build question is a separate tooling concern and is not part
  of this node change.

## Task List

### Phase 1: Node behavior

- [x] Task 1: Implement Switch routing with failing-first unit tests.

### Checkpoint: Node behavior

- [x] Unit tests cover scalar matches, type sensitivity, defaults, shared ports,
      and invalid/ambiguous configuration.
- [ ] Existing core node behavior remains unchanged.

### Phase 2: Engine integration

- [x] Task 2: Add a fake-port engine expect test for named-port routing.

### Checkpoint: Integration

- [x] The inline trace snapshot demonstrates only the selected downstream path
      executes and output items retain their values.

### Phase 3: Decision and docs

- [x] Task 3: Record the matching contract and add the Switch node guide.

### Checkpoint: Complete

- [ ] `bun run check`, `bun run build`, `bun run test:coverage`, and `bun run e2e`
      pass; deleted-test guard compares against `main`.
- [ ] Diff reviewed and ready for PR.

## Risks and Mitigations

| Risk                                                                    | Impact | Mitigation                                                |
| ----------------------------------------------------------------------- | ------ | --------------------------------------------------------- |
| Object/array equality is unclear and potentially surprising.            | Medium | Restrict selected and case values to JSON scalars.        |
| Duplicate case values would make routing order-dependent.               | Medium | Reject duplicate values; retain order for distinct cases. |
| Custom port names contain control characters or whitespace-only values. | Low    | Validate names before returning the output.               |

## Open Questions

- None for the Switch scope. Whether to replace the typecheck command with
  `bun check --no-script` is intentionally separate.
