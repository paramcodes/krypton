# Spec: Generic node execution timeouts

## Objective

Let a workflow author set a maximum duration for one node attempt. When that
deadline expires, the engine aborts the attempt signal, records a readable node
failure, and stops waiting for that attempt. HTTP keeps its existing request
timeout; this adds a generic engine-level bound. The node's error policy decides
whether the failure stops the run, skips the item, or routes an error item.

## Contract

- A node instance may specify `timeoutMs` as a positive integer from 1 through
  120,000. Omission means no generic node timeout.
- The timeout is per attempt. It uses the injected `Clock.sleep`, so simulations
  do not use ambient timers or wall-clock time.
- The executor receives an attempt-scoped `AbortSignal`. When the timeout fires,
  that signal is aborted and the engine records `Node timed out after Nms.` The
  node's error policy then applies: `fail` (the default) stops the run, `skip`
  drops the item, and `route` sends an error item to the `error` port.
- Timeout errors are terminal for the retry loop, even when the node has a retry
  policy. Retrying a timed-out executor can duplicate an external effect whose
  completion is unknown. They are not terminal for the run when the error policy
  handles them.
- Run cancellation remains distinct from a timeout and reports `Run cancelled.`
- The engine cannot forcibly stop a non-cooperative executor. Executors and
  adapters must honor the signal; the engine will not consume a later result from
  the attempt.
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
- Engine tests prove timeout aborts the attempt, records a readable failure, is
  not retried, and does not allow a late result to continue the graph. Error
  policy tests prove a timeout can be skipped or routed.
- Engine tests prove ordinary completion cancels the pending timeout sleep and
  workflow cancellation is not misreported as a timeout.
- Run `bun run check`, `bun run build`, `bun run test:coverage`, and `bun run e2e`.

## Files and scope

- Schema: `packages/schema/src/workflow.ts` and its tests.
- Engine: `packages/engine/src/run.ts`, node error contract, and tests.
- Decision/docs: ADR 0015, architecture overview, HTTP guide, and glossary if a
  new term remains after implementation.
- Out of scope: `Switch`, `Merge`, `Loop`, durable resume, and changing HTTP
  retry/idempotency policy. Error policy semantics live in
  [ADR 0021](../adr/0021-node-error-routes.md).
