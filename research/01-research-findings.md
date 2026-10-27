# 01. Research findings

Each section says what I found, where, and what it changes in our plan.

## 1. The video: Ron Minsky, "Now more than ever: building reliable software in the age of agents" (Jane Street, Bug Bash 2026)

Source: https://youtu.be/rUYP4C29yCw (66 minutes, uploaded by Antithesis). I read the full transcript.

**The thesis.** Agents make old engineering disciplines more important, not less. The scarce resource is human attention, so tools and process should maximise human understanding of the system, not remove humans.

| What he said | What it means for us | Where it lands |
|---|---|---|
| Types remove whole bug classes and are a design tool. "Make illegal states unrepresentable." Types give agents fast, just-in-time feedback, faster than any test suite. | Model workflows with discriminated unions, branded IDs and parse-at-the-boundary. A workflow that cannot run should not typecheck. | `02-architecture.md` §3 |
| XSS example: forgetting the escaping call is a type error, so the mistake is impossible at any distance. | Make the unsafe path hard: a `SecretString` type that cannot be logged, an `UntrustedHtml` type for rendered output, a `ValidatedUrl` type for HTTP nodes. | §3, §6 |
| Expect tests: print output, capture it in the source, review the diff. Text is friendly to agents because models are weak at vision. Example-based tests are "unreasonably effective" when written readably. | Engine tests print an execution trace as text and snapshot it inline. A PR diff then shows the logic change and the behaviour change together. | §4 |
| Library-level deterministic simulation: fake network, clock and services, so feedback takes milliseconds. | The engine takes `Clock`, `Http`, `Random`, `Store` as arguments. We can simulate a flaky API and a crash mid-run in a unit test. | §4 |
| Agents are trained to turn the red light green. They delete tests, reward hack, and are bad at non-functional qualities: simplicity, duplication, footguns. | CI blocks deleted tests, `.skip`, `eslint-disable`-style suppressions and coverage drops. Review is human. | `03-stack-and-tooling.md` §5 |
| Anthropic's agent-built C compiler stalled because the codebase got messy and each change broke something. Agents work better in tight, simple code. | Keep modules small, boundaries enforced, duplication low. Refactor early. | `04-skills-and-agents.md` §5 |
| Code review exists for human understanding: spreads practice, raises the bus factor, keeps code simple. Agent PRs break the social contract and reviewers glaze over. | Small PRs. Agents split big features into stacks. Agents write a guided diff walkthrough for the reviewer. | `06-roadmap.md` working rules |
| AI review is useful but is a different thing from human understanding. | Use AI review agents as an extra pass. Never as the approval. | §5 |
| Agents forget between sessions. Fix it in skills and docs, not in chat. | Every repeated correction becomes a lint rule, a type, a test, or a line in AGENTS.md. | `04-skills-and-agents.md` §6 |
| Formal methods are getting cheaper with agents. | Optional later: model the execution state machine in TLA+ or a statechart and check the engine against it. Not Stage 1. | `06-roadmap.md` Stage 7 |
| LLMs mimic the surrounding code, good and bad. House style matters. | Keep a neutral shared style, enforced by the formatter, so agents copy good patterns. | §3 |

## 2. What n8n is and how it works (so we copy behaviour, not code)

**[Sourced]** Sources: a C# Corner write-up of n8n internals, the n8n docs, and n8n vs Activepieces comparison pages.

- A Node.js engine that runs workflows stored as JSON: a list of nodes and a map of connections.
- Data between nodes is an array of items, each with a `json` object (and optional binary data).
- A trigger (webhook, cron, polling, manual) starts an execution. The engine walks the graph node by node, passing items along.
- Stored in SQLite by default, Postgres recommended. Credentials are encrypted with a key held in an environment variable and never appear in workflow JSON.
- Execution modes: manual, production, queue mode (main process + Redis + worker processes), sub-workflow.
- Errors stop the run by default. A separate "error workflow" can be triggered.
- It has AI nodes (LangChain-based, vector stores, memory) and acts as an MCP client and server.

**What this changes:** our workflow JSON format will be similar in spirit (nodes, connections, items) because it is a natural model, but we define our own schema, names and node contracts.

### The licence matters

**[Sourced]** n8n docs, Community licence FAQ, and a third-party summary.

- Allowed: use internally, for personal projects, learning and research; consulting; run it behind your own product if users cannot build or edit workflows.
- Not allowed: fork n8n's code to launch your own automation product; white-label it; let your customers build workflows on a hosted copy.
- You may not remove or alter licence and copyright notices.

**Decision:** clean-room. Concretely:
1. Do not copy or paste n8n source, node descriptions, JSON schemas or UI assets.
2. Do not feed n8n's source files to agents as "reference to rewrite".
3. Use public behaviour and docs as the spec. Write our own contracts.
4. Pick our own licence (MIT, Apache-2.0 or AGPL) deliberately in an ADR.
5. Pick a product name that does not include "n8n".

If you ever want to reuse n8n code, that is a legal question for a lawyer, not an engineering one.

## 3. Alternatives: what to learn from them

**[Sourced]** Activepieces vs n8n pages (vendor-written, so biased) and Better Stack's Activepieces guide.

- **Activepieces**: MIT core. Step-by-step linear builder (Zapier-like) instead of a free canvas. Integrations are "pieces" written in a TypeScript framework (700+ claimed). Easier for non-technical users, less raw flexibility.
- **n8n**: free-form canvas, code node in JavaScript and Python, deep error handling, Redis queue workers.
- **Langflow**: MIT, for building AI apps, not general business automation.
- Competitor criticism of n8n worth taking seriously, even though it is marketing: debugging means opening node after node and reading raw JSON.

