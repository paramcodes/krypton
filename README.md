# Krypton

Krypton is a self-hosted visual workflow automation app for people who want to
run automations on their own hardware without giving up observability, version
control, or a clean interface.

Status: **Stage 1 — pure engine and terminal runner in progress**. The repo has
the monorepo, quality gates, guardrails, architecture decisions, and agent setup.
The engine can run a validated workflow from JSON with the first built-in nodes,
safe whole-field expressions, bounded retries, and an HTTP Request node. The API,
editor, and worker are later stages.

## Why

- Self-hosters first: one admin, optional invited users, no organisations, SSO,
  or billing in v1.
- Observability as a feature: every run has a trace you can read and replay.
- Boring reliability: durable runs, idempotent steps, explicit retries.
- A distinct, accessible interface, not a generic AI-generated dashboard.
- AI nodes are post-v1. The core must work without a model provider.

## Clean-room

Krypton is built from public behaviour and documentation. We do not copy source
code, node definitions, JSON schemas, assets, screenshots, or branding from any
existing workflow tool. Contributions that cannot meet that bar are rejected.

## Quick start

Requirements: Bun 1.4.4, Node 26, and Podman for containers (Docker works in CI).

```sh
bun install
bun run check
bun run cli -- run examples/triage.workflow.json --input examples/triage.input.json
bunx playwright install chromium
bun run e2e
```

`bun run check` runs guardrails, formatting, linting, typechecking, and unit
tests. It should stay under 10 seconds on the current tree. The Playwright
browser is installed separately because it is a large download.

If the project skills are missing:

```sh
bun run skills:install
bun run skills:list
```

## Postgres (optional until Stage 2)

```sh
cp .env.example .env
podman compose up -d postgres
podman compose down
```

The compose file binds Postgres to `127.0.0.1` and uses a named volume. Change
the password in `.env` before exposing anything beyond localhost; the example
value is a placeholder.

## Layout

| Path                  | What it is                                       |
| --------------------- | ------------------------------------------------ |
| `apps/api`            | HTTP API and control plane (Stage 2)             |
| `apps/cli`            | Terminal workflow runner (Stage 1)               |
| `apps/web`            | React editor (Stage 3)                           |
| `apps/worker`         | Durable execution worker (Stage 4)               |
| `apps/docs`           | Documentation site (Stage 9)                     |
| `packages/engine`     | Pure execution engine and simulation             |
| `packages/schema`     | Shared types, brands, and validation             |
| `packages/node-sdk`   | Public node contract (Stage 5)                   |
| `packages/nodes-core` | Built-in nodes (Stage 1+)                        |
| `docs/`               | ADRs, architecture, glossary, and learning notes |
| `research/`           | Source research; not product code                |

## Quality gates

- `bun run check` — guardrails, dependency boundaries, doc links, format check,
  lint, types, and unit tests.
- `bun run test:coverage` — unit tests with the engine coverage tripwire.
- `bun run e2e` — Playwright smoke test; install Chromium first with
  `bunx playwright install chromium`.
- `bun run guardrails:deleted-tests` — CI deletion/assertion-loss check.
- `bun run build` — typecheck placeholder until the first deployable app exists.

Package dependency edges, engine purity, skipped tests, `@ts-nocheck`, all type
assertions except the reviewed `packages/schema/src/brand.ts` boundary, and `any`
are enforced. The guardrail scripts have temp-repo regression tests in
`scripts/*.test.ts`. CI runs the coverage tripwire, the deleted-test check, and
`docker compose config`. See [`CONSTRAINTS.md`](CONSTRAINTS.md) and
[`docs/adr/`](docs/adr/README.md).

## Docs

- [`docs/architecture/overview.md`](docs/architecture/overview.md)
- [`docs/expressions.md`](docs/expressions.md)
- [`docs/http-requests.md`](docs/http-requests.md)
- [`docs/learn-by-reading/README.md`](docs/learn-by-reading/README.md)
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md)
- [`docs/adr/`](docs/adr/README.md)
- [`docs/spikes/README.md`](docs/spikes/README.md)
- [`examples/`](examples/README.md)
- [`AGENTS.md`](AGENTS.md) and [`CONSTRAINTS.md`](CONSTRAINTS.md)

## Licence

AGPL-3.0-only. See [`LICENSE`](LICENSE). Krypton is a working name; a trademark
search comes before the first public release.
