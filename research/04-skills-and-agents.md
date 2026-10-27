# 04. Skills and agents

Install a small core set. Every skill adds tokens to every session and some overlap each other. Pstack's own principle is to guard the context window.

## 1. Core set (install in Stage 0)

| Source | What you get | Install |
|---|---|---|
| **Addy Osmani agent-skills** (MIT) | 25 lifecycle skills and `/spec /plan /build /test /constraints /review /webperf /code-simplify /ship`; 4 personas | `npx skills add addyosmani/agent-skills` or in Claude Code: `/plugin marketplace add addyosmani/agent-skills` then `/plugin install agent-skills@addy-agent-skills`. Install the whole repo, not single skills, so the shared `references/` checklists come along. **[S]** |
| **pstack** (poteto, MIT) | `/poteto-mode`, `how`, `why`, `teach`, `architect`, `interrogate`, `typescript-best-practices`, `technical-writing`, `unslop`, `correct`, `no-comments`, the 24 principles | `npx skills add backnotprop/pstack` (pick skills from the list), or Claude Code: `/plugin marketplace add cursor/plugins` then `/plugin install pstack@cursor-plugins`. First run `/setup-pstack`. Skills that call others must be installed together (`teach` needs `how` + `why`; `technical-writing` needs `unslop`). **[S]** |
| **shadcn skill** | Teaches agents the Radix and Base UI component APIs and the CLI | From ui.shadcn.com/skills (listed in CLI v4 notes). **[S]** |
| **Emil Kowalski design-engineering skill** | UI polish, animation decisions, component detail | Find the repo with `npx skills add <owner/repo> --list`. I could not confirm the exact path. **[V]** |
| **Tailwind v4 design-system skill** (wshobson/agents) | CSS-first `@theme` tokens, OKLCH colours, CVA components, dark mode | Copy the one skill folder rather than the whole 194-agent repo. **[S]**, install path **[V]** |
| **Anthropic `frontend-design`** | Distinctive, non-generic UI | Already available in Claude surfaces that ship it; otherwise via the skills CLI. **[S]** |

## 2. Add later, when the stage needs it

| Skill | Add at | Why |
|---|---|---|
| **GSAP official skills** (`npx skills add https://github.com/greensock/gsap-skills`, or `/plugin marketplace add greensock/gsap-skills`) | Stage 6 | Marketing site hero, onboarding sequences, scroll effects. Eight skills: core, timeline, scrolltrigger, plugins, utils, react, performance, frameworks. Keep GSAP out of the canvas hot path. **[S]** |
| **Impeccable** (pbakaus) | Stage 6 | Design critique and audit passes: hierarchy, motion, spacing, theming. **[S]** |
| **taste-skill** | Stage 6, optional | Tunable design variance and motion intensity to avoid generic UI. **[S]** |
| **pstack `create-verification-skill`** | Stage 3 | Generates a project-local skill that proves the editor actually works in a browser. **[S]** |
| **pstack `statechart` / formal verification skills** | Stage 7, optional | Model the execution state machine and check it. **[S]** |
| **UI.sh** (Tailwind team, paid, invite-only) | Optional | Reported good results; access is limited. **[S]**, not researched further |

## 3. Which skill to use for which job (resolve overlaps)

| Job | Use | Not |
|---|---|---|
| Decide what to build | Addy `interview-me` then `spec-driven-development` | Writing code first |
| Break into tasks | Addy `planning-and-task-breakdown` | A giant plan |
| Hard or risky task end to end | pstack `/poteto-mode` (it routes to a playbook) | Free-form prompting |
| Fix a bug | pstack `tdd` or Addy `debugging-and-error-recovery` | Both at once. Pick one per project |
| Write code that crosses a module boundary | pstack `architect` first | Starting with implementation |
| TypeScript quality | pstack `typescript-best-practices` + principle `type-system-discipline` | Style prompts in chat |
| Review a diff | Human first. Then Addy `code-review-and-quality` and pstack `interrogate` as extra eyes | Treating AI review as approval |
| Quality bar and anti-cheating | Addy `constraint-driven-development` → `CONSTRAINTS.md` | Hoping the agent behaves |
| Mistake keeps repeating | pstack `/correct`: fix at the highest level that works (architecture, then types, lint, CI, tests, docs last) | Another sentence in AGENTS.md |
| UI polish | Emil Kowalski skill + `frontend-design` + shadcn skill | GSAP for UI micro-interactions |
| Docs, ADRs, wiki | See `07-wiki-and-docs.md` | A generic "write docs" prompt |
| Teach me what was built | pstack `teach` (how + why), `bro` for plain-language restatement | Asking for a summary |
| Web performance | Addy `/webperf` and web-performance-auditor | Guessing |
| Security | Addy `security-and-hardening` + security-auditor persona | Skipping it until the end |

