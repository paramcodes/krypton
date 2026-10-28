# 0003 — Quality gate: Oxlint, Oxfmt, tsc, Vitest, Playwright, guardrails

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

The quality gate has to be fast enough to run on every save and strict enough
that an agent cannot quietly lower the bar. It must enforce package boundaries,
engine purity, types, tests, and formatting without a large ESLint plugin graph.

## Decision

`bun run check` runs, in order:

1. Guardrail scripts: forbidden patterns, engine purity, test deletion and
   assertion loss.
2. `oxfmt --check .`
3. `oxlint .`
4. `tsc --noEmit`
5. `vitest run`

Tooling is pinned: Oxlint 1.87.0, Oxfmt 0.72.0, TypeScript 7.0.2, Vitest 5.0.4,
Playwright 1.64.0. There is no ESLint or Prettier in the repo.

Package boundaries use Oxlint's built-in `no-restricted-imports` with custom,
actionable messages. A forbidden import says what to do instead, for example:
"Engine must stay pure. Pass a RunStore port instead." A custom plugin is not
needed for Stage 0.

The guardrail script rejects skipped/focused/disabled tests (`skip`, `only`,
`todo`, `fixme`, `skipIf`, `runIf`, including chained forms), `@ts-ignore`,
`@ts-expect-error`, `@ts-nocheck`, lint suppressions, and `as any` in
app/package/test code. Oxlint also enforces `ban-ts-comment` and
`consistent-type-assertions`; `packages/schema/src/brand.ts` is the only reviewed
assertion override. Inside `packages/engine` the script additionally rejects
`Date.now`, `new Date`, `Math.random`, `fetch`, `process`, `crypto`, `Buffer`,
`performance`, timers, `WebSocket`, `console`, and `require`. It also rejects
non-relative imports from the pure packages unless they are explicitly allowed
(`@krypton/schema`, plus `vitest` in test files and the reviewed `fast-check`
property-test exception). `react/no-danger` and the script reject raw HTML in
the web source.

The deleted-test script finds renames and copies with `git diff -M -C -z`, fails
a deleted test, a test renamed to a non-test path, or a modification that removes
more assertions than it adds. A doc-link check catches dead internal references
and rejects links that escape the repository root. Exceptions live in
`scripts/guardrails-allowlist.json` with a human-reviewed reason.

`scripts/check-guardrails.ts` also enforces a declared dependency map for
`@krypton/*` workspace edges, so an app cannot silently start importing a
forbidden package even if the import rule is missed. Turbo's experimental
`boundaries` command checks the opposite direction: every imported package must
be declared in the importing package's `package.json`. It is pinned with Turbo
2.11.7 and runs inside the guardrail step. During Stage 0 it found that both test
packages imported `vitest` without declaring it.

## Alternatives considered

- **ESLint + Prettier** — mature and extensible, but slower and more
  configuration-heavy. Oxlint covers the rules we need today.
- **Biome** — fast and cohesive, but the rule and plugin coverage we need for
  boundaries and TypeScript discipline is not there yet.
- **No custom scripts** — fewer moving parts, but then skipped tests, suppressions,
  and engine purity depend on review alone.
- **A custom Oxlint JS plugin** — unnecessary because `no-restricted-imports`
  supports paths, patterns, and messages.

## Consequences

- Oxlint has fewer rules than ESLint. We accept that and add a script when a rule
  is missing.
- Warnings fail because `denyWarnings` is on. This keeps the tree clean but can
  make upgrades noisier.
- The guardrail scripts are code. They have temp-repo regression tests, but they
  still need maintenance when the rules or Git output formats change.
- Formatting is checked, not enforced by an editor hook. `bun run format` fixes.

## Evidence

`scripts/check-guardrails.test.ts`, `scripts/check-deleted-tests.test.ts`, and
`scripts/check-doc-links.test.ts` run against temporary repositories. They cover
a forbidden package edge, a pure-package import, an engine timer/process/DOM
access, `@ts-nocheck`, a chained skipped test, a deleted test, a test renamed out
of the suite, a same-suite rename that loses an assertion, a broken link, and a
link that escapes the root. CI runs the coverage tripwire and validates the
compose file; the fast gate stays under ten seconds.

## Revisit when

- Oxlint lacks a rule that catches a real class of bug.
- The guardrail scripts produce false positives in normal work.
- Format or lint time grows beyond a few seconds on the Stage 0 tree.
