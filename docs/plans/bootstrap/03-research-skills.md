# Task 3: Write Research Skills (Agent: `research-skills-writer`)

> Part of [Bootstrap Plan](00-overview.md). Runs in parallel with Tasks 2, 4, 5.

**Files:**
- Create: `.claude/skills/research-reconciler/SKILL.md`
- Create: `.claude/skills/research-flight-protocol/SKILL.md`
- Create: `.claude/skills/research-nextjs-flight/SKILL.md`
- Create: `.claude/skills/research-yoga-ios/SKILL.md`
- Create: `.claude/skills/research-js-engine/SKILL.md`
- Create: `.claude/skills/research-html-mapping/SKILL.md`
- Create: `.claude/skills/research-ios-uikit/SKILL.md`

---

### Step 1: Create skill directories

```bash
cd /Users/rickhanlonii/oss/falcon
mkdir -p .claude/skills/{research-reconciler,research-flight-protocol,research-nextjs-flight,research-yoga-ios,research-js-engine,research-html-mapping,research-ios-uikit}
```

---

### Step 2: Write research-reconciler/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/research-reconciler/SKILL.md`:

```markdown
---
name: research-reconciler
description: Research the React reconciler host config API. Run this to document every function a custom renderer must implement.
---

# Research: React Reconciler Host Config

## Objective

Document the complete react-reconciler host config interface — every function, its signature, purpose, and whether it's required or optional. Focus on **mutation mode** (not persistent mode).

## Input Files

Read these files in `../react/` (relative to project root):

1. `packages/react-reconciler/src/forks/ReactFiberConfig.custom.js` — The definitive list of host config functions (287 lines). Every `export` is a function the renderer must provide.
2. `packages/react-noop-renderer/src/createReactNoop.js` — The simplest working renderer. Shows how each host config function is implemented with minimal logic.
3. `packages/react-reconciler/src/forks/ReactFiberConfig.native.js` — React Native's host config fork (shows real-world implementation mapping).

## Instructions

1. Read `ReactFiberConfig.custom.js` and list every exported function
2. For each function, read `createReactNoop.js` to find its implementation
3. Categorize functions by lifecycle phase:
   - **Instance creation**: `createInstance`, `createTextInstance`, etc.
   - **Mutation**: `appendChild`, `removeChild`, `commitUpdate`, etc.
   - **Scheduling**: `scheduleMicrotask`, `getCurrentEventPriority`, etc.
   - **Hydration**: (note these but mark as "not needed" — we don't hydrate)
   - **Other**: context, resources, singletons, etc.
4. Note which functions can use noop's stub implementation vs. which need real logic
5. Pay special attention to `commitUpdate` — this is where prop diffs drive native view updates

## Output

Write to: `docs/research/reconciler.md`

Format:
- Table: Function | Category | Required | Noop Implementation | Notes
- Section per category with explanation of the lifecycle phase
- Summary: which functions need real implementation for react-dom-native vs. which can use stubs

## After Completion

Update `docs/MASTER_PLAN.md` — check off "React reconciler host config API"
```

---

### Step 3: Write research-flight-protocol/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/research-flight-protocol/SKILL.md`:

```markdown
---
name: research-flight-protocol
description: Research the RSC Flight wire protocol. Run this to document the streaming format, client config interface, and deserialization.
---

# Research: RSC Flight Wire Protocol

## Objective

Document the RSC Flight wire protocol — the streaming format React uses to send component trees from server to client. Understand the Flight client config interface we need to implement.

## Input Files

Read these files in `../react/` (relative to project root):

1. `packages/react-noop-renderer/src/ReactNoopFlightClient.js` — Minimal Flight client config. Shows every function the client config must provide.
2. `packages/react-client/src/ReactFlightClient.js` — Full Flight client implementation. The core deserialization logic.
3. `packages/react-client/src/forks/ReactFlightClientConfig.custom.js` — The interface our Flight client config must satisfy.
4. `packages/react-server-dom-esm/src/client/ReactFlightClientConfigBundlerESM.js` — ESM bundler Flight client config (simplest real example).

## Instructions

1. Read `ReactFlightClientConfig.custom.js` to list all exports the client config must provide
2. Read `ReactNoopFlightClient.js` for the minimal implementation of each
3. Study `ReactFlightClient.js` to understand:
   - How the Flight stream is parsed (line-based protocol, JSON chunks)
   - How React elements, client references, and server references are resolved
   - How streaming/chunked delivery works
   - What `createFromFetch` / `createFromReadableStream` do
4. Document the wire format: what bytes flow over the network, how rows are delimited, what each row type means (model, module, error, etc.)

## Output

Write to: `docs/research/flight-protocol.md`

Format:
- Wire format specification (row types, delimiters, encoding)
- Client config interface table: Function | Noop Implementation | Purpose
- Data flow diagram: stream → parse → resolve → React elements
- Key considerations for native (no DOM, no bundler, custom module resolution)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "RSC Flight wire protocol"
```

---

