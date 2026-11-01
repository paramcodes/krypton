import type { Environment } from "./client.ts";
import { databaseName, isLoopbackHost, parsePostgresUrl } from "./postgres-url.ts";

const effectivePort = (url: URL): string => (url.port === "" ? "5432" : url.port);

const isSameDatabase = (testUrl: URL, databaseUrl: URL): boolean => {
  const samePort = effectivePort(testUrl) === effectivePort(databaseUrl);
  const sameHost = testUrl.hostname === databaseUrl.hostname && samePort;
  const sameLoopback =
    isLoopbackHost(testUrl.hostname) && isLoopbackHost(databaseUrl.hostname) && samePort;

  return (
    (sameHost || sameLoopback) &&
    databaseName(testUrl) === databaseName(databaseUrl) &&
    databaseName(testUrl) !== ""
  );
};

export const readTestDatabaseUrl = (environment: Environment = process.env): string => {
  const value = environment["TEST_DATABASE_URL"]?.trim();
  if (value === undefined || value === "") {
    throw new Error(
      "TEST_DATABASE_URL is required for integration tests. Point it at a disposable *_test database.",
    );
  }

  const testUrl = parsePostgresUrl(value, "TEST_DATABASE_URL");
  const testDatabaseName = databaseName(testUrl);
  if (!testDatabaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must point at a database whose name ends in _test.");
  }

  if (!isLoopbackHost(testUrl.hostname) && environment["TEST_DATABASE_ALLOW_REMOTE"] !== "true") {
    throw new Error(
      "TEST_DATABASE_URL must use a loopback host unless TEST_DATABASE_ALLOW_REMOTE=true.",
    );
  }

  const databaseValue = environment["DATABASE_URL"]?.trim();
  if (databaseValue !== undefined && databaseValue !== "") {
    const databaseUrl = parsePostgresUrl(databaseValue, "DATABASE_URL");
    if (isSameDatabase(testUrl, databaseUrl)) {
      throw new Error(
        "TEST_DATABASE_URL must not point at the same host, port, and database as DATABASE_URL.",
      );
    }
  }

  return value;
};
