# Implementation Plan: Node catalog

## Overview

Add a typed, validated catalog of node ports and parameter fields in
`@krypton/node-sdk`, populate it for every core node, and expose it through
`krypton nodes [--json]`. This is the metadata contract for the future editor,
not an editor implementation.

## Architecture Decisions

- Keep metadata in `node-sdk`; `engine` remains unaware of built-in node types.
- Use a small discriminated union instead of JSON Schema or a new dependency.
  It covers nested Switch cases without adopting a general schema vocabulary.
- Keep executors authoritative for resolved parameter validation. The catalog
  describes shape for forms.
- Enforce catalog/registry completeness with a test in `nodes-core`.
- Validate catalog input at the boundary so third-party catalogs can reuse the
  parser later.

## Task List

### Phase 1: Catalog contract

- [x] Task 1: Add catalog types and parser with failing-first tests.

### Checkpoint: Contract

- [x] Valid entries parse and round-trip through JSON.
- [x] Duplicate types, ports, keys, invalid defaults, and malformed fields fail.

### Phase 2: Core metadata

- [x] Task 2: Add `coreNodeCatalog` for all current core nodes.

### Checkpoint: Core catalog

- [x] Every executor has exactly one entry and every entry parses.
- [x] Switch declares its fixed `default` port and dynamic case ports.

### Phase 3: Consumption

- [x] Task 3: Add `krypton nodes [--json]` and tests.

### Checkpoint: CLI

- [x] Readable output lists nodes, ports, and parameters.
- [x] `--json` output parses and matches the catalog.
- [x] Unknown options fail with usage.

### Phase 4: Record

- [x] Task 4: Add ADR 0018 and catalog documentation.

### Checkpoint: Complete

- [x] Documentation links resolve.
- [x] `BASE_SHA=main bun run check`, `build`, `test:coverage`, and `e2e` pass.
- [x] Diff reviewed and ready for PR.

## Risks and Mitigations

| Risk                                               | Impact | Mitigation                                                       |
| -------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| Catalog metadata drifts from executor behavior.    | Medium | Registry completeness test; executors stay authoritative.        |
| A field kind cannot express a future node.         | Low    | Extend the union with the first consumer, not speculatively.     |
| Users expect an editor from "UI parameter schema". | Medium | Document that this is the editor contract, not React components. |
| Third-party catalogs inject unsafe text.           | Low    | Parse at the boundary and reject control characters.             |

## Open Questions

- None for this slice. A real editor remains Stage 3 work.