**Opportunity for "better look and feel":** a data inspector that shows each node's input and output inline, diff between runs, pinned test data, readable errors, and fast keyboard-driven editing. That is where we can beat n8n, not by having more nodes.

## 4. Execution engine options

**[Sourced]** Inngest's "best job queue alternatives" post (Inngest is a vendor, so read the positioning with that in mind), ZenML and Kestra comparisons, a DBOS summary.

| Option | Model | Fits us when | Watch out |
|---|---|---|---|
| In-process runner | A function in the API process | Stages 1 to 3 | Lost on restart |
| BullMQ | Job queue on Redis | Always-on workers, you want control and zero vendor fee | You build step state and retries yourself |
| Postgres queue (e.g. pg-boss) | Queue in the DB you already have | You want one dependency | Fewer rate-limit features than BullMQ (a community comparison says so) |
| DBOS | Durable execution as a library, checkpoints in Postgres | You want durability without a cluster | Large artifacts through Postgres are a poor fit |
| Inngest / Trigger.dev | Durable functions, retry from the failed step | Serverless, multi-step work | Vendor platform; check self-host terms |
| Temporal / Restate | Durable workflow engines | Long-running, many-language workflows | Operational weight, learning curve |

**Insight:** a user's workflow is itself a durable process: "retry from the failed node, show the run history" is exactly what these engines sell. We are building a product on top of that idea, so we should decide deliberately whether to build our own step journal (Postgres table of node runs) or sit on one of them. Recommended path: build our own journal in Stage 4 behind a small `Queue` and `RunStore` interface, so we can swap. Write the ADR first.

## 5. Lint, format and speed

**[Sourced]** Oxc blog (Oxfmt beta), Turborepo docs, a migration write-up, and an August 2026 comparison.

- Oxfmt reached beta in Feb 2026: Prettier-compatible, claimed 30x faster than Prettier and 3x faster than Biome on a cold run. Used by Vue core, Turborepo and Sentry's JS SDK.
- One team's full lint pipeline went from about 81 seconds to about 2.5 seconds after moving to Oxlint and Oxfmt, mostly by removing ESLint (their import-boundary rule had been the slow part, replaced with a small custom Oxlint plugin).
- Type-aware linting is still maturing in Oxlint (via tsgo) and in Biome (Biotype, roughly 75 to 85% of typescript-eslint rules per one source). ESLint with typescript-eslint is still the mature option for type-aware rules.
- Turborepo recommends running Oxlint and Oxfmt as root tasks.

**Decision:** Oxlint + Oxfmt + `tsc --noEmit`. Add typescript-eslint only if we need a type-aware rule that nothing else gives us. Biome stays the fallback if Oxc causes friction. Fast checks matter because agents need feedback in seconds.

## 6. UI foundation

**[Sourced]**

- **React Flow UI** (reactflow.dev/ui): ready-made React Flow components built on shadcn/ui, Tailwind 4 and React 19. Install with `npx shadcn@latest add https://ui.reactflow.dev/<component>`. The code is copied into your repo and is yours to edit. There is an AI Workflow Editor template.
- Import order matters with Tailwind 4: `@import "tailwindcss"; @import "tw-animate-css"; @layer base { @import "@xyflow/react/dist/style.css"; }` in `global.css`, not in `App.tsx`.
- **shadcn/ui** made **Base UI** the default in July 2026 (Base UI 1.6.0, 6M+ weekly downloads), Radix still supported. CLI v4 added `init --base`, presets, `shadcn docs`, `shadcn info` and an official agent skill.

## 7. Skills and subagents (details in `04-skills-and-agents.md`)

**[Sourced]**

- **pstack** (Cursor, by poteto; mirror at `backnotprop/pstack`, MIT): `/poteto-mode` routes to 23 playbooks; skills include `how`, `why`, `teach`, `architect`, `interrogate`, `tdd`, `typescript-best-practices`, `technical-writing`, `unslop`, `correct`; 24 principles including type-system discipline, boundary discipline and "encode lessons in structure." Install: `npx skills add backnotprop/pstack`. Its author says "the best spec is code" and ships no planning skills, which is a mild tension with this plan. We keep plans thin and let code settle the details.
- **Addy Osmani's agent-skills** (MIT, ~110k stars, 25 skills): spec, plan, build, test, review, ship, with commands `/spec /plan /build /test /constraints /review /webperf /code-simplify /ship`. Four persona agents: code-reviewer, test-engineer, security-auditor, web-performance-auditor.
- **GSAP official skills** (`greensock/gsap-skills`, MIT): 8 skills. All GSAP plugins are now free, including SplitText and MorphSVG.
- **Emil Kowalski's design-engineering skill**: UI polish, animation decisions and component details.
- **Design skills in the wild**: Tailwind v4 design-system skill (wshobson/agents), Anthropic's frontend-design skill, Impeccable (pbakaus), taste-skill, UI.sh (paid, invite-only, from the Tailwind team).
- **Subagent collections**: VoltAgent's awesome-claude-code-subagents (154+), wshobson/agents (194 agents). One practitioner's finding: only about a dozen subagents earn their context.

## 8. Icons

**[Sourced]**

| Set | Licence | Size | Notes |
|---|---|---|---|
| Lucide | ISC | 1,500+ | Stroke only. Default in many AI templates, so apps look alike. |
| Tabler | MIT | 5,900+ | Dashboard-friendly, 24px grid, 2px stroke. |
| Phosphor | MIT | 9,000+ | Six weights including duotone. Good for state (outline idle, filled active). |
| Heroicons | MIT | 450+ | Small. |
| Simple Icons | Check the repo licence **[Verify]** | brand logos only | The research source says to use it next to your main set for brand logos. |

Brand logos are trademarks of their owners. Check each brand's usage rules before shipping logos in a product.
