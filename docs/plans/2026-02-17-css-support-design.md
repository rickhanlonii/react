# CSS Support in react-dom-native

## The Core Question

react-dom-native uses HTML elements (`<div>`, `<span>`, `<p>`) as its API surface. If the element API is the web's API, the styling API should be too. The goal is: the same component code works on web and native.

## How It Works Today

Inline style objects only. Flow: JS style object → bridge → Swift merges with element defaults → YogaStyleApplier (layout) + UIKitMutationApplier (visual). No CSS parsing. ~50 properties supported.

Key files:
- `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift` — layout props
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` — visual props
- `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift` — per-element defaults

## How Chromium Does It

Chromium's CSS engine is ~200K+ lines: CSSParser (~20K), StyleResolver (~50K, selector matching + cascade), ComputedStyle (4-stage value resolution, inheritance), and a 500+ property system. ~5-10% of the entire rendering engine.

## What Cross-Platform React Needs

The #1 thing that makes web code not work on native today is that **className doesn't do anything**. Every CSS framework, component library, and design system uses className.

Minimum viable CSS for real cross-platform:
1. **className → style resolution** — the critical missing piece
2. **CSS custom properties** — how modern design systems do theming
3. **Inheritance** — already partially there, needs to be complete
4. **The cascade** (specificity + source order) — needed with multiple style sources

Skip for now: pseudo-elements, @keyframes, grid, complex selectors (`:nth-child`, `:has`).

## Architecture: CSS Engine in Swift

The CSS engine lives in the native layer, like a real browser. JS sends `className` and `<style>` content over the bridge. Swift parses CSS, matches selectors, resolves the cascade, and computes final styles — then feeds them to Yoga + UIKit as it already does.

### Why Swift, not JS

1. **Performance** — selector matching and cascade resolution are CPU-intensive string/tree operations. Swift is 10-100x faster than JSC for this.
2. **Closer to the browser model** — Chromium's style engine is native C++, not JavaScript. The style system is tightly coupled to the layout engine (Yoga) which is already in native.
3. **Shadow tree is already in Swift** — the tree structure needed for selector matching (parent/child/descendant relationships) already exists in `ShadowNodeWrapper`. No need to mirror it in JS.
4. **Less bridge traffic** — send raw `className` string once, not resolved style objects. CSS rules are registered once when `<style>` elements mount, not re-sent on every render.
5. **Caching** — native-side style caching (computed styles keyed by selector match set) is more efficient and survives across React renders.

### Data flow

```
React component
  ├─ className="card hero"
  ├─ style={{color: 'red'}}
  │
  ↓ (bridge — sends className + inline style as-is)
$$createNode(type, surfaceId, {className: "card hero", style: {color: "red"}}, ...)
  │
  ↓ (Swift)
CSS Resolution (NEW)
  ├─ Look up "card" and "hero" in stylesheet registry
  ├─ Match selectors against this node (type, class, ancestors)
  ├─ Apply specificity + cascade
  ├─ Merge: element defaults < CSS rules < inline style
  ├─ Resolve var(--custom-props) via ancestor walk
  ├─ Resolve inheritance for text properties
  │
  ↓
Resolved style dict {padding: 16, color: "red", borderRadius: 8, ...}
  ↓
YogaStyleApplier.apply(resolvedStyle, to: yogaNode)     ← unchanged
UIKitMutationApplier.applyCommonProps(resolvedStyle)     ← unchanged
```

### How CSS gets into the renderer

Two mechanisms, like the web:

**1. `<style>` elements in the React tree**

React 19 supports `<style>` as a first-class element with hoisting and deduplication (via `precedence` + `href` props). The reconciler passes `<style>` through to the host config like any other element. In react-dom-native, the host config intercepts it and feeds CSS text to Swift instead of creating a UIView.

```swift
// When $$createNode is called with type "style":
let cssText = props["children"] as? String
let rules = CSSParser.parse(cssText)
stylesheetRegistry.addRules(rules, surfaceId: surfaceId)
```

Rules persist until the `<style>` element is unmounted. This handles component-scoped styles, CSS-in-JS output, and inline stylesheets.

**2. External CSS files**

For Tailwind, third-party libraries, or global stylesheets — load CSS from files and register them with the stylesheet registry outside the React tree.

```swift
// Load CSS from bundled file or URL
let cssText = try String(contentsOfFile: bundlePath)
let rules = CSSParser.parse(cssText)
stylesheetRegistry.addRules(rules, surfaceId: surfaceId)
```

On the JS side, could also expose a bridge function:
```js
// Register CSS from JS (e.g., for dynamically loaded stylesheets)
$$registerStylesheet(cssText, surfaceId)
```

This handles Tailwind's generated CSS, reset stylesheets, design system tokens, etc.

### Shadow tree integration points

The shadow tree is well-suited for CSS:

| Need | Available in shadow tree |
|------|------------------------|
| Element type (`div`, `p`) | `family.elementType` |
| className | Add to `props` dict (already passes through) |
| id | Add to `props` dict |
| Parent access | Currently no parent pointer — needs to be added or passed through recursion |
| Children | `children: [ShadowNodeWrapper]` |
| Tree traversal | `readLayoutFrames()` already walks recursively — same pattern |

**One structural addition needed**: parent pointers on `ShadowNodeWrapper` (or build a parent map during tree construction). Currently nodes don't know their parent, which is needed for descendant selector matching and property inheritance.

## Implementation Layers

### Layer 1: CSS Parser (Swift)

Parse CSS text into structured rules. The parser needs to handle:

```swift
struct CSSRule {
    let selector: Selector       // Parsed selector
    let declarations: [String: Any]  // property → value
    let specificity: (Int, Int, Int) // (ids, classes, types)
    let sourceOrder: Int         // For cascade tiebreaking
}

