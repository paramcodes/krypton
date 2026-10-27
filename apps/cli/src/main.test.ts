import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const runCli = (args: readonly string[]): ReturnType<typeof spawnSync> =>
  spawnSync(process.execPath, ["apps/cli/src/main.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });

describe("krypton CLI", () => {
  it("runs the example workflow and prints the trace and final items", () => {
    const result = runCli([
      "run",
      "examples/triage.workflow.json",
      "--input",
      "examples/triage.input.json",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("branch true");
    expect(result.stdout).toContain('"route": "approve"');
    expect(result.stderr).toBe("");
  });

  it("prints usage for --help", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: krypton run");
  });

  it("escapes terminal control characters in error messages", () => {
    const directory = mkdtempSync(join(tmpdir(), "krypton-cli-"));
    const workflowPath = join(directory, "bad.json");
    const duplicateId = "node\u202e";

    try {
      writeFileSync(
        workflowPath,
        JSON.stringify({
          id: "bad",
          name: "Bad",
          nodes: [
            { id: duplicateId, type: "manual-trigger" },
            { id: duplicateId, type: "set" },
          ],
        }),
      );

      const result = runCli(["run", workflowPath]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).not.toContain("\u202e");
      expect(result.stderr).toContain("\\u202e");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
