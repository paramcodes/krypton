import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { isAllowed, readAllowlist } from "./lib/allowlist";

type Rule = {
  readonly id: string;
  readonly pattern: RegExp;
  readonly message: string;
};

type Violation = {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly text: string;
  readonly message: string;
};

type JsonObject = Readonly<Record<string, unknown>>;

type WorkspaceManifest = {
  readonly dir: string;
  readonly name: string;
  readonly dependencies: readonly string[];
};

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env["KRYPTON_ROOT"] ?? SCRIPT_ROOT;
const SOURCE_ROOTS = ["apps", "packages", "e2e"] as const;
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".astro",
  "coverage",
  ".turbo",
  ".git",
]);

const BASE_RULES: readonly Rule[] = [
  {
    id: "skipped-test",
    pattern:
      /\b(?:test|it|describe)(?:\.[A-Za-z_$][\w$]*)*\.(?:skip|only|todo|fixme|skipIf|runIf)\b/,
    message: "Remove the skipped/focused test and fix it. Do not silence the suite to get green.",
  },
  {
    id: "legacy-skipped-test",
    pattern: /\b(?:xit|xdescribe)\s*\(/,
    message:
      "Remove the skipped test. If it is genuinely obsolete, delete it in a reviewed change.",
  },
  {
    id: "ts-suppression",
    pattern: /@ts-(?:ignore|expect-error|nocheck)\b/,
    message: "Remove the TypeScript suppression and fix the type. Use a boundary parser if needed.",
  },
  {
    id: "lint-suppression",
    pattern: /\b(?:eslint|oxlint)-disable(?:-next-line|-line)?\b/,
    message:
      "Remove the lint suppression and fix the code. A reviewed allowlist entry is the exception.",
  },
  {
    id: "any-cast",
    pattern: /\bas\s+any\b/,
    message: "Parse at the boundary and use a real type instead of `as any`.",
  },
];

const ENGINE_RULES: readonly Rule[] = [
  {
    id: "engine-clock",
    pattern: /\bDate\.now\s*\(/,
    message: "Use the injected Clock port: clock.now(). Engine code must be deterministic.",
  },
  {
    id: "engine-date",
    pattern: /\bnew\s+Date\s*\(/,
    message: "Use the injected Clock port: clock.now(). Engine code must be deterministic.",
  },
  {
    id: "engine-random",
    pattern: /\bMath\.random\s*\(/,
    message: "Use the injected Random port: random.float() or random.uuid().",
  },
  {
    id: "engine-fetch",
    pattern: /\bfetch\s*\(/,
    message: "Use the injected Http port. The engine must not reach the network directly.",
  },
  {
    id: "engine-process",
    pattern: /\bprocess\./,
    message: "Use a port. The engine must not read process arguments, environment, or platform.",
  },
  {
    id: "engine-crypto",
    pattern: /\bcrypto\./,
    message: "Use the injected Random/Secrets ports. The engine must not use ambient crypto.",
  },
  {
    id: "engine-buffer",
    pattern: /\bBuffer\b/,
    message: "Stay on plain JSON values. Binary data belongs behind a port.",
  },
  {
    id: "engine-performance",
    pattern: /\bperformance\./,
    message: "Use the injected Clock port. The engine must be deterministic under simulation.",
  },
  {
    id: "engine-timers",
    pattern: /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask)\s*\(/,
    message: "Use clock.sleep(ms, signal) so time and ordering are simulated in tests.",
  },
  {
    id: "engine-realtime",
    pattern: /\b(?:WebSocket|XMLHttpRequest|EventSource)\b/,
    message: "Use the injected Http port. The engine must not open ambient connections.",
  },
  {
    id: "engine-console",
    pattern: /\bconsole\./,
    message: "Return trace/journal events. The worker owns structured logging and redaction.",
  },
  {
    id: "engine-dom",
    pattern: /\b(?:window|document|localStorage|sessionStorage|navigator)\b/,
    message: "The engine must not access the DOM or browser storage. Pass a port instead.",
  },
  {
    id: "engine-require",
    pattern: /\brequire\s*\(/,
    message: "The engine is ESM and pure. Use an injected port instead of a runtime require.",
  },
];

const WEB_RULES: readonly Rule[] = [
  {
    id: "web-dangerous-html",
    pattern: /\bdangerouslySetInnerHTML\b/,
    message: "Render user data through the escaping type. Never inject raw HTML.",
  },
];

const DEPENDENCY_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "devDependencies",
] as const;

const WORKSPACE_BOUNDARIES: Readonly<Record<string, readonly string[]>> = {
  "@krypton/schema": [],
  "@krypton/engine": ["@krypton/schema"],
  "@krypton/node-sdk": ["@krypton/schema"],
  "@krypton/nodes-core": ["@krypton/schema", "@krypton/engine", "@krypton/node-sdk"],
  "@krypton/api": [
    "@krypton/schema",
    "@krypton/engine",
    "@krypton/node-sdk",
    "@krypton/nodes-core",
  ],
  "@krypton/worker": [
    "@krypton/schema",
    "@krypton/engine",
    "@krypton/node-sdk",
    "@krypton/nodes-core",
  ],
  "@krypton/cli": ["@krypton/schema", "@krypton/engine", "@krypton/nodes-core"],
  "@krypton/web": ["@krypton/schema", "@krypton/node-sdk"],
  "@krypton/docs": [],
};

type PurePolicy = {
  readonly prefix: string;
  readonly label: string;
  readonly allowed: readonly string[];
};

const PURE_POLICIES: readonly PurePolicy[] = [
  { prefix: "packages/schema/src/", label: "Schema", allowed: [] },
  { prefix: "packages/engine/src/", label: "Engine", allowed: ["@krypton/schema"] },
  { prefix: "packages/node-sdk/src/", label: "Node SDK", allowed: ["@krypton/schema"] },
];

const IMPORT_PATTERNS: readonly RegExp[] = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const toPosix = (value: string): string => value.split(sep).join("/");

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNodeError = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const readString = (record: JsonObject, key: string, context: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context}: "${key}" must be a non-empty string.`);
  }
  return value;
};

const readJsonObject = async (path: string): Promise<JsonObject> => {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${path} must contain a JSON object.`);
  }
  return parsed;
};

const readWorkspaceDependencies = (manifest: JsonObject, context: string): readonly string[] => {
  const dependencies = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value === undefined) {
      continue;
    }
    if (!isRecord(value)) {
      throw new Error(`${context}: "${field}" must be an object.`);
    }
    for (const name of Object.keys(value)) {
      if (name.startsWith("@krypton/")) {
        dependencies.add(name);
      }
    }
  }
  return [...dependencies];
};

