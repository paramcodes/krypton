# Spec: Node error policies and error routes

Status: accepted (2026-10-28)

## Objective

Let a workflow author choose what happens when a node fails after its retries:
stop the run, skip the failed item, or route an error item to an `error` output.
The default remains the current fail-fast behavior. The engine stays pure and
deterministic, and every handled failure remains visible in the trace.

## Contract

### Node instance

```json
{
  "id": "request",
  "type": "http-request",
  "errorPolicy": "route",
  "retry": { "maxAttempts": 3, "delayMs": 1000 },
  "timeoutMs": 10000
}
```

`errorPolicy` is optional and has three values:

| Value   | Behavior                                                                 |
| ------- | ------------------------------------------------------------------------ |
| `fail`  | Stop the run with `status: "fail"`. This is the default when omitted.    |
| `skip`  | Record a skipped line, drop this item, and continue the remaining queue. |
| `route` | Record the failure and queue an error item on the node's `error` port.   |

The shared schema parses the exact values and rejects anything else. The engine
rejects an invalid in-memory value before executing any node.

### Applicability

The policy applies to:

- an ordinary executor error;
- a `RetryableNodeError` after its retry policy is exhausted; and
- a node timeout.

It does not apply to parameter compilation or evaluation, an invalid executor
result, an unknown node type, run cancellation, an invalid retry/timeout policy,
a retry sleep failure, an engine budget, a queue limit, or a malformed
connection. Those remain fail-fast.

Polling, external-effect idempotency, and durable resume are not part of this
slice.

### Error port

Every node has one fixed output port named `error`. It is engine-provided, not
returned by a successful executor; the engine rejects a successful result that
claims it. The catalog declares it for every core node, and the CLI lists it.

- `route` must have at least one outgoing connection whose `fromPort` is
  `"error"`. If none is connected when the node fails, the run fails visibly.
- Multiple error connections fan out the same error item in connection order.
- `skip` and `fail` do not need an error connection.
- `error` is reserved. Switch case ports may not use it.

### Error item

A routed item is a new object containing the failed input item's own fields plus
a top-level `error` object:

```json
{
  "order": "A-104",
  "error": {
    "nodeId": "request",
    "nodeType": "http-request",
    "message": "HTTP 503.",
    "attempts": 2,
    "retryable": true,
    "atMs": 250
  }
}
```

- The input item is not mutated.
- An existing top-level `error` field is replaced.
- `message` is the readable error message. The trace may prefix it with the final
  attempt number, for example `attempt 2/2: HTTP 503.` Do not put secrets in
  errors.
- `attempts` includes the final failed attempt.
- `retryable` describes the final error class, not whether attempts remain.
- `atMs` is elapsed run time from the injected `Clock`.
- Reserved Loop state is preserved.

Downstream fields and expressions are normal item fields, for example
`{{ $json.error.message }}`.

### Trace and status

- `fail`: one failed line with the original detail.
- `skip`: one skipped line such as `skipped: attempt 2/2: HTTP 503.`; no output
  item.
- `route`: one failed line such as `route error: attempt 2/2: HTTP 503.`, then
  the error item is queued and downstream nodes run normally.

Retryable errors, and errors after more than one attempt, include the final
attempt number in the trace detail. A first-attempt non-retryable error uses its
plain message. The error item's `message` is always unprefixed.

A run can finish `ok` when all failures were handled by `skip` or `route`. A
routed item that reaches a terminal node appears in `outputs`. The trace, not
only the status, is the record of handled failures. No `partial` status is added
in this slice.

## Project conventions

- TypeScript strict; no `any`, non-null assertions, unchecked casts, skipped
  tests, or lint/type suppressions.
- No new dependencies.
- Parse `errorPolicy` in `@krypton/schema`; keep the engine deterministic and
  pure.
- Preserve the existing retry, timeout, cancellation, trace, and queue behavior.
- Write failing-first tests in the schema, engine, and nodes-core before the
  implementation.

## Verification

- Schema tests accept all three policies, keep an omitted policy absent, and
  reject unknown or non-string values.
- Engine tests prove fail, skip, and route; route after retry exhaustion; route
  on timeout; no-edge failure; fan-out; trace/status semantics; and that
  parameter, contract, unknown-type, and cancellation failures bypass the policy.
- A nodes-core expect test runs the real HTTP Request node through retries and an
  error route with fake ports and an inline trace snapshot.
- Catalog tests include the standard error port and reject a Switch case named
  `error`.
- CLI tests list the standard error output.
- Run `bun run check`, `bun run build`, `bun run test:coverage`, `bun run e2e`,
  and the deleted-test guard.

## Files and scope

- Schema: `packages/schema/src/workflow.ts`, `packages/schema/src/index.ts`, and
  tests.
- Engine: `packages/engine/src/run.ts`, `packages/engine/src/node.ts`,
  `packages/engine/src/index.ts`, and tests.
- Nodes: `packages/nodes-core/src/catalog.ts`, `packages/nodes-core/src/index.ts`,
  related tests, and a new error-route expect test.
- CLI: catalog listing test.
- Decision and docs: ADR 0021, error-route guide, architecture overview, catalog
  docs/spec, Switch docs, glossary, indexes, and learning path.
- Out of scope: workflow-level handlers, durable error events, redaction,
  credentials, a `partial` status, and editor components.
