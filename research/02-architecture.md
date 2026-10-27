# 02. Architecture

Status: proposal. Every choice here becomes an ADR in Stage 0 or when we reach it. Labels: **[Recommended]** is my judgement, **[Verify]** needs a spike.

## 1. The shape of the system

```
┌──────────────┐   REST + SSE    ┌─────────────────┐   Queue    ┌──────────────┐
│  Editor (SPA)│ ──────────────► │   API server    │ ─────────► │   Workers    │
│  React Flow  │ ◄────────────── │  (Hono/Fastify) │            │ run engine   │
└──────────────┘  live run state └────────┬────────┘            └──────┬───────┘
                                          │                            │
                                          ▼                            ▼
                                   ┌─────────────┐              ┌─────────────┐
                                   │  Postgres   │ ◄────────────│ packages/   │
                                   │ (Drizzle)   │              │ engine (pure│
                                   └─────────────┘              │  library)   │
                                                                └─────────────┘
```

Stages 1 to 3 run the engine in the API process. Stage 4 moves it behind a queue to workers. The engine package does not change when that happens. That is the point of keeping it pure.

## 2. Packages (monorepo, pnpm + Turborepo)

| Package | Job | May import | Must not import |
|---|---|---|---|
| `packages/schema` | Zod schemas and branded types for workflows, nodes, items, executions | nothing internal | everything else |
| `packages/engine` | Graph validation, scheduling, executing nodes, retries, item flow | `schema` | DB, HTTP framework, `Date.now`, `Math.random`, `fetch` directly |
| `packages/nodes-core` | Built-in nodes (HTTP, IF, Switch, Merge, Set, Code, Wait, Cron, Webhook) | `schema`, `engine` types | DB, UI |
| `packages/node-sdk` | The contract third parties use to write nodes | `schema` | `engine` internals |
| `apps/api` | HTTP, auth, persistence, queue adapters | all packages | UI |
| `apps/worker` | Pulls jobs, calls engine with real ports | engine, nodes, api adapters | UI |
| `apps/web` | The editor | `schema`, `node-sdk` types | `engine`, DB |
| `apps/docs` | The wiki | none at runtime | none |

**Boundary rules are enforced by lint, not by a doc.** A forbidden import fails CI with a message that tells the agent what to do instead. This is the "encode lessons in structure" rule from pstack, and it is what the video says about a typed kernel enforcing global invariants. An example message: `engine must not import from "drizzle-orm". Pass a RunStore port instead (see packages/engine/src/ports.ts).`

## 3. Make illegal states unrepresentable

These shapes are illustrative. The real ones are written in Stage 1.

```ts
// Branded IDs: a NodeId cannot be passed where a WorkflowId is expected.
type Brand<T, B extends string> = T & { readonly __brand: B };
export type WorkflowId  = Brand<string, "WorkflowId">;
export type NodeId      = Brand<string, "NodeId">;
export type ExecutionId = Brand<string, "ExecutionId">;

// Secrets cannot be logged or serialised by accident.
export class SecretString {
  #value: string;
  constructor(v: string) { this.#value = v; }
  reveal(): string { return this.#value; }       // only the credential layer calls this
  toJSON() { return "[redacted]"; }
  toString() { return "[redacted]"; }
}

// An execution is a state machine. Impossible combinations do not typecheck.
export type Execution =
  | { status: "queued";    id: ExecutionId; queuedAt: Instant }
  | { status: "running";   id: ExecutionId; startedAt: Instant; current: NodeId[] }
  | { status: "succeeded"; id: ExecutionId; startedAt: Instant; finishedAt: Instant }
  | { status: "failed";    id: ExecutionId; startedAt: Instant; finishedAt: Instant; error: RunError }
  | { status: "cancelled"; id: ExecutionId; cancelledAt: Instant };
// "succeeded" with an error, or "queued" with a finishedAt, cannot be written.

// A connection links a real output port of one node to a real input port of another.
export type Connection = {
  from: { node: NodeId; port: OutputPortName };
  to:   { node: NodeId; port: InputPortName };
};
```

Rules that go in `AGENTS.md` and into lint where possible:
1. Parse at the boundary. Every HTTP body, DB row, webhook payload and node output is parsed with Zod once, then trusted inside.
2. Switch on a discriminant and make it exhaustive (`satisfies never` in the default branch).
3. No `any`. No non-null assertions outside tests. No `as` casts except in one reviewed file per boundary.
4. Business logic lives in pure functions. Guards live at the edges.

## 4. The engine

### 4.1 Data model (our own design)

- **Workflow**: `{ id, name, version, nodes[], connections[], settings }`. Versioned and immutable once published. Editing creates a draft.
- **Node instance**: `{ id, type, typeVersion, name, position, params, credentialRef? }`. `typeVersion` lets node behaviour evolve without breaking saved workflows.
- **Item**: `{ json: Record<string, unknown>, binary?: BinaryRef, meta: { sourceNode, sourceItemIndex } }`. The `meta` field gives us "where did this value come from", which powers the data inspector and error messages.
- **Run (execution)**: the state machine above plus a **node-run journal**: one row per node per attempt with input, output, error, timings. This journal is the single most valuable table in the product. It feeds the inspector, retries, resume, and tests.

