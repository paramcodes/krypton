import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { parsePostgresUrl } from "./postgres-url.ts";
import * as schema from "./schema.ts";

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseClient = {
  readonly db: Database;
  readonly pool: Pool;
};

export type DatabaseClientOptions = {
  /** Receives idle-client errors so the API can log them without crashing. */
  readonly onPoolError?: (error: Error) => void;
};

export type Environment = Readonly<Record<string, string | undefined>>;

export const readDatabaseUrl = (environment: Environment = process.env): string => {
  const value = environment["DATABASE_URL"]?.trim();
  if (value === undefined || value === "") {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env and start the Postgres service.",
    );
  }

  parsePostgresUrl(value, "DATABASE_URL");
  return value;
};

export const createDatabase = (
  connectionString: string,
  options: DatabaseClientOptions = {},
): DatabaseClient => {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (error) => {
    options.onPoolError?.(error);
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
};
