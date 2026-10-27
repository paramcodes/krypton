import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADVISORY_AGENTS = [
  "code-reviewer",
  "security-auditor",
  "test-engineer",
  "explainer",
] as const;

const denied = (action: string): RegExp =>
  new RegExp(`action:\\s*${action}\\s*\\n\\s*resource:\\s*"\\*"\\s*\\n\\s*effect:\\s*deny`);

describe("advisory agent permissions", () => {
  for (const agent of ADVISORY_AGENTS) {
    it(`${agent} cannot edit, run shell, or launch subagents`, () => {
      const text = readFileSync(join(ROOT, ".opencode", "agents", `${agent}.md`), "utf8");

      expect(text).toMatch(denied("edit"));
      expect(text).toMatch(denied("shell"));
      expect(text).toMatch(denied("subagent"));
      expect(text).not.toMatch(/resource:\s*"bun/);
    });
  }
});
