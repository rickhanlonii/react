# react-dom-native

A React framework that uses HTML elements (`<div>`, `<span>`, `<p>`, etc.) as the API surface, mapping them to native iOS views (UIKit) via Yoga layout.

## Architecture

- **Renderer**: Custom React reconciler (mutation mode) using `react-reconciler`
- **Layout**: Yoga with web-like defaults — `<div>` = column/block, `<span>` = inline
- **Server**: Next.js handles RSC rendering, Flight wire protocol, streaming
- **Client**: Native iOS app receives Flight stream, deserializes with `react-client/flight`, feeds custom renderer
- **Target**: iOS only (UIKit)
- **JS Engine**: TBD (Hermes vs JavaScriptCore — decided by `/research-js-engine`)

## Data Flow

```
Next.js (RSC server) → Flight stream (HTTP) → Native iOS client
→ Flight deserializer → React element tree → Custom renderer
→ HTML element mapping → UIKit views + Yoga layout → Screen
```

## Reference Repos (siblings in `../`)

| Repo | Purpose | Key Files |
|------|---------|-----------|
| `../react` | Reconciler, Flight, noop renderer | `packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` (host config interface), `packages/react-noop-renderer/src/createReactNoop.js` (simplest renderer) |
| `../react-native` | Architecture reference | `packages/react-native/ReactCommon/yoga/` (Yoga source), `packages/react-native/Libraries/NativeComponent/NativeComponentRegistry.js` |
| `../async-react` | Working Next.js RSC app | `app/` directory, `next.config.ts` |

## Key React Source Files

- `../react/packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` — 287 functions a custom renderer must implement
- `../react/packages/react-noop-renderer/src/createReactNoop.js` — Simplest complete renderer (best starting template)
- `../react/packages/react-noop-renderer/src/ReactNoopFlightClient.js` — Minimal Flight client config
- `../react/packages/react-noop-renderer/src/ReactNoopFlightServer.js` — Minimal Flight server config
- `../react/packages/react-server-dom-esm/` — ESM-based Flight integration (simplest bundler reference)
- `../react/packages/react-client/src/ReactFlightClient.js` — Full Flight client implementation
- `../react/packages/react-client/src/forks/ReactFlightClientConfig.custom.js` — Flight client config interface

## Project Structure

- `packages/renderer/` — Custom React reconciler host config
- `packages/components/` — HTML element → native view mappings
- `packages/yoga-layout/` — Yoga integration with web defaults
- `packages/bridge/` — JS ↔ Swift communication
- `packages/flight-client/` — RSC Flight client for native
- `packages/cli/` — Build tools and dev server
- `ios/` — Native Swift code (UIKit views, app delegate)
- `server/` — Next.js RSC server
- `example/` — Example app

## Skills

Run `/check-status` to see overall progress. Run `/resume-work` to pick up where the last session left off.

### Research (run first — all parallelizable)
`/research-reconciler`, `/research-flight-protocol`, `/research-nextjs-flight`, `/research-yoga-ios`, `/research-js-engine`, `/research-html-mapping`, `/research-ios-uikit`

### Specs (run after all research)
`/generate-specs`

### Implementation (run after specs, in dependency order)
1. `/impl-renderer` (first — no impl dependencies)
2. `/impl-js-bridge` + `/impl-yoga-layout` (parallel, no cross-dependency)
3. `/impl-html-components` (depends on renderer + yoga)
4. `/impl-flight-client` (depends on renderer + bridge)
5. `/impl-build-system` (depends on bridge)
6. `/impl-devtools` (depends on build-system)

### Testing
`/test-unit`, `/test-e2e`

## Progress

See `docs/MASTER_PLAN.md` for full progress tracker with checkboxes.
