---
name: reference
description: Reference repos, key React source files, design decisions, and data flow for react-dom-native
user_invocable: true
---

## Key Design Decisions

- **No NativeComponentRegistry**: `<div>` passed as raw string over bridge, created in Swift
- **No reactTag**: Node identity via InstanceHandle (object refs) and ShadowNode pointers
- **No ViewConfig**: Fixed HTML element set with known props/events, no runtime validation
- **Discrete events on main thread**: Click/press dispatch synchronously
- **Fixed DOM event set**: onClick, onChange, onScroll, etc. — no dynamic registration

## Data Flow

```
Express (RSC server) → Flight stream (HTTP) → Native iOS client
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

## Key Layout Files

- `packages/react-dom-native/src/yoga-layout/defaults.js` — element-type Yoga defaults (flexDirection, margins, fontSize)
- `packages/react-dom-native/src/renderer/HostConfig.js` — `createInstance` merges element defaults with user styles before sending to native
- `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift` — applies style dict to Yoga nodes (expects string enum values like `"column"`, not integers)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` — creates UIKit views and applies visual props (font, color, etc.)

## Known Yoga Gotchas

- `YGConfigSetUseWebDefaults(true)` makes Yoga default to `flexDirection: row` (CSS flex default). Block elements need explicit `flexDirection: 'column'` in their defaults.
- The native `YogaStyleApplier` expects **string** values for enum properties (`"column"`, `"center"`), not integer constants. Don't use `applyStyles()` which converts to integers.
- `#text` nodes are separate UILabels that need to inherit font/color from their parent element — handled in `applyInheritedTextStyle()` during the INSERT mutation.
- Yoga flex layout doesn't collapse margins like CSS block layout. When parent uses `gap` and children have default margins, spacing will be larger than web.
