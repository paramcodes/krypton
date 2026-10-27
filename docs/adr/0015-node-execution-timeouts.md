# 0015 — Generic per-node execution timeouts

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner, engine implementation owner

## Context

[ADR 0014](0014-http-request-and-retries.md) added the HTTP request timeout,
which protects the outbound socket, but left general node execution without a
deadline. A node can otherwise keep a run waiting forever. The engine must keep
timeouts deterministic in simulation and give a timed executor a chance to
release resources through its `AbortSignal`.

## Decision

- A node instance may set a top-level `timeoutMs` from 1 through 120,000. If
  omitted, there is no generic engine timeout.
- The timeout applies to one executor attempt, separately for every item and
  retry attempt. Parameter expression evaluation occurs before the executor
  attempt and is not included in this deadline.
- The engine races executor completion against `Clock.sleep(timeoutMs, signal)`.
  It gives each timed attempt a child `AbortSignal`; workflow cancellation
  aborts that child and remains distinguishable from timeout.
- When the deadline wins, the engine aborts the child signal, stops awaiting the
  attempt, and records `Node timed out after Nms.` on the node's failed trace
  line. A late result is ignored and cannot advance the workflow.
- Timeout failures are terminal, even if the node has a retry policy. A timed
  out external operation may have taken effect even though its completion is
  unknown; retrying it automatically could duplicate that effect.
- The engine cannot forcibly terminate executor code. Executors and adapters
  must honor the signal to stop their own work. A non-cooperative executor may
  continue in the background after the engine has failed the run.
- HTTP's `parameters.timeoutMs` remains an independent socket/request deadline.
  The node-instance `timeoutMs` is the wider engine deadline; whichever fires
  first determines the attempt failure.

## Alternatives considered

- **Rely only on each port's timeout** — protects known external operations but
  cannot bound a CPU-bound or stalled node that is not using a timed port.
- **Use ambient timers in the engine** — would make simulations depend on real
  time and violate engine purity. `Clock.sleep` is already injected and can be
  controlled by tests.
- **Retry a timed-out node automatically** — a timeout does not prove an
  external effect did not happen. Keep the timeout terminal until effect
  idempotency is explicitly modeled.
- **Treat timeout as forced termination** — JavaScript cannot safely stop
  arbitrary executor code. The signal is cooperative; isolation for untrusted
  code belongs in the separate Code-node sandbox decision.

## Consequences

- Workflow authors can bound a node's executor attempt without introducing
  timers or runtime APIs into the engine.
- Timed nodes receive a child signal rather than the run's signal directly. The
  engine links workflow cancellation to that child and cancels the timeout sleep
  when the attempt settles.
- The generic deadline does not replace HTTP adapter limits. HTTP requests still
  enforce their own socket timeout and response-size cap.
- Timeout behavior is deterministic with fake clocks, including cancellation
  and late-result tests.
- A timed-out non-cooperative executor can continue consuming resources after
  the run has failed; node authors must observe cancellation, and user code
  still requires an isolated sandbox.

## Revisit when

- The engine has durable execution and must persist deadline state across worker
  restarts.
- A node needs a timeout policy that spans all of its items or retry attempts,
  rather than one executor attempt.
- The worker needs hard termination for untrusted or non-cooperative code.
