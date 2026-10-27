# 0012 — Code node sandbox: isolated runtime, never the API process

- Status: proposed
- Date: 2026-10-27
- Deciders: project owner, security reviewer, engine implementation owner

## Context

A Code node is useful, and users will expect JavaScript. It is also the largest
security surface in the product: untrusted code, secrets nearby, network access,
and a shared worker process. Running user code with `node:vm` is not a security
boundary. The sandbox must survive malicious code, not just buggy code.

## Options

- **`node:vm`** — not a security boundary; do not use it for untrusted code.
- **`isolated-vm`** — native V8 isolates, fast, Node-specific. Requires a native
  build and careful memory/CPU limits.
- **QuickJS compiled to WebAssembly** — portable, strong isolation, slower, no
  native build. Good for small transforms.
- **Separate process or container** — strongest operational boundary, higher cold
  start, more moving parts. Can combine with one of the runtimes above.
- **Deno subprocess with permissions** — capable, but adds a second runtime to
  the distribution.

## Decision

Not final. The product decision is that user code never runs in the API or worker
process. The implementation choice is deferred to a Stage 1/4 spike.

The spike must evaluate:

1. Escape resistance and the test suite of known attacks.
2. CPU, memory, wall-clock, and output-size limits.
3. Network denial by default and an explicit allowlist if we ever support it.
4. Access to secrets only through an explicit input, never the process environment.
5. Cold start and throughput for small transforms.
6. Portability across the supported OCI image and Node 26.
7. Determinism options for tests and replay.
8. The operational cost for a single-machine self-hoster.

## Leading direction

Prefer a separate process or container boundary around a memory-safe runtime
(QuickJS/WASM or an isolate), rather than relying on language-level tricks. If the
cold start is unacceptable, measure `isolated-vm` with hard limits before
choosing it.

## Consequences until decided

- No Code node in v1 until the sandbox exists and passes escape tests.
- The worker must not expose secrets or the database to the sandbox.
- The sandbox image or subprocess is an operational dependency; document it.
- A failed sandbox spike means the Code node slips, not that we weaken isolation.

## Revisit when

- The Stage 1/4 spike completes.
- A maintained sandbox runtime meets the criteria with acceptable cold start.
- Self-hosters report that the operational cost is too high.
