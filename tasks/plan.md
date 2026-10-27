# Implementation Plan: Generic node execution timeouts

## Overview

Implement the approved spec in `docs/specs/node-timeouts.md`: optional per-node,
per-attempt deadlines using the `Clock` port, attempt-scoped cancellation, and a
terminal timeout trace. Preserve the existing HTTP port's independent request
timeout.

## Architecture Decisions

- Store the timeout on `NodeInstance`, beside its static retry policy, rather
  than in node parameters; the engine needs it before invoking the node.
- Use `Clock.sleep(timeoutMs, timerSignal)` and race it against node execution.
  No ambient timers enter the pure engine.
- Pass a child signal to a timed attempt. Link workflow cancellation to that
  child, abort it on timeout, and clean up the timeout sleep after any attempt
  settles.
- Use an internal, non-retryable timeout error. Timeout can leave an external
  effect's completion uncertain, so an explicit retry policy does not retry it.
- A non-cooperative executor may continue after the engine stops awaiting it;
  the contract signals cancellation but cannot forcibly terminate arbitrary
  executor code.

## Task List

### Phase 1: Workflow contract

- [x] Task 1: Parse bounded node timeouts.

### Checkpoint: Workflow contract

- [ ] Schema tests cover omitted, minimum, maximum, and invalid timeout values.
- [ ] Existing retry policy parsing remains unchanged.

### Phase 2: Engine behavior

- [x] Task 2: Enforce per-attempt timeouts with cancellation and trace behavior.

### Checkpoint: Engine behavior

- [x] Timeout, success-before-timeout, abort, late-result, retry interaction, and
  retry regressions are covered by deterministic engine tests.
- [ ] Engine coverage remains above the documented 90% thresholds.

### Phase 3: Decision and docs

- [ ] Task 3: Record ADR 0015 and update architecture/HTTP documentation.

### Checkpoint: Complete

- [ ] `bun run check`, `bun run build`, `bun run test:coverage`, and `bun run e2e`
  pass; deleted-test guard compares against `main`.
- [ ] Diff reviewed; ready for PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| A timed-out executor ignores its signal and continues side effects. | High | Abort the attempt signal, stop consuming its result, document cooperative cancellation, and do not retry timeouts. |
| A timeout sleep remains active after a fast node succeeds. | Medium | Use a dedicated abort signal for the sleep and test that success cancels it. |
| Workflow cancellation races the deadline. | Medium | Race cancellation explicitly and prioritize the run's aborted state in error handling. |
| Schema and engine validation limits drift. | Low | Use the same bound in both layers and test the schema boundary plus manually constructed typed workflows. |

## Open Questions

- None. The contract was approved in `docs/specs/node-timeouts.md`.
