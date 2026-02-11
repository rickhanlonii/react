# Task 4: Write Spec & Implementation Skills (Agent: `impl-skills-writer`)

> Part of [Bootstrap Plan](00-overview.md). Runs in parallel with Tasks 2, 3, 5.

**Files:**
- Create: `.claude/skills/generate-specs/SKILL.md`
- Create: `.claude/skills/impl-renderer/SKILL.md`
- Create: `.claude/skills/impl-html-components/SKILL.md`
- Create: `.claude/skills/impl-yoga-layout/SKILL.md`
- Create: `.claude/skills/impl-js-bridge/SKILL.md`
- Create: `.claude/skills/impl-flight-client/SKILL.md`
- Create: `.claude/skills/impl-build-system/SKILL.md`
- Create: `.claude/skills/impl-devtools/SKILL.md`

---

### Step 1: Create skill directories

```bash
cd /Users/rickhanlonii/oss/falcon
mkdir -p .claude/skills/{generate-specs,impl-renderer,impl-html-components,impl-yoga-layout,impl-js-bridge,impl-flight-client,impl-build-system,impl-devtools}
```

---

### Step 2: Write generate-specs/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/generate-specs/SKILL.md`:

```markdown
---
name: generate-specs
description: Generate architecture specs from research output. Run this after all 7 research skills are complete.
---

# Generate Specifications

## Objective

Read all research documents, make architecture decisions, and produce implementation specifications for each package.

## Prerequisites

All 7 research documents must exist in `docs/research/`:
- `reconciler.md`, `flight-protocol.md`, `nextjs-flight.md`, `yoga-ios.md`, `js-engine.md`, `html-mapping.md`, `ios-uikit.md`

## Instructions

1. Read all 7 research documents
2. Make architecture decisions and write ADRs:
   - JS engine choice (based on `js-engine.md` recommendation)
   - Bridge approach: JSI vs JSC C API vs JavaScriptCore.framework
   - Module resolution strategy for Flight client references
   - Component registration pattern (static vs dynamic)
3. Write specs for each package (see Output section)
4. Each spec should include: API surface, data structures, function signatures, error handling, and integration points with other packages

## Output

Write the following files:

- `docs/specs/adr/001-js-engine.md` — JS engine decision
- `docs/specs/adr/002-bridge-approach.md` — Native bridge decision
- `docs/specs/adr/003-module-resolution.md` — Flight client reference resolution
- `docs/specs/adr/004-component-registration.md` — Component registry pattern
- `docs/specs/renderer-host-config.md` — Full host config spec with function implementations
- `docs/specs/html-element-registry.md` — Element registry API, component definitions
- `docs/specs/yoga-defaults.md` — Yoga default config per element
- `docs/specs/flight-client.md` — Flight client architecture, streaming, deserialization
- `docs/specs/bridge-protocol.md` — JS ↔ native message protocol

## After Completion

Update `docs/MASTER_PLAN.md` — check off all Phase 2 items
```

---

### Step 3: Write impl-renderer/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/impl-renderer/SKILL.md`:

```markdown
---
name: impl-renderer
description: Implement the custom React reconciler host config. Run this first among all impl skills — others depend on it.
---

# Implement: React Renderer

## Objective

Build the react-reconciler host config (mutation mode) for react-dom-native. This is the core that lets React manage a tree of native view descriptors.

## Prerequisites

- `docs/specs/renderer-host-config.md` must exist
- `docs/research/reconciler.md` must exist

## Reference Files

- `../react/packages/react-noop-renderer/src/createReactNoop.js` — Base implementation to adapt
- `../react/packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` — Interface contract

## Instructions

1. Read the renderer host config spec
2. Initialize `packages/renderer/`:
   - `package.json` with `react-reconciler` dependency
   - `src/hostConfig.js` — host config implementation
   - `src/renderer.js` — creates the reconciler instance, exports `render()` function
   - `src/index.js` — public API
3. Implement host config functions:
   - Start from noop renderer, replace stubs with view descriptor logic
   - `createInstance(type, props)` → create view descriptor object `{ type, props, children: [] }`
   - `appendChild`, `removeChild`, `insertBefore` → mutate children arrays
   - `commitUpdate(instance, type, oldProps, newProps)` → diff props, queue native update
   - Focus on mutation mode functions only
4. Write tests:
   - `src/__tests__/renderer.test.js`
   - Test: render `<div>` produces correct view descriptor
   - Test: re-render updates props
   - Test: children are ordered correctly
   - Test: removal cleans up
5. Export `render(element, container)` as the main API

## Output

- `packages/renderer/package.json`
- `packages/renderer/src/hostConfig.js`
- `packages/renderer/src/renderer.js`
- `packages/renderer/src/index.js`
- `packages/renderer/src/__tests__/renderer.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "React reconciler host config"
```

---

### Step 4: Write impl-html-components/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/impl-html-components/SKILL.md`:

