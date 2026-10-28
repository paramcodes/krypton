# Implementation Plan: Node error policies and error routes

## Overview

Let a node instance choose what happens when an executor fails after its retries:
stop the run, skip the failed item, or route an error item to a fixed `error`
output. The default remains fail-fast. The engine stays pure and deterministic,
and every handled failure remains visible in the trace.

## Architecture Decisions

- Add `errorPolicy: "fail" | "skip" | "route"` to `NodeInstance`; omission means
  `fail`.
- Apply the policy to executor errors, retry exhaustion, and timeouts. Do not
  apply it to parameter evaluation, invalid executor results, unknown node types,
  cancellation, invalid configuration, retry-sleep failures, or engine budgets.
- Use the fixed `error` output port. A `route` failure with no connected error
  edge fails the run instead of silently dropping the item.
- Route a new item containing the failed input fields plus an `error` object with
  `nodeId`, `nodeType`, `message`, `attempts`, `retryable`, and `atMs`. Replace
  any existing top-level `error` field.
- Keep the run status `ok` when every failure was handled; the trace records
  failed, skipped, and routed lines. Do not add a `partial` status yet.
- Declare the standard `error` output in every core catalog entry and reserve the
  name against Switch case ports.
- No new dependencies, no workflow-level handler, no durable journal, and no
  editor work in this slice.

## Scope

### In

- Schema parsing for `errorPolicy`.
- Engine parsing, validation, retry/timeout interaction, skip and route handling,
  error item creation, fan-out, queue limits, trace, and status.
- Core catalog error outputs and Switch reserved-port validation.
- Engine, schema, catalog, CLI, and real-node expect tests.
- ADR, specification, user guide, glossary, architecture, catalog, switch,
  timeout, and learning-path updates.

### Out

- Workflow-level error handlers or triggers.
- Durable error events, resume, redaction, correlation IDs, or provider error
  codes.
- A `partial` run status or per-workflow defaults.
- Editor components for hiding or validating the error handle.

## Testing Strategy

- Schema tests accept all three values and reject unknown or non-string values.
- Engine tests prove fail, skip, route, route after retry exhaustion, timeout
  routing, no-edge failure, fan-out, and bypass for parameter/contract failures.
- A nodes-core expect test runs the real HTTP Request node through retries and an
  error route with fake ports and an inline trace snapshot.
- Catalog tests assert every core node has exactly one standard error output;
  Switch tests reject a case named `error`.
- CLI tests list the standard error output.
- Full gate: `bun run check`, `bun run build`, `bun run test:coverage`,
  `bun run e2e`, and the deleted-test guard.

## Risks and Mitigations

- **Hidden failures:** handled failures still appear in the trace, and `route`
  without a connection fails the run.
- **Scope creep:** no workflow handler, journal, editor, or `partial` status.
- **Retry/timeout interaction:** policy runs only after the retry loop or a
  non-retryable attempt; timeout remains non-retryable.
- **Port collision:** the engine reserves `error` and Switch rejects it.
- **Sensitive messages:** the docs warn against putting secrets in errors;
  redaction remains future work.

## Definition of Done

- `bun run check` passes.
- New behavior has failing-first tests and a passing implementation.
- Boundaries and ADRs describe the code.
- Docs and glossary cover the new domain terms.
- The diff is small enough for a human to walk through.
