# Expressions

Expressions are small, sandboxed value references for node fields. They do not
run JavaScript, call functions, or reach the network, time, randomness, or
secrets.

## Whole-field syntax

A field is an expression only when its entire value is wrapped in double braces:

```json
{
  "condition": "{{ $json.plan === 'trial' }}",
  "name": "{{ $json.customer.name }}"
}
```

A field is treated as an expression when its trimmed value starts with `{{` and
ends with `}}`; the whole inside is then parsed as one expression. Mixed text
that does not meet both boundaries, such as `"Hello {{ $json.name }}"`, stays a
literal string. That means a string that starts and ends with braces is not a
literal by accident; use an expression that returns the text instead, for example
`"{{ '{{literal}}' }}"`. Interpolation is not part of version 1.

## References

| Reference | Meaning                     |
| --------- | --------------------------- |
| `$json`   | The current item            |
| `$input`  | The workflow's input object |

`$json` changes for every item. `$input` stays the same for the whole run.
`$node` and `$run` are not available yet because the engine does not have node
output history or a run identity in this stage.

Access object fields with dots or quoted brackets, and array items with a
numeric index:

```text
$json.customer.email
$json["customer"].email
$json.tags[0]
```

Only own properties are read. Missing fields, prototype properties, and invalid
array indexes fail the run with an error instead of falling back to `undefined`.

## Operators

From lowest to highest precedence:

```text
||
&&
==  ===  !=  !==
<   <=   >   >=
+   -
*   /   %
!   -
.   []
( )
```

Equality is strict. `==` and `===` both compare without coercion; there is no
loose equality. Primitive values compare by value. Objects and arrays compare by
reference in version 1, so two separately built objects are not equal; compare
their fields instead. Arithmetic requires numbers. Boolean operators require
booleans, and relational comparisons require two numbers or two strings. This
keeps a typo from silently turning into JavaScript coercion.

Supported literals are `null`, `true`, `false`, decimal numbers such as `12` and
`1.5`, and single- or double-quoted strings. Numbers do not accept exponent
notation. Strings support `\\`, `\'`, `\"`, `\n`, `\r`, `\t`, `\b`, `\f`, and
`\uXXXX` escapes.

## Evaluation

All node parameters are compiled before the first node runs. A syntax error or
unknown `$reference` therefore fails the run before any step executes. Missing
fields and type errors depend on the item, so they fail the node when its
parameters are evaluated. Parameters are evaluated once per item, before the
node executor is called. The executor sees resolved JSON values, not expression
strings.

Errors include the parameter path, a plain-language message, and a position in
the expression:

```text
$.parameters.condition: Unknown field "plan" at position 7.
```

## Limits and versioning

Version 1 rejects expressions longer than 1,000 characters, more than 256 AST
nodes, and nesting deeper than 32 levels.

Workflows record `expressionVersion`. A missing field defaults to `1` so early
Stage 1 files remain readable. That also means a legacy file which used a
whole-field-looking string as plain text must escape it with an expression like
`"{{ '{{old text}}' }}"`. Record `expressionVersion` explicitly in new files.
The engine supports version `1` only and fails the run with a clear message for
any other version.

The design rationale and deferred features are in
[ADR 0011](adr/0011-expression-language.md).
