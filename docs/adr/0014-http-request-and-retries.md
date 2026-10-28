# 0014 — HTTP Request node, bounded retries, and the Http port

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner, engine implementation owner

## Context

Stage 1 needs an HTTP Request node and the retry/timeout behaviour that makes an
outbound request safe to run. The engine must stay pure and deterministic, so
network access and sleeping belong behind ports. The Stage 1 exit criteria also
call for a readable flaky-HTTP expectation test.

[ADR 0013](0013-engine-execution-model.md) deliberately deferred retries,
timeouts, error ports, and joins until their semantics were decided. This ADR
decides the HTTP request and retry slice; joins and error routes were deferred
at the time. Merge, Loop, and error routes are added later by ADRs 0019, 0020,
and 0021.

> [ADR 0015](0015-node-execution-timeouts.md) later adds the generic engine
> deadline for one node executor attempt. The HTTP request timeout below remains
> a separate adapter-level bound.
> [ADR 0019](0019-merge-node.md) and [ADR 0020](0020-loop-node.md) later add Merge
> and Loop over items. [ADR 0021](0021-node-error-routes.md) later adds per-node
> error policies, so an HTTP failure can be skipped or routed after its retries
> are exhausted.

## Decision

### Ports

`Clock` gains `sleep(ms, signal)`. It resolves after simulated or real time and
rejects when the signal is aborted.

`EnginePorts` gains a required `http` port:

```ts
type HttpRequest = {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

type Http = {
  request(request: HttpRequest, signal: AbortSignal): Promise<HttpResponse>;
};
```

The port is responsible for enforcing its timeout and response-size contract.
It rejects with an `HttpError` that carries a stable code and a `retryable`
flag. The engine and built-in nodes never call `fetch`, timers, or a network
API directly.

### Retries

A node instance may carry a static retry policy:

```json
{
  "retry": { "maxAttempts": 3, "delayMs": 1000, "backoff": "exponential" }
}
```

- `maxAttempts` includes the first attempt and is between 1 and 10.
- `delayMs` is between 0 and 60,000 milliseconds.
- `backoff` is `"fixed"` (the default) or `"exponential"` (delay doubles after
  each failed attempt, capped at 60 seconds).
- Only errors marked with `RetryableNodeError` are retried. Validation errors,
  aborts, and ordinary node errors stop immediately. This keeps retries
  explicit: a node author has to say that a failure may succeed on another
  attempt.
- Every failed attempt produces a trace line, including the attempt number.
  The final successful line includes the attempt number when more than one
  attempt ran. A run still fails after the final attempt; error routes are not
  part of this slice.
- The engine checks cancellation before each attempt, after each attempt, and
  after each retry sleep.

At the time of this decision, per-node timeout enforcement in the engine was
deferred. It was later decided separately in
[ADR 0015](0015-node-execution-timeouts.md), including the cooperative-executor
limitation.

### HTTP Request node

The built-in `http-request` node reads `url`, `method`, optional `headers`,
optional `body`, `timeoutMs`, and `maxResponseBytes` parameters. Defaults are
`GET`, 30 seconds, and 1 MiB. `timeoutMs` is capped at 120 seconds and
`maxResponseBytes` at 10 MiB. Parameters may use whole-field expressions.

- Only `http` and `https` URLs are accepted. Credentials in the URL are
  rejected.
- A JSON body is serialised and gets `content-type: application/json` when the
  caller did not set one.
- Response status 2xx and 3xx is an output. Transient statuses (408, 425, 429,
  and 5xx) throw a retryable node error for idempotent methods (`GET`, `HEAD`,
  `OPTIONS`, `PUT`, and `DELETE`). `POST` and `PATCH` are retryable only when a
  non-empty `Idempotency-Key` header is supplied; the caller must ensure the
  target service honors it. Other non-2xx statuses throw an ordinary node error.
  Redirects are not followed automatically.
- The output item is the input item plus an `http` object containing `status`,
  `headers`, `body`, and, when the response is JSON, a parsed `json` value. The
  namespace avoids collisions with common response fields at the item root; an
  existing top-level `http` field is replaced.
- Secrets are not resolved in this slice. A header containing a secret must not
  be put in workflow JSON.

### CLI adapter and SSRF

The CLI supplies the first real `Http` implementation. It is dependency-free
and uses `node:http` and `node:https` directly. It:

- accepts only `http` and `https`;
- rejects URL credentials;
- blocks loopback, private, link-local, multicast, documentation, and other
  non-public address ranges by default;
- resolves the hostname once, validates every returned address, and pins the
  connection to the validated address so a second lookup cannot rebind it;
- does not follow redirects;
- enforces a request timeout and an incremental response-size cap;
- maps aborts, timeouts, DNS failures, connection failures, blocked addresses,
  and oversized responses to `HttpError` codes.

A configurable private-network allow-list is deferred. The adapter exposes an
explicit test-only option so local-server tests can exercise timeout, size, and
abort behaviour without weakening the CLI default.

## Alternatives considered

- **Retry inside the HTTP node** — convenient, but hides retries from the
  engine, makes attempt traces node-specific, and would be duplicated by every
  outbound node.
- **Retry every node error** — simple, but validation and programmer errors
  would be repeated, and a non-idempotent request could be sent twice. An
  explicit retryable error is safer.
- **Use `fetch` for the CLI adapter** — less code, but it hides DNS resolution
  and makes it difficult to pin the validated address or cap a streamed body
  before it is fully buffered.
- **Follow redirects automatically** — useful, but every redirect needs a fresh
  SSRF and size check. Returning the 3xx response is the safe first step.
- **Add a generic per-node timeout now** — the executor contract cannot force a
  non-cooperative executor to stop, so this needs a separate decision.

## Consequences

- The engine gains a second port and the first retry path, with deterministic
  tests that use a fake clock and fake HTTP port.
- The CLI becomes a real network boundary and must be reviewed as security
  sensitive code.
- Non-idempotent requests are not retried unless a non-empty
  `Idempotency-Key` header is supplied. The target service must honor that key;
  a transport failure after the server may have processed a POST is otherwise
  ambiguous.
- Retry traces are more verbose, but the failed attempts remain visible rather
  than being hidden in a final error.
- HTTP response bodies are capped and returned as strings; binary responses are
  not supported in this slice.

## Revisit when

- A workflow needs a managed idempotency-key helper for POST retries.
- Error routes or continue-on-failure policies are added.
- A private-network allow-list or credentials/secrets are needed.
- Redirect following is needed.
- A second app (worker) needs the HTTP adapter, so it should move from the CLI
  into a shared runtime package.
