# Examples

Run the Stage 1 triage workflow in the terminal:

```sh
bun run cli -- run examples/triage.workflow.json --input examples/triage.input.json
```

The workflow starts with a Manual Trigger, adds a field with Set, chooses a
branch with IF, and prints the items that reach the selected terminal node. The
IF condition is the whole-field expression `{{ $json.plan == 'trial' }}`, which
evaluates to `true` for the example input. The `decline` branch is present but
does not execute. The workflow records `expressionVersion: 1`.
