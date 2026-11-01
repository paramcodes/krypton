# @krypton/api

The HTTP API and control plane. Hono is the accepted framework; see
[ADR 0010](../../docs/adr/0010-api-framework.md) and the
[spike evidence](../../docs/spikes/api-framework.md).

Stage 2 has started with persistence. The API routes, auth, SSE, and the durable
`RunStore` adapter are next.

## Database

The Drizzle schema is in `src/db/schema.ts`; generated migrations are committed in
`drizzle/`. The schema and migration decisions are in
[ADR 0023](../../docs/adr/0023-persistence-schema-and-migrations.md).

```sh
bun run db:migrate   # apply pending migrations (reads DATABASE_URL or the repo-root .env)
bun run db:check     # validate the Drizzle migration metadata
bun run db:drift     # regenerate in a temp directory and fail on schema drift
bun run db:generate  # generate the next migration after a schema change
```

`db:check` validates the migration journal and snapshots; it does not load
`schema.ts`. CI runs `db:drift`, which regenerates migrations in a temporary
directory and fails if `schema.ts` and the committed migration files diverge.

`db:migrate` is a small programmatic runner in `src/db/migrate.ts` so it uses this
package's `pg` and `drizzle-orm` dependencies.

Bun's isolated linker does not expose `drizzle-orm` to the Drizzle Kit binary.
The root `package.json` therefore keeps a pinned `drizzle-orm` development
dependency for `db:generate` and `db:check`. Remove that workaround only after
upgrading to a Drizzle Kit release that resolves the schema library from the
workspace package.

## Integration tests

```sh
TEST_DATABASE_URL=postgres://krypton:change-me@127.0.0.1:5432/krypton_test \
  bun run test:integration
```

The integration target resets the `public` schema and the Drizzle migration
bookkeeping schema. `TEST_DATABASE_URL` must point at a disposable database whose
name ends in `_test`; the URL guard rejects the same host/port/database as
`DATABASE_URL` and requires a loopback host unless
`TEST_DATABASE_ALLOW_REMOTE=true`. CI runs it against a `postgres:17-alpine`
service.
