# Stage 1 teach-back todos

- [x] Write the Stage 1 chapter with the real triage trace.
- [x] Explain the item queue, start nodes, named ports, and terminal outputs.
- [x] Explain why the engine uses ports and simulation.
- [x] Call out that the Stage 1 trace is not the durable journal.
- [x] Add the chapter to the learning path and docs index.
- [x] Add a small false-branch experiment that does not edit tracked files.
- [x] Add "where the code is" links without line numbers.
- [x] Distinguish output ports from engine ports in the chapter and glossary.
- [x] Replace the property-test plan and todo with this close-out slice.
- [x] Update the Stage 1 status wording without claiming the teach-back is reviewed.
- [x] Run the full gate: format, check, build, coverage, e2e, and deleted-tests.
- [x] Get an independent explainer review and fix the findings.
- [ ] Review the diff and open the teach-back PR; do not merge without permission.

## Gate result (2026-10-28)

- `bun run check` passed: guardrails, doc links, format, lint, types, and 209 tests.
- `bun run build` passed.
- Coverage passed at 96.76% statements, 93.31% branches, 98.73% functions, and
  96.7% lines.
- The Playwright smoke test and the deleted-test guard passed.
- The explainer review reported "ready for human review" after the terminology,
  start-node, retry-trace, error-port, and final-output fixes.

## Files

- `docs/learn-by-reading/01-how-the-engine-works.md`
- `docs/learn-by-reading/README.md`
- `docs/README.md`
- `README.md`
- `docs/architecture/overview.md`
- `docs/GLOSSARY.md`
- `tasks/plan.md`
- `tasks/todo.md`

## Review checks

- The CLI trace in the chapter matches the current command output.
- The chapter says the trace is not the journal and keeps crash-and-resume in
  Stage 2.
- The chapter links to ADR 0005, 0013, 0014, 0015, and 0022.
- The glossary distinguishes a node's output port from an engine port.
- The false-branch experiment works with a copy of the input file.
- `bun run check` passes.
