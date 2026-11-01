import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase, readDatabaseUrl } from "./client.ts";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));
const { db, pool } = createDatabase(readDatabaseUrl());

try {
  await migrate(db, { migrationsFolder });
} finally {
  await pool.end();
}
