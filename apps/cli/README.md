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

The CLI runs under Node 26's TypeScript support, so workspace source imports use
explicit `.ts` extensions. The repo is typechecked with `noEmit`; a future emit
step will need a bundler or `rewriteRelativeImportExtensions`.

Boundary: may import `@krypton/schema`, `@krypton/engine`, and
`@krypton/nodes-core`. It must not import the API, worker, web editor, database,
or UI.
