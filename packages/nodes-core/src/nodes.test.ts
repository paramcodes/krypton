import {
  HttpError,
  RetryableNodeError,
  type Http,
  type HttpRequest,
  type HttpResponse,
  type NodeExecutionContext,
  type NodeExecutor,
} from "@krypton/engine";
import { asNodeId, type JsonObject, type JsonValue } from "@krypton/schema";
import { describe, expect, it } from "vitest";

import { coreNodes } from "./index";

const executor = (type: string): NodeExecutor => {
  const found = coreNodes[type];
  if (found === undefined) {
    throw new Error(`Missing core node: ${type}`);
  }
  return found;
};

const unusedHttp: Http = {
  request: async () => {
    throw new Error("The test HTTP port was not configured.");
  },
};

const context = (
  parameters: JsonObject,
  item: JsonObject = { customer: "Ada" },
  http: Http = unusedHttp,
): NodeExecutionContext => ({
  nodeId: asNodeId("node"),
  nodeType: "test",
  item,
  parameters,
  ports: {
    clock: { now: () => 0, sleep: async () => {} },
    http,
  },
  signal: new AbortController().signal,
});

const fakeHttp = (
  response: HttpResponse | (() => Promise<HttpResponse>),
  requests: HttpRequest[] = [],
): Http => ({
  request: async (request) => {
    requests.push(request);
    return typeof response === "function" ? response() : response;
  },
});

const response = (overrides: Partial<HttpResponse> = {}): HttpResponse => ({
  status: 200,
  headers: { "content-type": "application/json" },
  body: '{"ok":true}',
  ...overrides,
});

describe("core node parameters", () => {
  it("merges Set values into the current item", async () => {
    const result = await executor("set")(context({ values: { status: "ready", score: 3 } }));

    expect(result.outputs).toEqual([
      { port: "main", items: [{ customer: "Ada", status: "ready", score: 3 }] },
    ]);
    expect(result.detail).toBe("2 fields");
  });

  it("rejects a non-object Set values parameter", async () => {
    await expect(executor("set")(context({ values: "not-an-object" }))).rejects.toThrow(
      /must be an object/,
    );
  });

  it("rejects a null Set values parameter", async () => {
    await expect(executor("set")(context({ values: null }))).rejects.toThrow(/must be an object/);
  });

  it("leaves the item unchanged when Set has no values", async () => {
    const result = await executor("set")(context({}));

    expect(result.outputs).toEqual([{ port: "main", items: [{ customer: "Ada" }] }]);
    expect(result.detail).toBe("0 fields");
  });

  it("routes the item to the true or false port", async () => {
    const trueResult = await executor("if")(context({ condition: true }));
    const falseResult = await executor("if")(context({ condition: false }));

    expect(trueResult.outputs).toEqual([{ port: "true", items: [{ customer: "Ada" }] }]);
    expect(falseResult.outputs).toEqual([{ port: "false", items: [{ customer: "Ada" }] }]);
  });

  it("rejects a non-boolean IF condition", async () => {
    await expect(executor("if")(context({ condition: "true" }))).rejects.toThrow(
      /must be a boolean/,
    );
  });

  it("routes matching JSON scalar values to their named ports", async () => {
    const scenarios: readonly {
      readonly value: JsonValue;
      readonly matchingValue: JsonValue;
      readonly port: string;
    }[] = [
      { value: "paid", matchingValue: "paid", port: "paid" },
      { value: 3, matchingValue: 3, port: "three" },
      { value: true, matchingValue: true, port: "enabled" },
      { value: null, matchingValue: null, port: "empty" },
    ];

    for (const scenario of scenarios) {
      const result = await executor("switch")(
        context({
          value: scenario.value,
          cases: [{ value: scenario.matchingValue, port: scenario.port }],
        }),
      );

      expect(result.outputs).toEqual([
        { port: scenario.port, items: [{ customer: "Ada" }] },
      ]);
      expect(result.detail).toBe(`switch ${scenario.port}`);
    }
  });

  it("routes unmatched values to the default port and distinguishes scalar types", async () => {
    const result = await executor("switch")(
      context({ value: 1, cases: [{ value: "1", port: "string-one" }] }),
    );

    expect(result.outputs).toEqual([{ port: "default", items: [{ customer: "Ada" }] }]);
    expect(result.detail).toBe("switch default");
  });

  it("allows distinct cases to share an output port", async () => {
    const result = await executor("switch")(
      context({
        value: "archived",
        cases: [
          { value: "deleted", port: "inactive" },
          { value: "archived", port: "inactive" },
        ],
      }),
    );

    expect(result.outputs).toEqual([{ port: "inactive", items: [{ customer: "Ada" }] }]);
  });

  it("rejects missing, empty, duplicate, and composite case configuration", async () => {
    for (const parameters of [
      { cases: [{ value: "paid", port: "paid" }] },
      { value: "paid", cases: [] },
      {
        value: "paid",
        cases: [
          { value: "paid", port: "paid" },
          { value: "paid", port: "duplicate" },
        ],
      },
      { value: { status: "paid" }, cases: [{ value: "paid", port: "paid" }] },
      { value: "paid", cases: [{ value: ["paid"], port: "paid" }] },
      { value: "paid", cases: [{ port: "paid" }] },
      { value: "paid", cases: "not-an-array" },
    ]) {
      await expect(executor("switch")(context(parameters))).rejects.toThrow(/Switch node/);
    }
  });

  it("rejects empty and control-character output port names", async () => {
    for (const port of ["", "  ", "bad\nport"]) {
      await expect(
        executor("switch")(
          context({ value: "paid", cases: [{ value: "paid", port }] }),
        ),
      ).rejects.toThrow(/port/i);
    }
  });
});

