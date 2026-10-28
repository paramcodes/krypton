# @krypton/node-sdk

The public contract for built-in and third-party nodes. The editor-facing node
catalog and parameter metadata contract is available now; the execution-side SDK
helpers land in Stage 5.

Boundary: may import `@krypton/schema` only. Must not import engine internals,
built-in nodes, persistence, the API framework, or UI.
