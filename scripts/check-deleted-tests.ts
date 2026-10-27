import { execFileSync } from "node:child_process";

import { isAllowed, readAllowlist } from "./lib/allowlist";

type ChangeStatus = {
  readonly status: string;
  readonly oldPath: string;
  readonly newPath: string;
};

type Violation = {
  readonly file: string;
  readonly rule: "deleted-test" | "lost-assertions";
  readonly message: string;
};

const TEST_FILE = /(?:\.test\.|\.spec\.)|(?:^|\/)e2e\//;
const ASSERTION = /\b(?:expect(?:\.\w+)*|assert(?:\.\w+)*)\s*\(/;

const isNodeError = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const findGitRoot = (): string | undefined => {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

const git = (root: string, args: readonly string[]): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const baseSha = (): string | undefined => {
  const value = (process.env["BASE_SHA"] ?? process.env["GITHUB_BASE_SHA"])?.trim();
  if (value === undefined || value === "" || /^0+$/.test(value)) {
    return undefined;
  }
  return value;
};

const parseNameStatus = (raw: string): readonly ChangeStatus[] => {
  const tokens = raw.split("\0").filter((token) => token !== "");
  const changes: ChangeStatus[] = [];

  let index = 0;
  while (index < tokens.length) {
    const status = tokens[index];
    if (status === undefined) {
      break;
    }

    const isRenameOrCopy = status.startsWith("R") || status.startsWith("C");
    const oldPath = tokens[index + 1];
    const newPath = isRenameOrCopy ? tokens[index + 2] : oldPath;
    if (oldPath === undefined || newPath === undefined) {
      throw new Error("Could not parse `git diff --name-status -z` output.");
    }

    changes.push({ status, oldPath, newPath });
    index += isRenameOrCopy ? 3 : 2;
  }

  return changes;
};

const assertionDelta = (
  root: string,
  base: string,
  paths: readonly string[],
): { readonly removed: number; readonly added: number } => {
  const diff = git(root, ["diff", "-U0", `${base}...HEAD`, "--", ...paths]);
  let removed = 0;
  let added = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("---") || line.startsWith("+++") || !ASSERTION.test(line)) {
      continue;
    }
    if (line.startsWith("-")) {
      removed += 1;
    } else if (line.startsWith("+")) {
      added += 1;
    }
  }

  return { removed, added };
};

const main = async (): Promise<void> => {
  const base = baseSha();
  if (base === undefined) {
    console.log("Deleted-test guard: skipped (set BASE_SHA to compare against a base commit).");
    return;
  }

  const root = findGitRoot();
  if (root === undefined) {
    console.error("Deleted-test guard: BASE_SHA is set, but this is not a git repository.");
    process.exitCode = 1;
    return;
  }

  let status: string;
  try {
    status = git(root, ["diff", "--name-status", "-M", "-C", "-z", `${base}...HEAD`]);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      console.error("Deleted-test guard: git is not installed.");
    } else {
      console.error(`Deleted-test guard: could not diff against ${base}.`);
    }
    process.exitCode = 1;
    return;
  }

  const allowlist = await readAllowlist(root);
  const violations: Violation[] = [];

  for (const change of parseNameStatus(status)) {
    const oldIsTest = TEST_FILE.test(change.oldPath);
    const newIsTest = TEST_FILE.test(change.newPath);

    if (change.status.startsWith("D") && oldIsTest) {
      violations.push({
        file: change.oldPath,
        rule: "deleted-test",
        message: "A test file was deleted. Fix it, or add a reviewed allowlist entry.",
      });
      continue;
    }

    if (change.status.startsWith("R") && oldIsTest && !newIsTest) {
      violations.push({
        file: change.oldPath,
        rule: "deleted-test",
        message: `A test file was renamed to a non-test path: ${change.oldPath} -> ${change.newPath}.`,
      });
      continue;
    }

    if (newIsTest && (change.status.startsWith("M") || change.status.startsWith("R"))) {
      const paths =
        change.status.startsWith("R") && oldIsTest
          ? [change.oldPath, change.newPath]
          : [change.newPath];
      const delta = assertionDelta(root, base, paths);
      if (delta.removed > delta.added) {
        violations.push({
          file: change.newPath,
          rule: "lost-assertions",
          message: `Removed ${delta.removed} assertion(s) and added ${delta.added}. Keep the assertion or explain it in review.`,
        });
      }
    }
  }

  const remaining = violations.filter(
    (violation) => !isAllowed(allowlist, violation.file, violation.rule),
  );
  if (remaining.length === 0) {
    console.log("Deleted-test guard: clean.");
    return;
  }

  console.error(`Deleted-test guard failed with ${remaining.length} violation(s):\n`);
  for (const violation of remaining) {
    console.error(`  ${violation.file}  [${violation.rule}]`);
    console.error(`    ${violation.message}\n`);
  }
  process.exitCode = 1;
};

await main();
