import { describe, expect, it } from "vitest";

import { createDatabase, readDatabaseUrl } from "./client.ts";

describe("readDatabaseUrl", () => {
  it("returns the configured connection string", () => {
    expect(
      readDatabaseUrl({
        DATABASE_URL: " postgres://krypton:change-me@127.0.0.1:5432/krypton ",
      }),
    ).toBe("postgres://krypton:change-me@127.0.0.1:5432/krypton");
  });

  it("rejects a missing connection string", () => {
    expect(() => readDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
  });

  it("rejects a blank connection string", () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: "   " })).toThrow(/DATABASE_URL is required/);
  });

  it("rejects a non-Postgres connection string", () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: "https://127.0.0.1/krypton" })).toThrow(
      /postgres: or postgresql:/,
    );
  });

  it("rejects an invalid connection string", () => {
    expect(() => readDatabaseUrl({ DATABASE_URL: "not a url" })).toThrow(/must be a valid URL/);
  });
});

describe("createDatabase", () => {
  it("routes idle-client errors to the provided handler", async () => {
    const errors: Error[] = [];
    const client = createDatabase("postgres://krypton:test@127.0.0.1/krypton", {
      onPoolError: (error) => errors.push(error),
    });
    const error = new Error("connection dropped");

    client.pool.emit("error", error);
    await client.pool.end();

    expect(errors).toEqual([error]);
  });
});