### Step 4: Write research-nextjs-flight/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/research-nextjs-flight/SKILL.md`:

```markdown
---
name: research-nextjs-flight
description: Research how Next.js serves RSC Flight responses. Run this to understand HTTP format, headers, and streaming behavior.
---

# Research: Next.js Flight Format

## Objective

Analyze how Next.js serves Flight responses — the HTTP format, content type, headers, streaming behavior, and any Next.js-specific extensions to the Flight protocol.

## Input Files

1. `../async-react/` — Working Next.js RSC app. Run it and inspect network traffic.
2. `../async-react/app/` — App router pages (examine RSC usage patterns)
3. `../async-react/next.config.ts` — Next.js configuration

## Instructions

1. Examine `../async-react/` to understand the app structure
2. Read `../async-react/app/layout.tsx` and key pages to see RSC patterns used
3. Research (web) how Next.js App Router serves Flight:
   - What HTTP endpoint serves the RSC payload (usually same URL with `RSC: 1` header or `?_rsc=` param)
   - What `Content-Type` header is used
   - How streaming is implemented (chunked transfer encoding)
   - How client references are encoded (webpack/turbopack module IDs)
   - How server actions are invoked (POST requests with Flight encoding)
4. Document the differences between what Next.js sends vs. raw React Flight
5. Identify what our native client needs to send/receive to communicate with Next.js

## Output

Write to: `docs/research/nextjs-flight.md`

Format:
- HTTP request/response examples (headers + body snippets)
- Content-Type and streaming format
- Client reference format (how Next.js encodes module IDs)
- What headers the native client must send
- Server action invocation format
- Differences from raw React Flight

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Next.js Flight format"
```

---

### Step 5: Write research-yoga-ios/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/research-yoga-ios/SKILL.md`:

```markdown
---
name: research-yoga-ios
description: Research Yoga layout engine for iOS. Run this to document the C API, integration patterns, and web-like default configuration.
---

# Research: Yoga Layout on iOS

## Objective

Document the Yoga layout engine C API, how to integrate it on iOS, and how to configure it for web-like defaults (flexbox with `<div>` = column/block, `<span>` = inline behavior).

## Input Files

Read these files in `../react-native/` (relative to project root):

1. `packages/react-native/ReactCommon/yoga/yoga/Yoga.h` — Main Yoga C API header
2. `packages/react-native/ReactCommon/yoga/yoga/YGNode.h` — Node API
3. `packages/react-native/ReactCommon/yoga/yoga/YGNodeStyle.cpp` — Style property setters
4. `packages/react-native/ReactCommon/yoga/yoga/YGEnums.h` — Enum definitions (FlexDirection, Align, Justify, etc.)
5. `packages/react-native/ReactCommon/yoga/yoga/enums/` — Individual enum files

## Instructions

1. Read Yoga.h to catalog the complete C API (node creation, style setting, layout calculation)
2. Document all style properties and their enum values
3. Research how React Native integrates Yoga:
   - How YGNode maps to native views
   - How style props are set during reconciliation
   - How layout results (x, y, width, height) are read and applied to views
4. Define "web-like defaults":
   - `<div>`: `flexDirection: column`, `display: flex` (block-level)
   - `<span>`: inline (Yoga doesn't natively support inline — document workaround)
   - Default box model matching CSS (border-box)
5. Document how to embed Yoga in an iOS project (CocoaPods, SPM, or direct C compilation)

## Output

Write to: `docs/research/yoga-ios.md`

Format:
- C API reference table: Function | Parameters | Purpose
- Style property matrix: Property | Type | Default | CSS Equivalent
- Web-like defaults configuration for each HTML element type
- iOS integration guide (build system, bridging header, Swift interop)
- Inline text limitation and proposed workaround

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Yoga iOS integration"
```

---

### Step 6: Write research-js-engine/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/research-js-engine/SKILL.md`:

```markdown
---
name: research-js-engine
description: Research JS engine options for the native client. Run this to compare Hermes vs JavaScriptCore for RSC client needs.
---

# Research: JS Engine Comparison

## Objective

Compare Hermes and JavaScriptCore (JSC) as the JavaScript engine for the native iOS client. Recommend one based on RSC client requirements.

## Instructions

1. Research Hermes on iOS:
   - Bytecode precompilation benefits
   - iOS integration story (build from source vs. prebuilt)
   - ES module support status
   - Streaming/async capabilities
   - JSI (JavaScript Interface) for native bridge
   - Bundle size

2. Research JavaScriptCore on iOS:
   - Built into iOS (no additional bundle size)
   - JSC C API availability
   - Performance characteristics
   - ES module support
   - `JavaScriptCore.framework` API surface (JSContext, JSValue, JSExport)

3. Evaluate against RSC client requirements:
   - Must deserialize Flight stream (streaming JSON parsing)
   - Must resolve client references (module loading)
   - Must call into native (create/update/delete views)
   - Must handle React rendering (reconciler runs in JS)
   - Startup time matters (perceived app launch speed)

4. Research how React Native currently handles this on iOS

## Output

Write to: `docs/research/js-engine.md`

Format:
- Comparison table: Feature | Hermes | JSC
- Pros/cons for each in our use case
- Clear recommendation with rationale
- Integration steps for the recommended engine
- Risk assessment for the other option (in case we need to switch)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "JS engine comparison"
```

