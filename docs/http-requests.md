# HTTP requests

The `http-request` built-in node calls an HTTP(S) endpoint through the engine's
`Http` port. The engine never opens a socket itself; the CLI supplies the real
adapter, while tests use a fake port. The design and security trade-offs are in
[ADR 0014](adr/0014-http-request-and-retries.md).

## Parameters

| Parameter          | Required | Default   | Limit             | Meaning                                                        |
| ------------------ | -------- | --------- | ----------------- | -------------------------------------------------------------- |
| `url`              | yes      | —         | http or https     | Absolute request URL. Credentials are rejected.                |
| `method`           | no       | `GET`     | supported methods | `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, or `OPTIONS`. |
| `headers`          | no       | `{}`      | single-line text  | Object of header names to string values.                       |
| `body`             | no       | none      | JSON              | A string is sent as-is; other JSON values are serialised.      |
| `timeoutMs`        | no       | `30000`   | 1–120000          | Request timeout enforced by the HTTP port.                     |
| `maxResponseBytes` | no       | `1000000` | 1–10000000        | Maximum response body size.                                    |

Any non-string JSON body gets `content-type: application/json` when no
`content-type` header is set. Parameters may use
[whole-field expressions](expressions.md). For example, use an endpoint string
already present on the current item:

```json
{
  "url": "{{ $json.endpoint }}"
}
```

## Retries

Retry policy is per node instance, not a parameter:

```json
{
  "id": "fetch",
  "type": "http-request",
  "parameters": {
    "url": "https://api.example.com/items",
    "timeoutMs": 10000
  },
  "retry": {
    "maxAttempts": 3,
    "delayMs": 1000,
    "backoff": "exponential"
  }
}
```

- `maxAttempts` includes the first attempt and must be between 1 and 10.
- `delayMs` must be between 0 and 60000.
- `backoff` is `"fixed"` by default or `"exponential"`. Exponential retries wait
  1×, 2×, 4×… the delay, capped at 60 seconds.
- Only failures marked as retryable are retried. The HTTP node marks transport
  failures, timeouts, 408, 425, 429, and 5xx responses as retryable for
  idempotent methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, and `DELETE`). `POST` and
  `PATCH` require a non-empty `Idempotency-Key` header before those failures can
  be retried. The target service must actually honor that key. Invalid
  parameters, blocked addresses, oversized responses, and other 4xx responses
  stop immediately.
- Every failed attempt appears in the trace. The final success line includes the
  attempt number.

A temporary service outage therefore produces a trace like:

```text
t=0ms     request      fail  attempt 1/3: HTTP 503.
t=1000ms  request      fail  attempt 2/3: HTTP 503.
t=3000ms  request      ok    attempt 3/3: HTTP 200
```

Retries are not safe for every external effect. A POST may have reached the
server even when the response was lost. Use an idempotency key at the target
service, or leave retries disabled for that node. Credentials and idempotency-key
helpers are not part of this slice.

## Response

The node keeps the current item and adds an `http` object:

```json
{
  "customer": "Ada",
  "http": {
    "status": 200,
    "headers": { "content-type": "application/json" },
    "body": "{\"id\":42}",
    "json": { "id": 42 }
  }
}
```

The response stays namespaced instead of adding fields such as `status` and
`body` to the item root. If the input already has a top-level `http` field, the
node replaces it with the response object.

- `body` is always the raw response text.
- `json` is present only when the response has a JSON content type and the body
  parses as JSON no deeper than 64 levels.
- `headers` uses lowercase names and joins repeated values with `, `.
- 2xx and 3xx responses are returned as items. Redirects are not followed.
- Non-transient 4xx responses fail the node terminally. 408, 425, 429, and 5xx
  responses fail with a retryable error only for retry-safe methods as described
  above.

Downstream fields use the namespace, for example:

```json
{ "remoteId": "{{ $json.http.json.id }}" }
```

## Security boundary

The CLI adapter is deliberately conservative:

- Only `http` and `https` URLs are accepted.
- URL credentials are rejected.
- Loopback, private, link-local, multicast, documentation, and mapped/reserved
  address ranges are blocked by default.
- The hostname is resolved once; every returned address is checked, and the
  connection is pinned to a validated address so DNS rebinding cannot switch to
  a private address after the check.
- Redirects are not followed, so a public URL cannot redirect to a private one.
- The request timeout and response-size cap are enforced while data is read.
- A private-network allow-list, credentials, and binary response bodies are
  future work; see [ADR 0014](adr/0014-http-request-and-retries.md).

The CLI has no flag to disable the private-address block. An adapter test uses an
explicit test-only option; do not expose that option to workflow authors without
a reviewed allow-list design.
