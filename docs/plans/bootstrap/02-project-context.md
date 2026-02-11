# Task 2: Write Project Context (Agent: `context-writer`)

> Part of [Bootstrap Plan](00-overview.md). Runs in parallel with Tasks 3-5.

**Files:**
- Create: `CLAUDE.md`
- Create: `docs/MASTER_PLAN.md`

---

### Step 1: Write CLAUDE.md

Create `/Users/rickhanlonii/oss/falcon/CLAUDE.md`:

```markdown
# react-dom-native

A React framework that uses HTML elements (`<div>`, `<span>`, `<p>`, etc.) as the API surface, mapping them to native iOS views (UIKit) via Yoga layout.

## Architecture

- **Renderer**: Custom React reconciler (mutation mode) using `react-reconciler`
- **Layout**: Yoga with web-like defaults — `<div>` = column/block, `<span>` = inline
- **Server**: Next.js handles RSC rendering, Flight wire protocol, streaming
- **Client**: Native iOS app receives Flight stream, deserializes with `react-client/flight`, feeds custom renderer
- **Target**: iOS only (UIKit)
- **JS Engine**: TBD (Hermes vs JavaScriptCore — decided by `/research-js-engine`)

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

- `packages/renderer/` — Custom React reconciler host config
- `packages/components/` — HTML element → native view mappings
- `packages/yoga-layout/` — Yoga integration with web defaults
- `packages/bridge/` — JS ↔ Swift communication
- `packages/flight-client/` — RSC Flight client for native
- `packages/cli/` — Build tools and dev server
- `ios/` — Native Swift code (UIKit views, app delegate)
- `server/` — Next.js RSC server
- `example/` — Example app

## Skills

Run `/check-status` to see overall progress. Run `/resume-work` to pick up where the last session left off.

### Research (run first — all parallelizable)
`/research-reconciler`, `/research-flight-protocol`, `/research-nextjs-flight`, `/research-yoga-ios`, `/research-js-engine`, `/research-html-mapping`, `/research-ios-uikit`

### Specs (run after all research)
`/generate-specs`

### Implementation (run after specs, in dependency order)
1. `/impl-renderer` (first — no impl dependencies)
2. `/impl-js-bridge` + `/impl-yoga-layout` (parallel, no cross-dependency)
3. `/impl-html-components` (depends on renderer + yoga)
4. `/impl-flight-client` (depends on renderer + bridge)
5. `/impl-build-system` (depends on bridge)
6. `/impl-devtools` (depends on build-system)

### Testing
`/test-unit`, `/test-e2e`

## Progress

See `docs/MASTER_PLAN.md` for full progress tracker with checkboxes.
```

---

### Step 2: Write docs/MASTER_PLAN.md

Create `/Users/rickhanlonii/oss/falcon/docs/MASTER_PLAN.md`:

```markdown
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
```

---

### Step 3: Verify

```bash
cat /Users/rickhanlonii/oss/falcon/CLAUDE.md | head -5
cat /Users/rickhanlonii/oss/falcon/docs/MASTER_PLAN.md | head -5
```

Expected: Both files exist with correct headers.
