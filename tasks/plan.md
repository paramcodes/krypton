# Implementation Plan: Loop over items node

## Overview

Add a `loop` node that runs a connected body once per object in an array,
collects the body's returned items, and emits one `done` item. The loop state
travels in the item under a reserved key so the engine stays pure. The body is a
normal graph cycle: `loop` → body → Loop node → `loop`/`done`.

## Architecture Decisions

- One node owns the iteration contract; do not split iterator and collector.
- Carry `{ items, nextIndex, results, original, maxItems }` in `__krypton`,
  keyed by node ID, so nested loops and multiple Loop nodes coexist.
- Spread the original item and the current element into each iteration item.
  Original fields keep source expressions evaluable on continuation; element
  fields are visible directly to the body.
- Collect full snapshots of body returns with all reserved state removed.
  `done` is the original item plus `results`; it keeps enclosing state at the
  top level.
- Bound iterations with `maxItems` (default 1,000, max 4,998) and the engine step
  budget. The cap fits the minimal one-body workflow's `2N + 3` steps. No engine
  changes.
- Reject malformed state and non-object items. Document the one-return,
  zero-return, fan-out, and state-preservation requirements.
- Treat state provenance as a trust boundary. The manual trigger strips reserved
  state; future untrusted triggers need the same sanitization or a run token.

## Task List

### Phase 1: Contract

- [x] Task 1: Write the Loop spec and ADR 0020.

### Checkpoint: Contract

- [x] Ports, parameters, state shape, and result shape are defined.
- [x] Empty arrays, bounds, fan-out, zero-return, and state tampering are
      documented.
- [x] The ADR records why there is no sub-workflow runtime or stateful executor.

### Phase 2: Tests and implementation

- [x] Task 2: Add failing-first expect tests for two items and an empty array.
- [x] Task 3: Add executor tests for continuation, bounds, malformed state, and
      state namespacing.
- [x] Task 4: Implement `loop.ts` and register `loop`.

### Checkpoint: Behavior

- [x] Two items run the body twice and emit one `done` item with two results.
- [x] An empty array skips the body.
- [x] `maxItems`, non-object items, non-object state maps, and malformed state
      fail with clear errors.
- [x] `done` keeps enclosing state, results strip every reserved state field,
      and prototype-like keys stay own JSON data.
- [x] Nested loops, fan-out, zero-return, state removal, and forged trigger state
      are covered or documented.

### Phase 3: Metadata and docs

- [x] Task 5: Add the catalog entry with `loop`/`done` ports and both parameters.
- [x] Task 6: Add the CLI listing assertion, user guide, and index links.
- [x] Task 7: Update the glossary and learn-by-reading path.

### Checkpoint: Complete

- [x] `BASE_SHA=main bun run check`, `build`, `test:coverage`, `e2e`, and
      deleted-test guard pass.
- [x] Diff reviewed and ready for PR.

## Risks and Mitigations

| Risk                                                   | Impact | Mitigation                                                        |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------- |
| Engine re-evaluates `items` on continuation.           | High   | Spread original fields; document source-field preservation.       |
| A body fans out or removes `__krypton`.                | High   | Document duplicate `done`/no `done`; step budget; preserve state. |
| Forged `__krypton` arrives from an untrusted trigger.  | High   | Strip at manual trigger; require trigger sanitization or a token. |
| State growth near the item cap.                        | Medium | Default 1,000, hard cap 4,998, step budget, strip results.        |
| Node IDs like `__proto__` collide with object lookups. | Medium | `Object.hasOwn` plus a regression test.                           |
| Nested loops leak or overwrite state.                  | Medium | Key state by node ID; strip all state from results; nested test.  |
| Users expect true sub-workflow semantics.              | Medium | Name the body contract and limits explicitly in docs and ADR.     |

## Open Questions

- Should a future slice add an error port for zero-return or fan-out bodies?
- Should the durable journal serialize `__krypton` as internal state, or hide it
  from the public item view?
- Should the editor validate the body cycle and exactly-one-return rule?
- Should cycle validation reject unrelated loops before the step budget?
