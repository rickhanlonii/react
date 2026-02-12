# Yoga Layout Integration: Replacing applySimpleLayout with Real Flexbox

## Goal

Replace the placeholder `applySimpleLayout` vertical-stack layout in Bindings.swift with the real Yoga C layout engine, giving react-dom-native correct CSS flexbox layout using web defaults.

## Motivation

- The current layout is a hardcoded vertical stack with estimated heights per element type — no flexbox, no gap, no padding, no alignment
- Style props (`flexDirection`, `gap`, `padding`, `alignItems`) are passed from JS but ignored on the native side
- Yoga is the same layout engine used by React Native, well-tested and production-grade
- Yoga exposes a pure C API that Swift can call directly via a module map — no bridging wrappers needed

## Current State

| Component | Status |
|---|---|
| `applySimpleLayout` in Bindings.swift | Hardcoded vertical stack, element-type height guesses |
| `props.style` from JS | Passed to `$$createNode` but never read for layout |
| ShadowNodeWrapper.layoutFrame | Set by `applySimpleLayout`, consumed by UIKitMutationApplier |
| JS `src/yoga-layout/` module | Exists (applyStyles, defaults, constants) but unused |
| Yoga C source | Available in `../react-native/ReactCommon/yoga/` |

## Design

### Yoga C Library Integration

Copy the Yoga source into the project as a C++ target in Package.swift.

**File placement:**
```
packages/react-dom-native/ios/Sources/
  Yoga/
    include/yoga/        ← 9 public C headers (Yoga.h, YGNode.h, YGNodeStyle.h, etc.)
    yoga/                ← 19 C++ implementation files
```

**Package.swift target:**
```swift
.target(
    name: "Yoga",
    path: "Sources/Yoga",
    publicHeadersPath: "include",
    cxxSettings: [.headerSearchPath("include")]
)
```

**Dependency graph:**
```
ReactDomNativeKit → ShadowTree → Yoga (C++)
                  → JSEngine
```

Only ShadowTree imports Yoga. Bindings works through ShadowNodeWrapper's API — it never calls Yoga directly.

### ShadowNodeWrapper + Yoga Node

Each ShadowNodeWrapper owns a `YGNodeRef`:

```swift
import Yoga

public class ShadowNodeWrapper {
    public let props: [String: Any]
    public var children: [ShadowNodeWrapper]
    public let family: ShadowNodeFamily
    public let text: String?
    public var layoutFrame: CGRect = .zero

    internal let yogaNode: YGNodeRef

    public init(props:, children:, family:, text:) {
        self.yogaNode = YGNodeNewWithConfig(YogaConfig.shared)
        // ... existing init ...
    }

    deinit {
        YGNodeFree(yogaNode)
    }
}
```

**Yoga config** uses web defaults:
```swift
// YogaConfig.swift (in ShadowTree)
public enum YogaConfig {
    public static let shared: YGConfigRef = {
        let config = YGConfigNew()!
        YGConfigSetUseWebDefaults(config, true)
        YGConfigSetPointScaleFactor(config, Float(UIScreen.main.scale))
        return config
    }()
}
```

Web defaults give: `flexDirection: row`, `flexShrink: 1`, `alignContent: stretch` — matching CSS. No per-element flexDirection overrides. Developers set `flexDirection: 'column'` explicitly when they want vertical stacking.

**Cloning:** Clone methods create a new `YGNodeRef` and copy style properties from the source node's yogaNode. Children yogaNodes are re-inserted when children are kept.

**Text nodes:** Register a `YGMeasureFunc` on the yogaNode that uses `NSString.boundingRect(with:options:attributes:)` to measure the text string. Font size comes from ancestor style props or a 16pt default.

### Style Application

A `YogaStyleApplier` enum in ShadowTree maps CSS property names to Yoga C API calls:

```swift
public enum YogaStyleApplier {
    public static func apply(_ style: [String: Any], to node: YGNodeRef) {
        if let fd = style["flexDirection"] as? String {
            switch fd {
            case "row": YGNodeStyleSetFlexDirection(node, .row)
            case "column": YGNodeStyleSetFlexDirection(node, .column)
            default: break
            }
        }
        if let gap = style["gap"] as? Double {
            YGNodeStyleSetGap(node, .all, Float(gap))
        }
        if let padding = style["padding"] as? Double {
            YGNodeStyleSetPadding(node, .all, Float(padding))
        }
        // alignItems, justifyContent, width, height, margin, etc.
    }
}
```

**Properties to support initially** (used by the example app):
- `flexDirection` (row, column)
- `gap`
- `padding`
- `alignItems` (center, flexStart, flexEnd, stretch)
- `justifyContent` (center, flexStart, flexEnd, spaceBetween)
- `width`, `height`
- `margin`, `marginTop`, `marginBottom`
- `fontSize` (for text measurement, not a Yoga property)

Applied in `$$createNode` after creating the ShadowNodeWrapper. Applied again in clone-with-new-props operations.

### Layout Calculation in $$completeRoot

Replaces `applySimpleLayout`. After building the new child list:

