# react-dom-native Master Plan

## Phase 1: Research

- [ ] React reconciler host config API (`/research-reconciler` → `docs/research/reconciler.md`)
- [ ] RSC Flight wire protocol (`/research-flight-protocol` → `docs/research/flight-protocol.md`)
- [ ] Next.js Flight format (`/research-nextjs-flight` → `docs/research/nextjs-flight.md`)
- [ ] Yoga iOS integration (`/research-yoga-ios` → `docs/research/yoga-ios.md`)
- [ ] JS engine comparison (`/research-js-engine` → `docs/research/js-engine.md`)
- [ ] HTML → native mapping (`/research-html-mapping` → `docs/research/html-mapping.md`)
- [ ] iOS UIKit patterns (`/research-ios-uikit` → `docs/research/ios-uikit.md`)

## Phase 2: Specifications

- [ ] Renderer host config spec (`docs/specs/renderer-host-config.md`)
- [ ] HTML element registry spec (`docs/specs/html-element-registry.md`)
- [ ] Yoga defaults spec (`docs/specs/yoga-defaults.md`)
- [ ] Flight client spec (`docs/specs/flight-client.md`)
- [ ] Bridge protocol spec (`docs/specs/bridge-protocol.md`)
- [ ] Architecture decision records (`docs/specs/adr/`)

## Phase 3: Core Implementation

- [ ] React reconciler host config (`packages/renderer/`)
- [ ] JS ↔ Swift bridge (`packages/bridge/`)
- [ ] Yoga layout integration (`packages/yoga-layout/`)

## Phase 4: Components & RSC

- [ ] HTML element registry + components (`packages/components/`)
- [ ] Flight client for native (`packages/flight-client/`)

## Phase 5: Polish

- [ ] Build system + Xcode project (`packages/cli/`, `ios/`)
- [ ] Developer tools — hot reload, error display (`packages/cli/`)
- [ ] Example app (`example/`)
- [ ] Next.js server setup (`server/`)
- [ ] End-to-end test — server → native rendering (`test-e2e`)
