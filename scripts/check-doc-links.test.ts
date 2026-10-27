import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./check-doc-links.ts", import.meta.url));
const roots: string[] = [];

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "krypton-doc-links-"));
  roots.push(root);
  for (const directory of ["docs", "apps", "packages", ".github"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const file of ["README.md", "AGENTS.md", "CONSTRAINTS.md"]) {
    writeFileSync(join(root, file), "");
  }
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

describe("check-doc-links", () => {
  it("fails a broken relative link", () => {
    const root = makeRoot();
    writeFileSync(join(root, "docs/page.md"), "[missing](missing.md)\n");

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing.md");
  });

  it("fails a link that escapes the repository root", () => {
    const root = makeRoot();
    writeFileSync(join(root, "docs/page.md"), "[outside](../../outside.md)\n");

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("outside.md");
  });

  it("passes a valid relative link", () => {
    const root = makeRoot();
    writeFileSync(join(root, "docs/page.md"), "[readme](../README.md)\n");

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Doc links: clean.");
  });
});
