# 0002 — Monorepo, Bun, Node, Turbo, and strict TypeScript

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

We need one repository for the API, worker, editor, documentation, shared
schema, pure engine, node SDK, and built-in nodes. The install must be fast,
workspace isolation must be strict enough to catch undeclared dependencies, and
the runtime must be boring enough for self-hosters and native modules.

## Decision

- **Bun 1.4.4** installs dependencies and runs repo scripts. `bunfig.toml` uses
  `linker = "isolated"` and `hoist = false`.
- **Node 26** runs the API, worker, CLI, and tests. Bun is not the production
  runtime.
- **Turborepo 2.11.7** orchestrates tasks across the workspace. The version must
  stay at or above 2.10.3 for Bun lockfile v2 support.
- **TypeScript 7.0.2** with the strict settings in `tsconfig.base.json`,
  including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noPropertyAccessFromIndexSignature`, and `verbatimModuleSyntax`.
- Workspaces live in `apps/*` and `packages/*`; package names use the
  `@krypton/` scope.

## Alternatives considered

- **pnpm** — mature workspace isolation and a large ecosystem. We chose Bun for
  install speed and one tool for install, scripts, and tests. The isolated linker
  keeps the dependency discipline pnpm users expect.
- **npm or Yarn** — workable, but slower installs and less convenient for the
  TypeScript-only workflow.
- **Bun as the production runtime** — faster startup, but a younger native-module
  and debugging story. Node 26 is the safer default for self-hosters.
- **TypeScript 5/6** — proven, but TypeScript 7 is stable and materially faster
  for a monorepo. The strict flags we rely on are supported.

## Consequences

- The isolated linker may reveal packages that imported undeclared dependencies.
  That is the point. If a tool breaks, relax `hoist` only with a documented
  reason and a follow-up.
- CI installs both Bun and Node. `bun install --frozen-lockfile` is the install
  gate.
- `bun run build` is a typecheck placeholder until the first deployable app
  exists. The tasks in `turbo.json` describe the intended graph; Stage 0 uses
  Turbo for workspace discovery and boundaries, and package scripts activate the
  tasks as apps appear. Real build tasks and Turbo caching arrive with Stage 2.
- The root `tsconfig` includes Node types for scripts/e2e and DOM/JSX for the
  future editor. Runtime purity in schema/engine/node-sdk is enforced separately
  by import and global guardrails. Per-package `types` isolation is a follow-up
  if the workspace grows libraries that need different ambient types.
- A major TypeScript upgrade needs a dedicated PR because type-only changes can
  surface across the whole workspace.

## Revisit when

- A critical tool cannot work with the isolated linker.
- Node 26 is unavailable on a supported self-hosting target.
- Bun changes the lockfile format again or Turbo drops support for it.
