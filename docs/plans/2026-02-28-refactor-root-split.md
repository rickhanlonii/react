# Refactor: Split Root.swift into Extensions

`Root.swift` is ~63K tokens — the second largest file. It handles the full lifecycle of a React root across SSR, CSR, hydration, hot reload, and boundary reveals.

## Current Responsibilities in Root.swift

1. **Public API** — `RootOptions`, `Root` class, `render()`, `unmount()`, `renderCSR()`, lifecycle
2. **SSR rendering** — `startSSRStream`, SSR coordinator setup, first paint, boundary reveal throttling
3. **Hydration** — `hydrateRoot`, SSR→React handoff, boundary retry during hydration
4. **CSR rendering** — `startCSRFlight`, client-only rendering path
5. **Hot reload** — `setupHotReload`, reload/refresh handlers, Fast Refresh chunk loading
6. **Flight stream** — `startFlightStream`, `FlightStreamClient` setup
7. **Boundary reveals** — throttle logic, reveal queue, SSR commit timing collection

## Proposed Split

All files stay in `packages/react-dom-native/ios/Sources/ReactDomNativeKit/`.

### Keep in `Root.swift`
- `RootOptions` struct
- `Root` class declaration, stored properties, init
- `render()`, `unmount()`, `renderCSR()` — the public API entry points
- `deinit`

### New: `Root+SSR.swift`
Move SSR-specific methods:
- `startSSRStream` and all SSR coordinator setup
- `handleSSRFirstPaint` / first paint logic
- Boundary reveal throttling (`revealQueue`, `revealTimer`, `processNextReveal`)
- SSR commit timing collection helpers

### New: `Root+Hydration.swift`
Move hydration methods:
- `hydrateRoot` and hydration setup
- SSR→React handoff logic
- Boundary retry during hydration
- `onHydrationComplete` handler setup

### New: `Root+HotReload.swift`
Move hot reload methods:
- `setupHotReload` — HotReloadClient wiring
- Reload handler (full reset + re-render)
- Fast Refresh handler (chunk reloading + HMR apply)
- Inspector message routing
- `ReloadBanner` show/dismiss calls

### New: `Root+Flight.swift`
Move Flight stream methods:
- `startFlightStream` / `startCSRFlight`
- `FlightStreamClient` and `FlightStreamDelegate` setup
- Flight response lifecycle (create, close, error)

## Approach

Same as Bindings split:
- Use `extension Root { }` in each new file
- Stored properties stay on the main class with `internal` access
- Methods move to appropriately named extension files
- All in the same module so `internal` access works

## Verification

1. `npm run test:swift` — Swift unit tests pass
2. `npm run test:fantom` — Integration tests pass
3. `npm run test:e2e-swift` — E2E tests pass
4. Build Falcon Demo app — no compile errors
