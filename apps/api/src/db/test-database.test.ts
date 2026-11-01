import { describe, expect, it } from "vitest";

import { readTestDatabaseUrl } from "./test-database.ts";

const VALID = "postgres://krypton:test@127.0.0.1:55432/krypton_test";

describe("readTestDatabaseUrl", () => {
  it("returns the trimmed, disposable test connection string", () => {
    expect(readTestDatabaseUrl({ TEST_DATABASE_URL: ` ${VALID} ` })).toBe(VALID);
  });

  it("rejects a missing test connection string", () => {
    expect(() => readTestDatabaseUrl({})).toThrow(/TEST_DATABASE_URL is required/);
  });

  it("rejects a blank test connection string", () => {
    expect(() => readTestDatabaseUrl({ TEST_DATABASE_URL: "   " })).toThrow(
      /TEST_DATABASE_URL is required/,
    );
  });

  it("rejects an invalid URL", () => {
    expect(() => readTestDatabaseUrl({ TEST_DATABASE_URL: "not a url" })).toThrow(
      /must be a valid URL/,
    );
  });

  it("rejects a non-Postgres protocol", () => {
    expect(() =>
      readTestDatabaseUrl({ TEST_DATABASE_URL: "https://127.0.0.1/krypton_test" }),
    ).toThrow(/postgres: or postgresql:/);
  });

  it("rejects a database name without the _test suffix", () => {
    expect(() =>
      readTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://krypton:test@127.0.0.1/krypton" }),
    ).toThrow(/ends in _test/);
  });

  it("rejects a remote host by default", () => {
    expect(() =>
      readTestDatabaseUrl({ TEST_DATABASE_URL: "postgres://krypton:test@db.example/krypton_test" }),
    ).toThrow(/loopback host/);
  });

  it("allows a remote host only with the explicit opt-in", () => {
    expect(
      readTestDatabaseUrl({
        TEST_DATABASE_URL: "postgres://krypton:test@db.example/krypton_test",
        TEST_DATABASE_ALLOW_REMOTE: "true",
      }),
    ).toBe("postgres://krypton:test@db.example/krypton_test");
  });

  it("rejects the same database as DATABASE_URL", () => {
    expect(() =>
      readTestDatabaseUrl({
        DATABASE_URL: "postgres://krypton:test@localhost:55432/krypton_test",
        TEST_DATABASE_URL: VALID,
      }),
    ).toThrow(/must not point at the same host, port, and database/);
  });

  it("treats the usual loopback spellings as the same host for the safety check", () => {
    expect(() =>
      readTestDatabaseUrl({
        DATABASE_URL: "postgres://krypton:test@localhost:55432/krypton_test",
        TEST_DATABASE_URL: "postgres://krypton:test@[::1]:55432/krypton_test",
      }),
    ).toThrow(/must not point at the same host, port, and database/);
  });

  it("uses the default Postgres port when a URL omits it", () => {
    expect(() =>
      readTestDatabaseUrl({
        DATABASE_URL: "postgres://krypton:test@localhost/krypton_test",
        TEST_DATABASE_URL: "postgres://krypton:test@127.0.0.1:5432/krypton_test",
      }),
    ).toThrow(/must not point at the same host, port, and database/);
  });

  it("accepts a distinct loopback database even when DATABASE_URL is set", () => {
    expect(
      readTestDatabaseUrl({
        DATABASE_URL: "postgres://krypton:test@127.0.0.1:55432/krypton",
        TEST_DATABASE_URL: VALID,
      }),
    ).toBe(VALID);
  });
});
