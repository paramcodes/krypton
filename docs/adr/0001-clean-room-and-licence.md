# 0001 — Clean-room policy and AGPL-3.0-only licence

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner

## Context

Krypton is a self-hosted workflow automation product. The market has mature
tools, and it would be easy to copy their source, node definitions, JSON schemas,
assets, screenshots, or branding. Doing so would create legal risk, make the
product derivative, and undermine the reason to build it: a clean, observable,
self-hosted alternative with its own interface and decisions.

The licence also determines who can build on Krypton. Public self-hosters are the
v1 audience; a hosted competitor should not be able to take the code closed
without contributing back.

## Decision

Build Krypton clean-room and license it **AGPL-3.0-only**.

- Do not copy source code, node definitions, workflow JSON schemas, assets,
  screenshots, or branding from any existing workflow tool.
- Use public documentation and observable behaviour as inputs, then write
  original code and original copy.
- Record provenance in the PR when a change is inspired by a specific public
  source. When in doubt, ask before merging.
- Check dependency licences for AGPL compatibility. Do not add a dependency
  that cannot be distributed under AGPL-3.0-only.
- Run a trademark search before the first public release. "Krypton" is a working
  name until then.
- Use a DCO or a small contributor agreement before accepting external
  contributions; decide which before the first outside PR.

## Alternatives considered

- **MIT or Apache-2.0** — easier for commercial adoption, but a hosted competitor
  could take the code closed. That conflicts with the self-hosting audience and
  the reciprocity goal.
- **GPL-3.0** — strong copyleft, but it does not cover network use. A hosted
  service could run modified Krypton without publishing changes.
- **AGPL-3.0-or-later** — compatible with more future versions, but "or later"
  introduces uncertainty about terms we have not read. "Only" is clearer.
- **Proprietary** — not compatible with the open, self-hosted goal.

## Consequences

- Network use triggers source-availability obligations. The README and release
  notes must explain this in plain language.
- Some dependencies and code snippets are off-limits. The review must check
  provenance, not just tests.
- Contributors need to accept the licence and provenance rules.
- Clean-room discipline is slower at the start and cheaper than a legal rewrite
  later.

## Revisit when

- Legal review finds a conflict with a required dependency.
- The trademark search rejects the working name.
- The project chooses a different contributor agreement or licence policy.
