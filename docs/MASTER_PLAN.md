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

- [ ] Install all dependencies (`/install-dependencies`)

## Phase 3: Core Implementation

- [ ] React reconciler host config (`/impl-renderer` → `packages/renderer/`)
- [ ] JS ↔ Swift bridge (`/impl-js-bridge` → `packages/bridge/`)
- [ ] Yoga layout integration (`/impl-yoga-layout` → `packages/yoga-layout/`)
- [ ] Xcode project + native app (`/impl-xcode-project` → `ios/`)

## Phase 4: Components & RSC

- [ ] HTML element registry + components (`/impl-html-components` → `packages/components/`)
- [ ] Flight client for native (`/impl-flight-client` → `packages/flight-client/`)

## Phase 5: Polish

- [ ] JS build system (`/impl-build-system` → `packages/cli/`, `scripts/`)
- [ ] Developer tools — hot reload, error display (`/impl-devtools` → `packages/cli/`)
- [ ] Example app (`example/`)
- [ ] Next.js server setup (`server/`)
- [ ] End-to-end test — server → native rendering (`/test-e2e`)
