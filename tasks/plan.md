# Implementation Plan: Stage 2 persistence foundation

## Overview

Start Stage 2 with the durable data model: a Postgres schema, Drizzle mappings,
committed migrations, and real-database integration coverage. This slice gives
the API a stable place to store workflows, versions, executions, journal rows,
sessions, credentials, triggers, and settings. It does not add HTTP routes or the
durable `RunStore` adapter yet.

The database is behind `apps/api`; the engine stays pure. The next slices add the
`RunStore` port/adapter and the API control plane.

## Architecture Decisions

- Use Postgres 17, Drizzle ORM `0.45.4`, node-postgres `8.23.1`, and Drizzle Kit
  `0.31.11`, all pinned exactly. Record the schema and migration policy in
  [ADR 0023](../docs/adr/0023-persistence-schema-and-migrations.md).
- Keep text primary keys to match the existing branded string IDs and readable
  workflow IDs. The API generates UUID-shaped IDs for records it owns.
- Store workflow graphs in `workflow_versions.graph` JSONB and validate them with
  `@krypton/schema` before insert. Version rows are immutable by API convention.
- Keep `workflows.current_version_id` without a foreign key because a simple FK
  would prevent dangling IDs but not a version owned by another workflow; the
  future publish path validates existence, ownership, and immutability
  transactionally.
- Make `execution_journal` append-only in convention, with a unique
  `(execution_id, sequence, attempt)` tuple so retries are visible. SSE ordering
  uses `(sequence, attempt)`.
- Use a composite foreign key so an execution's version belongs to its workflow.
- Make `users.email` unique case-insensitively through a `lower(email)` index.
- Restrict workflow deletion when executions exist; archive workflows instead.
- Make migrations forward-only. Use expand/contract for destructive changes and
  restore from backup as the rollback plan. CI runs `db:drift` to catch schema
  changes that were not generated into a migration.
- Run database tests against a real Postgres instance. `TEST_DATABASE_URL` must
  name a disposable `*_test` database because the suite resets `public` and the
  Drizzle bookkeeping schema. The URL guard also rejects the same
  host/port/database as `DATABASE_URL` and remote hosts without an explicit
  opt-in.
- Document the root `drizzle-orm` dev dependency: Bun's isolated linker does not
  expose the schema library to the Drizzle Kit binary.

## Scope

### In

- Add exact Drizzle, `pg`, and Drizzle Kit dependencies.
- Add the nine-table schema, indexes, checks, and foreign keys.
- Add the typed database client and `DATABASE_URL` boundary parser.
- Generate and commit the initial SQL migration and metadata.
- Add explicit `db:migrate`, `db:check`, `db:generate`, and `db:drift` commands.
- Add a real-Postgres integration test and a CI service job.
- Add `DATABASE_URL` and `TEST_DATABASE_URL` examples.
- Add ADR 0023 and update the architecture/data-model links.

### Out

- The `RunStore` port and Postgres adapter.
- Hono routes, auth, sessions endpoints, workflow CRUD, execution APIs, and SSE.
- Credential encryption/decryption implementation and key management.
- Worker queue claiming, leases, retention, replay, and crash-and-resume.
- UI or editor work.

## Testing Strategy

- Unit-test the `DATABASE_URL` and `TEST_DATABASE_URL` boundary parsers,
  including missing values, wrong protocols, unsafe test URLs, and loopback
  aliases.
- Run the integration target against a disposable Postgres 17 database. It removes
  the `public` and `drizzle` bookkeeping schemas, reapplies the committed
  migrations, and checks:
  - the workflow/version/execution/journal relationship,
  - JSONB graph and journal payload round-trips, including named output ports,
  - the unique workflow-version and case-insensitive user-email constraints,
  - retry attempt 2 with the same sequence and the unique journal tuple,
  - workflow and version deletion restrictions, and journal cascade behavior.
- Keep integration tests out of the fast unit suite so `bun run check` stays
  database-free; CI runs both targets.
- Add a `postgres:17-alpine` service to the integration CI job and run
  `bun run db:check` plus `bun run test:integration`. The check job runs
  `bun run db:drift`.
- Run `bun run check`, `bun run build`, `bun run test:coverage`, `bun run e2e`,
  and the deleted-test guard before the PR.

## Risks and Mitigations

- **Schema drift:** commit the generated SQL and snapshot, run `db:check` in the
  fast gate, and run `db:drift` in CI. Review the SQL, not just the TypeScript
  schema.
- **Migration mistakes:** migrations are forward-only, so a bad migration needs a
  corrective follow-up or restore. Keep this first migration additive and review
  every constraint.
- **Destructive integration setup:** reject any test URL whose database name does
  not end in `_test`, reject the same database as `DATABASE_URL`, and require a
  loopback host unless the operator explicitly opts into a disposable remote
  database.
- **Bun isolated linker:** keep the documented root `drizzle-orm` workaround and
  pin it to the same version as the API.
- **Circular version pointer:** keep the missing FK explicit and make the future
  publish path validate it in one transaction.
- **Journal volume:** defer retention and partitioning until Stage 4 has real run
  data; do not prematurely optimize the append path.

## Definition of Done

- `bun run check` passes.
- `bun run db:check` and `bun run db:drift` pass.
- The integration target passes against a real Postgres 17 database.
- CI runs the integration target with a Postgres service.
- ADR 0023, the ADR index, the API README, and the architecture overview agree
  with the code.
- Credentials are represented as encrypted material only; no plaintext secret is
  stored or logged by this slice.
- The diff is small enough for a human to walk through.
