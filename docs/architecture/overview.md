# Architecture overview

Status: Stage 1 engine code is complete. The Stage 1 teach-back is ready for
review; Stage 2 persistence and API is next. The pure engine, built-in nodes,
bounded retries, an HTTP Request node, per-node timeouts, node error policies,
property tests, and a terminal runner are implemented. The crash-and-resume test
moves to Stage 2 with persistence. The API, editor, and worker are not
implemented yet.
This document describes the target shape and the boundaries those stages must
respect. The full proposal is in
[`research/02-architecture.md`](../../research/02-architecture.md).

## Goals

- Self-hostable on one machine with Podman and Postgres.
- One admin, optional invited users, no organisations or billing in v1.
- Durable runs with a readable journal, bounded retries, and safe replay.
- A pure, deterministic engine that is easy to test without mocks.
- A typed node contract for built-in and third-party nodes.
- AI nodes after v1.

## System shape

```text
Browser (React editor)
   │ HTTPS + SSE
   ▼
API ───────────────► Postgres
   │ claim / enqueue
   ▼
Worker ──► Engine (pure) ──► Node SDK / built-in nodes
```

## Packages

| Package               | Responsibility                                  | May import                                  | Must not import                   |
| --------------------- | ----------------------------------------------- | ------------------------------------------- | --------------------------------- |
| `packages/schema`     | Branded IDs, workflow types, validation         | Nothing from the workspace; no Node runtime | Any workspace package; DB; UI     |
| `packages/engine`     | Pure scheduling, execution, journal, simulation | `@krypton/schema`                           | DB; HTTP; UI; nodes; Node runtime |
| `packages/node-sdk`   | Public node contract and helpers                | `@krypton/schema`                           | Engine internals; DB; HTTP; UI    |
| `packages/nodes-core` | Built-in nodes                                  | Schema, engine types, node SDK              | DB; HTTP framework; UI            |
| `apps/api`            | HTTP API, auth, persistence, SSE                | All packages                                | `apps/web`                        |
| `apps/worker`         | Durable run execution                           | Engine, nodes, node SDK, schema             | `apps/web`                        |
| `apps/cli`            | Terminal workflow runner (Stage 1)              | Schema, engine, nodes-core                  | API; worker; web; DB; UI          |
| `apps/web`            | React editor                                    | Schema and node SDK types                   | Engine; DB; server framework      |
| `apps/docs`           | Documentation site                              | Docs content                                | Product runtime code              |

Boundaries are enforced by Oxlint `no-restricted-imports`, a declared
`@krypton/*` dependency map and pure-package import backstop in
`scripts/check-guardrails.ts`, and Turbo's `boundaries` check for undeclared
imports. See [`CONSTRAINTS.md`](../../CONSTRAINTS.md).

## Execution flow

1. The editor saves a workflow. The API validates it against the schema and
   stores an immutable workflow version.
2. A trigger creates an execution row. The API returns an execution ID.
3. The worker claims a queued execution with a lease. A crashed worker loses the
   lease and another worker can resume from the journal.
4. The engine walks the graph in deterministic order, calling node executors with
   inputs, parameters, a cancellation signal, and ports.
5. Each step appends to the journal: status, attempts, timings, input/output
   references, and a redacted error.
6. The API streams journal updates to the editor over SSE. The editor can reopen
   the run and read the same trace later.
7. Retries are explicit and bounded. Only an error marked `RetryableNodeError`
   is retried; the retry sleep uses the `Clock` port and every failed attempt is
   visible in the trace. A step that may have performed an external effect must
   use an idempotency key or be marked as non-retryable.
8. A node instance may set `timeoutMs` to bound each executor attempt. The engine
   aborts the attempt signal and records a readable failure at the deadline;
   timed-out work is not automatically retried because its effects may be
   uncertain.
9. A node instance may set `errorPolicy` to `fail`, `skip`, or `route`. The policy
   applies to executor failures, retry exhaustion, and timeouts. `fail` stops the
   run, `skip` drops the item with a skipped trace line, and `route` sends an
   error item to the fixed `error` output. A run can end `ok` when every failure
   was handled; the trace still records each failure. See
   [ADR 0021](../adr/0021-node-error-routes.md).

