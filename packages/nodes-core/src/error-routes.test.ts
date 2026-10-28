import { formatTrace, runWorkflow, type Clock, type Http, type HttpRequest } from "@krypton/engine";
import { parseWorkflow } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import { coreNodes } from "./index";

const advancingClock = (): Clock => {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  };
};

const failingHttp = (requests: HttpRequest[]): Http => ({
  request: async (request) => {
    requests.push(request);
    return { status: 503, headers: {}, body: "try again" };
  },
});

describe("error route expect test", () => {
  it("routes a failed HTTP request to an error handler after retries", async () => {
    const requests: HttpRequest[] = [];
    const workflow = parseWorkflow({
      id: "http-error-route",
      name: "HTTP error route",
      nodes: [
        { id: "start", type: "manual-trigger" },
        {
          id: "request",
          type: "http-request",
          errorPolicy: "route",
          parameters: { url: "https://example.com/orders", timeoutMs: 5_000 },
          retry: { maxAttempts: 2, delayMs: 500 },
        },
        {
          id: "handler",
          type: "set",
          parameters: { values: { handled: true } },
        },
      ],
      connections: [
        { from: "start", to: "request" },
        { from: "request", fromPort: "error", to: "handler" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: { order: "A-104" },
      nodes: coreNodes,
      ports: { clock: advancingClock(), http: failingHttp(requests) },
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(requests).toHaveLength(2);
    expect(result.outputs).toEqual([
      {
        order: "A-104",
        error: {
          nodeId: "request",
          nodeType: "http-request",
          message: "HTTP 503.",
          attempts: 2,
          retryable: true,
          atMs: 500,
        },
        handled: true,
      },
    ]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     request      fail  attempt 1/2: HTTP 503.
      t=500ms   request      fail  route error: attempt 2/2: HTTP 503.
      t=500ms   handler      ok    1 field"
    `);
  });
});
