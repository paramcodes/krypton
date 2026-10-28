#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";

import { escapeTerminalText, formatTrace, runWorkflow, type Clock } from "@krypton/engine";
import { coreNodeCatalog, coreNodes } from "@krypton/nodes-core";
import { parseJsonObject, parseWorkflow } from "@krypton/schema";

import { createHttpPort } from "./http.ts";

const MAX_INPUT_BYTES = 1_000_000;

const USAGE = `Usage: krypton run <workflow.json> [--input <input.json>]
       krypton nodes [--json]

Runs a workflow with the built-in nodes and prints the trace, then the final
output items as JSON. Use "nodes" to list built-in node types, their ports, and
their parameters; add --json for the machine-readable catalog.`;

const writeOut = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const writeError = (message: string): void => {
  process.stderr.write(`${escapeTerminalText(message)}\n`);
};

const writeUsageError = (message: string): void => {
  process.stderr.write(`${message}\n\n${USAGE}\n`);
};

const formatJsonForTerminal = (value: unknown): string => {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    throw new Error("Could not serialize workflow output as JSON.");
  }

  return serialized.replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
};

const formatPorts = (
  ports: readonly { readonly name: string; readonly label: string }[],
): string =>
  ports.length === 0 ? "none" : ports.map((port) => `${port.name} (${port.label})`).join(", ");

const formatNodeCatalog = (): string =>
  coreNodeCatalog
    .map((node) => {
      const dynamic = node.dynamicOutputs === undefined ? "" : `, + ${node.dynamicOutputs.label}`;
      const parameters =
        node.parameters.length === 0
          ? "none"
          : node.parameters
              .map(
                (field) =>
                  `${field.key} (${field.kind}${field.required === true ? ", required" : ""})`,
              )
              .join(", ");

      return [
        `${node.type} — ${node.label} [${node.category}]`,
        `  ${node.description}`,
        `  Inputs: ${formatPorts(node.inputs)}`,
        `  Outputs: ${formatPorts(node.outputs)}${dynamic}`,
        `  Parameters: ${parameters}`,
      ].join("\n");
    })
    .join("\n\n");

const runNodes = (args: readonly string[]): number => {
  let json = false;

  for (const arg of args) {
    if (arg === "--json") {
      if (json) {
        writeUsageError('The "--json" option may be used only once.');
        return 1;
      }
      json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      writeOut(USAGE);
      return 0;
    }
    writeUsageError(`Unknown option "${escapeTerminalText(arg)}".`);
    return 1;
  }

  writeOut(json ? formatJsonForTerminal(coreNodeCatalog) : formatNodeCatalog());
  return 0;
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

const createClock = (): Clock => ({
  now: () => Date.now(),
  sleep: async (ms, signal) => {
    if (signal.aborted) {
      throw new Error("Aborted.");
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(new Error("Aborted."));
      };

      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
      }
    });
  },
});

const run = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "--help" || command === "-h") {
    writeOut(USAGE);
    return 0;
  }

  if (command === "nodes") {
    return runNodes(args.slice(1));
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
      ports: { clock: createClock(), http: createHttpPort() },
      signal: controller.signal,
    });

    writeOut(formatTrace(result.trace));

    if (result.status === "fail") {
      writeError("Run failed.");
      return 1;
    }

    writeOut(formatJsonForTerminal(result.outputs));
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
