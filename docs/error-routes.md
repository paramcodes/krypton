# Error policies and error routes

A node can fail after its retries. By default the run stops. A node instance can
choose a different policy with `errorPolicy`:

```json
{
  "id": "request",
  "type": "http-request",
  "errorPolicy": "route",
  "parameters": { "url": "https://api.example.com/orders" },
  "retry": { "maxAttempts": 2, "delayMs": 500 }
}
```

| Policy  | What happens                                                                       |
| ------- | ---------------------------------------------------------------------------------- |
| `fail`  | Stop the run with a failed status. This is the default when the field is omitted.  |
| `skip`  | Record a skipped trace line, drop the failed item, and continue with the queue.    |
| `route` | Record the failure and send an error item to the node's fixed `error` output port. |

The policy applies to an executor error, a retryable error after its retries are
exhausted, and a node timeout. It does not apply to parameter compilation or
evaluation, an invalid executor result, an unknown node type, cancellation, an
invalid retry or timeout policy, a retry sleep failure, an engine budget, a queue
limit, or a malformed connection. Those still stop the run.

## Routing an error

Connect the node's `error` output to a handler:

```json
{
  "nodes": [
    { "id": "start", "type": "manual-trigger" },
    {
      "id": "request",
      "type": "http-request",
      "errorPolicy": "route",
      "parameters": { "url": "https://api.example.com/orders" }
    },
    {
      "id": "handler",
      "type": "set",
      "parameters": { "values": { "handled": true } }
    }
  ],
  "connections": [
    { "from": "start", "to": "request" },
    { "from": "request", "fromPort": "error", "to": "handler" }
  ]
}
```

The handler receives the failed input item plus an `error` object:

```json
{
  "order": "A-104",
  "error": {
    "nodeId": "request",
    "nodeType": "http-request",
    "message": "HTTP 503.",
    "attempts": 2,
    "retryable": true,
    "atMs": 500
  }
}
```

- The original item's fields are preserved; an existing top-level `error` field
  is replaced.
- `message` is the readable error message without the trace's optional attempt
  prefix.
- `attempts` includes the final failed attempt.
- `retryable` describes the final error class, not whether attempts remain.
- `atMs` is elapsed run time from the injected clock.

Use normal expressions downstream, for example
`{{ $json.error.message }}`. A routed error item follows every matching `error`
connection, so two handlers both receive the same error item in connection order.

If `route` is configured but no `error` connection exists when the failure
happens, the run fails visibly. The engine does not silently drop the item.

## Trace and status

Handled failures stay visible:

```text
t=0ms     start        ok    1 item
t=0ms     request      fail  attempt 1/2: HTTP 503.
t=500ms   request      fail  route error: attempt 2/2: HTTP 503.
t=500ms   handler      ok    1 field
```

A `skip` line looks like `skipped: attempt 2/2: HTTP 503.` and produces no
output item. The trace includes `attempt N/M:` when the node retried or the
final error is retryable; a first-attempt non-retryable error uses its plain
message. The error item's `message` is always unprefixed. A `fail` line keeps
the original error detail.

A run can finish `ok` when every failure was handled by `skip` or `route`. A
routed item that reaches a terminal node appears in the final outputs. The trace
is the record of handled failures; there is no separate `partial` status yet. If
you need to know whether a run had handled errors, inspect the trace or, in a
later stage, the durable journal.

## Limits and interactions

- A policy is per node instance and per item, not per workflow or node type.
- `skip` drops that item only. Other queued items and branches continue.
- Retries happen first. `route` and `skip` see the final failed attempt.
- A timeout is not retried automatically, but it can be routed or skipped.
- A Loop body that fails can be routed back to the Loop node. The error item
  keeps the reserved `__krypton` state, so the Loop can collect it as a body
  result. Routing it elsewhere leaves the state visible downstream.
- Every node type has the standard `error` output in the catalog. Switch case
  ports may not use the reserved name `error`.
- Never put secrets in an error message. Redaction and the durable journal are
  later work.

See [ADR 0021](adr/0021-node-error-routes.md) and the
[specification](specs/error-routes.md) for the exact contract.
