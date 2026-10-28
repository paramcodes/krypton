# 0021 — Node error policies and the error output port

- Status: accepted
- Date: 2026-10-28
- Deciders: project owner, engine implementation owner

> [ADR 0013](0013-engine-execution-model.md) deferred error routes until the
> retry and journal contracts existed. [ADR 0014](0014-http-request-and-retries.md)
> added bounded retries, and [ADR 0015](0015-node-execution-timeouts.md) added a
> generic attempt deadline. This ADR adds the missing per-node error policy. It
> does not add durable checkpoints or a workflow-level error handler.

## Context

A workflow author needs a safe way to handle a node that fails after its retries.
The current engine fails the whole run on every executor error. That is correct
for the default, but it makes a recoverable failure impossible to model without
putting retry or branching logic inside every node.

The Stage 1 exit criteria include an error-route expect test. The engine must stay
pure and deterministic: routing cannot depend on a database, a worker, ambient
time, or a hidden retry loop. It also must not silently drop a failure when the
author expected to handle it.

The engine already has named output ports, a FIFO item queue, per-attempt trace
lines, bounded retries, and a per-node timeout. This slice builds on those
mechanisms rather than adding a new runtime.

## Decision

### Node instance field

A node instance may set a top-level `errorPolicy`:

```json
{
  "id": "request",
  "type": "http-request",
  "errorPolicy": "route",
  "retry": { "maxAttempts": 3, "delayMs": 1000 }
}
```

The accepted values are:

- `"fail"` — stop the run with a failed status. This is the default when the
  field is omitted.
- `"skip"` — record a skipped trace line for this item and continue with the
  remaining queue entries. The item produces no output.
- `"route"` — record the node failure and send an error item to the node's
  `error` output port.

The policy is per node instance, not per workflow or node type. The shared
workflow schema parses the exact three values and rejects anything else. The
engine validates the in-memory value defensively before executing any node.

### When the policy applies

The policy applies to executor failures:

- an ordinary error thrown by an executor on an attempt;
- a retryable error after the retry policy is exhausted; and
- a node timeout, which is not automatically retried.

The policy is applied independently for each queued item and each node instance.
A routed or skipped item does not stop unrelated items that are already queued.

The policy does **not** apply to failures that are not a node attempt:

- parameter compilation or per-item expression evaluation;
- an executor result that fails the engine's runtime contract;
- an unknown node type;
- run cancellation;
- an invalid retry policy or timeout;
- a retry sleep failure; or
- an engine budget, queue limit, or malformed connection.

Those failures still stop the run. Routing a configuration error could hide a
broken workflow, and cancellation is not a node error.

### The error port

Every node type has one fixed engine-level output port named `error`. It is
declared by the node catalog alongside the node's success ports, so the future
editor can render the handle and the CLI can describe it.

`route` uses this port only when the node fails. A successful node never emits an
`error` output; the engine rejects an executor result that claims it. If the node
has no matching `error` connection when the error occurs, the run fails visibly; a
policy that expects a route must not silently drop the item. Multiple matching
connections fan out the same error item in connection order.

The `error` name is reserved by the engine. A built-in node with author-defined
output ports may not use it. In particular, a Switch case may not be named
`error`.

### Routed item shape

A routed item is a new object containing every own field from the failed input
item plus an `error` object:

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

- `message` is the human-readable error message without the trace's optional
  attempt prefix. It is not a structured provider error.
- `attempts` is the number of attempts that ran, including the final failed
  attempt.
- `retryable` says whether the final error was marked `RetryableNodeError`. It
  does not mean more attempts remain.
- `atMs` is the elapsed run time from the injected `Clock`, matching the trace.
- The input item is not mutated. Existing top-level fields are preserved, but an
  existing `error` field is replaced. Downstream expressions read the details as
  `{{ $json.error.message }}`.
- Reserved Loop state inside the item is preserved. Routing a body error back to
  the Loop node can therefore return it as a body result; routing it elsewhere
  leaves the state visible to downstream nodes. Loop semantics are unchanged.

### Trace and run status

The trace is the record of what happened; a handled failure is not erased.

- `fail` writes a failed trace line with the original error detail.
- `skip` writes a skipped trace line, for example
  `skipped: attempt 3/3: HTTP 503.` The item is dropped.
- `route` writes a failed trace line, for example
  `route error: attempt 2/2: HTTP 503.`, then queues the error item. The node
  still failed even though the run continues.

A run remains `ok` when every failure was handled by `skip` or `route` and no
unhandled failure occurred. This matches the execution state machine's
"succeeded with a trace" case. A routed item that reaches a terminal node appears
in the run outputs like any other item. A run fails when an unhandled error
occurs, including a `route` with no connected error edge.

The run status is therefore coarse. Consumers that need to know whether a run
handled any errors must inspect the trace or, later, the durable journal. This ADR
does not add a `partial` status.

## Alternatives considered

- **A workflow-level error handler trigger** — useful for notifications and
  shared recovery, but it needs a run identity, a durable record, and a second
  execution context. Defer it until the journal exists.
- **Continue with the original item** — would hide the failure and send bad data
  down the success path. A routed error item is explicit, and skipping is
  explicit.
- **Return a status flag from every executor** — duplicates error handling in
  every node and still needs an engine decision about the run. An exception with
  an explicit retry marker is smaller.
- **Route directly to the `main` port** — would make success and failure edges
  indistinguishable and force every downstream node to inspect the item.
- **Add a special `$error` expression** — not needed. The routed item makes the
  details available through the existing `$json` reference.
- **Add a `partial` run status now** — the API and durable journal do not exist
  yet, and the trace already distinguishes handled failures. Revisit with the
  journal.

## Consequences

- A workflow can recover from a failed request without moving retry logic into
  the HTTP node or failing every unrelated branch.
- `skip` can drop work, but it is visible as a skipped trace line; it is not a
  silent success.
- `route` without a connected error edge fails the run rather than losing the
  item.
- The catalog gains one standard port for every node. Switch must reject
  author-defined case ports named `error`.
- Error messages are copied into the item and the trace. Secrets must never be
  included in an error message; redaction and the durable journal are later
  work.
- The engine still has no durable checkpoint. A crash cannot resume an
  in-progress run, and an error route is not a retry of an external effect.
- Parameter and contract failures remain fail-fast. If authors need to handle
  those per item later, that needs a separate decision.

## Revisit when

- The durable journal and workflow-level error handler exist.
- The editor needs to hide or validate the error handle based on `errorPolicy`.
- Error metadata needs redaction, correlation IDs, or structured provider codes.
- A workflow needs a partial/soft-failure status or per-workflow defaults.
- A trigger can receive untrusted items that already contain `__krypton` state.
