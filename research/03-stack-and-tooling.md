# 03. Stack and tooling

Labels: **[S]** sourced in research, **[R]** my recommendation, **[V]** verify in a Stage 0 spike. Versions move fast: pin exact versions at install time, and prefer releases at least two weeks old.

## 1. Application stack

| Layer | Choice | Why | Label |
|---|---|---|---|
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | Types are the fastest feedback loop for agents and humans | R (video) |
| Monorepo | pnpm workspaces + Turborepo | Cached tasks, root tasks for Oxc tools | S (Turborepo docs) |
| Web build | Vite + React 19 | Fast dev loop; the editor is a SPA, no SSR needed | R |
| Routing and data | TanStack Router + TanStack Query | Typed routes, cache, retries | R, V |
| Canvas | `@xyflow/react` (React Flow) | Purpose-built node UI; React Flow UI components exist | S |
| Auto-layout | elkjs or dagre for "tidy up" | Needed for imported or AI-generated workflows | V |
| Client state | Zustand for editor state | Small, selector-based, plays well with React Flow | R, V |
| Styling | Tailwind CSS 4, CSS variables for tokens | React Flow UI requires Tailwind 4 | S |
| Components | shadcn/ui on **Base UI** primitives | Base UI is the shadcn default since July 2026; code is copied into the repo | S |
| Canvas components | React Flow UI via `npx shadcn@latest add https://ui.reactflow.dev/<name>` | Ready nodes, handles, status indicators; editable | S |
| Code and expression editor | CodeMirror 6 | Lighter than Monaco for small inputs | R, V |
| Motion (UI) | Motion (the library formerly called Framer Motion) and CSS transitions | Layout and presence animations in React | R, V |
| Motion (marketing, onboarding) | GSAP with the official skills | Timelines and ScrollTrigger; all plugins are free | S |
| Forms and validation | Zod schemas shared with the server; schema-driven param forms | One source of truth for node params | R |
| API | Hono or Fastify | Small, typed, fast. Pick in an ADR | R, V |
| DB | Postgres + Drizzle + `drizzle-kit` | Typed SQL, migrations in the repo | R, V |
| Queue (Stage 4) | decide by ADR: own journal + pg queue, BullMQ, DBOS, Inngest, Temporal, Restate | See `01-research-findings.md` §4 | S |
| Realtime | SSE first | Simple, proxy-friendly, replayable from the journal | R |
| Code node sandbox | spike: V8 isolate lib vs WASM JS runtime vs locked-down container | RCE risk | V |
| Observability | OpenTelemetry traces and structured logs | Addy's observability skill covers it | S (skill) |
| Deployment | Docker image + `docker compose` for self-host | The way n8n users expect to run it | R |

### What to leave out at first
- Kubernetes, multi-region, a plugin marketplace, multi-tenant billing. They are real, and they are later.
- A second UI library. Pick shadcn + React Flow UI and extend.

## 2. UI libraries and where to borrow components

| Need | Source | Notes |
|---|---|---|
| Buttons, dialogs, popovers, menus, tabs, tooltips, command palette | shadcn/ui on Base UI | Own the code, restyle freely |
| Node, handle, edge, status indicator, "AI workflow editor" layout | React Flow UI | Start from the template, then diverge |
| Resizable panels (side config panel, bottom inspector) | shadcn Resizable component | Listed in the shadcn changelog |
| Command palette (add node, jump, run) | shadcn Command (cmdk-based) | **[V]** exact name in current registry |
| Toasts, empty states, spinners, badges | shadcn Sonner, Empty, Spinner, Badge | Empty, Spinner, Badge appear in the changelog |
| Animated polish pieces | Magic UI, Aceternity, Motion Primitives style libraries | **[V]** Not researched here. Treat as inspiration: copy one small effect at a time, check licence |
| Charts for run stats | Recharts or visx | **[V]** pick when we reach the Stage 6 dashboard |
| Tables for execution history | TanStack Table | R |

Run `npx shadcn docs <component>` and `npx shadcn info` so an agent gets exact API context instead of guessing. Install the shadcn skill (see `04-skills-and-agents.md`).

## 3. Icons

