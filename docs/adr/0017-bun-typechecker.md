# 0017 — Bun's built-in TypeScript checker for the fast gate

- Status: accepted
- Date: 2026-10-28
- Deciders: project owner, tooling owner

## Context

`bun run check` is the fast inner-loop gate. Its `typecheck` step ran
`tsc --noEmit`, starting the pinned TypeScript compiler on every pass. Bun
1.4.4 ships a built-in `bun check` that reads the nearest `tsconfig.json`,
follows project references, reports TypeScript diagnostics, and uses all CPU
cores.

Bun 1.4.4 embeds TypeScript 7.0.2, the version this repository pins. A parity
check on the current tree found that both checkers cover the same 37 project
files. Probe errors for `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitAny`, and plain assignment mismatch were identical in text and line
positions.

The root `package.json` also defines a `check` script, so Bun treats `bun check`
as a request to run that script. The built-in checker needs `--no-script`.

## Decision

- Set `typecheck` to `bun check --no-script`.
- Keep `build` as `tsc --noEmit`, and keep the CI build job. This is the
  authoritative check against the pinned TypeScript version.
- Do not switch `build` to `bun build`. The current build is a no-emit type
  verification; `bun build` bundles and emits artifacts, which is a different
  contract.
- Move the Bun and TypeScript pins together when upgrading either. The build
  gate catches checker drift.

## Alternatives considered

- **Keep `tsc --noEmit` everywhere** — correct, but slower for every fast-gate
  pass. On this repository the standalone checker takes roughly 1.3 seconds with
  `tsc` and 0.3–0.5 seconds with `bun check`.
- **Use `bun check` for both typecheck and build** — removes the independent
  check against the pinned `typescript` package, so a Bun upgrade could silently
  change what the build gate verifies.
- **Replace `build` with `bun build`** — changes the command from verification
  to artifact production and requires entry points, targets, and output review
  the repository does not yet define.
- **Run tsc through Bun (`bunx tsc --noEmit`)** — uses Bun as a package runner
  only and keeps the same compiler cost.

## Consequences

- Fast-gate typechecking takes about a third of the time with the same
  diagnostics on the checked-in project.
- Two checkers now exist: Bun's embedded checker for quick feedback and the
  pinned `tsc` for the build gate. They must stay aligned.
- CI already reads the Bun version from `.bun-version`, so the embedded checker
  matches local development.
- `--no-script` is required because the root `check` script shadows Bun's
  built-in command.
- The build command remains a typecheck rather than a production build. A real
  build and artifact pipeline remains separate work.

## Revisit when

- Bun's embedded TypeScript version differs from the pinned `typescript`
  package.
- A real build pipeline needs emitted artifacts.
- Checker diagnostics or performance diverge enough to make the split confusing.