---

### Step 7: Write research-html-mapping/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/research-html-mapping/SKILL.md`:

```markdown
---
name: research-html-mapping
description: Research HTML element to native UIKit view mappings. Run this to create the mapping matrix for the component registry.
---

# Research: HTML Element → Native View Mapping

## Objective

Create a comprehensive mapping of HTML elements to UIKit views, Yoga layout config, and default styles. This becomes the blueprint for the component registry.

## Input Files

1. `../react-native/packages/react-native/Libraries/NativeComponent/NativeComponentRegistry.js` — React Native's component registry pattern
2. `../react-native/packages/react-native/Libraries/NativeComponent/BaseViewConfig.ios.js` — iOS base view config

## Instructions

1. Define the initial HTML element set (start small, expand later):
   - **Layout**: `<div>`, `<span>`, `<main>`, `<section>`, `<article>`, `<nav>`, `<header>`, `<footer>`, `<aside>`
   - **Text**: `<p>`, `<h1>`-`<h6>`, `<strong>`, `<em>`, `<a>`
   - **Media**: `<img>`, `<video>`
   - **Input**: `<input>`, `<button>`, `<textarea>`, `<select>`
   - **List**: `<ul>`, `<ol>`, `<li>`
   - **Scroll**: maps to UIScrollView

2. For each element, define:
   - **UIKit view class**: UIView, UILabel, UIImageView, UIButton, UITextField, UITextView, UIScrollView, etc.
   - **Yoga defaults**: flexDirection, display, alignItems, justifyContent, etc.
   - **Props mapping**: HTML attributes → UIKit properties (e.g., `src` → `UIImageView.image`, `onClick` → gesture recognizer)
   - **Style defaults**: what CSS-like defaults this element should have to match web behavior

3. Study how React Native maps its components to native views for patterns

## Output

Write to: `docs/research/html-mapping.md`

Format:
- Mapping matrix table: HTML Element | UIKit Class | Yoga Defaults | Key Props | Notes
- Props mapping per element: HTML Prop | UIKit Property | Transform
- CSS defaults per element (matching web browser defaults)
- Priority ranking: which elements to implement first (P0, P1, P2)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "HTML → native mapping"
```

---

### Step 8: Write research-ios-uikit/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/research-ios-uikit/SKILL.md`:

```markdown
---
name: research-ios-uikit
description: Research UIKit fundamentals for building a custom view hierarchy. Run this to document view lifecycle, events, text rendering, and images.
---

# Research: iOS UIKit Patterns

## Objective

Document the UIKit patterns needed to implement a React-driven native view hierarchy — view creation, layout, event handling, text rendering, image loading, and scrolling.

## Instructions

1. **View hierarchy management**:
   - UIView creation, addSubview, removeFromSuperview, insertSubview(at:)
   - View recycling / reuse patterns (for list performance)
   - Frame vs. bounds vs. center (we'll use Yoga-computed frames)

2. **Layout**:
   - How to bypass Auto Layout entirely and set frames directly (from Yoga)
   - `layoutSubviews()` override pattern
   - `setNeedsLayout()` / `layoutIfNeeded()` for batching

3. **Event handling**:
   - UIGestureRecognizer (tap, long press, pan, swipe)
   - Touch event propagation (hitTest, point(inside:))
   - UIControl.addTarget for buttons/inputs

4. **Text rendering**:
   - UILabel for simple text, NSAttributedString for rich text
   - Text measurement (sizeThatFits, NSLayoutManager, TextKit)
   - Font handling, dynamic type, accessibility

5. **Images**:
   - UIImageView, async image loading patterns
   - Image caching strategies (NSCache, URLCache)

6. **Scrolling**:
   - UIScrollView fundamentals, contentSize, contentOffset
   - Nested scroll views, scroll delegates

7. **Performance**:
   - Off-main-thread concerns (all UIKit must be on main thread)
   - Layer backing, rasterization, shouldRasterize
   - Instrument-based profiling approach

## Output

Write to: `docs/research/ios-uikit.md`

Format:
- Section per topic with Swift code examples
- API reference for methods we'll call from the renderer
- Threading requirements and constraints
- Performance best practices for high-frequency updates (React re-renders)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "iOS UIKit patterns"
```

---

### Step 9: Verify

```bash
for skill in research-reconciler research-flight-protocol research-nextjs-flight research-yoga-ios research-js-engine research-html-mapping research-ios-uikit; do
  test -f "/Users/rickhanlonii/oss/falcon/.claude/skills/$skill/SKILL.md" && echo "OK: $skill" || echo "MISSING: $skill"
done
```

Expected: All 7 research skills show OK.