describe("HTTP Request node", () => {
  it("sends the configured request and namespaces the response on the item", async () => {
    const requests: HttpRequest[] = [];
    const result = await executor("http-request")(
      context(
        {
          url: "https://example.com/items",
          method: "post",
          headers: { "x-test": "1" },
          body: { hello: "world" },
          timeoutMs: 1_234,
          maxResponseBytes: 2_048,
        },
        { customer: "Ada" },
        fakeHttp(response(), requests),
      ),
    );

    expect(requests).toEqual([
      {
        url: "https://example.com/items",
        method: "POST",
        headers: { "x-test": "1", "content-type": "application/json" },
        body: '{"hello":"world"}',
        timeoutMs: 1_234,
        maxResponseBytes: 2_048,
      },
    ]);
    expect(result).toEqual({
      outputs: [
        {
          port: "main",
          items: [
            {
              customer: "Ada",
              http: {
                status: 200,
                headers: { "content-type": "application/json" },
                body: '{"ok":true}',
                json: { ok: true },
              },
            },
          ],
        },
      ],
      detail: "HTTP 200",
    });
  });

  it("uses safe GET, timeout, and response-size defaults", async () => {
    const requests: HttpRequest[] = [];
    const result = await executor("http-request")(
      context({ url: "https://example.com" }, {}, fakeHttp(response({ body: "hello" }), requests)),
    );

    expect(requests[0]).toMatchObject({
      method: "GET",
      timeoutMs: 30_000,
      maxResponseBytes: 1_000_000,
    });
    expect(result.outputs[0]?.items[0]).toEqual({
      http: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: "hello",
      },
    });
  });

  it("keeps the raw body and omits json when the body is not valid JSON", async () => {
    const result = await executor("http-request")(
      context({ url: "https://example.com" }, {}, fakeHttp(response({ body: "not-json" }))),
    );

    expect(result.outputs[0]?.items[0]).toEqual({
      http: {
        status: 200,
        headers: { "content-type": "application/json" },
        body: "not-json",
      },
    });
  });

  it("returns a 3xx response instead of following the redirect", async () => {
    const result = await executor("http-request")(
      context(
        { url: "https://example.com" },
        {},
        fakeHttp(response({ status: 302, headers: { location: "/next" }, body: "" })),
      ),
    );

    expect(result.outputs[0]?.items[0]).toEqual({
      http: { status: 302, headers: { location: "/next" }, body: "" },
    });
  });

  it("marks transient statuses as retryable and other failures as terminal", async () => {
    const transient = executor("http-request")(
      context({ url: "https://example.com" }, {}, fakeHttp(response({ status: 503 }))),
    );
    const terminal = executor("http-request")(
      context({ url: "https://example.com" }, {}, fakeHttp(response({ status: 404 }))),
    );

    await expect(transient).rejects.toBeInstanceOf(RetryableNodeError);
    await expect(transient).rejects.toThrow("HTTP 503");
    await expect(terminal).rejects.toThrow("HTTP 404");
    await expect(terminal).rejects.not.toBeInstanceOf(RetryableNodeError);

    const unsafePost = executor("http-request")(
      context(
        { url: "https://example.com", method: "POST" },
        {},
        fakeHttp(response({ status: 503 })),
      ),
    );
    const keyedPost = executor("http-request")(
      context(
        {
          url: "https://example.com",
          method: "POST",
          headers: { "Idempotency-Key": "request-123" },
        },
        {},
        fakeHttp(response({ status: 503 })),
      ),
    );
    const emptyKeyPost = executor("http-request")(
      context(
        {
          url: "https://example.com",
          method: "POST",
          headers: { "Idempotency-Key": " " },
        },
        {},
        fakeHttp(response({ status: 503 })),
      ),
    );
    await expect(unsafePost).rejects.not.toBeInstanceOf(RetryableNodeError);
    await expect(keyedPost).rejects.toBeInstanceOf(RetryableNodeError);
    await expect(emptyKeyPost).rejects.not.toBeInstanceOf(RetryableNodeError);
  });

  it("translates transient Http port failures into retryable node errors", async () => {
    const failing: Http = {
      request: async () => {
        throw new HttpError("network", "Connection reset.", true);
      },
    };

    await expect(
      executor("http-request")(context({ url: "https://example.com" }, {}, failing)),
    ).rejects.toBeInstanceOf(RetryableNodeError);

    await expect(
      executor("http-request")(
        context({ url: "https://example.com", method: "POST" }, {}, failing),
      ),
    ).rejects.not.toBeInstanceOf(RetryableNodeError);
    await expect(
      executor("http-request")(
        context(
          {
            url: "https://example.com",
            method: "POST",
            headers: { "idempotency-key": "request-123" },
          },
          {},
          failing,
        ),
      ),
    ).rejects.toBeInstanceOf(RetryableNodeError);
  });

  it("keeps blocked addresses and other terminal port failures non-retryable", async () => {
    const failing: Http = {
      request: async () => {
        throw new HttpError("blocked-address", "Address is private.", false);
      },
    };

    await expect(
      executor("http-request")(context({ url: "https://example.com" }, {}, failing)),
    ).rejects.toThrow("Address is private.");
    await expect(
      executor("http-request")(context({ url: "https://example.com" }, {}, failing)),
    ).rejects.not.toBeInstanceOf(RetryableNodeError);
  });

  it("rejects URLs that are not HTTP(S) or contain credentials", async () => {
    for (const url of [
      "ftp://example.com",
      "file:///etc/passwd",
      "https://user:pass@example.com",
    ]) {
      await expect(
        executor("http-request")(context({ url }, {}, fakeHttp(response()))),
      ).rejects.toThrow(/URL/);
    }
  });

  it("rejects invalid methods and headers", async () => {
    await expect(
      executor("http-request")(
        context({ url: "https://example.com", method: "TRACE" }, {}, fakeHttp(response())),
      ),
    ).rejects.toThrow(/method/);

    await expect(
      executor("http-request")(
        context({ url: "https://example.com", headers: { "x-test": 1 } }, {}, fakeHttp(response())),
      ),
    ).rejects.toThrow(/header/i);

    await expect(
      executor("http-request")(
        context(
          { url: "https://example.com", headers: { "bad header": "value" } },
          {},
          fakeHttp(response()),
        ),
      ),
    ).rejects.toThrow(/header/i);

    await expect(
      executor("http-request")(
        context(
          {
            url: "https://example.com",
            headers: { "Content-Type": "application/json", "content-type": "text/plain" },
          },
          {},
          fakeHttp(response()),
        ),
      ),
    ).rejects.toThrow(/duplicated/);

    await expect(
      executor("http-request")(
        context(
          { url: "https://example.com", headers: { host: "attacker.example" } },
          {},
          fakeHttp(response()),
        ),
      ),
    ).rejects.toThrow(/managed by the adapter/);
  });

  it("rejects timeout and response-size values outside their bounds", async () => {
    for (const timeoutMs of [0, -1, 1.5, 120_001]) {
      await expect(
        executor("http-request")(
          context({ url: "https://example.com", timeoutMs }, {}, fakeHttp(response())),
        ),
      ).rejects.toThrow(/timeoutMs/);
    }

    for (const maxResponseBytes of [0, -1, 1.5, 10_000_001]) {
      await expect(
        executor("http-request")(
          context({ url: "https://example.com", maxResponseBytes }, {}, fakeHttp(response())),
        ),
      ).rejects.toThrow(/maxResponseBytes/);
    }
  });
});
