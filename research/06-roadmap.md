# 06. Multi-stage roadmap

Sizes are relative (S, M, L), not calendar promises. Each stage ends with a **teach-back**: after the thing works, we write what was built, how it works and why, so you learn the system by reading a working one. Stages are sequential unless marked parallel.

```
Stage 0  Foundation and guardrails           S
Stage 1  Engine core, no UI                  L
Stage 2  Persistence and API                 M
Stage 3  Canvas editor MVP                   L
Stage 4  Triggers, queue, durable runs       L
Stage 5  Node SDK and core integrations      L
Stage 6  Look and feel polish                M   (design tokens start in Stage 3)
Stage 7  Hardening: security, perf, a11y     M
Stage 8  AI nodes (optional)                 M
Stage 9  Docs site, packaging, release       M   (docs run in parallel from Stage 0)
```

**Vertical slice rule:** by the end of Stage 3 you can build a three-node workflow in the browser and run it. Everything after widens or hardens that slice.

---

## Stage 0. Foundation and guardrails (S)

**Goal:** an empty repo where agents cannot easily do the wrong thing, and every later decision has a home.

**Build**
- Monorepo skeleton: pnpm + Turborepo, packages listed in `02-architecture.md` §2, strict `tsconfig` base.
- Oxlint + Oxfmt + `tsc` wired as `pnpm check`. Boundary rules as lint with agent-readable messages. Anti-cheat rules (no skipped or deleted tests, no suppressions).
- Vitest set up with an inline-snapshot example. Playwright set up with one smoke test.
- GitHub Actions: `check`, `e2e`, `build`. Branch protection. PR template with a "walkthrough for the reviewer" section.
- `AGENTS.md` (short), `CONSTRAINTS.md`, `docs/adr/`, `docs/GLOSSARY.md`.
- Install the core skills and subagents from `04-skills-and-agents.md`.
- Spikes (each timeboxed to an hour or two, each ends with a one-page ADR): docs site generator; Oxlint custom boundary plugin; expression approach; Code node sandbox options; API framework.
- ADRs written now: 0001 clean-room policy and licence; 0002 monorepo layout; 0003 lint and format stack; 0004 design tokens and icon set; 0005 test strategy (expect tests, simulation); 0006 TDD and review skill ownership.

**Skills and agents:** Addy `interview-me`, `spec-driven-development`, `constraint-driven-development`, `ci-cd-and-automation`; pstack `typescript-best-practices`, `correct`.

**Exit criteria**
- [ ] `pnpm check` passes in CI and locally in under about 10 seconds on a near-empty repo.
- [ ] A deliberately bad PR (forbidden import, skipped test, `any`) fails CI with a message that says how to fix it. Try it.
- [ ] Six ADRs exist and a newcomer can read them.
- [ ] No wasteful setup: installing dependencies once, not per worktree or per task.

**Teach-back:** "How this repo keeps agents honest" (types, lint, CI, why each exists).

---

## Stage 1. Engine core, no UI (L)

**Goal:** run a workflow from a JSON file in a terminal, with deterministic tests.

**Build**
- `schema`: branded IDs, workflow, node, connection, item, execution state machine, zod parsers.
- `engine`: validate, plan, execute with ports (`clock`, `random`, `http`, `store`, `secrets`, `log`), retries, timeouts, abort, error policies, item flow, IF, Switch, Merge, Loop semantics.
- `nodes-core` first five: Manual trigger, Set, IF, HTTP Request, Code (disabled until sandbox decision).
- Simulated ports and the `runSim` trace printer.
- CLI: `app run workflow.json --input data.json` printing the trace.
- Expression language v0 (decision from the spike).

**Skills and agents:** pstack `architect` (settle types and ports before code), `tdd`, `principle-type-system-discipline`, `principle-model-the-domain`, `test-behavior-not-implementation`; `test-engineer` and `code-reviewer` agents; Addy `incremental-implementation`.

**Exit criteria**
- [ ] 100% of engine behaviour covered by readable expect tests: flaky HTTP, timeout, cancel, crash-and-resume, branch and merge, loop, error route.
- [ ] Engine suite runs in a few seconds with no network and no real clock.
- [ ] A property test shows random valid graphs never throw and random invalid graphs are rejected with a clear error.
- [ ] Engine imports nothing from DB or HTTP frameworks (lint proves it).
- [ ] Teach-back reviewed by you and you can explain, in your own words, how an item moves from node to node.

