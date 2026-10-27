/**
 * A validation failure at the boundary where untrusted JSON becomes a typed
 * workflow value.
 */
export class SchemaError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "SchemaError";
    this.path = path;
  }
}
