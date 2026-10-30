# 0010 — API framework: Hono

- Status: accepted
- Date: 2026-10-29
- Deciders: project owner, backend implementation owner

## Context

The API needs typed routes, request validation, cookie sessions, server-sent
events, file uploads for workflow import, and a test client that does not need a
live port. It runs on Node 26 behind a single process for v1, with a worker
separate. The framework must not leak into the engine or the web app.

The Stage 1 schema package validates boundaries with explicit parsers rather than
Zod. The spike used that same custom-parser shape. A future shared-schema decision
may add Zod, but routing must not require it.

The spike evidence is in
[`docs/spikes/api-framework.md`](../spikes/api-framework.md).

## Decision

Use **Hono** with `@hono/node-server`.

- Keep Hono inside `apps/api`; the engine and web app must not import it.
- Validate request bodies with the existing `@krypton/schema` parsers through
  Hono's `validator` middleware. Do not add Zod solely for routing.
- Use Hono's built-in `requestId`, `secureHeaders`, `cors`, cookie, `bodyLimit`,
  and `streamSSE` helpers.
- Use a small in-repo, single-process rate limiter for login and webhook routes
  in Stage 2. Revisit a shared limiter when Stage 4 adds workers and a queue.
- Test routes with `app.request()`; unit tests do not need a live port.
- Pin `hono@4.13.13` and `@hono/node-server@2.1.5`. Both were released more than
  two weeks before this decision; the Hono 5 release candidate is not used.

## Spike results

The probe passed 13 tests/subtests under Node 26.12.1, and `bunx tsc --noEmit`
passed under TypeScript 7.0.2:

| Criterion                         | Hono                                      | Fastify                                       |
| --------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Typed route and error body        | Built-in `validator`; `c.req.valid` typed | Manual parser; schema typing needs a provider |
| SSE streaming and test client     | `streamSSE`; test-client stream works     | Raw reply stream; inject works                |
| Multipart upload and size limit   | `bodyLimit`; 413 works                    | `@fastify/multipart`; 413 works               |
| Cookie create, rotate, revoke     | `hono/cookie`; works                      | `@fastify/cookie`; works                      |
| Test client                       | `app.request()`; no port                  | `app.inject()`; no port                       |
| Node 26 compatibility             | Pass                                      | Pass                                          |
| Startup to listening              | ~140–156 ms                               | ~313–375 ms                                   |
| Rate limiting                     | No built-in; external package or custom   | Mature plugin; 429 works                      |
| CORS, secure headers, request IDs | Built in                                  | Plugins; request-ID header via a hook         |

The app startup numbers are three separate-process runs each on Node 26.12.1.
Hono has two direct dependencies; the Fastify probe needed six. Fastify also
needed extra error mapping so its rate-limit `429` did not become a `500`.

The one Fastify advantage is rate limiting. Hono's external option,
`hono-rate-limiter@0.5.4`, also requires `unstorage`; a small in-memory limiter is
enough for the single-process Stage 2 API. This is revisited before Stage 4.

SSE keepalive, disconnect handling, and backpressure were not proven by this
probe; they are implementation tests for Stage 2. The cookie session store and
rate limiter are also our code, so both need tests and a security review.

## Alternatives considered

- **Fastify** — mature, but more direct dependencies, slower startup, and more
  glue for typed validation and error mapping. Keep it as the fallback if Hono
  misses a required capability.
- **Express** — familiar, but weaker typing and fewer modern defaults.
- **tRPC** — good editor ergonomics, but couples client and server and does not
  solve public REST, webhooks, or external clients.
- **Hono 5 release candidate** — not stable and not old enough for the dependency
  policy.

## Consequences

- The API can test routes without opening a port and can stream SSE through the
  same test client.
- Hono stays at the HTTP edge. The engine remains pure and the editor still talks
  to a typed REST surface.
- Rate limiting is our code, not a plugin. Keep it small, tested, and replace it
  if the API becomes multi-instance.
- The API package gains two pinned dependencies when implementation starts.
- `@hono/node-server` is the Node adapter boundary; a future runtime change
  should not leak into route code.

## Revisit when

- Rate limiting needs a shared store or multiple API instances.
- Hono lacks a capability the API needs, or `@hono/node-server` has a Node 26
  blocker.
- The shared schema decision adds Zod or an OpenAPI generator that changes the
  validation or client story.
- Stage 4 moves execution behind a worker and queue.
