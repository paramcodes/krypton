# 0010 — API framework: Hono candidate, Fastify fallback

- Status: proposed
- Date: 2026-10-27
- Deciders: project owner, backend implementation owner

## Context

The API needs typed routes, request validation, cookie sessions, server-sent
events, file uploads for workflow import, and a test client that does not need a
live port. It runs on Node 26 behind a single process for v1, with a worker
separate. The framework must not leak into the engine or the web app.

## Candidates

- **Hono** — small, Web Standards-based, typed, good Node adapter, straightforward
  SSE and streaming. Smaller ecosystem than Fastify.
- **Fastify** — mature, plugin-rich, strong schema support, Node-native. More
  concepts and a larger dependency surface.
- **Express** — ubiquitous and simple, but weaker typing and fewer modern
  defaults.
- **tRPC** — excellent TypeScript ergonomics for the editor, but couples client
  and server and does not solve external webhooks or a public REST surface.

## Leading candidate

**Hono**, with Fastify as the fallback if the spike finds a blocker.

## Spike criteria

Run a one-hour spike in Stage 2 and record the result here:

1. A typed route with Zod validation and a typed error response.
2. SSE with keepalive, disconnect handling, and backpressure.
3. Multipart upload with a size limit and a streaming path.
4. Cookie session creation, rotation, and revocation.
5. A test client that covers status, headers, and streamed bodies.
6. Node 26 compatibility and startup time.
7. Availability of rate limiting, CORS, secure headers, and request IDs.
8. How errors map to a stable API error shape without leaking internals.

## Consequences until decided

- Do not add framework code or dependencies before the spike.
- The API package stays an empty boundary with a README.
- The decision must be recorded by changing this ADR to accepted or rejected, not
  by starting the implementation and calling it settled.

## Revisit when

- The Stage 2 spike completes.
- A required capability is missing or unmaintained in the chosen framework.
