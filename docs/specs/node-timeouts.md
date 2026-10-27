# Spec: Generic node execution timeouts

## Objective

Let a workflow author set a maximum duration for one node attempt. When that
deadline expires, the engine aborts the attempt signal, records a readable node
failure, and stops waiting for that attempt. HTTP keeps its existing request
timeout; this adds a generic engine-level bound.

## Contract

- A node instance may specify `timeoutMs` as a positive integer from 1 through
  120,000. Omission means no generic node timeout.
- The timeout is per attempt. It uses the injected `Clock.sleep`, so simulations
  do not use ambient timers or wall-clock time.
- The executor receives an attempt-scoped `AbortSignal`. When the timeout fires,
  that signal is aborted and the run fails with `Node timed out after Nms.`
- Timeout errors are terminal, even when the node has a retry policy. Retrying a
  timed-out executor can duplicate an external effect whose completion is
  unknown.
- Run cancellation remains distinct from a timeout and reports `Run cancelled.`
- The engine cannot forcibly stop a non-cooperative executor. Executors and
  adapters must honor the signal; the timed-out run will not consume a later
  result from the attempt.
- HTTP's request timeout remains independently enforced by the `Http` adapter;
  whichever deadline fires first ends the request attempt.

## Project conventions

- TypeScript strict; parse `timeoutMs` in the shared workflow schema and validate
  the engine's in-memory boundary defensively.
- No new dependencies. Engine behavior stays deterministic and uses ports.
- Add failing-first unit tests to `packages/schema` and `packages/engine`.
- Preserve retry behavior, abort behavior, trace formatting, and existing port
  boundaries.

## Verification

- Schema tests accept absent/boundary timeout values and reject invalid values.
- Engine tests prove timeout aborts the attempt, creates a failed trace, is not
  retried, and does not allow a late result to continue the graph.
- Engine tests prove ordinary completion cancels the pending timeout sleep and
  workflow cancellation is not misreported as a timeout.
- Run `bun run check`, `bun run build`, `bun run test:coverage`, and `bun run e2e`.

## Files and scope

- Schema: `packages/schema/src/workflow.ts` and its tests.
- Engine: `packages/engine/src/run.ts`, node error contract, and tests.
- Decision/docs: ADR 0015, architecture overview, HTTP guide, and glossary if a
  new term remains after implementation.
- Out of scope: `Switch`, `Merge`, `Loop`, error routes, durable resume, and
  changing HTTP retry/idempotency policy.
