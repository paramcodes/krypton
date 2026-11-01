import { defineConfig } from "drizzle-kit";

const defaultLocalUrl = "postgres://krypton:change-me@127.0.0.1:5432/krypton";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? defaultLocalUrl,
  },
  strict: true,
  verbose: true,
});
