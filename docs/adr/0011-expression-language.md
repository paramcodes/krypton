# 0011 — Expression language: small safe language before sandboxed JS

- Status: accepted
- Date: 2026-10-27
- Deciders: project owner, engine implementation owner

## Context

Node fields need dynamic values: a name from the previous item, a URL built from
a webhook body, a condition comparing two numbers. Users will expect a syntax
like `{{ $json.customer.email }}`. Arbitrary JavaScript in every field is unsafe,
hard to autocomplete, and hard to make deterministic.

The Code node is a separate, much larger security surface. It needs its own
sandbox decision in [ADR 0012](0012-code-sandbox.md); it is not a shortcut for
field expressions.

## Decision

Build a small expression language for field values. Do not use `eval`,
`new Function`, or a general JavaScript parser.

The first version is deliberately narrow:

- An expression is a whole field value of the form `{{ expression }}`. Mixed
  literal text and interpolation are deferred until the parser and escaping
  rules are proven.
- References are limited to the current item (`$json`), workflow input
  (`$input`), a named node output (`$node.<id>.json`), and run metadata
  (`$run.id`). Secrets are not addressable from expressions.
- The grammar supports literals, field access, comparisons, boolean logic,
  arithmetic, and parentheses. Equality is strict.
- There are no user-defined functions, loops, I/O, time, randomness, or prototype
  access in the first version. A small allowlist of pure functions can be added
  as a versioned grammar change.
- The parser validates syntax and references before a run. Evaluation is bounded
  by expression length and depth and returns a typed error with a source
  location and a plain-language message.
- Property access reads own properties only. Unknown references, unknown
  functions, and type errors fail with a useful message rather than falling back
  to JavaScript coercion.
- When the expression parser lands, the workflow JSON will record an expression
  version so a later grammar can keep old workflows readable. The current
  execution slice has no expression evaluator and therefore no version field
  yet.

The Stage 1 execution slice does not evaluate expressions yet. It establishes
the workflow shape, node contract, and deterministic runner that the expression
parser plugs into next.

## Alternatives considered

- **Restricted JavaScript in a sandbox** — familiar, but heavier, harder to
  secure, and awkward to autocomplete in a small field. It also makes a simple
  condition depend on a second runtime.
- **Full JavaScript in a separate sandbox** — powerful, but belongs in the Code
  node. It is not a safe default for every parameter field.
- **Template-only substitution with no operators** — simple, but cannot express
  the common conditions that make a workflow useful.

## Consequences

- We own a parser, evaluator, error model, and versioning policy. Keep the first
  version small and test precedence, escaping, and failure cases thoroughly.
- Expressions remain deterministic and testable under simulation because they
  have no ambient access to time, randomness, network, or process state.
- Users get one safe syntax in fields and a separate, explicit Code node for
  arbitrary logic. The two surfaces must not silently blur.
- New syntax or functions require an ADR update and tests; they are not ad-hoc
  additions to node implementations.

## Revisit when

- Real workflows need a construct the small language cannot express safely.
- The sandbox decision makes restricted JavaScript cheap enough to prefer in
  fields.
- The expression version needs a breaking grammar change.
