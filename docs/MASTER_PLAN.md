# react-dom-native Master Plan

## Phase 1: Research

- [x] React reconciler host config API (`/research-reconciler` → `docs/research/reconciler.md`)
- [x] RSC Flight wire protocol (`/research-flight-protocol` → `docs/research/flight-protocol.md`)
- [x] Next.js Flight format (`/research-nextjs-flight` → `docs/research/nextjs-flight.md`)
- [x] Yoga iOS integration (`/research-yoga-ios` → `docs/research/yoga-ios.md`)
- [x] JS engine comparison (`/research-js-engine` → `docs/research/js-engine.md`)
- [x] HTML → native mapping (`/research-html-mapping` → `docs/research/html-mapping.md`)
- [x] iOS UIKit patterns (`/research-ios-uikit` → `docs/research/ios-uikit.md`)
- [x] JS bundler comparison (`/research-bundler` → `docs/research/bundler.md`)

## Phase 1b: Architecture Research

- [x] C++ shadow tree & JSI bindings (`/research-cpp-shadow-tree` → `docs/research/cpp-shadow-tree-jsi.md`)
- [x] Node identity without reactTag (`/research-node-identity` → `docs/research/node-identity.md`)
- [x] Native event system (`/research-event-system` → `docs/research/event-system.md`)
- [x] Eliminating ViewConfig (`/research-no-viewconfig` → `docs/research/no-viewconfig.md`)
- [x] Mounting, scheduling & layout pipeline (`/research-mounting-scheduling` → `docs/research/mounting-scheduling.md`)
- [x] String-based element dispatch (`/research-element-dispatch` → `docs/research/element-dispatch.md`)

## Phase 2: Specifications

- [x] Renderer host config spec (`docs/specs/renderer-host-config.md`)
- [x] HTML element registry spec (`docs/specs/html-element-registry.md`)
- [x] Yoga defaults spec (`docs/specs/yoga-defaults.md`)
- [x] Flight client spec (`docs/specs/flight-client.md`)
- [x] Bridge protocol spec (`docs/specs/bridge-protocol.md`)
- [x] Architecture decision records (`docs/specs/adr/`)

## Phase 2.5: Dependencies

- [x] Install all dependencies (`/install-dependencies`)

## Phase 3: Core Implementation

- [x] React reconciler host config (`/impl-renderer` → `packages/renderer/`)
- [x] JS ↔ Swift bridge (`/impl-js-bridge` → `packages/bridge/`)
- [x] Yoga layout integration (`/impl-yoga-layout` → `packages/yoga-layout/`)
- [x] Xcode project + native app (`/impl-xcode-project` → `ios/`)

## Phase 4: Components & RSC

- [x] HTML element registry + components (`/impl-html-components` → `packages/components/`)
- [x] Flight client for native (`/impl-flight-client` → `packages/flight-client/`)

## Phase 5: Integration Testing

- [x] JS build system (`/impl-build-system` → `packages/cli/`, `scripts/`)
- [x] Developer tools — hot reload, error display (`/impl-devtools` → `packages/cli/`)
- [x] Extract shared ShadowTree Swift module (no UIKit, shared by app + tester)
- [x] Build FantomTester headless Swift binary (macOS, JavaScriptCore, StubView)
- [x] JS test runtime (describe/it/expect running inside JSC)
- [x] JS test API (createRoot, runTask, getRenderedOutput)
- [x] Custom Jest runner (esbuild bundle + spawn tester + JSON IPC)
- [x] Integration tests (`-itest.js` files)

## Phase 5b: Flight Integration Testing

- [ ] `renderToFlightString()` — synchronous Flight encoder (`packages/fantom/src/index.js`)
- [ ] `createFromFlight()` — Flight payload parser (`packages/fantom/src/index.js`)
- [ ] Flight integration tests (`tests/integration/rsc-*-flight-itest.js`)

## Phase 6: App & Server

- [ ] Example app (`example/`)
- [ ] Next.js server setup (`server/`)
- [ ] End-to-end smoke test — server → native rendering (`/test-e2e`)
