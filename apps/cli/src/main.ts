#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";

import { escapeTerminalText, formatTrace, runWorkflow } from "@krypton/engine";
import { coreNodes } from "@krypton/nodes-core";
import { parseJsonObject, parseWorkflow } from "@krypton/schema";

const MAX_INPUT_BYTES = 1_000_000;

const USAGE = `Usage: krypton run <workflow.json> [--input <input.json>]

Runs a workflow with the built-in nodes and prints the trace, then the final
output items as JSON.`;

const writeOut = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const writeError = (message: string): void => {
  process.stderr.write(`${escapeTerminalText(message)}\n`);
};

const writeUsageError = (message: string): void => {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
};

const readJson = async (path: string): Promise<unknown> => {
  const info = await stat(path);
  if (!info.isFile()) {
    throw new Error(`${path} is not a file.`);
  }
  if (info.size > MAX_INPUT_BYTES) {
    throw new Error(`${path} is larger than ${MAX_INPUT_BYTES} bytes.`);
  }

  const text = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(text);
  return parsed;
};

const readInputPath = (args: readonly string[]): string | undefined => {
  let inputPath: string | undefined;

  for (let index = 2; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }

    if (arg === "--input") {
      const candidate = args[index + 1];
      if (candidate === undefined || candidate.startsWith("--")) {
        throw new Error("--input needs a file path.");
      }
      inputPath = candidate;
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      const candidate = arg.slice("--input=".length);
      if (candidate === "") {
        throw new Error("--input needs a file path.");
      }
      inputPath = candidate;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option "${arg}".`);
    }
  }

  return inputPath;
};

const run = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "--help" || command === "-h") {
    writeOut(USAGE);
    return 0;
  }

  if (command !== "run") {
    writeUsageError(
      command === undefined
        ? "A command is required."
        : `Unknown command "${escapeTerminalText(command)}".`,
    );
    return 1;
  }

  const workflowPath = args[1];
  if (workflowPath === undefined) {
    writeUsageError("A workflow JSON path is required.");
    return 1;
  }

  if (workflowPath === "--help" || workflowPath === "-h") {
    writeOut(USAGE);
    return 0;
  }

  if (workflowPath.startsWith("--")) {
    writeUsageError("A workflow JSON path is required.");
    return 1;
  }

  let inputPath: string | undefined;
  try {
    inputPath = readInputPath(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid arguments.";
    writeUsageError(escapeTerminalText(message));
    return 1;
  }

  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);

  try {
    const workflow = parseWorkflow(await readJson(workflowPath));
    const input =
      inputPath === undefined ? {} : parseJsonObject(await readJson(inputPath), "$.input");

    const result = await runWorkflow({
      workflow,
      input,
      nodes: coreNodes,
      ports: { clock: { now: () => Date.now() } },
      signal: controller.signal,
    });

    writeOut(formatTrace(result.trace));

    if (result.status === "fail") {
      writeError("Run failed.");
      return 1;
    }

    writeOut(JSON.stringify(result.outputs, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    writeError(`krypton: ${message}`);
    return 1;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
};

process.exitCode = await run();
