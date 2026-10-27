import { describe, expect, it } from "vitest";

import { formatTrace, type TraceLine } from "./trace";

describe("formatTrace", () => {
  it("prints a readable execution trace", () => {
    const lines: readonly TraceLine[] = [
      { atMs: 0, node: "webhook", status: "ok", detail: "1 item" },
      { atMs: 0, node: "http", status: "fail", detail: "attempt 1 503" },
      { atMs: 1000, node: "http", status: "ok", detail: "attempt 2 200 1 item" },
    ];

    expect(formatTrace(lines)).toMatchInlineSnapshot(`
      "t=0ms     webhook      ok    1 item
      t=0ms     http         fail  attempt 1 503
      t=1000ms  http         ok    attempt 2 200 1 item"
    `);
  });

  it("escapes control characters so one event stays one line", () => {
    const output = formatTrace([
      {
        atMs: 5,
        node: "bad\nnode",
        status: "fail",
        detail: "boom\t\u001b[31mred\u001b[0m\\",
      },
    ]);

    expect(output.split("\n")).toHaveLength(1);
    expect(output).toContain("bad\\nnode");
    expect(output).toContain("boom\\t\\x1b[31mred\\x1b[0m\\\\");
    expect(output).not.toContain("\u001b");
  });

  it("escapes carriage returns, Unicode line separators, and DEL", () => {
    const output = formatTrace([
      {
        atMs: 1,
        node: "n",
        status: "skip",
        detail: "a\rb\u2028c\u2029d\u007fe",
      },
    ]);

    expect(output.split("\n")).toHaveLength(1);
    expect(output).toContain("a\\rb\\u2028c\\u2029d\\x7fe");
  });

  it("escapes C1 and bidi control characters", () => {
    const output = formatTrace([
      {
        atMs: 2,
        node: "n",
        status: "ok",
        detail: "a\u0085b\u007fc\u202ed\u2066e\u200ef\u061cg",
      },
    ]);

    expect(output.split("\n")).toHaveLength(1);
    expect(output).toContain("a\\x85b\\x7fc\\u202ed\\u2066e\\u200ef\\u061cg");
  });
});