## Engine ports

The engine is a pure library. It receives the outside world through narrow ports:

- `Clock` — `now()` and `sleep(ms, signal)`. Retry delays use the injected clock,
  so a fake clock can advance deterministic time in tests.
- `Random` — seeded randomness and IDs.
- `Http` — outbound requests with a required timeout, a response-size cap, and a
  classified failure that says whether a retry is safe.
- `RunStore` — claim, checkpoint, and journal persistence.
- `Secrets` — resolve credentials without putting plaintext in the journal.

Stage 1 implements `Clock` and `Http`. `Clock.sleep` drives retries and generic
node deadlines without ambient timers in the engine. The CLI supplies the real
HTTP adapter; the engine and node tests use fake ports. `Random`, `RunStore`, and
`Secrets` arrive with their first consumer. The engine returns a trace (and,
later, journal events) rather than logging directly; the worker owns structured
logging and redaction. Tests use a simulation with fake ports. The engine never
reads `process.env`, calls `fetch`, uses `Date.now`, touches the database, or
opens its own network, timer, crypto, or console handles.

The HTTP adapter is the only code in Stage 1 that opens a network connection. It
blocks private and link-local addresses by default, pins the validated DNS
address, does not follow redirects, and enforces the request timeout and response
limit. The generic per-node deadline and HTTP request timeout are separate; see
[ADR 0014](../adr/0014-http-request-and-retries.md) and
[ADR 0015](../adr/0015-node-execution-timeouts.md).

## Data model summary

- `users`, `sessions` — single admin plus optional invited users.
- `workflows` — mutable metadata and the current version pointer.
- `workflow_versions` — immutable graph snapshots.
- `executions` — run status, timestamps, trigger, and lease owner.
- `execution_journal` — append-only events and step results.
- `credentials` — encrypted secrets and metadata, never returned in plaintext.
- `triggers` — manual, schedule, and webhook registrations.
- `settings` — instance configuration.

The exact SQL, indexes, and migration tool are decided in Stage 2.

## Stage map

| Stage | Outcome                                                                      |
| ----- | ---------------------------------------------------------------------------- |
| 0     | Foundation, quality gates, guardrails, ADRs                                  |
| 1     | Pure engine, expressions, simulation, expect and property tests, first nodes |
| 2     | API, Postgres, auth, workflow persistence                                    |
| 3     | React editor, design tokens, accessibility                                   |
| 4     | Triggers, queue, durable runs, recovery                                      |
| 5     | Node SDK, credentials, core integrations                                     |
| 6     | Look and feel polish                                                         |
| 7     | Security, performance, accessibility hardening                               |
| 8     | AI nodes (optional)                                                          |
| 9     | Docs site, packaging, release                                                |

The detailed exit criteria are in
[`research/06-roadmap.md`](../../research/06-roadmap.md).

## Non-goals for v1

- AI nodes, agents, or model providers in the core.
- Organisations, SSO, SCIM, billing, or a marketplace.
- Multi-tenant isolation beyond a single instance.
- Running untrusted code in the API or worker process.
- Kubernetes as a requirement.

## Open decisions

- API framework: [`docs/adr/0010-api-framework.md`](../adr/0010-api-framework.md).
- Code sandbox: [`docs/adr/0012-code-sandbox.md`](../adr/0012-code-sandbox.md).

The expression language, Stage 1 execution model, HTTP/retry slice, node
timeouts, Switch, Merge, Loop, and error routes are accepted in
[ADR 0011](../adr/0011-expression-language.md),
[ADR 0013](../adr/0013-engine-execution-model.md),
[ADR 0014](../adr/0014-http-request-and-retries.md),
[ADR 0015](../adr/0015-node-execution-timeouts.md),
[ADR 0016](../adr/0016-switch-node.md),
[ADR 0019](../adr/0019-merge-node.md),
[ADR 0020](../adr/0020-loop-node.md), and
[ADR 0021](../adr/0021-node-error-routes.md).
