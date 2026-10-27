import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./check-guardrails.ts", import.meta.url));
const roots: string[] = [];

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "krypton-guardrails-"));
  roots.push(root);
  mkdirSync(join(root, "apps"), { recursive: true });
  mkdirSync(join(root, "packages/engine/src"), { recursive: true });
  mkdirSync(join(root, "e2e"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts/guardrails-allowlist.json"), '{"allow":[]}\n');
  return root;
};

const run = (root: string): SpawnSyncReturns<string> =>
  spawnSync("bun", [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, KRYPTON_ROOT: root },
  });

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("check-guardrails", () => {
  it("passes a clean pure package", () => {
    const root = makeRoot();
    writeFileSync(join(root, "packages/engine/src/index.ts"), "export const answer = 42;\n");

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Guardrails: clean.");
  });

  it("catches pure-import, engine, and test-suppression violations", () => {
    const root = makeRoot();
    writeFileSync(
      join(root, "packages/engine/src/bad.ts"),
      [
        'import { drizzle } from "drizzle-orm";',
        "",
        "// @ts-nocheck",
        'test.concurrent.skip("not a real test", () => {});',
        "export const now = Date.now();",
        "export const env = process.env;",
        "export const root = document;",
        "setTimeout(() => {}, 0);",
        "",
      ].join("\n"),
    );

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[pure-import]");
    expect(result.stderr).toContain("[engine-clock]");
    expect(result.stderr).toContain("[engine-process]");
    expect(result.stderr).toContain("[engine-dom]");
    expect(result.stderr).toContain("[engine-timers]");
    expect(result.stderr).toContain("[ts-suppression]");
    expect(result.stderr).toContain("[skipped-test]");
  });

  it("catches a forbidden workspace dependency", () => {
    const root = makeRoot();
    mkdirSync(join(root, "apps/web"), { recursive: true });
    writeFileSync(
      join(root, "apps/web/package.json"),
      JSON.stringify({
        name: "@krypton/web",
        dependencies: { "@krypton/api": "workspace:*" },
      }),
    );

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[package-boundary]");
    expect(result.stderr).toContain("@krypton/api");
  });
});
