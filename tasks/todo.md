# Stage 2 persistence foundation todos

- [x] Add pinned Drizzle, node-postgres, and Drizzle Kit dependencies.
- [x] Define the nine-table Postgres schema with checks, indexes, and foreign keys.
- [x] Add the typed database client and the `DATABASE_URL` boundary parser.
- [x] Generate the initial SQL migration and Drizzle metadata.
- [x] Add root `db:check`, `db:generate`, `db:migrate`, and `db:drift` commands.
- [x] Add unit coverage for the database and disposable-test URL guards.
- [x] Add a real-Postgres integration test for relationships and constraints.
- [x] Add `DATABASE_URL` and `TEST_DATABASE_URL` examples.
- [x] Write ADR 0023 and update the ADR index and architecture overview.
- [x] Document the database setup and the Bun isolated-linker workaround.
- [x] Add the Postgres service and integration target to CI.
- [x] Run the full gate, build, coverage, e2e, and deleted-test guard.
- [ ] Review the diff and open the persistence PR; do not merge without approval.

## Follow-on slices

- [ ] Add the `RunStore` port and Postgres adapter.
- [ ] Add Hono API routes for workflows, versions, executions, and SSE.
- [ ] Add minimal auth/session endpoints and the in-process rate limiter.
- [ ] Add credential encryption/decryption and key-version handling.

## Gate result (2026-11-01)

- `bun run check` passed: guardrails, doc links, format, lint, types, migration
  metadata, and 227 unit tests.
- `bun run build` passed.
- Coverage passed at 96.76% statements, 93.31% branches, 98.73% functions, and
  96.7% lines.
- `bun run db:drift` reported a clean schema/migration match.
- The Playwright smoke test and the deleted-test guard passed.
- `bun run test:integration` passed both schema integration tests against a
  disposable Postgres 17 container.
- `bun run db:migrate` applied the committed migration to an empty database.

## Files

- `apps/api/src/db/schema.ts`
- `apps/api/src/db/client.ts`
- `apps/api/src/db/postgres-url.ts`
- `apps/api/src/db/test-database.ts`
- `apps/api/src/db/migrate.ts`
- `apps/api/src/db/schema.integration.test.ts`
- `apps/api/src/db/client.test.ts`
- `apps/api/src/db/test-database.test.ts`
- `apps/api/drizzle.config.ts`
- `apps/api/drizzle/`
- `scripts/check-drizzle-drift.ts`
- `vitest.integration.config.ts`
- `docs/adr/0023-persistence-schema-and-migrations.md`
- `tasks/plan.md`
- `tasks/todo.md`

## Review checks

- Every table has a clear owner and lifecycle.
- The current-version pointer has no FK and the reason is documented.
- Executions restrict workflow deletion; a composite FK keeps an execution's
  version in the same workflow; journal rows cascade from executions.
- `TEST_DATABASE_URL` cannot point at a non-`_test` database, at `DATABASE_URL`,
  or at a remote host without an explicit opt-in.
- The integration target applies the committed migrations and passes.
- No credential or session secret is stored in plaintext by the schema or test
  fixtures; generic JSONB write paths must redact secrets.
- `bun run check`, `bun run db:check`, and `bun run db:drift` pass.
