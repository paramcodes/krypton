# Documentation

Start here:

- [Architecture overview](architecture/overview.md) — system shape, package
  boundaries, execution flow.
- [Glossary](GLOSSARY.md) — plain-language definitions.
- [Expressions](expressions.md) — the safe field syntax and its limits.
- [Architecture decision records](adr/README.md) — why the foundation looks like
  this, and when to revisit.
- [Spikes](spikes/README.md) — open questions and the evidence needed to close
  them.

The original research notes are in [`research/`](../research). They are source
material, not product documentation; do not treat an idea there as a decision
until it is recorded in an ADR.

## Writing style

- Explain the problem before the solution.
- Prefer concrete examples and trade-offs over adjectives.
- Record the alternative you rejected and why.
- Keep a beginner in the room: define a term the first time it appears, then
  link to the [glossary](GLOSSARY.md).
- If a decision changes, update the ADR and link the replacement. Do not rewrite
  history silently.