### 4.2 Ports (everything the engine needs from the outside)

```ts
export interface Ports {
  clock:  { now(): Instant; sleep(ms: number, signal: AbortSignal): Promise<void> };
  random: { uuid(): string; float(): number };
  http:   { request(req: HttpRequest, signal: AbortSignal): Promise<HttpResponse> };
  store:  RunStore;          // append node-run journal, load run, save state
  secrets: SecretResolver;   // resolves a credentialRef to a SecretString
  log:    Logger;
}
```

Production passes real implementations. Tests pass a **simulated** set: a clock you advance by hand, an HTTP fake that fails on the third call, a store that "crashes" after N writes. That is the library-level deterministic simulation the video describes, and it is how we test retries, timeouts, resume after crash and idempotency in milliseconds.

### 4.3 Executing a run

1. **Validate** the graph: no dangling connections, no cycles unless through a Loop node, every node type exists, every param passes the node's schema.
2. **Plan**: topological order with branching. Nodes with several inputs wait for all their live inputs (Merge semantics are explicit, not implicit).
3. **Run each node** with an `AbortSignal`, a per-node timeout, and the retry policy from settings. Write a journal row before and after.
4. **Pass items** along the chosen output port. IF and Switch choose ports; others have one.
5. **On error**: apply the node's error policy (stop, continue, route to an error output). If the run fails, trigger the workflow's error handler if one is set.
6. **Resume**: because the journal is the source of truth, a crashed run can be resumed from the last finished node. Nodes declare whether they are idempotent. Non-idempotent nodes get an idempotency key.

Dependency-free scheduling (no framework) keeps this readable. If the ADR in Stage 4 picks DBOS, Inngest or Temporal instead, the journal moves into that tool and the `RunStore` port adapts.

### 4.4 Expressions

Users write expressions in node params, e.g. `{{ $input.item.json.email }}`. Our own syntax and variable names, not n8n's. Two options, decide in a Stage 1 spike **[Verify]**:
- a tiny expression language we own and parse (safest, smallest attack surface, less powerful);
- evaluate a restricted JavaScript subset in a sandbox (more powerful, bigger risk).

Recommended start: our own small language with a fixed set of functions, plus the Code node for real JavaScript in a sandbox.

### 4.5 The Code node and sandboxing **[Verify]**

Running user JavaScript in the API process is a remote-code-execution hole. Options to spike in Stage 1 and decide by ADR: an isolated V8 isolate library, a WASM JavaScript runtime, or a separate locked-down worker container with no network and a memory and time cap. Until the sandbox passes the Stage 7 security review, the Code node is disabled by default in any shared deployment.

## 5. Persistence

Postgres with Drizzle **[Recommended]**. Tables: `workflows`, `workflow_versions`, `executions`, `node_runs` (the journal), `credentials`, `users`, `webhooks`, `schedules`. SQLite for local dev is tempting; avoid it unless we keep both in CI, because behaviour differs.

- Credentials: encrypted at rest with an app key from the environment, envelope encryption if we later add a KMS. Never returned by the API after creation. Never in workflow JSON.
- Large payloads: store binary data outside the row (disk or object storage), keep a reference in the item.
- Retention: a setting for how long node-run payloads are kept, because the journal grows fast.

## 6. Security checklist (owned by the security-auditor agent, reviewed by a human)

- SSRF: the HTTP node blocks private and link-local ranges by default, with an allow-list setting.
- Webhooks: unguessable path, optional HMAC signature check, rate limit, body size limit.
- Credentials: encrypted, redacted in logs and journal, scoped per user or project.
- Expressions and Code node: sandboxed, time and memory capped.
- Auth: sessions or tokens with sensible expiry; CSRF protection for cookie sessions; role checks on every route.
- Supply chain: pin versions, review new dependencies, run a malware advisory check on installs. Pinning to versions at least two weeks old is a good habit.
- Output: all user-supplied strings rendered through an escaping type, never `dangerouslySetInnerHTML`.

## 7. Realtime run view

SSE (or WebSocket) stream per execution: `node.started`, `node.finished`, `node.failed`, `run.finished`, each carrying the journal row id. The editor paints node states from the stream. On reconnect it replays from the journal, so the UI never depends on having seen every event.

## 8. Testing the engine (expect tests)

A helper runs a workflow with the simulated ports and **prints a readable trace**:

```ts
it("retries a flaky HTTP node then continues", async () => {
  const trace = await runSim(workflow, { http: flakyUntilAttempt(3) });
  expect(trace).toMatchInlineSnapshot(`
    t=0ms    webhook      ok    1 item
    t=0ms    http         fail  attempt 1  503
    t=1000ms http         fail  attempt 2  503
    t=3000ms http         ok    attempt 3  200  1 item
    t=3000ms set          ok    1 item
    run succeeded
  `);
});
```

When an agent changes retry behaviour, the diff shows the changed timings. The reviewer reads behaviour, not just code. Output must be designed to be read: short lines, aligned columns, one fact per line. Layer on property tests (fast-check) for graph validation and item flow **[Verify the library choice]**, and Playwright tests for the editor.
