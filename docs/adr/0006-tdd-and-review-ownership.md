# 0006 — Primary TDD and review skill ownership

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

Two skill packs are installed: Addy Osmani's lifecycle pack and pstack. Both have
valuable TDD and review guidance, and both can be right in different contexts.
Running both as co-primary workflows creates conflicting instructions, duplicated
review passes, and agent drift.

## Decision

- **Primary TDD workflow:** pstack `tdd`. Use a failing test, the smallest
  implementation, then refactor. Keep each step verifiable.
- **Primary review:** Addy `code-review-and-quality`. Review correctness,
  readability, architecture, security, performance, and tests, then report
  findings by severity.
- **Optional second review:** pstack `interrogate` for a fresh-context adversarial
  pass on high-risk changes.
- **Security review:** the `security-auditor` subagent, especially for auth,
  credentials, webhooks, outbound HTTP, and the Code node.
- **Human approval:** required. No agent approves or merges its own work.
- The main session orchestrates. Subagents do not launch other subagents.
- Addy's `test-driven-development` skill is installed but is not the primary
  workflow. Do not run two TDD workflows on the same change.

## Alternatives considered

- **Addy lifecycle as primary** — stronger for greenfield specification and
  planning, but heavier per change and overlaps with the pstack principles.
- **pstack only** — coherent, but the Addy review rubric is broader and easier to
  hand to a human reviewer.
- **Addy only** — good lifecycle coverage, but pstack's small-step TDD and
  interrogation style fit the engine work better.
- **No prescribed workflow** — maximum flexibility, minimum consistency.

## Consequences

- The primary workflow must be named in `AGENTS.md` and in review requests.
- The optional second review should be reserved for risky changes, not every PR.
- Skill updates can change behavior. Review the diff before accepting an update.
- If a change is mostly specification or product discovery, use the planning
  skills, then return to pstack `tdd` for implementation.

## Revisit when

- The primary workflow proves too heavy or too light after Stage 2.
- A skill update changes the workflow materially.
- A production incident reveals a review gap the primary rubric missed.
