export type TraceStatus = "ok" | "fail" | "skip";

export type TraceLine = {
  readonly atMs: number;
  readonly node: string;
  readonly status: TraceStatus;
  readonly detail: string;
};

const pad = (value: string, width: number): string => value.padEnd(width, " ");

const isBidiControl = (code: number): boolean =>
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069) ||
  code === 0x200e ||
  code === 0x200f ||
  code === 0x061c;

/**
 * Escape text for a single terminal line. Control characters, line breaks, and
 * bidirectional overrides are made visible so untrusted values cannot inject
 * terminal commands or forge extra output lines.
 */
export const escapeTerminalText = (value: string): string => {
  let escaped = "";

  for (const character of value) {
    const code = character.charCodeAt(0);

    switch (character) {
      case "\\":
        escaped += "\\\\";
        break;
      case "\n":
        escaped += "\\n";
        break;
      case "\r":
        escaped += "\\r";
        break;
      case "\t":
        escaped += "\\t";
        break;
      case "\u2028":
        escaped += "\\u2028";
        break;
      case "\u2029":
        escaped += "\\u2029";
        break;
      default:
        if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
          escaped += `\\x${code.toString(16).padStart(2, "0")}`;
        } else if (isBidiControl(code)) {
          escaped += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          escaped += character;
        }
    }
  }

  return escaped;
};

/**
 * Render an execution trace as one aligned line per event.
 * Cell text is escaped so untrusted details cannot forge extra lines or inject
 * terminal control sequences. The Stage 1 engine feeds this from a simulation.
 */
export const formatTrace = (lines: readonly TraceLine[]): string =>
  lines
    .map((line) => {
      const time = `t=${line.atMs}ms`;
      return `${pad(time, 9)} ${pad(escapeTerminalText(line.node), 12)} ${pad(line.status, 5)} ${escapeTerminalText(line.detail)}`.trimEnd();
    })
    .join("\n");
