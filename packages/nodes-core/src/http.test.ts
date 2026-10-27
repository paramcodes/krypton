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

const flakyHttp = (requests: HttpRequest[]): Http => ({
  request: async (request) => {
    requests.push(request);
    if (requests.length < 3) {
      return { status: 503, headers: {}, body: "try again" };
    }
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok":true}',
    };
  },
});

describe("HTTP expect test", () => {
  it("retries a flaky HTTP request and passes its response to the next node", async () => {
    const requests: HttpRequest[] = [];
    const workflow = parseWorkflow({
      id: "flaky-http",
      name: "Flaky HTTP",
      expressionVersion: 1,
      nodes: [
        { id: "start", type: "manual-trigger" },
        {
          id: "request",
          type: "http-request",
          parameters: { url: "https://example.com/items", timeoutMs: 5_000 },
          retry: { maxAttempts: 3, delayMs: 1_000, backoff: "exponential" },
        },
        {
          id: "finish",
          type: "set",
          parameters: { values: { remoteStatus: "{{ $json.http.status }}" } },
        },
      ],
      connections: [
        { from: "start", to: "request" },
        { from: "request", to: "finish" },
      ],
    });

    const result = await runWorkflow({
      workflow,
      input: { customer: "Ada" },
      nodes: coreNodes,
      ports: { clock: advancingClock(), http: flakyHttp(requests) },
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("ok");
    expect(requests).toHaveLength(3);
    expect(result.outputs).toEqual([
      {
        customer: "Ada",
        http: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: '{"ok":true}',
          json: { ok: true },
        },
        remoteStatus: 200,
      },
    ]);
    expect(formatTrace(result.trace)).toMatchInlineSnapshot(`
      "t=0ms     start        ok    1 item
      t=0ms     request      fail  attempt 1/3: HTTP 503.
      t=1000ms  request      fail  attempt 2/3: HTTP 503.
      t=3000ms  request      ok    attempt 3/3: HTTP 200
      t=3000ms  finish       ok    1 field"
    `);
  });
});
