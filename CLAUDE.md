# react-dom-native

A React framework that uses HTML elements (`<div>`, `<span>`, `<p>`, etc.) as the API surface, mapping them to native iOS views (UIKit) via Yoga layout.

## Architecture

- **Renderer**: Custom React reconciler (mutation mode) using `react-reconciler`, calling into Swift shadow tree via JavaScriptCore
- **Shadow Tree**: Swift shadow nodes with Yoga layout, inspired by Fabric but simplified for fixed HTML elements
- **Layout**: Yoga with web-like defaults — `<div>` = column/block, `<span>` = virtual text (no UIView)
- **Server**: Express handles RSC rendering, Flight wire protocol, streaming
- **Client**: Native iOS app receives Flight stream, deserializes with `react-client/flight`, feeds custom renderer
- **Target**: iOS only (UIKit)
- **JS Engine**: JavaScriptCore (native Swift API, zero bundle size)
- **Bundler**: esbuild (fastest, simplest config)

## Project Structure

### Package

- `packages/react-dom-native/` — The library
  - `src/` — JS: renderer (host config), bridge, flight-client, server (SSR), polyfills, devtools, entry point
  - `ios/` — Swift Package: ReactDomNativeKit (shadow tree, Yoga layout, UIKit bindings)

### Apps

- `example/` — **Falcon Demo** — full RSC app (Flight + SSR + hydration)
  - `Falcon/` — Xcode project (runs on "Falcon Demo" simulator)
  - `server/` — Express RSC server (`server.js` on :6000) + SSR server (`ssr-server.js` on :6001), server components in `src/`
  - `scripts/` — esbuild bundler, dev server, watcher
- `web-example/` — **Web reference app** — Next.js app rendering the same components for visual comparison
  - `app/` — Next.js app dir with pages for fixtures and categories
  - `lib/fixtures.js` — shared fixture loader
- `tests/e2e/LayoutCompare/` — **LayoutCompare** — e2e comparison app (runs on "Falcon E2E" simulator)
  - Renders each fixture natively (UIKit/Yoga) and in a WKWebView side-by-side, diffs layout

### Tests

- `tests/integration/` — Fantom integration tests (JS ↔ Swift, `*-itest.js`)
- `tests/e2e/fixtures/` — Layout comparison fixtures (JSX, shared by LayoutCompare and web-example)
- `tools/fantom/` — Fantom headless test runner (JS + Swift binary)

### Other

- `Falcon.xcworkspace` — Workspace containing Falcon demo + ReactDomNativeKit package
- `scripts/` — Root build/test/dev scripts (build-ios, build-js, test-swift, test-e2e-swift, dev, build-server)
- `docs/` — Plans, research, architecture docs

## Skills

`/build`, `/test`, `/e2e`, `/reference`, `/add-element`

### Required Skills

- **Building/running apps**: ALWAYS use `/build demo` or `/build e2e`. Do NOT manually start dev servers or run `build_run_sim` without it.
- **Running tests**: Use `/test` to automatically run the right test suite based on what changed.
- **Reference repos and React source files**: Use `/reference` for sibling repo info and key React source files.
- **Adding a new HTML element**: Use `/add-element` for the lockstep checklist.

## Development Workflow

### Running tests

Use the `/test` skill which auto-detects what to run, or run manually:

- `npm test` — JS unit tests
- `npm run test:swift` — Swift unit tests (uses `xcodebuild test`, not `swift test`)
- `npm run test:fantom` — Fantom integration tests (JS ↔ Swift)
- `npm run test:e2e-swift` — E2E Swift tests (real servers → React → UIKit)

### Dev server

Run `cd example && npm run dev` to start esbuild watcher + RSC server on `http://localhost:6000`. The native app auto-reloads via WebSocket on JS changes.

### Debugging

Choose the right tool based on what you're investigating:

