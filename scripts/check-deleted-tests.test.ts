import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./check-deleted-tests.ts", import.meta.url));
const TEST_PATH = "packages/engine/src/sample.test.ts";
const RENAMED_TEST_PATH = "packages/engine/src/renamed.test.ts";
const roots: string[] = [];

const git = (repo: string, args: readonly string[]): void => {
  execFileSync("git", args, { cwd: repo, stdio: "ignore" });
};

const makeRepo = (): string => {
  const repo = mkdtempSync(join(tmpdir(), "krypton-deleted-tests-"));
  roots.push(repo);
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Krypton Test"]);
  mkdirSync(join(repo, "scripts"), { recursive: true });
  writeFileSync(join(repo, "scripts/guardrails-allowlist.json"), '{"allow":[]}\n');
  return repo;
};

const writeAt = (repo: string, relativePath: string, content: string): void => {
  const path = join(repo, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

const writeTest = (repo: string, content: string): void => {
  writeAt(repo, TEST_PATH, content);
};

const commit = (repo: string, message: string): string => {
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-m", message]);
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim();
};

const run = (repo: string, base: string): SpawnSyncReturns<string> =>
  spawnSync("bun", [SCRIPT], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, BASE_SHA: base },
  });

const baseTest = [
  'import { expect, it } from "vitest";',
  "",
  'it("adds", () => {',
  "  expect(1 + 1).toBe(2);",
  "});",
  "",
].join("\n");

const twoAssertionTest = [
  'import { expect, it } from "vitest";',
  "",
  'it("adds", () => {',
  "  expect(1 + 1).toBe(2);",
  "  expect(2 + 2).toBe(4);",
  "});",
  "",
].join("\n");

const oneAssertionTest = [
  'import { expect, it } from "vitest";',
  "",
  'it("adds", () => {',
  "  expect(1 + 1).toBe(2);",
  "});",
  "",
].join("\n");

afterEach(() => {
  for (const repo of roots.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe("check-deleted-tests", () => {
  it("fails when a test file is deleted", () => {
    const repo = makeRepo();
    writeTest(repo, baseTest);
    const base = commit(repo, "base");
    rmSync(join(repo, TEST_PATH));
    commit(repo, "delete the test");

    const result = run(repo, base);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("deleted");
  });

  it("fails when a test is renamed to a non-test path", () => {
    const repo = makeRepo();
    writeTest(repo, baseTest);
    const base = commit(repo, "base");
    git(repo, ["mv", TEST_PATH, "packages/engine/src/sample.ts"]);
    commit(repo, "rename the test away");

    const result = run(repo, base);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("renamed");
  });

  it("fails when a test is renamed to another test path and loses an assertion", () => {
    const repo = makeRepo();
    writeAt(repo, TEST_PATH, twoAssertionTest);
    const base = commit(repo, "base");
    git(repo, ["mv", TEST_PATH, RENAMED_TEST_PATH]);
    writeAt(repo, RENAMED_TEST_PATH, oneAssertionTest);
    commit(repo, "rename and drop an assertion");

    const result = run(repo, base);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("assertion");
  });

  it("fails when a modification removes more assertions than it adds", () => {
    const repo = makeRepo();
    writeTest(repo, baseTest);
    const base = commit(repo, "base");
    writeTest(repo, ['import { it } from "vitest";', "", 'it("adds", () => {});', ""].join("\n"));
    commit(repo, "drop the assertion");

    const result = run(repo, base);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("assertion");
  });

  it("skips the all-zero SHA used by a first push", () => {
    const repo = makeRepo();
    writeTest(repo, baseTest);
    commit(repo, "base");

    const result = run(repo, "0".repeat(40));

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("skipped");
  });

  it("passes when assertions are added", () => {
    const repo = makeRepo();
    writeTest(repo, baseTest);
    const base = commit(repo, "base");
    writeTest(
      repo,
      [
        'import { expect, it } from "vitest";',
        "",
        'it("adds", () => {',
        "  expect(1 + 1).toBe(2);",
        "  expect(2 + 2).toBe(4);",
        "});",
        "",
      ].join("\n"),
    );
    commit(repo, "add an assertion");

    const result = run(repo, base);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Deleted-test guard: clean.");
  });
});
