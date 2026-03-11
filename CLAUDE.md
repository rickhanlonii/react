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

- `packages/react-dom-native/` — The library
  - `src/` — JS: renderer (host config), bridge, flight-client, server (SSR), polyfills, devtools, entry point
  - `ios/` — Swift Package: ReactDomNativeKit (shadow tree, Yoga layout, UIKit bindings)
- `fixtures/example/` — **Falcon Demo** — full RSC app (Flight + SSR + hydration)
  - `Falcon/` — Xcode project (runs on "Falcon Demo" simulator)
  - `server/` — Express RSC server (`server.js` on :6000) + SSR server (`ssr-server.js` on :6001), server components in `src/`
- `fixtures/web-example/` — **Web reference app** — Next.js app rendering the same components for visual comparison
- `fixtures/layout/LayoutCompare/` — **LayoutCompare** — e2e comparison app (runs on "Falcon E2E" simulator)
- `tests/integration/` — Fantom integration tests (JS ↔ Swift, `*-itest.js`)
- `fixtures/layout/fixtures/` — Layout comparison fixtures (JSX, shared by LayoutCompare and web-example)
- `packages/fantom/` — Fantom headless test runner (JS + Swift binary)
- `fixtures/Falcon.xcworkspace` — Workspace containing Falcon demo + ReactDomNativeKit package
- `scripts/` — Root build/test/dev scripts
- `docs/` — Plans, research, architecture docs

## Skills

- **Building/running apps**: ALWAYS use `/build demo` or `/build e2e`. Do NOT manually start dev servers or run `build_run_sim` without it.
- **Running tests**: Use `/test` to automatically run the right test suite based on what changed.
- **Reference repos**: Use `/reference` for sibling repo info and key React source files.
- **Adding a new HTML element**: Use `/add-element` for the lockstep checklist.
- **E2E layout comparison**: Use `/e2e` for LayoutCompare workflows.

## Development Workflow

Run `cd fixtures/example && npm run dev` to start esbuild watcher + RSC server on `http://localhost:6000`. The native app auto-reloads via WebSocket on JS changes.

For UI automation, test commands, and output filtering, see `docs/cli-reference.md`.

## Debugging

Pick the right tool for what you're investigating:

- **UI structure**: `npm run app:snapshot-ui` — accessibility tree with element types, labels, frames, IDs
- **Visual rendering**: `npm run app:screenshot` — capture what the user sees
- **App logs**: `npm run app:log-start` (relaunches app with stdout capture) → `npm run app:log-read` → `npm run app:log-stop` — captures Swift `print()` output
- **JS runtime** (console, eval): Use app log capture — `npm run app:log-start` → `npm run app:log-read` → `npm run app:log-stop`
- **Native runtime** (Swift/UIKit): `npm run app:debug-lldb -- demo "<command>"` — run LLDB commands against the running app
- **Performance traces**: Use `falcon-devtools` MCP tools (`performance_start_trace`/`performance_stop_trace`) to capture Chrome DevTools traces, or `npm run test:trace` to validate trace event format

## Coding Conventions

- **Always set `id` on interactive elements.** Every `<button>`, `<input>`, and other interactive element must have an `id` prop. The `id` maps to `accessibilityIdentifier` on UIKit views and marks them as accessibility elements (`isAccessibilityElement = true`), enabling UI automation to target elements by ID. Use descriptive, kebab-case IDs (e.g. `id="counter-increment"`, `id="login-submit"`).

## UI Automation

- **Always tap by ID, never by coordinates.** Use `npm run app:tap -- demo "id:<elementId>"` to tap elements. Coordinate-based tapping is not supported.
- **Workflow**: `snapshot-ui` to find element IDs → `tap` by ID → `screenshot` to verify.
- **If a tap fails with "No accessibility element matched"**, the element is missing an `id` prop in JSX. Add `id="descriptive-name"` to the element — the `id` prop automatically sets both `accessibilityIdentifier` and `isAccessibilityElement = true` on the UIKit view.

## Debugging Rules

- **Trust the user's bug reports.** When the user reports a visual bug and attributes it to a change, investigate immediately — don't argue about theoretical correctness. The user can see the screen. Reproduce first, theorize later.
- **Verify the app is alive before and after traces.** Take a screenshot or snapshot-ui. If either returns empty or errors, the app has crashed — rebuild before retrying. A trace with zero custom track events almost always means a crash.

## Rules

- **Plans**: ALWAYS write plans to `./docs/plans`. When finished, move to `./docs/plans/completed` and include in your commit.
- **Planning only**: If asked to only create a plan, do not explore — just plan.
- **Commit hygiene**: Commit completed work before ending a session. One concern per set of uncommitted changes.
- **Build server**: Never start, stop, or restart the build server (`npm run build-server`). It is managed by the user. If it's not running, use fallback commands or ask.
- **Build operations**: NEVER call `bash scripts/build-op.sh` directly or `curl` the build server (port 6002). Always use `npm run app:*` commands.

IMPORTANT: NEVER USE WORKTREES OR GIT BRANCHES. Always execute plans in their entirety without stopping for feedback.

IMPORTANT: NEVER USE `xcrun simctl` or `curl -s http://localhost:6002`, ALWAYS use the CLI in `docs/cli-reference.md`.