**Teach-back:** "How the engine works": the journal, ports, why simulation.
**Risk:** over-building the expression language. Keep it tiny.

---

## Stage 2. Persistence and API (M)

**Goal:** workflows and runs survive restarts; the UI will have something to talk to.

**Build**
- Postgres + Drizzle schema and migrations for the tables in `02-architecture.md` §5.
- `RunStore` Postgres adapter writing the node-run journal.
- Credentials: create, encrypt, resolve (never returned).
- API: workflows CRUD, publish and version, run now, list executions, get execution with journal, cancel. SSE endpoint for run events. Minimal auth.
- OpenAPI or typed client generated from the same Zod schemas so the web app shares types.

**Skills and agents:** Addy `api-and-interface-design`, `security-and-hardening`; `security-auditor` on credentials and auth; `backend-developer`.

**Exit criteria**
- [ ] Integration tests against a real Postgres (Docker) pass in CI.
- [ ] Kill the process mid-run, restart, the run resumes or is marked failed with a reason, never lost.
- [ ] A test proves credentials never appear in API responses, logs or journal.
- [ ] Migrations are reversible or have a documented forward-only policy.

**Teach-back:** "Data model and the journal table" with an ER diagram.

---

## Stage 3. Canvas editor MVP (L)

**Goal:** build, save and run a workflow in the browser. This is the vertical slice.

**Build**
- Vite + React 19 + Tailwind 4 + shadcn on Base UI + React Flow UI. Design tokens file (`05-design-and-ux.md` §2) before components.
- Canvas with custom node and edge components, node palette, drag to add, connect, delete, undo and redo.
- Right config panel generated from node schemas. Bottom data inspector for input and output.
- Run button, live status on nodes from SSE, readable errors.
- Autosave and load. Basic list of workflows.
- First FPS and bundle measurements.

**Skills and agents:** shadcn skill, Emil Kowalski skill, Tailwind v4 skill, `frontend-design`, Addy `frontend-ui-engineering` and `browser-testing-with-devtools`, pstack `create-verification-skill`, `web-performance-auditor`, `frontend-developer`.

**Exit criteria**
- [ ] Playwright test: add three nodes, connect, run, see green statuses and output data.
- [ ] Pasting an invalid workflow shows a clear error instead of a blank canvas.
- [ ] Tokens only: lint finds no hard-coded colours.
- [ ] Measured and recorded: FPS at 100, 300, 500 nodes; first-load JS size. These become Stage 7 budgets.
- [ ] Axe checks pass on the non-canvas screens.

**Teach-back:** "How the editor talks to the engine" and "Why these UI libraries".
**Risk:** React Flow re-render storms. Memoise node components, keep selectors narrow, avoid storing the whole graph in one atom **[V]**.

---

## Stage 4. Triggers, queue and durable runs (L)

**Goal:** workflows start on their own and survive failures at scale.

**Build**
- Webhook trigger (production and test URLs), cron trigger, manual trigger.
- ADR comparing own journal + Postgres queue, BullMQ, DBOS, Inngest, Temporal, Restate, based on a small spike of the top two. Then implement behind the `Queue` and `RunStore` ports.
- Worker app. Concurrency, retries with backoff, per-workflow concurrency limit, idempotency keys, dead-letter handling.
- Error workflow support. Execution history UI with filters. Re-run from failed node.
- Retention settings for journal payloads.

**Skills and agents:** pstack `principle-make-operations-idempotent`, `swarm` for parallel checks; Addy `observability-and-instrumentation`; `test-engineer`; `security-auditor` on webhooks.

**Exit criteria**
- [ ] Simulation tests cover: worker crash mid-node, duplicate webhook delivery, retry storm, cancel while running.
- [ ] Load test: webhook throughput and p95 latency recorded with a target agreed in the ADR.
- [ ] Re-run from a failed node works from the UI.
- [ ] Traces and structured logs show one run end to end.

**Teach-back:** "Why a run is a journal" and "queue choice: what we picked and what we rejected".

---

## Stage 5. Node SDK and core integrations (L)

**Goal:** adding a node is a small, safe, well-documented task for us and for outsiders.

**Build**
- `node-sdk` contract: params schema, ports, credential types, execute function, test harness that runs a node with simulated ports.
- Credential flows: API key, basic auth, OAuth2 (authorization code with refresh).
- 12 to 15 core nodes: Webhook, Cron, HTTP, IF, Switch, Merge, Set, Loop, Wait, Code, Send Email, Slack-style message, Google Sheets-style spreadsheet, a database query node. Choose by what you will actually use.
- Node icon set and brand logo allow-list.
- A "create a node" generator and a node author guide.

