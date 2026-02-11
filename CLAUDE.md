# react-dom-native

A React framework that uses HTML elements (`<div>`, `<span>`, `<p>`, etc.) as the API surface, mapping them to native iOS views (UIKit) via Yoga layout.

## Architecture

- **Renderer**: Custom React reconciler (mutation mode) using `react-reconciler`, calling into C++ shadow tree via JSI
- **Shadow Tree**: C++ shadow nodes with embedded Yoga nodes, inspired by Fabric but simplified for fixed HTML elements
- **Layout**: Yoga with web-like defaults — `<div>` = column/block, `<span>` = virtual text (no UIView)
- **Server**: Next.js handles RSC rendering, Flight wire protocol, streaming
- **Client**: Native iOS app receives Flight stream, deserializes with `react-client/flight`, feeds custom renderer
- **Target**: iOS only (UIKit)
- **JS Engine**: JavaScriptCore (native Swift API, zero bundle size)
- **Bundler**: esbuild (fastest, simplest config)

## Key Design Decisions

- **No NativeComponentRegistry**: `<div>` passed as raw string over bridge, created in C++
- **No reactTag**: Node identity via InstanceHandle (JSI object refs) and ShadowNode pointers
- **No ViewConfig**: Fixed HTML element set with known props/events, no runtime validation
- **Discrete events on main thread**: Click/press dispatch synchronously
- **Fixed DOM event set**: onClick, onChange, onScroll, etc. — no dynamic registration

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
- `packages/bridge/` — JS ↔ C++ communication (JSI bindings)
- `packages/flight-client/` — RSC Flight client for native
- `packages/cli/` — Build tools and dev server
- `ios/` — Native code: C++ shadow tree/scheduler, Swift UIKit views, app delegate
- `server/` — Next.js RSC server
- `example/` — Example app

## Skills

Run `/check-status` to see overall progress. Run `/resume-work` to pick up where the last session left off.

### Research (run first — all parallelizable)
`/research-reconciler`, `/research-flight-protocol`, `/research-nextjs-flight`, `/research-yoga-ios`, `/research-js-engine`, `/research-html-mapping`, `/research-ios-uikit`, `/research-bundler`

### Architecture Research (run after initial research)
First 4 parallelizable: `/research-cpp-shadow-tree`, `/research-node-identity`, `/research-event-system`, `/research-no-viewconfig`
Then 2 with dependencies: `/research-mounting-scheduling` (after cpp-shadow-tree), `/research-element-dispatch` (after event-system + no-viewconfig)

### Specs (run after all research)
`/generate-specs`

### Dependencies (run after specs, before impl)
`/install-dependencies` — installs all npm and native dependencies upfront

### Implementation (run after dependencies, in dependency order)
1. `/impl-renderer` (first — no impl dependencies)
2. `/impl-js-bridge` + `/impl-yoga-layout` (parallel, no cross-dependency)
3. `/impl-xcode-project` (depends on bridge)
4. `/impl-html-components` (depends on renderer + yoga)
5. `/impl-flight-client` (depends on renderer + bridge)
6. `/impl-build-system` (depends on bridge)
7. `/impl-devtools` (depends on build-system)
8. `/impl-fantom` (depends on renderer + bridge — integration testing framework)

### Testing
`/test-unit`, `/test-e2e`

## Progress

See `docs/MASTER_PLAN.md` for full progress tracker with checkboxes.