Two overlaps to settle once and write down in an ADR: **TDD** (Addy's vs pstack's) and **review** (Addy's vs pstack's `interrogate`). Choose a primary for each and keep the other available but unused by default.

**Note on planning.** pstack's author argues the best spec is code and ships no planning skills. Addy's pack is spec-first. This plan sits in between: thin written stages with exit criteria, then code settles details, with a prototype before any big decision.

## 4. Subagents (specialised agents)

Practitioners report that of the hundreds available, about a dozen earn their context. Install few, configure tightly: read-only tools for reviewers, the cheaper model for routine passes, the strongest model for security.

| Agent | Role | Tools | Model tier | Use |
|---|---|---|---|---|
| `code-reviewer` | Diff review, five axes | Read, Grep, Glob, Bash (no Write/Edit) | mid | After every change |
| `security-auditor` | Auth, input validation, secrets, SSRF, sandbox | read-only | top | Before merging anything touching auth, credentials, HTTP node, Code node |
| `test-engineer` | Test strategy, coverage gaps, flaky risk | read + run tests | mid | New features, Stage 1 and 4 especially |
| `web-performance-auditor` | Core Web Vitals, bundle, render | read + run | mid | Stage 3, 6 |
| `frontend-developer` | Build components from specs | full | mid | Editor UI work |
| `backend-developer` | API, DB, queue code | full | mid | API and worker work |
| `explainer` (we write it) | Rewrite a change in plain language for a beginner | read-only | mid | Every teach-back doc |
| `comment-sicko` (pstack) | Strips comments that should be code, types or tests | read-only | mid | Before review, through `/no-comments` |

Sources: Addy's four personas, pstack's `poteto-agent` and `comment-sicko`, and the VoltAgent and wshobson collections for the rest. Rule from Addy's orchestration notes: **personas do not invoke other personas**; the main session orchestrates.

A subagent file looks like this (the format is standard in Claude Code):

```markdown
---
name: code-reviewer
description: Reviews a diff. Use right after writing or changing code.
tools: Read, Grep, Glob, Bash
model: sonnet
---
Run `git diff main...HEAD`. Review for correctness, readability, architecture,
security and performance. Report Critical, Required, Optional, Nit.
Never edit files.
```

A parallel review pass that one practitioner reports as ~75% useful runs nine reviewers at once: test runner, linter, code reviewer, security, quality and style, test quality, performance, dependencies and deploy safety, simplification. Start with three (reviewer, security, test quality) and add only if findings justify it.

## 5. Rules that make agents reliable in this repo (from the video)

1. **Tight codebase.** Small modules, no duplication, explicit boundaries. Agents stall in messy code.
2. **Fast feedback.** `pnpm check` under about 10 seconds for the changed package. Types first, tests second.
3. **Readable behaviour.** Expect tests print traces so a human sees behaviour change in the diff.
4. **No cheating.** CI blocks deleted tests, skipped tests, suppressed lint and weakened types.
5. **Human review is for understanding.** The agent writes a guided walkthrough (order of files, one line each) in the PR description.
6. **Small PRs.** About 100 lines changed is the guideline in Addy's review skill. Agents split big work into stacks.
7. **House style is neutral and enforced.** The formatter decides; agents copy surrounding code.

## 6. `AGENTS.md` (keep it short)

Under about 60 lines. It points to the rules; it does not restate them.

```markdown
# AGENTS.md
Project: workflow automation app. Clean-room: never copy n8n code or assets.

Commands: `pnpm check` (fast gate), `pnpm test`, `pnpm e2e`, `pnpm dev`.
Layout: see docs/architecture/overview.md. Boundaries are enforced by lint; read the lint message and follow it.
Rules: strict TS, parse at boundaries, exhaustive switches, no `any`.
Never: delete or skip tests to get green, add lint suppressions without a reason, add dependencies without an ADR note.
Decisions live in docs/adr/. Glossary in docs/GLOSSARY.md. Read both before changing architecture.
Before saying done: run `pnpm check` and show the output.
```

Every time a human corrects an agent twice for the same thing, run `/correct` and encode the fix in a type, a lint rule or a test, not in more prose. If you have a guardrail-setup skill of your own (for example an `/agent-ready` style skill), run it in Stage 0 and keep only the checks this repo needs.

## 7. Using Firecrawl well in this project

- Research with the Firecrawl MCP or CLI, and save the findings in `docs/research/` with the source URL and date. Findings in chat vanish.
- Scrape official docs (React Flow, shadcn, Base UI, Drizzle) into `docs/references/` only when an agent keeps getting an API wrong. Prefer `shadcn docs` and library `llms.txt` files where they exist.
- Never scrape n8n's source for implementation. Public docs for behaviour are fine; remember the clean-room rule.
