# Fixture Rendering Mode Toggle

## Problem

Each fixture has a hardcoded `ssrEndpoint` config that locks it to a single rendering mode. Users can't easily compare how the same fixture renders across different modes.

## Design

### Three Rendering Modes

| Mode | Label | Behavior |
|------|-------|----------|
| Server | "Server" | SSR rendered, no hydration, no client JS. Client components are visible but not interactive. |
| Hydrated | "Hydrated" | SSR + hydration. Full interactivity via Flight + Fizz + React runtime. |
| PPR | "PPR" | Partial pre-render with device caching + resume. Static shell served instantly, dynamic content fetched on resume. |

### UX

- **Global segmented control** in `CategoryListView` header: Server / Hydrated / PPR
- **Persisted** via `@AppStorage("renderingMode")`, default `"hydrated"`
- **All fixtures support all modes.** No per-fixture mode restrictions.
  - Server mode with client components: renders SSR output without hydration (components visible but not interactive)
  - PPR mode without Suspense boundaries: prerender captures the full page (no postponed state)
- **Footer note** in Server mode: "Server mode — client components are not interactive"
- **Unsupported fixture tapped**: opens but shows a native "not supported" screen (not currently needed since all modes work for all fixtures, but available as a fallback)

### SwiftUI Changes (FalconApp.swift)

- Add `@AppStorage("renderingMode")` with default `"hydrated"`
- Add `Picker` with `.segmentedControl` style to `CategoryListView`
- Change `FixtureRootView` to dispatch based on global mode instead of `config.ssrEndpoint`:
  - `"server"` → `ServerOnlyViewController`
  - `"hydrated"` → `HydrationViewController`
  - `"ppr"` → `PrerenderViewController`

### Server Changes

- Remove `ssrEndpoint` from fixture 30 (`prerender-resume`) and 31 (`server-only`) configs
- Remove `ssrEndpoint` from `/fixtures` response schema in `server.js`
- No endpoint changes — `/ssr/:name`, `/prerender/:name`, `/resume/:name` already work for any fixture

### Reload / HMR / Profiling

No special handling needed:
- Each view controller creates a `Root` with a specific `RenderMode` enum
- `Root.rerender()` re-executes based on stored mode — works automatically for all three modes
- Fast Refresh updates components in-place (mode-agnostic)
- Full Reset destroys/recreates JS runtime, then calls `root.rerender()` which re-dispatches
- Profiling/tracing survives reloads via `tracingActive` flag (independent of render mode)
- Prerender cache revalidation via `onReload` callback continues to work as-is

### What Doesn't Change

- View controllers (work as-is)
- Server endpoints (work as-is)
- Reload/HMR/profiling (works automatically)
- Other fixture configs (`hideNavBar`, `backgroundColor`)
