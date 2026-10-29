# API framework spike

- Date: 2026-10-29
- Decision: [ADR 0010](../adr/0010-api-framework.md)
- Result: Hono accepted; Fastify retained as the fallback

## Question and pass criteria

Can one HTTP framework cover the Stage 2 API without leaking into the engine or
the web app? The probe had to show:

1. A typed route with boundary validation and a typed error response.
2. SSE with a test client that can read the streamed body.
3. Multipart upload with a size limit.
4. Cookie session creation, rotation, and revocation.
5. A test client that covers status, headers, and streamed bodies.
6. Node 26 compatibility.
7. Rate limiting, CORS, secure headers, and request IDs.
8. Stable error mapping that does not leak internals.

The repo's Stage 1 schema uses explicit parsers, not Zod. The probe used that
parser shape. Zod was not added just to make the framework comparison work.

## Versions and environment

- Node 26.12.1
- Bun 1.4.4
- TypeScript 7.0.2, strict
- Hono 4.13.13
- `@hono/node-server` 2.1.5
- Fastify 5.12.7
- `@fastify/cookie` 11.1.3
- `@fastify/multipart` 10.1.4
- `@fastify/cors` 11.3.1
- `@fastify/helmet` 13.2.0
- `@fastify/rate-limit` 11.2.1

The probe was a throwaway package. No probe code is committed.

## Results

`node --test` passed 13 tests/subtests with no skips. `bunx tsc --noEmit` passed
under the strict configuration.

| Criterion                         | Hono                                                                                      | Fastify                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Typed route and error body        | `validator` returns a typed body through `c.req.valid("json")`; `onError` maps `ApiError` | Manual parser in the handler; compile-time schema typing would need a type provider |
| SSE                               | `streamSSE`; `app.request()` reads the streamed body                                      | Raw reply stream; `app.inject()` reads the streamed body                            |
| Multipart                         | `bodyLimit` plus `parseBody`; 413 for oversized files                                     | `@fastify/multipart`; 413 for oversized files                                       |
| Cookie sessions                   | `hono/cookie`; create, rotate, revoke, old cookie rejected                                | `@fastify/cookie`; same behavior                                                    |
| Test client                       | `app.request()`; no live port                                                             | `app.inject()`; no live port for normal routes                                      |
| Node 26                           | Pass                                                                                      | Pass                                                                                |
| CORS, secure headers, request IDs | Built-in middleware; headers present                                                      | Plugins plus an `onSend` hook for the request-ID header                             |
| Rate limiting                     | No built-in; external package or custom middleware                                        | Route-level plugin; second request returns 429                                      |
| Startup to listening              | 140.02, 151.27, 156.45 ms                                                                 | 312.58, 357.45, 375.30 ms                                                           |

The startup figures are three separate-process runs each. Medians are about
151 ms for Hono and 357 ms for Fastify. Hono has two direct dependencies; the
Fastify probe needed six.

## What the probe found

- **Hono's test client is the simplest part of the API story.** `app.request()`
  covers status, headers, SSE, multipart, and cookies without a port. The same
  probe style will work in `apps/api` unit tests.
- **Fastify's rate-limit plugin works, but its 429 first arrived as a 500** under
  the custom error handler. Mapping `statusCode` fixed it. That is manageable,
  but it is extra glue. Hono has no equivalent plugin, so its limiter is ours.
- **Hono has no built-in rate limiter.** `hono-rate-limiter@0.5.4` also needs
  `unstorage`. For a single-process Stage 2 API, a small in-repo limiter keyed by
  IP and route is enough. It must be tested and revisited when Stage 4 adds
  multiple processes.
- **Fastify's typed-route story needs more machinery** if the project wants
  schema-inferred types. `fastify-type-provider-zod@7.0.0` peers on
  `@fastify/swagger` and `openapi-types`. That is not a reason to reject Fastify
  by itself, but it is more surface than the Hono `validator` used here.
- **Both frameworks pass the security-header, CORS, cookie, SSE, and upload
  checks.** The decision is not about a missing core feature.

## Residual risk

- SSE keepalive, disconnect handling, and backpressure were not exercised. The
  Stage 2 implementation must add those tests.
- The cookie session store and rate limiter are custom code, not framework
  plugins. Test them and include them in the security review.
- Hono starts faster in this probe, but these numbers are not a production
  benchmark. Re-measure with the real API before making performance claims.

## Recommendation

Accept Hono for Stage 2. Keep Fastify as the fallback if Hono misses a required
capability. Add a small, tested rate limiter with the first login or webhook
route, and revisit it before Stage 4 adds a queue and workers.
