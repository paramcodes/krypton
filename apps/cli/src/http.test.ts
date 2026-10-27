import { createServer, type Server } from "node:http";

import { HttpError, type HttpRequest } from "@krypton/engine";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpPort, isBlockedAddress } from "./http";

const servers: Server[] = [];

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Expected a TCP server address."));
        return;
      }
      resolve(address.port);
    });
  });

const close = async (server: Server): Promise<void> => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
};

const startServer = async (server: Server): Promise<number> => {
  servers.push(server);
  return listen(server);
};

const request = (url: string, overrides: Partial<HttpRequest> = {}): HttpRequest => ({
  url,
  method: "GET",
  headers: {},
  timeoutMs: 1_000,
  maxResponseBytes: 1_000,
  ...overrides,
});

const signal = (): AbortSignal => new AbortController().signal;

afterEach(async () => {
  const pending = servers.splice(0);
  await Promise.all(pending.map((server) => close(server)));
});

describe("HTTP adapter address policy", () => {
  it("blocks loopback, private, link-local, and documentation ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.1.1",
      "100.64.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "fec0::1",
      "2001:db8::1",
      "2001:1::1",
      "::1.2.3.4",
      "::ffff:127.0.0.1",
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(address)).toBe(false);
    }
  });

  it("rejects loopback, credentials, and non-HTTP URLs before connecting", async () => {
    const http = createHttpPort();

    await expect(http.request(request("http://127.0.0.1/"), signal())).rejects.toMatchObject({
      code: "blocked-address",
      retryable: false,
    });
    await expect(http.request(request("http://localhost/"), signal())).rejects.toMatchObject({
      code: "blocked-address",
    });
    await expect(
      http.request(request("https://user:pass@example.com/"), signal()),
    ).rejects.toMatchObject({ code: "invalid-request" });
    await expect(http.request(request("file:///etc/passwd"), signal())).rejects.toMatchObject({
      code: "invalid-request",
    });
  });

  it("rejects invalid timeout and response-size contracts", async () => {
    const http = createHttpPort();

    await expect(
      http.request(request("https://example.com/", { timeoutMs: 0 }), signal()),
    ).rejects.toMatchObject({ code: "invalid-request", retryable: false });
    await expect(
      http.request(request("https://example.com/", { maxResponseBytes: 10_000_001 }), signal()),
    ).rejects.toMatchObject({ code: "invalid-request", retryable: false });
  });
});

describe("HTTP adapter requests", () => {
  it("sends a request and returns the response", async () => {
    let receivedBody = "";
    const server = createServer((incoming, outgoing) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      incoming.on("end", () => {
        receivedBody = Buffer.concat(chunks).toString("utf8");
        outgoing.writeHead(201, { "x-test": "yes" });
        outgoing.end("created");
      });
    });
    const port = await startServer(server);
    const http = createHttpPort({ allowPrivateNetworks: true });

    const response = await http.request(
      request(`http://127.0.0.1:${port}/items?q=1`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-test": "1" },
        body: '{"hello":"world"}',
      }),
      signal(),
    );

    expect(receivedBody).toBe('{"hello":"world"}');
    expect(response.status).toBe(201);
    expect(response.headers["x-test"]).toBe("yes");
    expect(response.body).toBe("created");
  });

  it("does not follow redirects", async () => {
    const server = createServer((_incoming, outgoing) => {
      outgoing.writeHead(302, { location: "/next" });
      outgoing.end();
    });
    const port = await startServer(server);
    const http = createHttpPort({ allowPrivateNetworks: true });

    const response = await http.request(request(`http://127.0.0.1:${port}/`), signal());

    expect(response.status).toBe(302);
    expect(response.headers["location"]).toBe("/next");
  });

  it("times out a request that never responds", async () => {
    const server = createServer(() => {
      // Deliberately leave the response open.
    });
    const port = await startServer(server);
    const http = createHttpPort({ allowPrivateNetworks: true });

    await expect(
      http.request(request(`http://127.0.0.1:${port}/`, { timeoutMs: 25 }), signal()),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("stops before buffering a response over the byte limit", async () => {
    const server = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200);
      outgoing.end("0123456789");
    });
    const port = await startServer(server);
    const http = createHttpPort({ allowPrivateNetworks: true });

    await expect(
      http.request(request(`http://127.0.0.1:${port}/`, { maxResponseBytes: 4 }), signal()),
    ).rejects.toMatchObject({ code: "response-too-large", retryable: false });
  });

  it("maps an abort signal to a non-retryable HttpError", async () => {
    const server = createServer(() => {
      // Keep the connection open until the client aborts.
    });
    const port = await startServer(server);
    const http = createHttpPort({ allowPrivateNetworks: true });
    const controller = new AbortController();

    const pending = http.request(
      request(`http://127.0.0.1:${port}/`, { timeoutMs: 10_000 }),
      controller.signal,
    );
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(HttpError);
    await expect(pending).rejects.toMatchObject({ code: "aborted", retryable: false });
  });
});
