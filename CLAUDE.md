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

- `packages/react-dom-native/` — The library (single package)
  - `src/renderer/` — Custom React reconciler host config
  - `src/components/` — HTML element → native view mappings
  - `src/yoga-layout/` — Yoga integration with web defaults
  - `src/bridge/` — JS ↔ Swift communication protocol
  - `src/flight-client/` — RSC Flight client for native
  - `ios/` — Swift Package: ReactDomNativeKit + ShadowTree
- `example/` — Example app
  - `Falcon/` — iOS Xcode project
  - `server/` — RSC server (Express)
  - `components/` — Client components (Counter, TextInput)
  - `entry/` — App entry point (bundled into Falcon)
  - `scripts/` — Build scripts (esbuild, dev server, watcher)
- `tools/fantom/` — Headless integration testing framework
  - `src/` — JS test runner + Jest integration
  - `ios/` — Swift FantomTester binary
- `scripts/` — Root build scripts
- `tests/` — Integration tests
- `docs/` — Documentation

## Skills

Run `/check-status` to see overall progress. Run `/resume-work` to pick up where the last session left off.

### Dependencies
`/install-dependencies` — installs all npm and native dependencies upfront

### Implementation (in dependency order)
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

See `docs/master-plan.md` for full progress tracker with checkboxes.