- **UI chrome:** one set only. Recommended: **Phosphor** if you want a distinct look (six weights, duotone for active states), **Lucide** if you want the safest default with the smallest friction. Lucide is everywhere in AI-generated apps, which is the reason to pick something else.
- **Brand logos for integrations:** Simple Icons, with a reviewed list of allowed logos. Brand marks are trademarks.
- **Node icons we own:** commission or draw a small consistent set for core nodes (HTTP, IF, Merge, Code, Wait, Webhook, Cron). Distinct, ownable node icons are a big part of "look and feel".
- Rule: no mixing stroke widths. Enforce with a single `<Icon>` wrapper that sets size and weight.

## 4. CLIs we will use

| CLI | Used for |
|---|---|
| `pnpm`, `turbo` | Workspaces, cached tasks |
| `gh` | PRs, checks, releases, issue templates |
| `npx skills` | Install and list agent skills (`--list`, `--skill`, `--agent`) |
| `npx shadcn@latest` | `init`, `add`, `docs`, `info`, `--dry-run`, `--diff` |
| `oxlint`, `oxfmt`, `tsc` | Lint, format, type check |
| `vitest`, `playwright` | Unit and E2E tests, traces |
| `drizzle-kit` | Migrations |
| `knip` | Dead code and unused dependencies **[V]** |
| `hyperfine` | Benchmark CLI commands (the Oxc migration write-up used it) **[S]** |
| `k6` or `autocannon` | Load tests for webhooks and the API **[V]** |
| `firecrawl` CLI / MCP | Research and scraping docs for agents |
| `claude` (Claude Code) | The agent harness; plugins from marketplaces |
| `docker compose` | Local Postgres and the self-host image |

## 5. Quality gates: lint, format, types, tests, CI

**Order of checks (fastest first), all runnable locally with one command:** `pnpm check`.

1. `oxfmt --check` (seconds)
2. `oxlint` with a strict config (seconds)
3. `tsc --noEmit` across packages (cached by Turborepo)
4. `vitest run` (unit and expect tests; engine suite should stay under a few seconds)
5. `playwright test` (editor smoke tests; run on PR, not on every save)
6. `knip` and a dependency audit **[V]**

**Rules that stop agents cheating** (this is what the video and Addy's `constraint-driven-development` skill are about):
- Fail CI if a test file is deleted or loses assertions without a labelled exception.
- Fail on `.skip`, `.only`, `@ts-ignore`, `@ts-expect-error` without a reason, and lint-disable comments without a reason.
- Fail if coverage on `packages/engine` drops. Coverage is a tripwire, not a goal.
- Boundary rules as custom Oxlint rules or a small JS plugin (the sourced migration did exactly this) **[S]**, each with an error message that tells the agent the fix.
- Lint messages are written for an agent: say what to do, not just what is wrong.

**Git hooks:** a pre-commit hook runs format + lint on staged files only. Keep it under two seconds or people will bypass it. Heavy checks run in CI.

**CI (GitHub Actions):**
- One workflow, matrix off. Cache pnpm store and Turborepo.
- Jobs: `check` (steps 1 to 4), `e2e` (Playwright, uploads traces on failure), `build` (Docker image), `audit` (dependency and secret scan).
- Required status checks on `main`. No direct pushes. Squash merge. Conventional commit titles.
- Preview deploy of the editor per PR is nice-to-have, not Stage 0.

## 6. Performance tools

| Layer | Tool | What we measure |
|---|---|---|
| Editor render | React DevTools Profiler, Chrome Performance panel | Re-renders on pan, zoom, drag with 100, 300, 1,000 nodes |
| Page load | Lighthouse, `web-vitals`, Vite bundle visualiser | Bundle size per route, LCP, INP. Addy's `/webperf` command and web-performance-auditor persona automate this |
| Canvas | Custom FPS harness in Playwright | Drag a node on a 500-node graph and record frame times |
| Engine | `vitest bench` or a small benchmark script, `clinic`/`0x` flame graphs | Nodes per second, memory per run |
| API and webhooks | k6 or autocannon | Webhook p95 latency at N requests per second |
| DB | `EXPLAIN ANALYZE`, `pg_stat_statements` | Journal queries, execution list |
| Tooling | `hyperfine` | `pnpm check` time. Treat a rise as a bug |
| Number sanity | pstack's `benchmark-checklist` skill | Is the number measuring what we think it measures |

Set budgets in Stage 3 and fail CI on regression only once the numbers are stable.

## 7. What NOT to install on day one

- Every skill and subagent you can find. Context is limited; each one costs tokens every session. Start with the core set in `04-skills-and-agents.md`.
- Two lint stacks. Pick Oxc; keep Biome only as a documented fallback.
- A second state manager or a second animation library for the same job.
