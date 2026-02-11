---
name: impl-flight-client
description: Implement the RSC Flight client for native. Depends on renderer and bridge.
---

# Implement: Flight Client

## Objective

Build a Flight client that consumes Next.js RSC streams and feeds the resulting React element tree into our custom renderer.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `docs/specs/flight-client.md` must exist
- `docs/research/flight-protocol.md` and `docs/research/nextjs-flight.md` must exist
- `packages/renderer/` must be implemented
- `packages/bridge/` must be implemented

## Reference Files

- `../react/packages/react-noop-renderer/src/ReactNoopFlightClient.js` — Minimal Flight client config
- `../react/packages/react-server-dom-esm/src/client/ReactFlightClientConfigBundlerESM.js` — ESM bundler config
- `../react/packages/react-client/src/forks/ReactFlightClientConfig.custom.js` — Interface we must implement

## Instructions

1. Read the Flight client spec and research documents
2. Initialize `packages/flight-client/`:
   - `package.json` with `react-client` (or `react-server-dom-*`) dependency
3. Implement Flight client config:
   - `resolveClientReference(metadata)` — resolve client component references (module loading)
   - `resolveServerReference(metadata)` — resolve server action references
   - `prepareDestinationForModule(metadata)` — preload module if needed
   - `preloadModule(metadata)` / `requireModule(metadata)` — load client component code
4. Implement the HTTP client:
   - `fetchRSC(url)` — makes HTTP request with proper headers (`RSC: 1`, `Next-Router-State-Tree`, etc.)
   - Receives streaming response
   - Feeds chunks to Flight deserializer
   - Returns React element tree
5. Integrate with renderer:
   - Flight client produces React elements → pass to `render(elements, container)`
   - Handle streaming updates (progressive rendering)
6. Write tests:
   - Mock HTTP responses with recorded Flight payloads
   - Test deserialization produces correct element tree
   - Test streaming updates work

## Output

- `packages/flight-client/package.json`
- `packages/flight-client/src/config.js`
- `packages/flight-client/src/client.js`
- `packages/flight-client/src/http.js`
- `packages/flight-client/src/index.js`
- `packages/flight-client/src/__tests__/client.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Flight client for native"
