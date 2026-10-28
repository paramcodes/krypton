import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const runCli = (args: readonly string[]) =>
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

  it("lists built-in node metadata", () => {
    const result = runCli(["nodes"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("http-request — HTTP Request [network]");
    expect(result.stdout).toContain("switch — Switch [flow]");
    expect(result.stdout).toContain("cases (list, required)");
    expect(result.stdout).toContain("Case ports");
  });

  it("prints the catalog as JSON", () => {
    const result = runCli(["nodes", "--json"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const parsed: unknown = JSON.parse(result.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(result.stdout).toContain('"type": "manual-trigger"');
    expect(result.stdout).toContain('"type": "http-request"');
  });

  it("rejects unknown nodes options", () => {
    const result = runCli(["nodes", "--verbose"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unknown option");
    expect(result.stderr).toContain("Usage: krypton run");
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

  it("keeps terminal controls escaped in final JSON output", () => {
    const directory = mkdtempSync(join(tmpdir(), "krypton-cli-output-"));
    const workflowPath = join(directory, "workflow.json");
    const inputPath = join(directory, "input.json");

    try {
      writeFileSync(
        workflowPath,
        JSON.stringify({
          id: "safe-output",
          name: "Safe output",
          nodes: [{ id: "start", type: "manual-trigger" }],
          connections: [],
        }),
      );
      writeFileSync(inputPath, JSON.stringify({ value: `before\u202eafter\u0085` }));

      const result = runCli(["run", workflowPath, "--input", inputPath]);

      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain("\u202e");
      expect(result.stdout).not.toContain("\u0085");
      expect(result.stdout).toContain("before\\u202eafter\\u0085");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