**Skills and agents:** Addy `api-and-interface-design`, `source-driven-development` (ground each integration in the provider's official docs); pstack `principle-boundary-discipline`; `explainer` agent for the guide.

**Exit criteria**
- [ ] A new node can be written and tested in under an hour by following the guide, verified by someone who did not write the SDK (or an agent given only the docs).
- [ ] Every node has a simulated-port test and a docs page.
- [ ] No node copies n8n's descriptions, parameter names or icons. Reviewed against ADR 0001.

**Teach-back:** "Anatomy of a node".

---

## Stage 6. Look and feel polish (M)

**Goal:** the product feels fast, calm and deliberate.

**Build**
- Command palette, keyboard shortcuts, node toolbars, tidy-up layout, minimap, outline mode.
- Motion pass with Emil Kowalski's skill; reduced-motion support.
- Onboarding flow and templates gallery. Marketing landing page using GSAP skills.
- Empty, loading, error and offline states everywhere (`05-design-and-ux.md` §5).
- Run comparison view and pinned data.
- Design critique pass with Impeccable and `frontend-design`.

**Exit criteria**
- [ ] The look-and-feel checklist in `05-design-and-ux.md` §7 is fully ticked.
- [ ] Usability test with 3 to 5 people: each builds the sample workflow unaided in under 5 minutes. Fix what blocks them.
- [ ] Performance budgets hold on the reference machine.

**Teach-back:** "Motion and design tokens: the rules we follow and why".

---

## Stage 7. Hardening: security, performance, accessibility (M)

**Build**
- Pick and implement the Code node sandbox from the Stage 1 spike. Resource limits, no network by default, escape tests.
- SSRF protections in the HTTP node, rate limits, webhook signing option.
- Dependency audit, secret scanning, pinned versions, SBOM if you plan to distribute.
- Load tests at agreed targets; fix hot spots found with flame graphs and `EXPLAIN ANALYZE`.
- Accessibility audit with the canvas outline mode.
- Optional: model the execution state machine in a statechart or TLA+ and check the engine against it (pstack `statechart`).

**Exit criteria**
- [ ] `security-auditor` report has zero Critical findings open; a human reviewed it.
- [ ] Sandbox escape attempts documented and blocked, written as tests.
- [ ] Budgets met; regressions now fail CI.

**Teach-back:** "Threat model: what can go wrong and what stops it".

---

## Stage 8. AI nodes (optional) (M)

n8n treats AI as part of the engine; if you want parity, add:
- LLM call node with provider credentials, structured output via the same Zod schemas.
- Agent node with tool-calling over other nodes. MCP client node.
- Guardrails: token and cost limits, redaction, timeouts, visible tool-call traces in the inspector.

**Exit criteria:** deterministic tests using a recorded or fake model port (same simulation idea), cost caps enforced, traces readable.

---

## Stage 9. Docs site, packaging and release (M, parallel from Stage 0)

**Build**
- Docs site with the structure in `07-wiki-and-docs.md`, generated reference docs for nodes from schemas.
- Docker image, `docker compose` for self-host, upgrade guide, backup and restore guide.
- Release pipeline: conventional commits to changelog, signed tags, versioned images.
- Contribution guide, issue and PR templates, security policy.
- Licence applied per ADR 0001.

**Exit criteria**
- [ ] A person with only the docs can self-host, build a workflow, write a node and run the tests.
- [ ] Every ADR is understandable by a beginner (see the test in `07-wiki-and-docs.md`).

---

## Cross-cutting: the loop for every stage

1. `interview-me` / `spec` for a one-page goal and exit criteria.
2. `architect` for any change that crosses a module boundary.
3. Build in small vertical PRs. Each PR description includes a reviewer walkthrough.
4. Agent reviewers run; a human reviews for understanding.
5. When the stage is done: run `teach`, then `unslop`, then read it yourself. If you cannot explain it, the teach-back is not finished.
6. Update ADRs, glossary and `AGENTS.md`. Run `/correct` for repeated mistakes.

## Open questions for you

1. Who is this for first: you alone, a team, or public self-hosters? It changes how early auth, multi-user and licence work matter.
2. Is Stage 8 (AI nodes) in scope for v1?
3. Which 5 integrations do you actually need first? That picks the Stage 5 list.
