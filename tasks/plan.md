# Implementation Plan: Stage 1 teach-back

## Overview

Close Stage 1 with a readable chapter that follows one item through the triage
workflow. The chapter must connect the JSON boundary, the engine queue, named
ports, the trace, and the simulation tests without pretending that the durable
journal already exists.

The chapter is a learning document, not a new engine feature. It uses the real CLI
output and links to the code and ADRs that make the behavior true.

## Architecture Decisions

- Put the chapter in `docs/learn-by-reading/01-how-the-engine-works.md`, following
  the repo's chapter shape: what you will see, how it works, why, try it, and
  where the code is.
- Use the existing triage example rather than inventing a second workflow. The
  example already exercises a trigger, Set, IF, a branch, and a terminal node.
- Be explicit that the Stage 1 trace is not the durable journal. Persistence,
  replay, and crash-and-resume are Stage 2 or later.
- Link to files without line numbers so the chapter does not rot.
- Do not add runtime code, ports, dependencies, or new node behavior.

## Scope

### In

- The Stage 1 teach-back chapter.
- Learning-path and documentation-index links.
- A glossary distinction between a node's output port and an engine port.
- A status note that Stage 1 code is complete and the teach-back is ready for
  review.
- Task plan and todo replacement.

### Out

- Stage 2 schema, API, Postgres, credentials, or worker work.
- A durable journal implementation.
- Reopening engine behavior or adding new nodes.
- A docs site or generated reference.

## Testing Strategy

- Run the exact CLI command in the chapter and compare the trace and output.
- Run the triage expect test and the property test named in the chapter.
- Run `bun run check` for doc links, formatting, lint, types, and unit tests.
- Build, coverage, e2e, and the deleted-test guard remain unchanged by this
  docs-only slice, but the normal gate still runs before the PR.

## Risks and Mitigations

- **Stale trace:** keep the example output small and say that timings vary; the
  code links and the inline test snapshot are the durable checks.
- **Journal confusion:** a dedicated "What is not here yet" section prevents the
  trace from being mistaken for persisted state.
- **Over-teaching:** keep the chapter focused on one item's path, then link to the
  ADRs and glossary for the details.

## Definition of Done

- The chapter runs the triage workflow and explains every trace line.
- The chapter has a diagram, design rationale, a small experiment, and exact code
  links.
- The learning path and docs index link to the chapter.
- `bun run check` passes.
- The diff is small enough for a human to walk through.
