# Spikes

A spike is a timeboxed investigation, usually one hour. It ends with an ADR, even
if the answer is "not yet." A spike that does not end in a decision is unfinished.

| Spike                  | Status   | Outcome                                                                                        |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| Docs site generator    | resolved | Starlight; [ADR 0009](../adr/0009-docs-site.md)                                                |
| Oxlint boundary plugin | resolved | Built-in `no-restricted-imports` with custom messages; [ADR 0003](../adr/0003-quality-gate.md) |
| API framework          | open     | Hono candidate, Fastify fallback; [ADR 0010](../adr/0010-api-framework.md)                     |
| Expression language    | open     | Small safe language before sandboxed JS; [ADR 0011](../adr/0011-expression-language.md)        |
| Code node sandbox      | open     | Isolated runtime, never the API process; [ADR 0012](../adr/0012-code-sandbox.md)               |

## Resolved notes

### Docs site generator

The docs are mostly Markdown with a guided tour and a generated node reference.
Starlight keeps the docs app independent of the product runtime and avoids adding
Next.js to the planned Vite/React editor. The content remains portable Markdown.

### Oxlint boundary plugin

Oxlint's `no-restricted-imports` supports `paths`, `patterns`, and custom messages,
which is enough for package boundaries and engine purity. A custom JS plugin
would add maintenance without adding enforcement. The temp-repo tests in
`scripts/check-guardrails.test.ts` exercise the messages and a failing command;
[ADR 0003](../adr/0003-quality-gate.md) records the evidence.

## Open spike rules

- Write the question and pass/fail criteria before starting.
- Use a throwaway branch or a temporary probe. Do not leave probe code behind.
- Record the evidence, including commands and versions.
- End with an ADR update: accepted, rejected, or superseded.
- Do not merge production code from a spike until the ADR is accepted.