```markdown
---
name: impl-html-components
description: Implement the HTML element registry and component definitions. Depends on renderer and yoga.
---

# Implement: HTML Components

## Objective

Build the component registry that maps HTML element types (`div`, `span`, `p`, etc.) to native view configurations — UIKit class, Yoga defaults, prop mappings.

## Prerequisites

- `docs/specs/html-element-registry.md` must exist
- `docs/research/html-mapping.md` must exist
- `packages/renderer/` must be implemented

## Instructions

1. Read the HTML element registry spec and mapping research
2. Initialize `packages/components/`:
   - `package.json`
   - `src/registry.js` — component registration and lookup
   - `src/elements/` — one file per element category
3. Implement registry:
   - `registerElement(type, config)` — registers an HTML element type
   - `getElementConfig(type)` — returns config for a type
   - Config shape: `{ nativeView, yogaDefaults, propMapping, defaultStyles }`
4. Implement P0 elements first:
   - `div` → UIView, flexDirection: column
   - `span` → UIView, flexDirection: row (inline approximation)
   - `p` → UILabel, flexDirection: column, with text handling
   - `img` → UIImageView
   - `button` → UIButton
5. Write tests for registry lookup and config correctness
6. Integrate with renderer — renderer's `createInstance` calls `getElementConfig(type)`

## Output

- `packages/components/package.json`
- `packages/components/src/registry.js`
- `packages/components/src/elements/layout.js` (div, span, section, etc.)
- `packages/components/src/elements/text.js` (p, h1-h6, strong, em, a)
- `packages/components/src/elements/media.js` (img, video)
- `packages/components/src/elements/input.js` (input, button, textarea, select)
- `packages/components/src/index.js`
- `packages/components/src/__tests__/registry.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "HTML element registry + components"
```

---

### Step 5: Write impl-yoga-layout/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/impl-yoga-layout/SKILL.md`:

```markdown
---
name: impl-yoga-layout
description: Implement Yoga layout integration with web-like defaults. Can run in parallel with impl-js-bridge.
---

# Implement: Yoga Layout

## Objective

Integrate the Yoga layout engine with web-like defaults so that `<div>` behaves like CSS flexbox column, `<span>` like inline, etc.

## Prerequisites

- `docs/specs/yoga-defaults.md` must exist
- `docs/research/yoga-ios.md` must exist

## Instructions

1. Read the Yoga defaults spec and iOS research
2. Initialize `packages/yoga-layout/`:
   - `package.json`
   - Swift/C bridge or JS-based Yoga bindings (based on bridge spec)
3. Implement:
   - `createYogaNode(elementType)` — creates a YGNode with web-like defaults for that element
   - `applyStyles(node, styles)` — applies CSS-like style props to a YGNode
   - `calculateLayout(rootNode, width, height)` — runs layout calculation
   - `getLayoutResult(node)` → `{ x, y, width, height }` — reads computed layout
4. Define web-like defaults per element type:
   - `div`: `flexDirection: column`, `display: flex`
   - `span`: `flexDirection: row` (inline approximation)
   - All elements: `boxSizing: border-box` equivalent, `position: relative`
5. Write tests:
   - Test: div with children lays out vertically
   - Test: span children lay out horizontally
   - Test: explicit style overrides defaults
   - Test: nested layout calculates correctly

## Output

- `packages/yoga-layout/package.json`
- `packages/yoga-layout/src/node.js`
- `packages/yoga-layout/src/defaults.js`
- `packages/yoga-layout/src/index.js`
- `packages/yoga-layout/src/__tests__/layout.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Yoga layout integration"
```

---

### Step 6: Write impl-js-bridge/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/impl-js-bridge/SKILL.md`:

```markdown
---
name: impl-js-bridge
description: Implement the JS to Swift bridge for native communication. Can run in parallel with impl-yoga-layout.
---

# Implement: JS ↔ Swift Bridge

## Objective

Build the communication layer between JavaScript (running in the JS engine) and Swift (UIKit). The bridge must support creating/updating/deleting native views and dispatching events from native back to JS.

## Prerequisites

- `docs/specs/bridge-protocol.md` must exist
- `docs/research/js-engine.md` must exist (for engine choice)

## Instructions

1. Read the bridge protocol spec and JS engine research
2. Initialize `packages/bridge/`:
   - `package.json` (JS side)
   - Swift source files in `ios/Bridge/`
3. Implement JS → Native commands:
   - `createView(id, type, props)` — creates a native view
   - `updateView(id, props)` — updates props on existing view
   - `deleteView(id)` — removes a view
   - `appendChild(parentId, childId)` — adds child view
   - `removeChild(parentId, childId)` — removes child view
   - `setLayout(id, x, y, width, height)` — applies Yoga-computed layout
4. Implement Native → JS events:
   - `onPress(id)`, `onTextChange(id, text)`, etc.
   - Event dispatch mechanism (callback registry or event emitter)
5. Implement the transport:
   - JSC: use `JSContext.evaluateScript` + `JSExport` protocol
   - Or Hermes: use JSI `HostObject` / `HostFunction`
   - Batch commands for performance (send array of operations per frame)
6. Write tests:
   - Mock native side, verify command serialization
   - Test event dispatch round-trip

## Output

- `packages/bridge/package.json`
- `packages/bridge/src/commands.js`
- `packages/bridge/src/events.js`
- `packages/bridge/src/index.js`
- `packages/bridge/src/__tests__/bridge.test.js`
- `ios/Bridge/BridgeModule.swift`
- `ios/Bridge/ViewRegistry.swift`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "JS ↔ Swift bridge"
```

---

### Step 7: Write impl-flight-client/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/impl-flight-client/SKILL.md`:

```markdown
---
name: impl-flight-client
description: Implement the RSC Flight client for native. Depends on renderer and bridge.
---

# Implement: Flight Client

## Objective

Build a Flight client that consumes Next.js RSC streams and feeds the resulting React element tree into our custom renderer.

## Prerequisites

- `docs/specs/flight-client.md` must exist
- `docs/research/flight-protocol.md` and `docs/research/nextjs-flight.md` must exist
- `packages/renderer/` must be implemented
- `packages/bridge/` must be implemented

## Reference Files

- `../react/packages/react-noop-renderer/src/ReactNoopFlightClient.js` — Minimal Flight client config
- `../react/packages/react-server-dom-esm/src/client/ReactFlightClientConfigBundlerESM.js` — ESM bundler config
- `../react/packages/react-client/src/forks/ReactFlightClientConfig.custom.js` — Interface we must implement

## Instructions

1. Read the Flight client spec and research documents
2. Initialize `packages/flight-client/`:
   - `package.json` with `react-client` (or `react-server-dom-*`) dependency
3. Implement Flight client config:
   - `resolveClientReference(metadata)` — resolve client component references (module loading)
   - `resolveServerReference(metadata)` — resolve server action references
   - `prepareDestinationForModule(metadata)` — preload module if needed
   - `preloadModule(metadata)` / `requireModule(metadata)` — load client component code
4. Implement the HTTP client:
   - `fetchRSC(url)` — makes HTTP request with proper headers (`RSC: 1`, `Next-Router-State-Tree`, etc.)
   - Receives streaming response
   - Feeds chunks to Flight deserializer
   - Returns React element tree
5. Integrate with renderer:
   - Flight client produces React elements → pass to `render(elements, container)`
   - Handle streaming updates (progressive rendering)
6. Write tests:
   - Mock HTTP responses with recorded Flight payloads
   - Test deserialization produces correct element tree
   - Test streaming updates work

## Output

- `packages/flight-client/package.json`
- `packages/flight-client/src/config.js`
- `packages/flight-client/src/client.js`
- `packages/flight-client/src/http.js`
- `packages/flight-client/src/index.js`
- `packages/flight-client/src/__tests__/client.test.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Flight client for native"
```

---

### Step 8: Write impl-build-system/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/impl-build-system/SKILL.md`:

