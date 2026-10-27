import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type Violation = {
  readonly file: string;
  readonly line: number;
  readonly target: string;
};

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env["KRYPTON_ROOT"] ?? SCRIPT_ROOT;
const SOURCE_PATHS = [
  "README.md",
  "AGENTS.md",
  "CONSTRAINTS.md",
  "docs",
  "apps",
  "packages",
  ".github",
];
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".astro",
  "coverage",
  ".turbo",
  ".agents",
]);
const MAX_DEPTH = 20;
const MARKDOWN = /\.mdx?$/i;
const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

const toPosix = (value: string): string => value.split(sep).join("/");

const walk = async (path: string, depth = 0): Promise<readonly string[]> => {
  if (depth > MAX_DEPTH) {
    throw new Error(`Refusing to walk deeper than ${MAX_DEPTH} levels: ${path}`);
  }

  const info = await lstat(path);
  if (info.isSymbolicLink()) {
    throw new Error(`Symlinked documentation paths are not allowed: ${path}`);
  }
  if (info.isFile()) {
    return MARKDOWN.test(path) ? [path] : [];
  }
  if (!info.isDirectory()) {
    return [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const child = join(path, entry.name);
    files.push(...(await walk(child, depth + 1)));
  }
  return files;
};

const blankCodeBlocks = (text: string): string =>
  text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "));

const targetPath = (raw: string): string | undefined => {
  let target = raw.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  }
  if (target === "" || EXTERNAL.test(target)) {
    return undefined;
  }
  target = target.split("#")[0] ?? "";
  target = target.split("?")[0] ?? "";
  if (target === "") {
    return undefined;
  }
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
};

const lineAt = (text: string, index: number): number => text.slice(0, index).split("\n").length;

const main = async (): Promise<void> => {
  const files = (await Promise.all(SOURCE_PATHS.map((path) => walk(join(ROOT, path))))).flat();
  const violations: Violation[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const searchable = blankCodeBlocks(text);
    LINK.lastIndex = 0;

    for (let match = LINK.exec(searchable); match !== null; match = LINK.exec(searchable)) {
      const raw = match[1];
      if (raw === undefined) {
        continue;
      }
      const target = targetPath(raw);
      if (target === undefined) {
        continue;
      }

      const resolved = target.startsWith("/") ? join(ROOT, target) : resolve(dirname(file), target);
      const relativeTarget = relative(ROOT, resolved);
      if (
        relativeTarget === ".." ||
        relativeTarget.startsWith(`..${sep}`) ||
        isAbsolute(relativeTarget)
      ) {
        violations.push({
          file: toPosix(relative(ROOT, file)),
          line: lineAt(searchable, match.index),
          target: raw,
        });
        continue;
      }

      try {
        await lstat(resolved);
      } catch {
        violations.push({
          file: toPosix(relative(ROOT, file)),
          line: lineAt(searchable, match.index),
          target: raw,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log("Doc links: clean.");
    return;
  }

  console.error(`Doc links failed with ${violations.length} broken link(s):\n`);
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.target}`);
  }
  console.error("\nFix the path or remove the link. Do not leave a dead reference.");
  process.exitCode = 1;
};

await main();
