export const parsePostgresUrl = (value: string, variableName: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid URL.`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${variableName} must use the postgres: or postgresql: protocol.`);
  }

  return url;
};

export const databaseName = (url: URL): string => url.pathname.replace(/^\/+|\/+$/g, "");

export const isLoopbackHost = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname === "[::1]";
