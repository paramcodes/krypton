# 0011 — Expression language: small safe language before sandboxed JS

- Status: proposed
- Date: 2026-10-27
- Deciders: project owner, engine implementation owner

## Context

Node fields need dynamic values: a name from the previous item, a URL built from
a webhook body, a condition comparing two numbers. Users will expect a syntax
like `{{ $json.customer.email }}`. Arbitrary JavaScript in every field is unsafe,
hard to autocomplete, and hard to make deterministic.

## Options

- **Own small expression language** — a parser and evaluator with a fixed set of
  value references, operators, and pure functions. No loops, no I/O, no `eval`.
- **Restricted JavaScript in a sandbox** — familiar, but heavier, harder to
  secure, and awkward to autocomplete in a small field.
- **Full JavaScript in a separate sandbox** — powerful, but belongs in the Code
  node, not in every parameter field.

## Leading candidate

Build a small expression language for field values, and keep arbitrary JavaScript
for the Code node behind the separate sandbox decision in
[ADR 0012](0012-code-sandbox.md).

The language should support:

- References to the current item, workflow input, node output, and run metadata.
- Literals, comparisons, boolean logic, arithmetic, and string interpolation.
- A small allowlist of pure functions (for example `lower`, `upper`, `length`,
  `json`, `date`).
- Static validation and autocomplete from the schema.
- Errors with a source location and a plain-language message.
- A versioned grammar so old workflows keep working.

## Spike criteria

1. Parse and evaluate the common cases without `eval` or `new Function`.
2. Reject unknown references and functions at save time.
3. Bound evaluation time and output size.
4. Produce useful errors for a missing field and a type mismatch.
5. Serialize the expression and its version in the workflow JSON.
6. Test with property-based cases for precedence and escaping.

## Consequences until decided

- Do not add an expression evaluator or a JavaScript dependency yet.
- The workflow schema will reserve a field syntax, but the parser is Stage 1 work.
- The Code node is not a shortcut for expressions. It is a separate, sandboxed
  feature with a different threat model.

## Revisit when

- The Stage 1 spike completes.
- Real workflows need a construct the small language cannot express safely.
- The sandbox decision makes restricted JavaScript cheap enough to prefer.
