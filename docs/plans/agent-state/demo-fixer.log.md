# Demo Fixer State

## Bugs Fixed
(none yet)

## Currently Working On
- Idle — waiting for next assignment

---
### 2026-02-18
- Diagnosed: `ssr-boundaries` / `Suspense boundaries stuck in fallback + Counter non-interactive`
- Root cause: (1) `Tabs`, `Accordion`, `TodoList` missing from client manifests in `server.js:32` and `ssr-server.js:42` -- Flight server cannot serialize client refs, SSR emits E instructions. (2) `BoundaryManager.clientRenderBoundary` is a no-op -- never sets `fallback: true` on the `#suspense` node, so React hydration waits for a reveal that never comes.
- Report: `docs/plans/agent-state/demo-diagnosis-ssr-boundaries.md`
- Severity: high

## Files Read (ready to fix)
- `packages/react-dom-native/src/renderer/renderer.js` — createRoot, hydrateRoot
- `packages/react-dom-native/src/server/NativeFizzConfig.js` — SSR instruction encoding
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` — SSR instruction routing
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — hydration traversal, node registry
- `packages/react-dom-native/src/flight-client/client.js` — Flight wire protocol parser
