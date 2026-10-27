# Architecture decision records

An ADR records a decision that is expensive to reverse or easy to forget. Each
record states the context, the choice, the alternatives, and what the choice
costs us. A decision can be revisited; it cannot be silently ignored.

## Statuses

- **proposed** — under discussion; do not build on it yet.
- **accepted** — the current default.
- **superseded** — replaced by a newer ADR; keep the history.
- **rejected** — considered and declined; keep the reason.

## Template

```md
# NNNN — Title

- Status: proposed
- Date: YYYY-MM-DD
- Deciders: names or roles

## Context

What problem are we solving? What constraints apply?

## Decision

What will we do? Be specific enough to act on.

## Alternatives considered

What did we reject, and why?

## Consequences

What becomes easier, what becomes harder, and what must we maintain?

## Revisit when

Name the evidence or event that should reopen this decision.
```

## Index

| ADR                                         | Decision                                                      | Status   |
| ------------------------------------------- | ------------------------------------------------------------- | -------- |
| [0001](0001-clean-room-and-licence.md)      | Clean-room policy and AGPL-3.0-only licence                   | accepted |
| [0002](0002-monorepo-bun-node-turbo.md)     | Monorepo, Bun, Node, Turbo, and strict TypeScript             | accepted |
| [0003](0003-quality-gate.md)                | Oxlint, Oxfmt, tsc, Vitest, Playwright, and guardrail scripts | accepted |
| [0004](0004-design-tokens-and-icons.md)     | Semantic design tokens and Phosphor icons                     | accepted |
| [0005](0005-test-strategy.md)               | Expect tests, simulation, integration tests, and Playwright   | accepted |
| [0006](0006-tdd-and-review-ownership.md)    | Primary TDD and review skill ownership                        | accepted |
| [0007](0007-containers-and-distribution.md) | Podman locally, Docker in CI, OCI and compose                 | accepted |
| [0008](0008-agent-harness.md)               | OpenCode-only, project-local agents and skills                | accepted |
| [0009](0009-docs-site.md)                   | Starlight for the documentation site                          | accepted |
| [0010](0010-api-framework.md)               | API framework: Hono candidate, Fastify fallback               | proposed |
| [0011](0011-expression-language.md)         | Expression language: small safe language before sandboxed JS  | accepted |
| [0012](0012-code-sandbox.md)                | Code node sandbox: isolated runtime, not the API process      | proposed |
| [0013](0013-engine-execution-model.md)      | Engine execution model: injectable nodes over an item queue   | accepted |
| [0014](0014-http-request-and-retries.md)    | HTTP Request node, bounded retries, and the Http port         | accepted |
