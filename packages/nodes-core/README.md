# @krypton/nodes-core

Built-in nodes: Manual Trigger, Set, IF, Switch, Merge, and HTTP Request. The
`coreNodeCatalog` export describes their ports and parameters for the future
editor; credentials and the first five integrations follow in Stage 5.

Boundary: may import `@krypton/schema`, engine types, and `@krypton/node-sdk`.
Must not import the database, HTTP framework, or UI.
