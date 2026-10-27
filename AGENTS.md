<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Krypton agent instructions

Krypton is a clean-room, self-hosted visual workflow automation app. The v1
audience is public self-hosters; AI nodes are post-v1. Never copy source, node
definitions, JSON schemas, assets, screenshots, or branding from an existing
workflow tool.

## Commands

- `bun run check` — the fast gate: guardrails, format, lint, types, unit tests.
- `bun run test` / `bun run test:coverage` — unit tests / coverage tripwire.
- `bun run e2e` — Playwright smoke test (install Chromium first).
- `bun run guardrails:deleted-tests` — CI test-deletion/assertion-loss check.
- `bun run skills:install` — restore pinned skills from `skills-lock.json`.

Run `bun run check` before saying work is done, and show the command output.

## Layout and boundaries

`apps/web` is the React editor. `apps/api` is the HTTP control plane.
`apps/worker` runs executions. `packages/engine` is pure and deterministic.
`packages/schema` is shared types. `packages/node-sdk` is the public node
contract. `packages/nodes-core` holds built-in nodes. Read
`docs/architecture/overview.md` and `docs/adr/` before changing a boundary.

## Non-negotiables

- TypeScript strict. Parse at boundaries; do not use `any`, non-null assertions,
  or `as` casts outside reviewed boundary files such as
  `packages/schema/src/brand.ts`.
- `packages/engine` is pure: no `Date.now`, `Math.random`, `fetch`,
  `process.env`, DB, HTTP framework, UI, or Node runtime APIs. Use ports
  (`Clock`, `Random`, `Http`, `RunStore`, `Secrets`).
- No skipped tests, `.only`, deleted tests, or weakened assertions. Fix the test
  or get a reviewed allowlist entry.
- No lint/type suppressions. `scripts/guardrails-allowlist.json` is the only
  exception path and needs a human-reviewed reason.
- Never log, serialize, or return secrets. Credentials stay encrypted at rest.
- No raw HTML in the web app (`dangerouslySetInnerHTML` is blocked).
- Do not add dependencies casually. Pin exact versions, prefer releases at least
  two weeks old, and ask before a global install.
- Use Podman locally and `compose.yaml`; Docker is CI-only. No Docker-specific
  features.

## Tests

Default to an expect test: run the pure engine with fake ports and snapshot the
human-readable trace inline. Add unit tests for pure helpers; use Playwright for
browser flows. If a snapshot changes, inspect the diff and explain why.

## Agents

The main session orchestrates. Subagents (`code-reviewer`, `security-auditor`,
`test-engineer`, `explainer`) are advisory: they inspect the tree and report
findings, but do not edit files, run repository scripts/tests, or launch other
agents. Running the gate is the main session's job; paste failures into the
relevant review. Primary TDD workflow: pstack `tdd`. Primary review:
`code-review-and-quality`. Optional second review: `interrogate`. A human makes
the merge decision.

## Git and review

Keep changes small enough for a human to walk through. Do not push, force-push,
or commit to `main` without explicit permission. Every change needs a review,
and AGPL-3.0-only compatibility is a merge requirement.

## Definition of done

- `bun run check` passes.
- New behaviour has a failing-first test and a passing implementation.
- Boundaries and ADRs still describe the code.
- Docs/glossary updated for a new domain term.
- The diff is small enough for a human to walk through.
