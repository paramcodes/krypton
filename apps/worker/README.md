# @krypton/worker

The execution worker. It arrives in Stage 4 when runs move behind a queue.

Boundary: it may use the engine, built-in nodes, node SDK, and schema. It must
not import the web editor.
