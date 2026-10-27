# Workflow automation app (n8n-style): build plan

A visual workflow builder with a better look and feel than n8n. This folder is the plan. Read the files in order the first time.

| File | What it answers |
|---|---|
| `00-README.md` | This page: summary, decisions, rules |
| `01-research-findings.md` | What the research found, with sources, and what each finding changes |
| `02-architecture.md` | Domain model, engine design, data model, security, how types and tests keep agents honest |
| `03-stack-and-tooling.md` | Stack, UI libraries, icons, CLIs, lint, format, CI, testing, performance tools |
| `04-skills-and-agents.md` | Which skills and subagents to install, when to use each, and which ones overlap |
| `05-design-and-ux.md` | How we get the better look and feel: tokens, canvas UX, motion rules |
| `06-roadmap.md` | The multi-stage plan, with exit criteria per stage |
| `07-wiki-and-docs.md` | How we write a wiki a beginner can learn the app and codebase from |

## How confident each claim is

- **[Sourced]** Found in a page I read with Firecrawl. The source is named.
- **[Recommended]** My engineering judgement. Reasonable, not proven for your case.
- **[Verify]** From my general knowledge, not checked in this research. Stage 0 has a spike to confirm it before we depend on it.

## The 12 decisions in one screen

1. **Clean-room build.** n8n's licence (Sustainable Use) forbids forking its code to launch a competing automation product and forbids white-labelling it. We study behaviour and public docs, then write our own code, node format, names and icons. **[Sourced]**
2. **TypeScript everywhere, strict.** One language across engine, API and UI so types carry the rules. **[Recommended]**
3. **Engine is a pure library first.** `packages/engine` has no database, no HTTP, no clock of its own. Everything outside is passed in. That lets us test it in milliseconds and simulate failures. **[Recommended, from the video]**
4. **Canvas: React Flow (`@xyflow/react`)** with **React Flow UI** components on top of **shadcn/ui + Tailwind 4 + React 19**. It already ships an "AI Workflow Editor" template. **[Sourced]**
5. **Primitives: Base UI** through shadcn (it became shadcn's default in July 2026; Radix still supported). **[Sourced]**
6. **Lint and format: Oxlint + Oxfmt**, with `tsc` as the type gate. Fast enough that agents get feedback in seconds. **[Sourced]**
7. **Execution: start in-process, then a durable queue.** We write an ADR comparing BullMQ, a Postgres queue, DBOS, Inngest, Temporal and Restate before Stage 4. **[Sourced options, Recommended order]**
8. **Tests: Vitest with inline snapshots as "expect tests", property tests, Playwright for the editor.** **[Recommended, from the video]**
9. **Skills: a small core set**, not everything. Addy Osmani's lifecycle skills + selected pstack skills + shadcn skills + Emil Kowalski's design skill. GSAP skills only when we build the marketing and onboarding pages. **[Sourced]**
10. **Icons: one UI set (Lucide or Phosphor) plus Simple Icons for brand logos.** Phosphor if we want to look less like every other AI-built app. **[Sourced]**
11. **Learn by building.** Each stage ends with a teach-back document written after the code works: what was built, how, and why. **[Your stated preference]**
12. **Human understanding is the bottleneck.** Small PRs, readable diffs, expect-test output in the diff, a human reviews every merge. **[Sourced, from the video]**

## Working rules for every stage

- Build the smallest slice that runs end to end, then widen.
- A stage is done only when its exit criteria pass on the real artifact, not when the code compiles.
- Never let an agent delete or skip a test to get green. Lint and CI forbid it (Stage 0).
- One decision, one ADR, written in plain language (see `07-wiki-and-docs.md`).
- Do not copy n8n source, node definitions, JSON schemas verbatim, screenshots or branding. Do not use "n8n" in our product name.

## What I could not confirm

- Exact install path for Emil Kowalski's skill. Run `npx skills add <owner/repo> --list` and pick it from the list.
- Sandbox library for the Code node (isolated-vm vs a WASM JS runtime). Stage 1 spike.
- Docs site generator. Fumadocs, Starlight and Docusaurus all fit; decide in Stage 0 with a 1-hour spike. I did not research them in depth.
- Performance numbers for React Flow at scale. The budgets in `05-design-and-ux.md` are targets to measure, not facts.