enum Selector {
    case element(String)                    // div
    case `class`(String)                    // .card
    case id(String)                         // #main
    case compound([Selector])               // div.card
    case descendant(Selector, Selector)     // .card .title
    case child(Selector, Selector)          // .card > .title
    case list([Selector])                   // .foo, .bar
}
```

Supported CSS syntax:
- Class selectors (`.foo`), element selectors (`div`), ID selectors (`#bar`)
- Descendant combinator (`.foo .bar`), child combinator (`.foo > .bar`)
- Compound selectors (`div.card`)
- Comma-separated selectors (`.foo, .bar`)
- Declaration blocks with `property: value;` pairs
- CSS shorthand expansion (`margin: 10px 20px` → individual edges)
- Unit parsing (`16px`, `1.5rem`, `50%`, `#ff0000`)

~800-1200 lines of Swift.

### Layer 2: Selector Matching

Given a node and its ancestors, determine which CSS rules match.

```swift
func matchingRules(for node: ShadowNodeWrapper, ancestors: [ShadowNodeWrapper]) -> [CSSRule] {
    return stylesheetRegistry.allRules.filter { rule in
        matches(selector: rule.selector, node: node, ancestors: ancestors)
    }
    .sorted(by: specificity, then: sourceOrder)
}
```

Matching is straightforward:
- `.card` matches if node's className contains "card"
- `div` matches if node's elementType is "div"
- `.card .title` matches if node matches `.title` AND some ancestor matches `.card`
- `.card > .title` matches if node matches `.title` AND parent matches `.card`

~300-500 lines.

**Optimization**: For large stylesheets (e.g., Tailwind generates thousands of rules), index rules by their rightmost simple selector. Most rules start with a class selector — build a `[String: [CSSRule]]` map keyed by class name. Only check rules whose key appears in the node's className. This makes matching O(classes) instead of O(rules).

### Layer 3: Style Resolution + Cascade

Compute the final style for a node by merging all sources:

```swift
func computeStyle(
    for node: ShadowNodeWrapper,
    ancestors: [ShadowNodeWrapper],
    parentComputedStyle: [String: Any]?
) -> [String: Any] {
    // 1. Start with element defaults
    var computed = ElementDefaults.defaults(for: node.family.elementType)

    // 2. Apply matched CSS rules (sorted by specificity)
    let matched = matchingRules(for: node, ancestors: ancestors)
    for rule in matched {
        for (prop, value) in rule.declarations {
            computed[prop] = value
        }
    }

    // 3. Apply inline style (highest priority)
    if let inline = node.props["style"] as? [String: Any] {
        for (prop, value) in inline {
            computed[prop] = value
        }
    }

    // 4. Resolve inheritance for unset inheritable properties
    if let parent = parentComputedStyle {
        for prop in inheritableProperties {
            if computed[prop] == nil {
                computed[prop] = parent[prop]
            }
        }
    }

    // 5. Resolve var(--custom-props)
    resolveCustomProperties(&computed, parentComputedStyle)

    return computed
}
```

This replaces the current `ElementDefaults.mergedStyle()` call — same idea, but with CSS rules inserted between defaults and inline styles.

~500-800 lines (including inheritance table and var() resolution).

### Layer 4: Integration into Shadow Tree

Modify the node creation/cloning flow to run CSS resolution:

