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

- An expression is a whole field value of the form `{{ expression }}`. A field
  is active when its trimmed value starts with `{{` and ends with `}}`; mixed
  literal text and interpolation are deferred until the parser and escaping
  rules are proven. A literal that accidentally looks like a whole-field
  expression is returned with `{{ '{{text}}' }}`.
- References are limited to the current item (`$json`) and workflow input
  (`$input`). A named node output (`$node.<id>.json`) and run metadata
  (`$run.id`) need node-output history and run identity; those references are
  deferred until the engine has that state. Secrets are never addressable from
  expressions.
- The grammar supports literals, field access, comparisons, boolean logic,
  arithmetic, and parentheses. Equality is strict.
- There are no user-defined functions, loops, I/O, time, randomness, or prototype
  access in the first version. A small allowlist of pure functions can be added
  as a versioned grammar change.
- The parser validates syntax and known roots before a run. Missing fields and
  type errors are data-dependent and fail at the node during evaluation.
  Evaluation is bounded by expression length and depth and returns a typed error
  with a source location and a plain-language message.
- Property access reads own properties only. Unknown references and type errors
  fail with a useful message rather than falling back to JavaScript coercion.
- Workflow JSON records `expressionVersion`. A missing field defaults to `1` for
  compatibility with early Stage 1 files, which means a legacy whole-field-
  looking string is evaluated unless it is escaped as an expression. The engine
  accepts version `1` only and fails visibly for any other version.

Version 1 uses these concrete rules:

- Literals are JSON `null`, booleans, decimal numbers without an exponent, and
  single- or double-quoted strings with a small escape set.
- Dot access and literal bracket access are supported:
  `$json.customer.email`, `$json["customer"].email`, and `$json.tags[0]`.
  Brackets do not accept arbitrary expressions.
- Operators, from lowest to highest precedence, are `||`, `&&`, equality
  (`==`, `===`, `!=`, `!==`), comparison (`<`, `<=`, `>`, `>=`), additive
  (`+`, `-`), multiplicative (`*`, `/`, `%`), unary (`!`, `-`), member access,
  and parentheses. `==` and `===` both use strict equality; there is no loose
  equality operator. Primitives compare by value, while objects and arrays
  compare by reference in version 1.
- Arithmetic is numbers only. Boolean operators require booleans. Relational
  comparisons require two numbers or two strings. These rules avoid silent
  JavaScript coercion.
- The parser rejects an expression longer than 1,000 characters, more than 256
  AST nodes, or nesting deeper than 32 levels. Parameter trees are independently
  bounded to 64 levels so the engine cannot recurse without limit on a tree that
  bypassed the schema boundary.
- All node parameters are compiled before any node executes. A syntax error or
  unknown root fails the run before the first step. Missing fields and type
  errors fail the node during evaluation. Parameters are then evaluated per item
  before the node executor is called, so executors receive resolved JSON and
  never parse expressions themselves.

The Stage 1 runner now evaluates expressions. Node executors still receive a
plain `JsonObject` for `parameters`; the expression layer stays inside the pure
engine.

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
