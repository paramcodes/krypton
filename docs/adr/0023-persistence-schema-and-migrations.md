# 0023 — Persistence schema and migration policy

- Status: accepted
- Date: 2026-10-30
- Deciders: project owner, API and persistence implementation owner

## Context

Stage 2 makes workflows and runs survive restarts and gives the API something
durable to read. The target data model is in
[`docs/architecture/overview.md`](../../docs/architecture/overview.md): users,
sessions, workflows, workflow version snapshots, executions, a node-attempt
execution journal, credentials, triggers, and instance settings.

The engine must stay pure and cannot import a database driver. Persistence lives
in `apps/api`, behind the future `RunStore` port and the API's service layer. The
schema must support deterministic replays, lease-based worker recovery in Stage
4, SSE catch-up from a journal sequence, and the rule that credentials are never
returned or journaled in plaintext.

The project already standardises on Postgres 17 in `compose.yaml`. The exact SQL,
indexes, and migration tool were deliberately left to Stage 2.

## Decision

Use **Postgres 17**, **Drizzle ORM `0.45.4`**, **node-postgres `8.23.1`**, and
**Drizzle Kit `0.31.11`**. All versions are pinned exactly. Drizzle Kit is a
development tool; the API uses `drizzle-orm` and `pg` at runtime.

The schema is in `apps/api/src/db/schema.ts`, the connection boundary is in
`apps/api/src/db/client.ts`, and generated SQL migrations live in
`apps/api/drizzle/`.

### Tables

- **`users`** — local account identity. `id` is text, `email` is unique
  case-insensitively through a `lower(email)` index, `password_hash` is never
  plaintext, and `role` is checked as `admin` or `member`. The schema defaults to
  `member`; the future bootstrap path must explicitly create the first admin. A
  single-admin instance still uses this row.
- **`sessions`** — cookie-session metadata. Only a token hash is stored, never the
  raw cookie. Expiry and revocation are timestamps; deleting a user cascades.
- **`workflows`** — mutable metadata, creator, archive timestamp, and
  `current_version_id`. The current-version pointer intentionally has no foreign
  key because a simple FK would prevent dangling IDs but not a version that belongs
  to another workflow. The future publish path must validate existence, ownership,
  and immutability in one transaction.
- **`workflow_versions`** — graph snapshots, immutable by API convention. `graph`
  is JSONB validated by `@krypton/schema` before insert. `(workflow_id, version)` is
  unique, versions must be positive, and deleting a workflow cascades to its
  versions.
- **`executions`** — one run of one workflow version snapshot. `status` is checked as
  `queued`, `running`, `succeeded`, `failed`, or `cancelled`. Trigger, input,
  outputs, and a redacted error are JSONB. A composite foreign key requires the
  referenced version to belong to the execution's workflow. The lease fields are
  reserved for the Stage 4 worker. Workflow and version deletion is restricted so
  run history is not silently destroyed; archive the workflow instead.
- **`execution_journal`** — node-attempt records, append-only by API convention.
  Each row is written after an attempt finishes, with a per-execution `sequence`
  and an `attempt`; `(execution_id, sequence, attempt)` is unique. The row stores
  node identity, final status, the input item, named output ports and items, a
  redacted error, and timings. Journal rows cascade when an execution is deleted.
  SSE catch-up must order by `(sequence, attempt)`, not sequence alone, because a
  retry reuses the sequence. In-flight attempts are represented by the execution's
  lease and status, not by a mutable journal row.
- **`credentials`** — encrypted secret material plus metadata. The database stores
  ciphertext, IV, auth tag, and key version. Encryption and decryption belong to
  the API/service boundary; plaintext never enters logs, traces, journal rows, or
  API responses. Names are unique in the single-instance model.
- **`triggers`** — one table for manual, schedule, and webhook registrations. The
  type is checked, `config` is JSONB, and a webhook may store only a secret hash.
  Deleting a workflow cascades to its triggers.
- **`settings`** — instance configuration as key/value JSONB.

IDs are text because the shared schema already uses branded string IDs and
existing workflow files use readable IDs. The API generates UUID-shaped IDs for
records it owns; the database does not require that shape.

