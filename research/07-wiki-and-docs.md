# 07. Wiki and docs: a master-level wiki anyone can learn from

Goal: a stranger, or you in six months, can learn what the app does, how the code is organised and why it is built that way, without asking anyone. Labels: **[S]** sourced, **[R]** recommended, **[V]** verify.

## 1. The core problem to design against

Agents left alone write generic docs and ADRs full of jargon that a beginner cannot follow. The fix is not "write better docs." It is a structure, a vocabulary, a review test and a pass that strips filler.

## 2. Structure: Diátaxis, four kinds of page, never mixed

Pstack's `technical-writing` skill layers Diátaxis, Google's developer style guide, Simplified Technical English and Global English **[S]**. Use the four Diátaxis types:

| Type | Reader's question | Example pages for us |
|---|---|---|
| **Tutorial** | "Teach me by doing" | Build your first workflow; write your first node |
| **How-to** | "Help me do X" | Self-host with Docker; add a credential type; debug a failed run |
| **Reference** | "Tell me the exact facts" | Node reference (generated from schemas), API reference, config options, error codes |
| **Explanation** | "Help me understand why" | How the engine works; why a run is a journal; why clean-room; threat model |

Folder layout:

```
docs/
  GLOSSARY.md              every domain word, one plain sentence each
  adr/                     one decision per file, plain language
  architecture/            explanation: overview, engine, editor, data model, security
  tutorials/
  how-to/
  reference/               mostly generated
  learn-by-reading/        the guided tour (see §5)
  research/                dated research notes with sources
```

Docs site: Fumadocs, Starlight or Docusaurus all fit **[V]**. Decide in the Stage 0 spike by checking: Markdown/MDX in the repo, Mermaid diagrams, search, versioning, build time, and how easily an agent can edit it.

## 3. ADRs a beginner can read

Addy's `documentation-and-adrs` skill says the most valuable docs capture the **why**, the context and alternatives **[S]**. A community `create-adr` skill uses `docs/adr/001-title.md` naming **[S]**. Our template adds a beginner layer:

```markdown
# ADR 0007: Use a Postgres journal for run history

Status: accepted   Date: 2026-11-02   Decided by: <name>

## In one sentence
We save every step a workflow takes in a database table, so a crashed run can continue.

## The problem, in plain words
If the server stops halfway through a workflow, we need to know which steps already happened.

## What we picked
...

## What we looked at and did not pick
| Option | Why not |
|---|---|

## What this costs us
...

## What would make us change our mind
...

## Words used here
Journal: ... (links to GLOSSARY.md)
```

**The beginner test** (a gate, not a hope): give the ADR to a fresh agent with no project context and the instruction "explain this to a smart 15-year-old." If it cannot, or invents things, the ADR fails review. Run the same test on every explanation page.

## 4. Skills and agents for writing the wiki

| Job | Tool |
|---|---|
| Pick the doc type and structure | pstack `technical-writing` (Diátaxis + Google style + STE) **[S]** |
| Explain a subsystem from the code | pstack `how` (walkthrough) and `why` (history and reasons), combined by `teach` **[S]** |
| Plain-language restatement | pstack `bro` **[S]** |
| Remove AI filler and tells | pstack `unslop` **[S]** |
| ADRs and decision records | Addy `documentation-and-adrs`; optional community `create-adr` **[S]** |
| Docs for agents (rules, specs) | Addy `context-engineering`, `documentation-and-adrs` ("Documentation for agents" section) **[S]** |
| Diagrams | Mermaid in Markdown; pstack `statechart` for state machines **[S]** |
| Reviewing a page | An `explainer` subagent (we write it): read-only, runs the beginner test and flags undefined words **[R]** |
| Keeping docs true | pstack `maintain-verification-skill` pattern: a script that checks docs against the code **[S]** |

Order of operations for a page: write with `technical-writing`, check terms against the glossary, run `unslop`, run the beginner test, then a human reads it.

## 5. The guided tour: `learn-by-reading/`

Because the best way for you to learn is to see the working thing first and then take it apart, each stage's teach-back becomes a chapter, in the order the system was built:

1. The 10-minute tour: run a sample workflow, read the trace.
2. From JSON to a run: types, graph validation, items.
3. Why ports: simulate a failure in a unit test.
4. The journal: pause a run, kill the server, resume.
5. The editor: how a click becomes a node.
6. Triggers and the queue.
7. Writing a node.
8. Security: what could go wrong.

Each chapter has: **What you will see** (run this command), **How it works** (diagram + 5 to 10 sentences), **Why it is built this way** (link to the ADR), **Try it** (a small change and what breaks), **Where the code is** (file links, with line-free anchors so links do not rot).

## 6. Generated reference (so it never drifts)

- Node reference generated from each node's Zod schema and metadata.
- API reference generated from the same schemas.
- Error code table generated from the error enum, with a plain-language "what to do."
- CI fails if a node has no docs page or an error code has no explanation.

## 7. Docs quality gates in CI **[R]**

- Link checker; Markdown lint; spell check with a project dictionary.
- Every code block in tutorials is extracted and run in CI where practical.
- Glossary check: a script flags capitalised domain terms that are not in `GLOSSARY.md`.
- ADR check: every ADR has the required sections and a status.
- Docs build must pass on PRs; a docs-only PR path stays fast.

## 8. Rules of thumb

- Define a term the first time, in the same sentence.
- One page, one purpose. If you are tempted to write "also," split the page.
- Explain with a concrete example before the general rule.
- Prefer a diagram plus five sentences over five paragraphs.
- Say what a thing is not, when beginners commonly confuse it.
- Write the "why" even when it feels obvious; it will not be obvious later.
- Never document how n8n's code works as if it were ours. Describe our behaviour.