const findWorkspaceManifests = async (): Promise<readonly WorkspaceManifest[]> => {
  const manifests: WorkspaceManifest[] = [];
  for (const group of ["apps", "packages"] as const) {
    const groupPath = join(ROOT, group);
    let entries;
    try {
      entries = await readdir(groupPath, { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const dir = `${group}/${entry.name}`;
      const manifestPath = join(ROOT, dir, "package.json");
      let manifest: JsonObject;
      try {
        manifest = await readJsonObject(manifestPath);
      } catch (error) {
        if (isNodeError(error, "ENOENT")) {
          continue;
        }
        throw error;
      }

      manifests.push({
        dir,
        name: readString(manifest, "name", manifestPath),
        dependencies: readWorkspaceDependencies(manifest, manifestPath),
      });
    }
  }
  return manifests;
};

const checkPackageBoundaries = async (): Promise<readonly Violation[]> => {
  const violations: Violation[] = [];
  for (const manifest of await findWorkspaceManifests()) {
    const allowed = WORKSPACE_BOUNDARIES[manifest.name];
    if (allowed === undefined) {
      violations.push({
        file: `${manifest.dir}/package.json`,
        line: 1,
        rule: "package-boundary",
        text: manifest.name,
        message:
          "This workspace is not in the boundary map. Add its allowed @krypton dependencies deliberately.",
      });
      continue;
    }

    for (const dependency of manifest.dependencies) {
      if (allowed.includes(dependency)) {
        continue;
      }
      const allowedText = allowed.length === 0 ? "no workspace packages" : allowed.join(", ");
      violations.push({
        file: `${manifest.dir}/package.json`,
        line: 1,
        rule: "package-boundary",
        text: `${manifest.name} -> ${dependency}`,
        message: `${manifest.name} may depend only on ${allowedText}.`,
      });
    }
  }
  return violations;
};

const isTestPath = (path: string): boolean => /(?:\.test\.|\.spec\.)/.test(path);

const checkPureImports = async (files: readonly string[]): Promise<readonly Violation[]> => {
  const violations: Violation[] = [];

  for (const file of files) {
    const relativeFile = toPosix(relative(ROOT, file));
    const policy = PURE_POLICIES.find((candidate) => relativeFile.startsWith(candidate.prefix));
    if (policy === undefined) {
      continue;
    }

    const contents = await readFile(file, "utf8");
    const lines = contents.split("\n");

    lines.forEach((text, index) => {
      for (const pattern of IMPORT_PATTERNS) {
        pattern.lastIndex = 0;
        for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
          const specifier = match[1];
          if (specifier === undefined || specifier.startsWith(".")) {
            continue;
          }
          if (policy.allowed.includes(specifier)) {
            continue;
          }
          if (
            isTestPath(relativeFile) &&
            (specifier === "vitest" || specifier === "vitest/config")
          ) {
            continue;
          }

          const allowedText =
            policy.allowed.length === 0
              ? "relative files only"
              : `relative files and ${policy.allowed.join(", ")}`;
          violations.push({
            file: relativeFile,
            line: index + 1,
            rule: "pure-import",
            text: specifier,
            message: `${policy.label} may import ${allowedText}. Move external effects behind a port.`,
          });
        }
      }
    });
  }

  return violations;
};

const walk = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlinked source is not allowed: ${path}`);
    }
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      files.push(...(await walk(path)));
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(path);
    }
  }

  return files;
};

const rulesFor = (file: string): readonly Rule[] => {
  if (file.startsWith("packages/engine/src/")) {
    return [...BASE_RULES, ...ENGINE_RULES];
  }
  if (file.startsWith("apps/web/src/")) {
    return [...BASE_RULES, ...WEB_RULES];
  }
  return BASE_RULES;
};

const main = async (): Promise<void> => {
  const allowlist = await readAllowlist(ROOT);
  const files = (
    await Promise.all(SOURCE_ROOTS.map((directory) => walk(join(ROOT, directory))))
  ).flat();

  const ruleViolations: Violation[] = [];
  for (const file of files) {
    const relativeFile = toPosix(relative(ROOT, file));
    const contents = await readFile(file, "utf8");
    const lines = contents.split("\n");

    for (const rule of rulesFor(relativeFile)) {
      lines.forEach((text, index) => {
        if (!rule.pattern.test(text)) {
          return;
        }
        ruleViolations.push({
          file: relativeFile,
          line: index + 1,
          rule: rule.id,
          text: text.trim(),
          message: rule.message,
        });
      });
    }
  }

  const violations = [
    ...(await checkPackageBoundaries()),
    ...(await checkPureImports(files)),
    ...ruleViolations,
  ].filter((violation) => !isAllowed(allowlist, violation.file, violation.rule));

  if (violations.length === 0) {
    console.log("Guardrails: clean.");
    return;
  }

  console.error(`Guardrails failed with ${violations.length} violation(s):\n`);
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]`);
    console.error(`    Found: ${violation.text}`);
    console.error(`    Fix:   ${violation.message}\n`);
  }
  console.error(
    "Exceptions require a reviewed entry in scripts/guardrails-allowlist.json with a reason.",
  );
  process.exitCode = 1;
};

await main();
