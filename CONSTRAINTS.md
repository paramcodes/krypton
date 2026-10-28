# Constraints

This is the quality bar. Tools enforce it where possible; review enforces the
rest. If a constraint blocks a legitimate change, change the constraint through
an ADR. Do not bypass it.

## Clean-room

- No copied source, node definitions, JSON schemas, assets, screenshots, or
  branding from an existing workflow tool.
- Use public behaviour and documentation, then write original code and copy.
- Enforced by review and [ADR 0001](docs/adr/0001-clean-room-and-licence.md).

## Runtime and packages

- Bun 1.4.4 installs dependencies and runs repo scripts.
- Node 26 runs the API, worker, CLI, and tests.
- Turborepo 2.11.7 orchestrates tasks. TypeScript 7.0.2 is strict.
- `bun run typecheck` uses Bun's built-in checker for fast feedback. `bun run
  build` keeps the pinned `tsc --noEmit` as the authoritative typecheck.
- Pin exact versions and prefer releases at least two weeks old.
- Pin GitHub Actions to commit SHAs, with the tag in a comment.
- No global installs without asking. Project-local tools only.
- Enforced by `package.json`, `bun.lock`, `bunfig.toml`, `.bun-version`, the
  workflow, [ADR 0017](docs/adr/0017-bun-typechecker.md), and review.

## Boundaries and engine purity

- `packages/schema` depends on no other workspace package and no Node runtime.
- `packages/engine` may import `@krypton/schema` only. It must not import DB,
  HTTP frameworks, UI, built-in nodes, or Node runtime APIs.
- `packages/node-sdk` may import `@krypton/schema` only.
- `packages/nodes-core` may import schema, engine types, and the node SDK; it
  must not import DB, HTTP frameworks, or UI.
- `apps/web` may import schema and node SDK types; it must not import the engine,
  database, or server framework.
- `apps/cli` may import schema, engine, and nodes-core; it must not import the
  API, worker, web editor, database, or UI.
- Server apps must not import the web editor.
- The engine uses ports: `Clock`, `Random`, `Http`, `RunStore`, `Secrets`.
  Ports are added with their first consumer; Stage 1 starts with `Clock`.
- Enforced by Oxlint `no-restricted-imports` with actionable messages,
  `scripts/check-guardrails.ts` for the declared `@krypton/*` dependency map and
  pure-package imports, and `turbo boundaries` for undeclared imports.

## Types

- `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature`, and `verbatimModuleSyntax`.
- No `any`, no non-null assertions, and no `as` casts outside the reviewed
  `packages/schema/src/brand.ts` boundary. No `@ts-ignore`, `@ts-expect-error`,
  or `@ts-nocheck`.
- Parse untrusted data once at the boundary, then pass typed values inward.
- Prefer exhaustive switches and discriminated unions over optional flags.
- Enforced by `tsc`, Oxlint `consistent-type-assertions`/`ban-ts-comment`, and the
  guardrail script.

## Tests

- New behaviour starts with a failing test.
- Expect tests run the pure engine with fake ports and snapshot the readable
  trace inline.
- No skipped/focused tests, deleted tests, renames out of the test suite, or lost
  assertions.
- Engine coverage stays at or above 90% lines, functions, branches, and
  statements.
- Browser flows get Playwright tests; the smoke test must keep working.
- Guardrail scripts have temp-repo regression tests in `scripts/*.test.ts`.
- Enforced by Vitest, coverage thresholds in CI, Oxlint's Vitest rules, the
  guardrail scripts, and the deleted-test script.

## Security and privacy

- Credentials are encrypted at rest and never returned by the API, logged, or
  put in traces.
- Validate all external input. Treat webhook bodies, imported workflows, and
  node parameters as untrusted.
- Never inject raw HTML. The web app must not use `dangerouslySetInnerHTML`.
- Outbound HTTP gets explicit timeouts, size limits, and SSRF protection.
- Run user code in a sandbox, never in the API or worker process.
- Enforced by review, `security-auditor`, and tests added with each surface.

## UX and accessibility

- Keyboard-first, WCAG 2.2 AA, light and dark themes from day one.
- Use semantic tokens, never hard-coded colours in components.
- No layout shift when a run updates or a panel opens.
- Planned budgets: editor interactive under 2 seconds on mid-range hardware;
  canvas interaction at 60 fps; no full-graph re-render on node drag.
- Enforced by review and Playwright until the first budget tests land.

## Operations

- Runs are durable and resumable; steps are idempotent where possible.
- Retries are bounded and visible. Do not hide failures.
- Structured logs, health checks, and an execution journal are part of the
  product, not an afterthought.
- Podman locally, Docker in CI, provider-neutral `compose.yaml`, OCI images. No
  Docker-specific features.
- Enforced by Stage 4/6 tests and review.

## Exceptions

Add an entry to `scripts/guardrails-allowlist.json` with `file`, `rule`, and a
human-reviewed `reason`. Remove it when the underlying issue is fixed. Inline
`@ts-ignore`, `eslint-disable`, and `oxlint-disable` comments are not an
exception path.