**In `Bindings.swift` → `$$createNode`**:
```swift
// Before: ElementDefaults.mergedStyle(for: type, userStyle: userStyle)
// After:  CSSResolver.computeStyle(for: node, ancestors: ancestorChain, parent: parentStyle)
```

**In `$$completeRoot`** (tree commit):
- Walk the new tree top-down, computing styles with parent context
- This is where inheritance and var() resolution happen (they need the full tree)
- The existing `readLayoutFrames()` pattern works — recursive top-down walk

**For `<style>` elements**:
- `$$createNode("style", ...)` → parse CSS text, register rules in `StylesheetRegistry`
- `$$removeNode("style", ...)` → unregister rules
- When rules change, mark affected nodes dirty for style recomputation

~300-500 lines of integration glue.

### Layer 5: Tailwind / Utility CSS (free)

With Layers 1-4, Tailwind just works:

```jsx
// Load Tailwind's generated CSS
<style>{tailwindCSS}</style>

// Use Tailwind classes — they resolve through the CSS engine
<div className="flex p-4 bg-red-500 rounded-lg">
  <span className="text-xl font-bold text-white">Hello</span>
</div>
```

The stylesheet registry holds Tailwind's rules. The selector matcher indexes by class name for fast lookup. No special Tailwind integration needed.

**Performance note**: Tailwind v4 generates ~5K-15K rules for a typical app. With class-name indexing, matching is O(1) per class. Style computation per node is dominated by dict merging, which is fast in Swift.

### Layer 6: Media Queries (future)

```swift
// Query iOS device traits at runtime
@media (prefers-color-scheme: dark) → UITraitCollection.current.userInterfaceStyle
@media (min-width: 768px)          → UIScreen.main.bounds.width
@media (orientation: portrait)      → UIDevice.current.orientation
```

Filter rules by active media queries during matching. Re-run when traits change (dark mode toggle, rotation).

~500 lines.

## Summary

| Layer | What | ~Lines (Swift) | Unlocks |
|-------|------|---------------|---------|
| 1 | CSS Parser | 800-1200 | Parse `<style>` content into rules |
| 2 | Selector Matching | 300-500 | className → matched rules |
| 3 | Style Resolution + Cascade | 500-800 | Specificity, inheritance, var() |
| 4 | Shadow Tree Integration | 300-500 | Wire it all together |
| 5 | Tailwind | 0 | Free — it's just CSS |
| 6 | Media Queries (future) | 500 | Responsive, dark mode |
| **Total (L1-4)** | | **~2-3K** | **className + CSS works** |

All Swift, in the same package as the existing shadow tree. The bridge sends `className` and `<style>` content — raw, unprocessed. The native CSS engine does the rest.

## Key Files

**New files** (in `packages/react-dom-native/ios/Sources/ShadowTree/`):
- `CSSParser.swift` — tokenizer + parser
- `CSSSelector.swift` — selector types + matching
- `CSSResolver.swift` — cascade + style computation
- `StylesheetRegistry.swift` — stores parsed rules, indexed by selector

**Modified files**:
- `ShadowNodeWrapper.swift` — add parent pointer (weak ref) or computed style storage
- `Bindings.swift` — `$$createNode` / `$$cloneNodeWithNewProps` call CSS resolver instead of `ElementDefaults.mergedStyle()`; handle `<style>` element type
- `HostConfig.js` — pass `className` through to native (it already does, just confirm it's not stripped)
- `NativeFizzConfig.js` — handle `<style>` in SSR path

**Unchanged**:
- `YogaStyleApplier.swift` — receives resolved style dict, same as today
- `UIKitMutationApplier.swift` — receives resolved props, same as today
- `ElementDefaults.swift` — still provides defaults, but called by CSSResolver instead of directly

## Open Questions

1. **Parent pointers vs. ancestor map** — Add a `weak var parent: ShadowNodeWrapper?` to each node, or build a temporary parent map during tree commit? Parent pointers are simpler but require updating on every clone/reparent.
2. **When to recompute styles** — During `$$createNode` (eager, per-node) or during `$$completeRoot` (batch, full tree walk)? Batch is better for inheritance/var() but requires storing pre-resolved styles.
3. **External CSS** — Support `<link href="styles.css">`? Would need a fetch mechanism from Swift.
4. **Scoping** — Global `<style>` (like web) or scoped to component subtree? Global is simpler and matches web behavior.
5. **Server-side CSS** — Should the RSC server send CSS rules in the Flight stream? Or should CSS be loaded separately (like a `<link>` tag)?
