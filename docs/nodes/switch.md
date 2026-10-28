# Switch node

The `switch` node routes the current item to one named output port by comparing
a JSON scalar value against a list of scalar cases. It leaves the item unchanged
and uses the engine's existing named-port connections to continue the workflow.

## Parameters

```json
{
  "value": "{{ $json.status }}",
  "cases": [
    { "value": "paid", "port": "paid" },
    { "value": "refunded", "port": "needs-review" }
  ]
}
```

- `value` is required and must resolve to a string, finite number, boolean, or
  `null`.
- `cases` is a required, non-empty array of objects with scalar `value` and
  non-empty `port` fields.
- Case values must be unique and compare with strict, same-type equality. For
  example, number `1` does not match string `"1"`.
- Different case values may share one port to group routes.
- Port names may not contain control characters or use the reserved engine name
  `error`.

Parameters support the existing whole-field expression syntax, so `value` and
case values can be selected per item. Validation runs after expression
evaluation; a duplicate value or object/array result fails the node rather than
silently selecting a route.

## Routing

The first matching case sends the unchanged item to its named port. If no case
matches, the item goes to the fixed `default` port. Connect a downstream node
using that exact output name:

```json
{
  "connections": [
    { "from": "route", "fromPort": "paid", "to": "send-receipt" },
    { "from": "route", "fromPort": "needs-review", "to": "check-refund" },
    { "from": "route", "fromPort": "default", "to": "manual-review" }
  ]
}
```

The Switch node does not inspect graph connections or perform fan-out itself;
the engine routes items along connections whose source port matches the emitted
port. The readable trace reports the selected route, for example `switch paid`.

The node also has the standard engine-level `error` output. It is only used when
the node instance's `errorPolicy` is `route` and the node fails; a Switch case
port cannot use that reserved name. See
[error policies and error routes](../error-routes.md).

See [ADR 0016](../adr/0016-switch-node.md) for the design decision.
