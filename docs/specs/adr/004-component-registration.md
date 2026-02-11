# ADR 004: Component Registration — Static Element Registry

## Status

Accepted

## Context

React Native uses a dynamic component registry (`NativeComponentRegistry`) with runtime ViewConfig validation. Components are registered lazily and can be added at any time. Options for react-dom-native:

1. **Dynamic registry** (React Native pattern): Register components at runtime with ViewConfig objects
2. **Static registry**: Hardcode all supported HTML elements in a compile-time lookup table
3. **Hybrid**: Static registry with extension points for custom elements

## Decision

**Use a static element registry** with no ViewConfig validation layer.

## Rationale

### Fixed element set

react-dom-native supports only standard HTML elements (`<div>`, `<span>`, `<p>`, `<img>`, `<button>`, `<input>`, etc.). Unlike React Native, which allows third-party native components, our element set is closed and known at compile time.

### What ViewConfig provided (and why we don't need it)

| ViewConfig Feature | Our Replacement |
|-------------------|-----------------|
| Component lookup by name | Static `unordered_map<string, ElementDescriptor>` in C++ |
| `validAttributes` prop whitelist | Pass all props to C++; C++ ignores unknown props |
| `validAttributes.process` transforms | Explicit transforms in prop parsing code |
| `bubblingEventTypes` / `directEventTypes` | Static event table in `HTMLEventRegistry` |
| DEV prop validation | Optional `validateElement()` in DEV builds |

### Architecture

```
JS: createInstance("div", props)
  │
  ▼
C++: HTMLElementRegistry::get("div")  // O(1) hash map lookup
  │
  ▼
Returns: ElementDescriptor {
  category: Container,
  defaultViewType: UIView,
  yogaDefaults: { flexDirection: Column, flexShrink: 0 },
  accessibility: { role: "" },
  isTextContainer: false,
  canBeVirtual: false,
  ...
}
```

### Benefits

1. **No runtime validation overhead**: Props are not filtered through `validAttributes`
2. **Simpler code**: No `NativeComponentRegistry`, no lazy ViewConfig creation, no config caching
3. **Type safety via build tools**: TypeScript catches prop errors at compile time instead of runtime
4. **Faster startup**: No ViewConfig computation or registration during app initialization

## Element Categories

| Category | Elements | View Type |
|----------|----------|-----------|
| Container | div, main, section, article, nav, header, footer, aside, form | UIView |
| TextContainer | p, h1–h6 | TextRenderView (Core Text) |
| VirtualText | span, strong, em, a, br | Virtual (inside text) or UIView (outside) |
| Image | img | UIImageView |
| Button | button | UIView + gesture recognizer |
| Input | input, textarea | UITextField / UITextView |
| Select | select | UIView + picker |
| List | ul, ol | UIView |
| ListItem | li | UIView |
| HorizontalRule | hr | UIView |

## Shadow Node Design

A single universal `HTMLShadowNode` class handles all elements, parameterized by the `ElementDescriptor`. No per-element subclasses.

The `ElementDescriptor` reference is shared across all clones of a given element type (it points to a static registry entry), so it costs zero additional memory per clone.

## Consequences

- Cannot add custom native elements at runtime (by design)
- Element behavior must be defined in C++ source code
- JS-side and C++-side element definitions must stay in sync (mitigated by a single source of truth in `HTMLElementRegistry`)
- Unknown element types throw at creation time with a clear error message
