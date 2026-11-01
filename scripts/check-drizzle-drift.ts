import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative as relativePath } from "node:path";
import { fileURLToPath } from "node:url";

type Tree = ReadonlyMap<string, Buffer>;

const scriptsDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = join(scriptsDirectory, "..");
const apiDirectory = join(repositoryRoot, "apps/api");
const migrationsDirectory = join(apiDirectory, "drizzle");

const readTree = async (root: string, relative = ""): Promise<Map<string, Buffer>> => {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  const files = new Map<string, Buffer>();

  for (const entry of entries) {
    const entryPath = join(relative, entry.name);
    if (entry.isDirectory()) {
      for (const [path, contents] of await readTree(root, entryPath)) {
        files.set(path, contents);
      }
    } else if (entry.isFile()) {
      files.set(entryPath, await readFile(join(root, entryPath)));
    }
  }

  return files;
};

const findDrift = (expected: Tree, actual: Tree): readonly string[] => {
  const paths = new Set([...expected.keys(), ...actual.keys()]);
  const changed: string[] = [];

  for (const path of paths) {
    const expectedContents = expected.get(path);
    const actualContents = actual.get(path);
    if (
      expectedContents === undefined ||
      actualContents === undefined ||
      !expectedContents.equals(actualContents)
    ) {
      changed.push(path);
    }
  }

  return changed.toSorted();
};

const main = async (): Promise<void> => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "krypton-drizzle-"));
  const temporaryMigrations = join(temporaryRoot, "drizzle");
  const outputDirectory = relativePath(apiDirectory, temporaryMigrations);

  try {
    await cp(migrationsDirectory, temporaryMigrations, { recursive: true });
    const result = spawnSync(
      "bun",
      [
        "run",
        "drizzle-kit",
        "generate",
        "--dialect",
        "postgresql",
        "--schema",
        "src/db/schema.ts",
        "--out",
        outputDirectory,
      ],
      { cwd: apiDirectory, encoding: "utf8" },
    );

    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      throw new Error("drizzle-kit generate failed while checking for schema drift.");
    }

    const drift = findDrift(
      await readTree(migrationsDirectory),
      await readTree(temporaryMigrations),
    );
    if (drift.length > 0) {
      process.stderr.write(
        `Migration drift detected in: ${drift.join(", ")}. Run bun run db:generate and review the changes.\n`,
      );
      process.exitCode = 1;
      return;
    }

    process.stdout.write("Migration drift: clean.\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

await main();
