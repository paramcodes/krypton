# Documentation

Start here:

- [Architecture overview](architecture/overview.md) — system shape, package
  boundaries, execution flow.
- [How the engine works](learn-by-reading/01-how-the-engine-works.md) — the
  Stage 1 teach-back: follow one item through the queue and see why ports and
  simulation keep the engine testable.
- [Glossary](GLOSSARY.md) — plain-language definitions.
- [Expressions](expressions.md) — the safe field syntax and its limits.
- [HTTP requests](http-requests.md) — the HTTP Request node, retries, and the
  outbound security boundary.
- [Error policies and error routes](error-routes.md) — fail, skip, or route a
  failed node item to a recoverable path.
- [Error route specification](specs/error-routes.md) — the exact policy, error
  item, and trace contract.
- [Node timeout specification](specs/node-timeouts.md) — the per-attempt
  execution deadline contract.
- [Switch node](nodes/switch.md) — exact scalar matching over named output ports.
- [Merge node](nodes/merge.md) — append-only fan-in without a wait barrier.
- [Loop over items](nodes/loop.md) — bounded per-item body execution with
  collected results.
- [Node catalog](nodes/catalog.md) — the port and parameter metadata contract
  for the future editor.
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