Timestamps are `timestamptz`. Application code sets `updated_at`; Stage 2 does
not add database triggers for it. JSONB columns are validated by the API at the
boundary and parsed into typed values on read. `$type<T>()` is a compile-time
convenience, not runtime validation. Generic JSONB columns can hold user data, so
the future write path must store credential references instead of resolved secrets
and must redact payloads before persistence.

### Migrations

- Generated SQL migrations and their Drizzle metadata are committed.
- Migrations are **forward-only**. There are no down migrations. Never edit or
  rename an applied migration; add a new one. Destructive changes use
  expand/contract: add and backfill first, switch readers, then remove the old
  shape in a later release. Restoring from a backup is the rollback plan.
- `bun run db:check` validates the migration journal and snapshots. It does not
  load `schema.ts`, so it cannot detect schema drift by itself.
- `bun run db:drift` regenerates migrations in a temporary directory and fails if
  `schema.ts` and the committed migration files diverge. CI runs it before the
  fast gate. `bun run db:check` still runs in `bun run check` for metadata
  validation.
- `bun run db:migrate` applies pending migrations explicitly and loads the
  repo-root `.env` when it exists; explicit environment variables win. The API
  does not migrate on startup.
- `bun run db:generate` generates the next SQL file and snapshot after a schema
  change. Review the SQL before committing it.
- Generated migration files are excluded from Oxfmt because Drizzle Kit owns
  their formatting.
- Bun's isolated linker does not expose `drizzle-orm` to the Drizzle Kit binary,
  so the root workspace keeps a pinned `drizzle-orm` development dependency for
  the generator. The API keeps its own runtime dependency; `pg` remains available
  to the API's migration script.

### Integration tests

Database tests run against a real Postgres instance, not an in-memory fake. They
are a separate Vitest target (`bun run test:integration`) so the fast unit suite
does not require a database. `TEST_DATABASE_URL` must point at a disposable
database whose name ends in `_test`; the guard rejects a non-Postgres URL, the
same host/port/database as `DATABASE_URL`, and a remote host unless
`TEST_DATABASE_ALLOW_REMOTE=true`. The suite removes the `public` and `drizzle`
bookkeeping schemas, recreates `public`, applies the committed migrations, and
then tests relationships, constraints, JSONB round-trips, and cascades. CI runs
the target with a `postgres:17-alpine` service. There is no skipped integration
test: if the URL is missing or unsafe, the target fails with a clear message.

## Alternatives considered

- **Prisma** — strong migration tooling, but a generated client and a heavier
  runtime for a schema this small.
- **Kysely plus hand-written SQL** — good SQL types, but we would maintain a
  separate schema and migration format.
- **Raw SQL only** — maximum control, but more mapping code and easier drift
  between runtime types and tables.
- **One JSONB document per run instead of a journal table** — simple writes, but
  poor ordered streaming, weak queryability, and no natural per-attempt record.
- **Separate webhook and schedule tables** — more explicit, but duplicates
  enable/disable, ownership, and lifecycle fields for little gain in v1.
- **UUID primary keys everywhere** — a good default, but it conflicts with
  existing readable workflow and node IDs and would force a translation layer.

## Consequences

- The API owns the current-version invariant and graph parsing; the database
  cannot enforce version ownership through the circular pointer, so the publish
  path validates it transactionally.
- Workflow versions are immutable and journal rows are append-only by convention
  in this slice. A later stage may add triggers or role-based protection after the
  write path is settled.
- Execution history is intentionally protected from workflow deletion. The API
  must offer archive, not hard delete, once runs exist.
- JSONB keeps migrations cheap but moves validation into application code. Every
  read path that trusts a JSON column must parse it, and every write path must
  redact secrets before storing generic JSON.
- Integration tests add a container/service dependency to CI and local
  development, but they prove the SQL and migration path that unit tests cannot.
- Credential encryption is still an API obligation. The table shape alone does not
  make a secret safe.
- Journal retention, partitioning, and archival are deferred until real run volume
  data exists.

## Revisit when

- Stage 4 adds a durable worker queue or changes lease/claim semantics.
- Journal volume makes retention or partitioning necessary.
- Credential key rotation needs more than a `key_version` column.
- Drizzle 1.0 stabilises or its migration tooling changes materially.
- A destructive schema change needs a different rollback policy.
