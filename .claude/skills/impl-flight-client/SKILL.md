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
- `packages/react-dom-native/src/renderer/` must be implemented
- `packages/react-dom-native/src/bridge/` must be implemented

## Reference Files

- `../react/packages/react-noop-renderer/src/ReactNoopFlightClient.js` — Minimal Flight client config
- `../react/packages/react-server-dom-esm/src/client/ReactFlightClientConfigBundlerESM.js` — ESM bundler config
- `../react/packages/react-client/src/forks/ReactFlightClientConfig.custom.js` — Interface we must implement

## Instructions

1. Read the Flight client spec and research documents
2. Initialize `packages/react-dom-native/src/flight-client/`:
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

- `packages/react-dom-native/src/flight-client/config.js`
- `packages/react-dom-native/src/flight-client/client.js`
- `packages/react-dom-native/src/flight-client/http.js`
- `packages/react-dom-native/src/flight-client/index.js`
- `packages/react-dom-native/src/flight-client/__tests__/client.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Flight client for native"
