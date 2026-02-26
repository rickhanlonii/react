# react-dom-native

A React framework that uses HTML elements (`<div>`, `<span>`, `<p>`, etc.) as the API surface, mapping them to native iOS views (UIKit) via Yoga layout.

## Architecture

- **Renderer**: Custom React reconciler (mutation mode) using `react-reconciler`, calling into Swift shadow tree via JavaScriptCore
- **Shadow Tree**: Swift shadow nodes with Yoga layout, inspired by Fabric but simplified for fixed HTML elements
- **Layout**: Yoga with web-like defaults — `<div>` = column/block, `<span>` = virtual text (no UIView)
- **Server**: Next.js handles RSC rendering, Flight wire protocol, streaming
- **Client**: Native iOS app receives Flight stream, deserializes with `react-client/flight`, feeds custom renderer
- **Target**: iOS only (UIKit)
- **JS Engine**: JavaScriptCore (native Swift API, zero bundle size)
- **Bundler**: esbuild (fastest, simplest config)

## Key Design Decisions

- **No NativeComponentRegistry**: `<div>` passed as raw string over bridge, created in Swift
- **No reactTag**: Node identity via InstanceHandle (object refs) and ShadowNode pointers
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

`/test-unit`, `/test-e2e`, `/e2e`, `/build-demo`, `/build-e2e`

### Required Skills

- **Building/running the Falcon demo app**: ALWAYS use `/build-demo`. Do NOT manually start dev servers or run `build_run_sim` without it.
- **Building/running the LayoutCompare e2e app**: ALWAYS use `/build-e2e`. Do NOT manually start dev servers or run `build_run_sim` without it.

## Superpowers

Only invoke these superpowers skills proactively:
- `brainstorming` — before creative/design work
- `writing-plans` — before multi-step implementation
- `dispatching-parallel-agents` — when 2+ independent tasks exist

All other superpowers skills (TDD, debugging, verification, etc.) should only
be used when explicitly requested via slash command.

## Development Workflow

### Running tests

**JS unit tests** (renderer, components, yoga-layout, bridge, flight-client):
```bash
npm test
```

**Swift unit tests** (ElementDefaults, YogaStyleApplier, UIKitHelpers):
```bash
npm run test:swift
```
This runs `xcodebuild test` with the `ReactDomNativeKit-Package` scheme on the iOS Simulator. Don't use `swift test` (UIKit isn't available on macOS) or the MCP `test_sim` tool (the SPM package has no `.xcodeproj`).

**Fantom integration tests** (JS ↔ Swift end-to-end via headless runner):
```bash
npm run test:fantom
```

**E2E Swift tests** (full pipeline: real HTTP servers → real React → real UIKit views):
```bash
npm run test:e2e-swift
```
This starts Flight + SSR servers on ports 7100/7101, then runs `EndToEndSSRTests` (SSR + hydration) and `EndToEndCSRTests` (client-side rendering) via `xcodebuild test`.

### Dev server

Run `cd example && npm run dev` to start:
- **esbuild watcher** — rebuilds `bundle.js` on JS file changes
- **RSC server** on `http://localhost:6000` — serves Flight streams, the JS bundle, and a version endpoint

The native app (debug builds) loads the bundle from `http://localhost:6000/bundle.js` instead of the app bundle, and reloads automatically via WebSocket when files change. Press **Cmd+Shift+R** in the simulator to manually reload.

Server component changes (e.g. `server/src/App.js`) are picked up automatically — the server clears Node's require cache on each request, and the version endpoint tracks source file mtimes.

### Iterating on native layout

To iterate on layout differences between web and native:

1. Start the dev server: `cd example && npm run dev`
2. Build and run the app with `/build-demo`
3. Take a screenshot with the `screenshot` MCP tool (XcodeBuildMCP)
4. Compare against web rendering (save web screenshot as `web.png`)
5. Make changes to JS files (auto-reloads) or Swift files (requires rebuild via `build_run_sim`)
6. Repeat from step 3

**Key files for layout fixes:**
- `packages/react-dom-native/src/yoga-layout/defaults.js` — element-type Yoga defaults (flexDirection, margins, fontSize)
- `packages/react-dom-native/src/renderer/HostConfig.js` — `createInstance` merges element defaults with user styles before sending to native
- `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift` — applies style dict to Yoga nodes (expects string enum values like `"column"`, not integers)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` — creates UIKit views and applies visual props (font, color, etc.)

**Known Yoga gotchas:**
- `YGConfigSetUseWebDefaults(true)` makes Yoga default to `flexDirection: row` (CSS flex default). Block elements need explicit `flexDirection: 'column'` in their defaults.
- The native `YogaStyleApplier` expects **string** values for enum properties (`"column"`, `"center"`), not integer constants. Don't use `applyStyles()` which converts to integers.
- `#text` nodes are separate UILabels that need to inherit font/color from their parent element — handled in `applyInheritedTextStyle()` during the INSERT mutation.
- Yoga flex layout doesn't collapse margins like CSS block layout. When parent uses `gap` and children have default margins, spacing will be larger than web.

## Adding a New HTML Element

Every new element requires updating these files in lockstep:

1. **`ElementDefaults.swift`** — add a static defaults dict + case in `defaults(for:)` switch
2. **`UIKitMutationApplier.swift`** — add to `createView`/`updateView` case list (text elements go in the UILabel case, container elements fall through to the default UIView case)
3. **`HostConfig.js`** — add to `TEXT_CONTEXT_ELEMENTS` Set if the element is inline text (virtual text inside a text container)
4. **Swift tests** (`ElementDefaultsTests.swift`) — verify defaults dict values
5. **JS integration tests** (`element-defaults-itest.js`) — verify end-to-end via Fantom

Reference descriptors with exact values: `docs/research/html-elements/`

## Session Hygiene

- **Commit completed work** before ending a session. Don't leave uncommitted changes spanning multiple features.
- **One concern per set of uncommitted changes.** If starting a new feature, commit or stash the current work first.
