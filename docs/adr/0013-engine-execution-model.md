# 0013 — Engine execution model: injectable nodes over an item queue

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner, engine implementation owner

> [ADR 0014](0014-http-request-and-retries.md) adds the `Http` port, bounded
> retries, and HTTP request timeouts. The queue model and the deferral of joins,
> loops, and error routes in this decision still stand.
> [ADR 0015](0015-node-execution-timeouts.md) adds a generic timeout for one
> node executor attempt.
> [ADR 0016](0016-switch-node.md) adds a built-in Switch that selects among the
> named output ports already supported by the queue model.

## Context

The Stage 1 engine must run a workflow from JSON in the terminal, with
deterministic tests and no UI, database, network, or ambient time. It must not
import the built-in node implementations: `packages/engine` depends on
`@krypton/schema` only, while `packages/nodes-core` depends on the engine's
node contract.

The first workflow is a manual trigger, a Set node, and an IF node. We need a
small model that supports named branch outputs without building a workflow
runtime into the engine.

## Decision

The engine executes an immutable, validated workflow with an injected node
registry.

- A workflow is a graph of node instances and directed connections. Connections
  may name a source port; the default port is `main`.
- The engine does not know node type names. A caller passes a
  `NodeRegistry` mapping a type string to a `NodeExecutor`.
- A node executor receives one item, the node's parameters, its ID and type, the
  engine ports, and an `AbortSignal`. It returns named output ports containing
  zero or more items, plus an optional human-readable detail for the trace.
- Nodes with no incoming connection are start nodes. If there is no start node,
  the run fails. Multiple start nodes execute in node-ID order with the same
  initial item.
- Execution is a FIFO item queue. Each queued entry is one node execution for one
  item. An output item follows every connection whose source port matches the
  output port. Items on an output port with no matching connection become run
  outputs.
- The engine records one trace line per execution. Timestamps come from the
  injected `Clock` port. Engine code never calls `Date.now`, timers, `fetch`,
  `Math.random`, `process`, or a logger.
- The engine validates an executor result at runtime before using it: named
  ports, JSON object items, and an optional string detail. An invalid result
  fails the run instead of being trusted because the TypeScript type says so.
- The first slice fails fast on an unknown node type, an executor error, a
  cancelled signal, or a run that exceeds a budget. Cancellation is checked
  before and after each executor; a cancelled result is not processed. The
  default step budget is 10,000 executions and the default queued-item budget is
  10,000 entries. Both are configurable in the internal run options. Retries,
  error ports, joins, and loop semantics arrive with their own decisions.
- The first slice has only the `Clock` port. `Random`, `Http`, `RunStore`, and
  `Secrets` are added when their first consumer exists, so the contract stays
  honest.
- The trace is the simulation journal. It is not yet a durable journal, and the
  engine does not persist it.

## Alternatives considered

- **Recursive depth-first execution** — simple for a tree, but awkward for
  multiple incoming edges and easy to recurse without bound.
- **A topological sort over the whole graph** — good for acyclic pipelines, but
  it does not model branch ports or per-item fan-out cleanly.
- **Switch on built-in node types inside the engine** — convenient, but it
  reverses the dependency boundary and makes third-party nodes a special case.
- **A whole-graph step function with merge semantics from day one** — more
  capable, but the join, loop, and retry rules are not decided yet.

## Consequences

- A node may execute more than once in a run, once per incoming item. Join and
  merge behaviour is intentionally undefined in this slice.
- Branching is expressed by connections, not by node-specific engine code.
- The engine is easy to test with fake node executors and a fake clock.
- Cycles can exhaust the step budget. That is a visible failure, not a silent
  hang; explicit loop semantics must come with a later ADR.
- Failures stop the run in this slice. Error routes and bounded retries need the
  journal and retry design before they can be added.
- The journal, persistence, and the remaining ports are Stage 1/Stage 4 work.

## Revisit when

- A workflow needs joins, loops, error routes, or bounded retries.
- The journal needs durable checkpoints or replay.
- A real node needs a port that the engine does not yet expose.