**UI structure** — use `npm run app:snapshot-ui` to get the full accessibility tree with element types, labels, frames (x, y, width, height), and unique IDs. Best for verifying view hierarchy, checking if elements exist, and understanding layout structure.

**Visual rendering** — use `npm run app:screenshot` to capture what the user actually sees. Best for checking visual appearance, colors, spacing, and comparing against expected rendering.

**Native runtime (Swift/UIKit)** — use the LLDB debugger (requires build server):
- `npm run app:debug-attach` — attach to the running app
- `npm run app:debug-lldb -- demo "<command>"` — run any LLDB command (e.g. `po UIApplication.shared`, `expression`, `breakpoint list`)
- `npm run app:debug-stack` — get backtrace (app must be stopped at a breakpoint)
- `npm run app:debug-variables` — inspect frame variables (app must be stopped)
- `npm run app:debug-detach` — detach when done

**App logs** — use log capture (requires build server):
- `npm run app:log-start` — start capturing logs
- `npm run app:log-read` — read captured logs without stopping
- `npm run app:log-stop` — stop and return all logs
- Logs are filtered to the app's bundle ID (`com.react.Falcon`) and process name

**JS runtime** — use the `/devtools` skill to connect Chrome DevTools to the app's JSC runtime for console logs, JS profiling, and runtime inspection.

### UI Automation

Interact with the running app programmatically. All commands target the demo app by default; pass `e2e` as the second arg for LayoutCompare.

- `npm run app:tap -- <x> <y>` — tap at coordinates
- `npm run app:swipe -- <x1> <y1> <x2> <y2>` — swipe between points
- `npm run app:gesture -- <preset>` — preset gestures: `scroll-up`, `scroll-down`, `scroll-left`, `scroll-right`, `swipe-from-left-edge`, `swipe-from-right-edge`, `swipe-from-top-edge`, `swipe-from-bottom-edge`
- `npm run app:type-text -- "<text>"` — type text into focused field
- `npm run app:long-press -- <x> <y> <duration_ms>` — long press
- `npm run app:button -- <type>` — hardware buttons: `home`, `lock`, `side-button`, `siri`, `apple-pay`
- `npm run app:key-press -- <keyCode>` — press a key by HID keycode

Typical workflow: `snapshot-ui` to find coordinates → `tap`/`swipe`/`type-text` to interact → `screenshot` to verify result.

### Filtering output

All `npm run app:*` commands support `--filter <query>` to filter response lines (case-insensitive). Always use `--filter` instead of piping to `grep`.

```bash
npm run app:snapshot-ui -- --filter AXLabel       # only lines containing "AXLabel"
npm run app:snapshot-ui -- --filter BackButton     # find a specific element
npm run app:list -- --filter Booted                # only booted simulators
```

## Coding Conventions

- **Always set `id` on interactive elements.** Every `<button>`, `<input>`, and other interactive element must have an `id` prop. The `id` maps to `accessibilityIdentifier` on UIKit views, enabling UI automation to target elements by ID instead of coordinates. Use descriptive, kebab-case IDs (e.g. `id="counter-increment"`, `id="login-submit"`, `id="search-input"`).

## Planning

Always write plans to ./docs/plans. When a plan is finished, move it to ./docs/plans/complete and include it in your commit.

## Session Hygiene

- **Planning:** If asked to only create a plan to investigate, do not explore, just plan.
- **Commit completed work** before ending a session. Don't leave uncommitted changes spanning multiple features.
- **One concern per set of uncommitted changes.** If starting a new feature, commit or stash the current work first.
- **Build server**: Never start, stop, or restart the build server (`npm run build-server`). It is managed by the user in a separate terminal. If it's not running, use fallback commands or ask the user to start it.
- **Build operations**: NEVER call `bash scripts/build-op.sh` directly or `curl` the build server (port 6002). Always use `npm run app:*` commands instead.

IMPORTANT: NEVER USE WORKTREES OR GIT BRANCHES. Always execute plans in their entirety without stopping for feedback.