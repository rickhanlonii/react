---
name: research-flight-protocol
description: Research the RSC Flight wire protocol. Run this to document the streaming format, client config interface, and deserialization.
---

# Research: RSC Flight Wire Protocol

## Objective

Document the RSC Flight wire protocol — the streaming format React uses to send component trees from server to client. Understand the Flight client config interface we need to implement.

## Input Files

Read these files in `../react/` (relative to project root):

1. `packages/react-noop-renderer/src/ReactNoopFlightClient.js` — Minimal Flight client config. Shows every function the client config must provide.
2. `packages/react-client/src/ReactFlightClient.js` — Full Flight client implementation. The core deserialization logic.
3. `packages/react-client/src/forks/ReactFlightClientConfig.custom.js` — The interface our Flight client config must satisfy.
4. `packages/react-server-dom-esm/src/client/ReactFlightClientConfigBundlerESM.js` — ESM bundler Flight client config (simplest real example).

## Instructions

1. Read `ReactFlightClientConfig.custom.js` to list all exports the client config must provide
2. Read `ReactNoopFlightClient.js` for the minimal implementation of each
3. Study `ReactFlightClient.js` to understand:
   - How the Flight stream is parsed (line-based protocol, JSON chunks)
   - How React elements, client references, and server references are resolved
   - How streaming/chunked delivery works
   - What `createFromFetch` / `createFromReadableStream` do
4. Document the wire format: what bytes flow over the network, how rows are delimited, what each row type means (model, module, error, etc.)

## Output

Write to: `docs/research/flight-protocol.md`

Format:
- Wire format specification (row types, delimiters, encoding)
- Client config interface table: Function | Noop Implementation | Purpose
- Data flow diagram: stream → parse → resolve → React elements
- Key considerations for native (no DOM, no bundler, custom module resolution)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "RSC Flight wire protocol"