1. Create a temporary root `YGNodeRef` sized to the rootView's bounds
2. Insert top-level children's yogaNodes as children of the root
3. Call `YGNodeCalculateLayout(rootNode, width, height, .LTR)`
4. Walk the tree recursively, reading layout results into `layoutFrame`:
   ```swift
   func readLayout(from node: ShadowNodeWrapper) {
       node.layoutFrame = CGRect(
           x: CGFloat(YGNodeLayoutGetLeft(node.yogaNode)),
           y: CGFloat(YGNodeLayoutGetTop(node.yogaNode)),
           width: CGFloat(YGNodeLayoutGetWidth(node.yogaNode)),
           height: CGFloat(YGNodeLayoutGetHeight(node.yogaNode))
       )
       for child in node.children {
           readLayout(from: child)
       }
   }
   ```
5. Remove children from temporary root (so they stay owned by their ShadowNodeWrappers), then free it
6. Proceed with diff and UIKit mutation as before

Yoga returns positions relative to the parent. UIKit's `view.frame` is also relative to superview. The coordinate systems match.

### What Changes, What Doesn't

**Remove:**
- `applySimpleLayout` and `layoutNode` methods from Bindings.swift

**Modify:**
- `$$createNode` — call `YogaStyleApplier.apply(style, to: node.yogaNode)`
- `$$appendChild` — add `YGNodeInsertChild(parent.yogaNode, child.yogaNode, index)`
- `$$cloneNodeWithNewProps` — apply new style to cloned yogaNode
- `$$completeRoot` — Yoga calculate + layout walk instead of `applySimpleLayout`
- ShadowNodeWrapper — add `yogaNode` property, `deinit` cleanup
- Package.swift — add Yoga target, ShadowTree depends on Yoga

**No changes to:**
- UIKitMutationApplier — already reads `node.layoutFrame`
- ViewRegistry — unchanged
- JSEngine — unchanged
- JS host config — already passes `style` in props
- JS `yoga-layout/` module — not used yet, can optimize later

## Implementation Plan

### Phase 1: Add Yoga C library to Swift Package

- Copy Yoga source from `../react-native/ReactCommon/yoga/yoga/` into `Sources/Yoga/`
- Organize: public headers in `include/yoga/`, implementation in `yoga/`
- Add Yoga target to Package.swift
- Add ShadowTree dependency on Yoga
- **Verify:** `swift build --target Yoga` and `swift build --target ShadowTree` compile

### Phase 2: Add YGNodeRef to ShadowNodeWrapper

- Create `YogaConfig.swift` with shared config using web defaults
- Add `yogaNode: YGNodeRef` to ShadowNodeWrapper
- Create yogaNode in init, free in deinit
- Update clone methods to create new yogaNodes and copy style
- **Verify:** ShadowTree builds, existing behavior unchanged (yogaNodes created but not used for layout yet)

### Phase 3: Implement YogaStyleApplier

- Create `YogaStyleApplier.swift` in ShadowTree
- Support: flexDirection, gap, padding, alignItems, justifyContent, width, height, margin
- **Verify:** Unit test that applies styles and reads them back via `YGNodeStyleGet*`

### Phase 4: Wire up Bindings

- In `$$createNode`: extract `props["style"]` and call `YogaStyleApplier.apply`
- In `$$appendChild`: call `YGNodeInsertChild`
- In clone operations: apply new styles to cloned yogaNodes
- In `$$completeRoot`: replace `applySimpleLayout` with Yoga layout calculation
- Remove `applySimpleLayout` and `layoutNode`
- **Verify:** Example app renders with correct layout

### Phase 5: Text measurement

- Register `YGMeasureFunc` on text node yogaNodes
- Measure using `NSString.boundingRect` with font from style props
- **Verify:** Text nodes size correctly in the example app

### Phase 6: Update TesterBridge

- Apply same Yoga integration to FantomTester's TesterBridge
- TesterBridge uses same ShadowNodeWrapper with yogaNodes
- **Verify:** FantomTester still compiles

## Key Design Decisions

1. **Web defaults, no element overrides** — `YGConfigSetUseWebDefaults(true)` gives CSS-standard `flexDirection: row`, `flexShrink: 1`. No per-element defaults for layout properties. Developers set `flexDirection: 'column'` explicitly, same as on the web.

2. **Yoga in ShadowTree, not Bindings** — ShadowNodeWrapper owns its yogaNode. Bindings calls high-level methods (apply style, calculate layout) without importing Yoga directly. This keeps the C++ dependency contained.

3. **Style processing in Swift** — Props arrive as a dictionary from JS. Swift maps string keys/values to Yoga C API calls. The existing JS `yoga-layout/` module is not wired up yet — it can be used later to preprocess styles in JS for performance.

4. **Incremental property support** — Only implement the CSS properties the example app uses. Add more as needed. Yoga supports the full CSS flexbox spec; we just need the mapping code.

5. **Temporary root node for layout** — `$$completeRoot` creates a throwaway root yogaNode sized to the UIView bounds, inserts children, calculates, reads results, then cleans up. This avoids persisting a root yogaNode across commits.
