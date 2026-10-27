# @krypton/cli

Run a validated workflow from JSON in the terminal. The CLI is a Stage 1
development tool: it wires the pure engine to the built-in nodes and prints the
run trace plus terminal output items. It does not persist runs.

```sh
bun run cli -- run examples/triage.workflow.json --input examples/triage.input.json
```

The workflow and input are parsed at the boundary. Invalid JSON, unknown node
references, and node parameter errors fail with a non-zero exit code. Each JSON
file is capped at 1 MiB.

The CLI supplies the real `Clock` and `Http` ports. HTTP requests have an
explicit timeout, a response-size cap, and no automatic redirects. Private,
loopback, link-local, and reserved address ranges are blocked by default, and the
validated DNS address is pinned before connecting. See
[`docs/http-requests.md`](../../docs/http-requests.md) for the node parameters,
retry policy, and output shape.

Node parameters may contain whole-field expressions such as
`"{{ $json.plan === 'trial' }}"`. Expressions are compiled before the run and
evaluated per item; see [`docs/expressions.md`](../../docs/expressions.md) for
the syntax, limits, and supported references. The example workflow records
`expressionVersion: 1` and uses an expression for its IF condition.

The CLI runs under Node 26's TypeScript support, so workspace source imports use
explicit `.ts` extensions. The repo is typechecked with `noEmit`; a future emit
step will need a bundler or `rewriteRelativeImportExtensions`.

Boundary: may import `@krypton/schema`, `@krypton/engine`, and
`@krypton/nodes-core`. It must not import the API, worker, web editor, database,
or UI.