```markdown
---
name: impl-build-system
description: Implement the build system — bundler config, Xcode project, and build scripts. Depends on bridge.
---

# Implement: Build System

## Objective

Set up the build tooling: JS bundler configuration, Xcode project for the iOS app, and scripts that tie everything together.

## Prerequisites

- `packages/bridge/` must be implemented (need to know the native module structure)
- JS engine decision must be made (`docs/specs/adr/001-js-engine.md`)

## Instructions

1. **JS bundler setup**:
   - Configure bundler (esbuild, swc, or metro) to bundle `packages/` into a single JS file
   - Output: `ios/bundle.js` (the JS bundle loaded by the native app)
   - Must handle: CommonJS/ESM, React, our packages

2. **Xcode project**:
   - Create `ios/ReactDomNative.xcodeproj` (or use SPM Package.swift)
   - Add Swift source files from `ios/`
   - Link Yoga (as a dependency)
   - Link JavaScriptCore.framework (or Hermes)
   - Configure build phases to bundle JS before building

3. **Build scripts**:
   - `scripts/build-js.sh` — bundle JS
   - `scripts/build-ios.sh` — build iOS app (xcodebuild)
   - `scripts/dev.sh` — start Next.js server + build iOS in debug mode
   - Add to root `package.json` scripts

4. Write tests:
   - Test: JS bundle builds without errors
   - Test: bundle includes all required packages

## Output

- `ios/ReactDomNative.xcodeproj/` or `ios/Package.swift`
- `scripts/build-js.sh`
- `scripts/build-ios.sh`
- `scripts/dev.sh`
- Updated `package.json` scripts
- Bundler config file

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Build system + Xcode project"
```

---

### Step 9: Write impl-devtools/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/impl-devtools/SKILL.md`:

```markdown
---
name: impl-devtools
description: Implement developer tools — hot reload, error display, and debugging. Depends on build-system.
---

# Implement: Developer Tools

## Objective

Build developer experience tools: hot reload during development, error overlay display on the native app, and debugging support.

## Prerequisites

- `packages/cli/` build system must exist
- Build scripts must work

## Instructions

1. **Hot reload**:
   - Watch JS source files for changes
   - Re-bundle on change
   - Signal the native app to reload the JS bundle (via WebSocket or native notification)
   - Preserve React state where possible (Fast Refresh integration)

2. **Error overlay**:
   - Catch JS errors and display them on a native overlay view
   - Show: error message, stack trace, source file + line
   - Red box pattern (similar to React Native)
   - Dismiss on tap

3. **Debugging**:
   - Enable Safari Web Inspector for JSC (or Chrome DevTools for Hermes)
   - Console.log forwarding to Xcode console
   - React DevTools integration (if feasible)

4. **CLI tool**:
   - `packages/cli/` — wraps build scripts with a nice interface
   - `npx react-dom-native dev` — starts dev server + hot reload
   - `npx react-dom-native build` — production build

## Output

- `packages/cli/package.json`
- `packages/cli/src/dev.js`
- `packages/cli/src/build.js`
- `packages/cli/bin/cli.js`
- `ios/DevTools/ErrorOverlay.swift`
- `ios/DevTools/HotReload.swift`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Developer tools"
```

---

### Step 10: Verify

```bash
for skill in generate-specs impl-renderer impl-html-components impl-yoga-layout impl-js-bridge impl-flight-client impl-build-system impl-devtools; do
  test -f "/Users/rickhanlonii/oss/falcon/.claude/skills/$skill/SKILL.md" && echo "OK: $skill" || echo "MISSING: $skill"
done
```

Expected: All 8 spec/impl skills show OK.
