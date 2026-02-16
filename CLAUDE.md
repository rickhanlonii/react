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

## Development Workflow

### Dev server

Run `cd example && npm run dev` to start:
- **esbuild watcher** — rebuilds `bundle.js` on JS file changes
- **RSC server** on `http://localhost:6000` — serves Flight streams, the JS bundle, and a version endpoint

The native app (debug builds) loads the bundle from `http://localhost:6000/bundle.js` instead of the app bundle, and polls `/bundle-version` every 2 seconds to auto-reload when files change. Press **Cmd+R** in the simulator to manually reload.

Server component changes (e.g. `server/src/App.js`) are picked up automatically — the server clears Node's require cache on each request, and the version endpoint tracks source file mtimes.

### Iterating on native layout

To iterate on layout differences between web and native:

1. Start the dev server: `cd example && npm run dev`
2. Build and run the app in the simulator (via Xcode or `build_run_sim` MCP tool)
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
- The `/resume-work` skill relies on clean git state to determine where to pick up.

## Progress

See `docs/master-plan.md` for full progress tracker with checkboxes.
