# Glossary

Plain-language definitions for terms used in the code, docs, and reviews.

| Term             | Meaning                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| Workflow         | A saved graph of nodes and connections that runs as one unit.                                                     |
| Node             | One step in a workflow, with a typed input and output.                                                            |
| Node definition  | The code and metadata that implement a node type.                                                                 |
| Node catalog     | The editor-facing description of a node type's ports and parameter fields.                                        |
| Append merge     | A fan-in node that passes each incoming item through in queue order without waiting for other branches.           |
| Loop over items  | A node that runs a connected body once per array element and collects each returned item in `results`.            |
| Loop state       | The reserved `__krypton` item field that carries iteration position and partial results through the engine.       |
| Node instance    | A node placed in a workflow, with its own parameters and position.                                                |
| Connection       | A directed edge that passes items from one node to another.                                                       |
| Item             | One JSON object flowing through the graph.                                                                        |
| Trigger          | A node that starts a run, such as a manual click, schedule, or webhook.                                           |
| Run              | One attempt to execute a workflow. Also called an execution.                                                      |
| Trace            | The readable record of a run returned by the engine; not yet the durable journal.                                 |
| Start node       | A node with no incoming connection, where a run begins.                                                           |
| Step budget      | The maximum number of node executions a run may perform before it fails visibly.                                  |
| Journal          | The append-only record of run events used for replay, debugging, and recovery.                                    |
| Port             | An interface the engine depends on for an external effect, such as time, randomness, HTTP, storage, or secrets.   |
| HTTP port        | The engine interface for outbound requests and destination policy.                                                |
| Node timeout     | A per-attempt deadline that aborts a node's signal and fails the attempt if its executor does not finish in time. |
| Error policy     | A per-node rule for an executor failure: fail the run, skip the item, or route an error item.                     |
| Error route      | The path from a node's fixed `error` output to a handler, used when the policy is `route`.                        |
| Error item       | The failed input item plus an `error` object with node, attempt, and timing details.                              |
| Skipped item     | An item dropped by an error policy of `skip`; the trace records it, but it produces no output.                    |
| Retry policy     | A bounded, per-node rule for retrying failures that a node explicitly marks as retryable.                         |
| SSRF             | Server-side request forgery: tricking a server into requesting private or otherwise unsafe destinations.          |
| Simulation       | A deterministic test run that uses fake ports instead of real time, network, or storage.                          |
| Expect test      | A readable end-to-end test that runs the engine and snapshots the human-readable trace inline.                    |
| Property test    | A test that generates many randomized inputs and checks an invariant, shrinking failures to a counterexample.     |
| Expression       | A whole-field `{{ expression }}` value reference evaluated per item, with no arbitrary code, I/O, or secrets.     |
| Credential       | An encrypted secret attached to a node and never returned by the API.                                             |
| Sandbox          | An isolated runtime for user code, separate from the API and worker.                                              |
| Clean-room       | Built from public behaviour and documentation, without copying source, assets, schemas, or branding.              |
| ADR              | Architecture decision record: the context, choice, alternatives, and consequences of a decision.                  |
| Tripwire         | A check that fails CI when a constraint is crossed.                                                               |
| Boundary         | A rule about which package may import which other package.                                                        |
| Curation         | A hand-written, reviewed set of nodes, not an open marketplace.                                                   |
| Pin data         | Saved test data for a node so a workflow can be tested without live systems.                                      |
| Idempotency      | The property that retrying an operation does not duplicate its effect.                                            |
| SSE              | Server-Sent Events, used to stream run updates from the API to the editor.                                        |
| OCI image        | The container image format used by both Podman and Docker.                                                        |
| Workflow version | An immutable snapshot of a workflow, so an old run can be explained and replayed.                                 |
| Execution order  | The deterministic order in which nodes are scheduled for a run.                                                   |
| Backpressure     | A limit that stops a fast producer from overwhelming a slower consumer, such as a run queue.                      |
