# Research: Yoga Layout on iOS

## Overview

Yoga is a C++ layout engine that implements CSS Flexbox. It is developed by Meta and used in React Native. The Yoga source code lives at `../react-native/packages/react-native/ReactCommon/yoga/yoga/`. Yoga provides a pure C API suitable for integration from any language, including Swift via a bridging header.

This document covers the complete Yoga C API, style properties, enum values, web-like default configuration, iOS integration strategy, and inline text handling.

---

## 1. C API Reference

### 1.1 Node Lifecycle

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeNew` | `void` | Heap-allocate a new node with default config |
| `YGNodeNewWithConfig` | `YGConfigConstRef config` | Heap-allocate a node with custom config |
| `YGNodeClone` | `YGNodeConstRef node` | Create a mutable copy (same context/children, no owner) |
| `YGNodeFree` | `YGNodeRef node` | Free node, disconnecting from owner/children |
| `YGNodeFreeRecursive` | `YGNodeRef node` | Free entire subtree rooted at node |
| `YGNodeFinalize` | `YGNodeRef node` | Free without disconnecting (for parallel GC) |
| `YGNodeReset` | `YGNodeRef node` | Reset node to default state |

### 1.2 Layout Calculation

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeCalculateLayout` | `node, availableWidth, availableHeight, ownerDirection` | Calculate layout for the tree rooted at `node` |
| `YGNodeGetHasNewLayout` | `YGNodeConstRef node` | Check if layout may have changed since last calc |
| `YGNodeSetHasNewLayout` | `node, hasNewLayout` | Mark layout as consumed |
| `YGNodeIsDirty` | `YGNodeConstRef node` | Check if node or children changed |
| `YGNodeMarkDirty` | `YGNodeRef node` | Mark a node with custom measure func as dirty |

### 1.3 Tree Manipulation

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeInsertChild` | `node, child, index` | Insert child at given index |
| `YGNodeSwapChild` | `node, child, index` | Replace child at given index |
| `YGNodeRemoveChild` | `node, child` | Remove a specific child |
| `YGNodeRemoveAllChildren` | `YGNodeRef node` | Remove all children |
| `YGNodeSetChildren` | `owner, children[], count` | Set children from an array |
| `YGNodeGetChild` | `node, index` | Get child at index |
| `YGNodeGetChildCount` | `YGNodeConstRef node` | Get number of children |
| `YGNodeGetOwner` | `YGNodeRef node` | Get owner (parent) node |
| `YGNodeGetParent` | `YGNodeRef node` | Get parent (alias for owner) |

### 1.4 Context & Configuration

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeSetContext` | `node, void* context` | Attach arbitrary data to the node |
| `YGNodeGetContext` | `YGNodeConstRef node` | Read attached context |
| `YGNodeSetConfig` | `node, config` | Change config after creation |
| `YGNodeGetConfig` | `YGNodeRef node` | Get current config |

### 1.5 Measure & Baseline Functions

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeSetMeasureFunc` | `node, YGMeasureFunc` | Set custom measurement (for leaf nodes like text) |
| `YGNodeHasMeasureFunc` | `YGNodeConstRef node` | Check if measure func is set |
| `YGNodeSetBaselineFunc` | `node, YGBaselineFunc` | Set custom text baseline calculator |
| `YGNodeHasBaselineFunc` | `YGNodeConstRef node` | Check if baseline func is set |
| `YGNodeSetIsReferenceBaseline` | `node, bool` | Mark as reference baseline among siblings |
| `YGNodeIsReferenceBaseline` | `YGNodeConstRef node` | Check if is reference baseline |

**YGMeasureFunc signature:**
```c
typedef YGSize (*YGMeasureFunc)(
    YGNodeConstRef node,
    float width, YGMeasureMode widthMode,
    float height, YGMeasureMode heightMode);
```

**YGMeasureMode values:**
- `YGMeasureModeUndefined` -- no constraint, any size allowed
- `YGMeasureModeAtMost` -- child can be up to this size
- `YGMeasureModeExactly` -- parent dictates exact size

### 1.6 Node Type

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeSetNodeType` | `node, YGNodeType` | Set node type (Default or Text) |
| `YGNodeGetNodeType` | `YGNodeConstRef node` | Get node type |

- `YGNodeTypeDefault` -- normal layout node
- `YGNodeTypeText` -- leaf node whose layout may be truncated during rounding

### 1.7 Containing Block

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeSetAlwaysFormsContainingBlock` | `node, bool` | Force node to be a containing block for descendants |
| `YGNodeGetAlwaysFormsContainingBlock` | `YGNodeConstRef node` | Check containing block status |

### 1.8 Dirtied Callback

| Function | Parameters | Purpose |
|---|---|---|
| `YGNodeSetDirtiedFunc` | `node, YGDirtiedFunc` | Called when tree change dirties this node |
| `YGNodeGetDirtiedFunc` | `YGNodeConstRef node` | Get current dirtied callback |

### 1.9 Layout Result Getters

| Function | Returns | Purpose |
|---|---|---|
| `YGNodeLayoutGetLeft` | `float` | Computed left position |
| `YGNodeLayoutGetTop` | `float` | Computed top position |
| `YGNodeLayoutGetRight` | `float` | Computed right position |
| `YGNodeLayoutGetBottom` | `float` | Computed bottom position |
| `YGNodeLayoutGetWidth` | `float` | Computed width |
| `YGNodeLayoutGetHeight` | `float` | Computed height |
| `YGNodeLayoutGetDirection` | `YGDirection` | Resolved layout direction |
| `YGNodeLayoutGetHadOverflow` | `bool` | Whether node had overflow |
| `YGNodeLayoutGetMargin` | `float` (per edge) | Computed margin |
| `YGNodeLayoutGetBorder` | `float` (per edge) | Computed border |
| `YGNodeLayoutGetPadding` | `float` (per edge) | Computed padding |
| `YGNodeLayoutGetRawWidth` | `float` | Width before rounding |
| `YGNodeLayoutGetRawHeight` | `float` | Height before rounding |

### 1.10 Pixel Grid Rounding

| Function | Parameters | Purpose |
|---|---|---|
| `YGRoundValueToPixelGrid` | `value, pointScaleFactor, forceCeil, forceFloor` | Round a point value to nearest pixel |

### 1.11 Configuration API

| Function | Parameters | Purpose |
|---|---|---|
| `YGConfigNew` | `void` | Allocate new config |
| `YGConfigFree` | `YGConfigRef config` | Free config |
| `YGConfigGetDefault` | `void` | Get default config values |
| `YGConfigSetUseWebDefaults` | `config, bool` | Use web-compatible defaults |
| `YGConfigGetUseWebDefaults` | `YGConfigConstRef config` | Check if web defaults enabled |
| `YGConfigSetPointScaleFactor` | `config, float` | Set pixel density for rounding (e.g. 2.0 for Retina, 3.0 for 3x) |
| `YGConfigGetPointScaleFactor` | `YGConfigConstRef config` | Get current scale factor |
| `YGConfigSetErrata` | `config, YGErrata` | Configure W3C conformance vs legacy compatibility |
| `YGConfigGetErrata` | `YGConfigConstRef config` | Get current errata |
| `YGConfigSetLogger` | `config, YGLogger` | Set custom log function |
| `YGConfigSetContext` | `config, void*` | Set arbitrary context on config |
| `YGConfigGetContext` | `YGConfigConstRef config` | Get config context |
| `YGConfigSetExperimentalFeatureEnabled` | `config, feature, bool` | Enable experimental features |
| `YGConfigIsExperimentalFeatureEnabled` | `config, feature` | Check if experimental feature enabled |
| `YGConfigSetCloneNodeFunc` | `config, YGCloneNodeFunc` | Set node clone callback |

---

## 2. Style Properties

### 2.1 Style Property Matrix

| Property | Type | Yoga Default | CSS Web Default | Setter | CSS Equivalent |
|---|---|---|---|---|---|
| **direction** | `YGDirection` | `Inherit` | `ltr` | `YGNodeStyleSetDirection` | `direction` |
| **flexDirection** | `YGFlexDirection` | `Column` | `row` | `YGNodeStyleSetFlexDirection` | `flex-direction` |
| **justifyContent** | `YGJustify` | `FlexStart` | `flex-start` | `YGNodeStyleSetJustifyContent` | `justify-content` |
| **alignContent** | `YGAlign` | `FlexStart` | `stretch` | `YGNodeStyleSetAlignContent` | `align-content` |
| **alignItems** | `YGAlign` | `Stretch` | `stretch` | `YGNodeStyleSetAlignItems` | `align-items` |
| **alignSelf** | `YGAlign` | `Auto` | `auto` | `YGNodeStyleSetAlignSelf` | `align-self` |
| **positionType** | `YGPositionType` | `Relative` | `static` | `YGNodeStyleSetPositionType` | `position` |
| **flexWrap** | `YGWrap` | `NoWrap` | `nowrap` | `YGNodeStyleSetFlexWrap` | `flex-wrap` |
| **overflow** | `YGOverflow` | `Visible` | `visible` | `YGNodeStyleSetOverflow` | `overflow` |
| **display** | `YGDisplay` | `Flex` | `block`* | `YGNodeStyleSetDisplay` | `display` |
| **flex** | `float` | undefined | n/a | `YGNodeStyleSetFlex` | `flex` shorthand |
| **flexGrow** | `float` | `0.0` | `0` | `YGNodeStyleSetFlexGrow` | `flex-grow` |
| **flexShrink** | `float` | `0.0` (Yoga) / `1.0` (web) | `1` | `YGNodeStyleSetFlexShrink` | `flex-shrink` |
| **flexBasis** | `YGValue` | `auto` | `auto` | `YGNodeStyleSetFlexBasis` | `flex-basis` |
| **position** | `YGValue` (per edge) | undefined | `auto` | `YGNodeStyleSetPosition` | `top/right/bottom/left` |
| **margin** | `YGValue` (per edge) | undefined (0) | `0` | `YGNodeStyleSetMargin` | `margin` |
| **padding** | `YGValue` (per edge) | undefined (0) | `0` | `YGNodeStyleSetPadding` | `padding` |
| **border** | `float` (per edge) | undefined (0) | `0` | `YGNodeStyleSetBorder` | `border-width` |
| **gap** | `YGValue` (per gutter) | undefined (0) | `normal` (0) | `YGNodeStyleSetGap` | `gap/row-gap/column-gap` |
| **width** | `YGValue` | `auto` | `auto` | `YGNodeStyleSetWidth` | `width` |
| **height** | `YGValue` | `auto` | `auto` | `YGNodeStyleSetHeight` | `height` |
| **minWidth** | `YGValue` | undefined | `auto` | `YGNodeStyleSetMinWidth` | `min-width` |
| **minHeight** | `YGValue` | undefined | `auto` | `YGNodeStyleSetMinHeight` | `min-height` |
| **maxWidth** | `YGValue` | undefined | `none` | `YGNodeStyleSetMaxWidth` | `max-width` |
| **maxHeight** | `YGValue` | undefined | `none` | `YGNodeStyleSetMaxHeight` | `max-height` |
| **aspectRatio** | `float` | undefined | `auto` | `YGNodeStyleSetAspectRatio` | `aspect-ratio` |
| **boxSizing** | `YGBoxSizing` | `BorderBox` | `content-box`** | `YGNodeStyleSetBoxSizing` | `box-sizing` |

*CSS default is `block`, but Yoga only supports `Flex`, `None`, and `Contents`. All nodes are flex containers.
**CSS default is `content-box`, but Yoga defaults to `border-box` which matches modern CSS best practice.

### 2.2 Dimension Setter Variants

Each dimension property has multiple setter variants:

| Variant | Example | Purpose |
|---|---|---|
| Points | `YGNodeStyleSetWidth(node, 100)` | Set to fixed point value |
| Percent | `YGNodeStyleSetWidthPercent(node, 50)` | Set to percentage of parent |
| Auto | `YGNodeStyleSetWidthAuto(node)` | Set to auto-sizing |
| MaxContent | `YGNodeStyleSetWidthMaxContent(node)` | Size to content without wrapping |
| FitContent | `YGNodeStyleSetWidthFitContent(node)` | Fit content with wrapping |
| Stretch | `YGNodeStyleSetWidthStretch(node)` | Stretch to fill available space |

Applies to: width, height, minWidth, minHeight, maxWidth, maxHeight, flexBasis.

### 2.3 Edge-based Setter Variants

| Variant | Example | Purpose |
|---|---|---|
| Points | `YGNodeStyleSetMargin(node, YGEdgeLeft, 10)` | Fixed point value per edge |
| Percent | `YGNodeStyleSetMarginPercent(node, YGEdgeAll, 5)` | Percentage per edge |
| Auto | `YGNodeStyleSetMarginAuto(node, YGEdgeHorizontal)` | Auto per edge (margin only) |

---

## 3. Enum Reference

### YGAlign
`Auto`, `FlexStart`, `Center`, `FlexEnd`, `Stretch`, `Baseline`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly`

### YGBoxSizing
`BorderBox`, `ContentBox`

### YGDimension
`Width`, `Height`

### YGDirection
`Inherit`, `LTR`, `RTL`

### YGDisplay
`Flex`, `None`, `Contents`

### YGEdge
`Left`, `Top`, `Right`, `Bottom`, `Start`, `End`, `Horizontal`, `Vertical`, `All`

### YGErrata (bitmask)
`None=0`, `StretchFlexBasis=1`, `AbsolutePositionWithoutInsetsExcludesPadding=2`, `AbsolutePercentAgainstInnerSize=4`, `All=2147483647`, `Classic=2147483646`

### YGFlexDirection
`Column`, `ColumnReverse`, `Row`, `RowReverse`

### YGGutter
`Column`, `Row`, `All`

### YGJustify
`FlexStart`, `Center`, `FlexEnd`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly`

### YGMeasureMode
`Undefined`, `Exactly`, `AtMost`

### YGNodeType
`Default`, `Text`

### YGOverflow
`Visible`, `Hidden`, `Scroll`

### YGPositionType
`Static`, `Relative`, `Absolute`

### YGUnit
`Undefined`, `Point`, `Percent`, `Auto`, `MaxContent`, `FitContent`, `Stretch`

### YGWrap
`NoWrap`, `Wrap`, `WrapReverse`

---

## 4. Web-Like Defaults Configuration

### 4.1 Built-in `useWebDefaults` Mode

Yoga has a built-in `YGConfigSetUseWebDefaults` flag. When enabled, it changes:

| Property | Yoga Default | Web Default |
|---|---|---|
| `flexDirection` | `Column` | **`Row`** |
| `alignContent` | `FlexStart` | **`Stretch`** |
| `flexShrink` (resolved) | `0.0` | **`1.0`** |
| `flexBasis` (when flex > 0) | `0pt` | **`auto`** |

**Source** (from `Node.h:306`):
```cpp
void useWebDefaults() {
    style_.setFlexDirection(FlexDirection::Row);
    style_.setAlignContent(Align::Stretch);
}
```

**Important:** For our project, we do NOT want `useWebDefaults` because we want `<div>` to default to `flexDirection: column` (matching CSS block layout). Instead, we apply selective web defaults per element type.

### 4.2 Per-Element Web-Like Defaults

For react-dom-native, we want HTML elements to behave like their CSS counterparts:

#### `<div>` -- Block-level flex container
```c
// Already matches Yoga defaults! No changes needed.
// flexDirection: Column (Yoga default)
// display: Flex (Yoga default)
// alignItems: Stretch (Yoga default)
// positionType: Relative (Yoga default)
// boxSizing: BorderBox (Yoga default)
// flexShrink: 0.0 (Yoga default -- differs from CSS but closer to block behavior)
```

Key insight: Yoga's default (Column, Stretch, BorderBox) already matches `display: block` (or `display: flex; flex-direction: column`) behavior very well.

#### `<span>` -- Inline element (see Section 6 for workarounds)
```c
// Yoga does not support true inline layout.
// Workaround: treat <span> inside text as part of a text measurement,
// not as a separate Yoga node. See Section 6.
```

#### `<p>` -- Paragraph (text container)
```c
// Same as <div> but typically a leaf node with a measure function
// for text content measurement via Core Text / UIKit.
YGNodeSetMeasureFunc(node, textMeasureFunc);
YGNodeSetNodeType(node, YGNodeTypeText);
```

#### `<img>` -- Replaced element
```c
// Leaf node with known intrinsic dimensions.
// Set width/height from the image's natural size or style props.
YGNodeStyleSetWidth(node, imageWidth);
YGNodeStyleSetHeight(node, imageHeight);
```

#### `<button>`, `<input>` -- Form elements
```c
// Leaf nodes with measure functions for native control sizing.
YGNodeSetMeasureFunc(node, nativeControlMeasureFunc);
```

#### Summary: Our Defaults vs Yoga Defaults vs CSS Defaults

| Property | Yoga Default | CSS Default | Our `<div>` Default | Delta from Yoga |
|---|---|---|---|---|
| flexDirection | Column | row | **Column** | None |
| alignItems | Stretch | stretch | **Stretch** | None |
| alignContent | FlexStart | stretch | **FlexStart** | None (block doesn't wrap) |
| flexShrink | 0.0 | 1 | **0.0** | None (block elements don't shrink) |
| positionType | Relative | static | **Relative** | None (closest equivalent) |
| boxSizing | BorderBox | content-box | **BorderBox** | None (modern CSS resets use border-box) |
| overflow | Visible | visible | **Visible** | None |
| display | Flex | block | **Flex** | None (Yoga only has Flex/None/Contents) |
| flexBasis | auto | auto | **auto** | None |

Conclusion: **Yoga's defaults are almost perfectly suited for `<div>`-like block layout without any changes.** No need to enable `useWebDefaults`, which would switch to row direction.

### 4.3 Config Setup Code (C)

```c
YGConfigRef config = YGConfigNew();
// Do NOT enable web defaults -- Yoga's column default matches <div>
// YGConfigSetUseWebDefaults(config, true);  // DON'T do this

// Set point scale factor for the device
YGConfigSetPointScaleFactor(config, UIScreen.mainScreen.scale);  // 2.0 or 3.0

// Use latest W3C conformance (no legacy errata)
YGConfigSetErrata(config, YGErrataNone);

// Create nodes using this config
YGNodeRef root = YGNodeNewWithConfig(config);
```

---

## 5. React Native's Yoga Integration Pattern

### 5.1 How YGNode Maps to Native Views

In React Native (Fabric), every `ShadowNode` has a corresponding `yoga::Node`. The architecture:

1. **ShadowNode creation** -- A `YogaLayoutableShadowNode` is created with an embedded `yogaNode_` member. The ShadowNode pointer is stored as the Yoga node's context via `YGNodeSetContext(&yogaNode_, this)`.

2. **Style application** -- When React props change, `updateYogaProps()` translates React style props into Yoga style calls (e.g., `YGNodeStyleSetFlexDirection`, `YGNodeStyleSetWidth`).

3. **Tree building** -- When children change, `updateYogaChildren()` syncs the Yoga node tree to match the React element tree using `YGNodeInsertChild`/`YGNodeRemoveChild`.

4. **Layout calculation** -- Layout is triggered by calling `YGNodeCalculateLayout` on the root node with available width/height and direction.

5. **Reading results** -- After layout, results are read using `layoutMetricsFromYogaNode()`:
```cpp
layoutMetrics.frame = Rect{
    .origin = Point{
        .x = YGNodeLayoutGetLeft(&yogaNode),
        .y = YGNodeLayoutGetTop(&yogaNode)
    },
    .size = Size{
        .width = YGNodeLayoutGetWidth(&yogaNode),
        .height = YGNodeLayoutGetHeight(&yogaNode)
    }
};
```

6. **Applying to native views** -- The `LayoutMetrics` (frame, padding, border) are sent to the native view layer, which sets `UIView.frame` or equivalent.

### 5.2 Measure Functions for Text

React Native uses `YGNodeSetMeasureFunc` for text nodes (`ParagraphShadowNode`). The measure function:
- Receives constraints (width, widthMode, height, heightMode)
- Uses the platform's text layout engine (Core Text on iOS, Android's StaticLayout on Android)
- Returns the measured `YGSize { width, height }`
- The Yoga node must be a leaf (cannot have children and a measure function simultaneously)
- Setting a measure function auto-sets `YGNodeTypeText`

### 5.3 Key Pattern: Context Pointer

Yoga nodes carry a `void* context` that maps back to the application's node object:
```c
YGNodeSetContext(yogaNode, myAppNode);
// Later, in measure callback:
MyAppNode* appNode = (MyAppNode*)YGNodeGetContext(node);
```

This is the primary mechanism for connecting Yoga's layout tree to the application's view tree.

---

## 6. Inline Text Limitation and Workaround

### 6.1 The Problem

Yoga implements CSS Flexbox, not CSS inline layout. There is no `display: inline` or `display: inline-block`. The `YGDisplay` enum only has:
- `Flex` -- flex container
- `None` -- hidden
- `Contents` -- transparent container (children participate in parent's layout)

This means `<span>` elements cannot flow inline alongside text in the normal CSS sense.

### 6.2 Proposed Workaround: Attributed String Model

The approach React Native uses (and we should adopt):

1. **Text is measured as a unit.** A `<p>` or text-containing element becomes a Yoga leaf node with a `YGMeasureFunc`.

2. **Inline spans become attributed string ranges.** Instead of creating separate Yoga nodes for `<span>` inside text, we:
   - Walk the React element tree for the text subtree
   - Build an `NSAttributedString` where each `<span>` becomes a range with its own attributes (font, color, etc.)
   - The `YGMeasureFunc` measures this entire attributed string using Core Text (`CTFramesetterSuggestFrameSizeWithConstraints`) or UIKit (`NSAttributedString.boundingRect`)

3. **No Yoga node for inline elements.** `<span>` inside a `<p>` does not create a Yoga node. It only affects text attributes.

4. **Block-level spans get Yoga nodes.** If a `<span>` is a direct child of a `<div>` (not inside text), it gets a normal Yoga node styled as a flex item.

### 6.3 Architecture

```
<div>                    --> YGNode (flexDirection: column)
  <p>                    --> YGNode (leaf, measureFunc for text)
    Hello                --> part of NSAttributedString
    <span>world</span>   --> range in NSAttributedString (bold, color, etc.)
  </p>
  <span>standalone</span> --> YGNode (treated as a <div>-like flex item)
</div>
```

### 6.4 Implementation Notes

- **Context detection:** When creating a `<span>`, check if the parent is a text container (`<p>`, another `<span>` inside text, etc.). If so, do not create a Yoga node; instead, append to the parent's attributed string.
- **Rich text:** `<strong>`, `<em>`, `<a>` inside text all follow the same pattern -- they become attributed string ranges, not Yoga nodes.
- **Nested views in text:** React Native supports `<View>` inside `<Text>` as "inline views". These use special `NSTextAttachment` or placeholder characters in the attributed string, with their size determined by a nested Yoga layout. We may want to support this eventually.

---

## 7. iOS Integration Guide

### 7.1 Source Inclusion Strategy

**Recommended approach: Direct C++ source compilation.**

Yoga is pure C++ with no external dependencies (except `<android/log>` on Android, which we skip). The simplest approach is to include the Yoga source files directly in our Xcode project.

Source files needed (from `../react-native/packages/react-native/ReactCommon/yoga/yoga/`):
```
yoga/*.cpp
yoga/*.h
yoga/**/*.cpp
yoga/**/*.h
```

Subdirectories:
- `algorithm/` -- Layout algorithm implementation
- `config/` -- Config class
- `debug/` -- Debug/assert utilities
- `enums/` -- C++ enum wrappers
- `event/` -- Event callbacks
- `node/` -- Node class implementation
- `numeric/` -- Float comparison utilities
- `style/` -- Style class and value types

### 7.2 Build Configuration

**Compiler requirements:**
- C++20 (`-std=c++20`)
- Exceptions enabled (`-fexceptions`)
- Frame pointers (`-fno-omit-frame-pointer`)
- PIC (`-fPIC`)

**Header search path:**
The parent directory of `yoga/` must be in the header search path so that `#include <yoga/Yoga.h>` resolves correctly.

### 7.3 Option A: Xcode Static Library Target

1. Create a new static library target `YogaCore` in Xcode.
2. Add all `.cpp` and `.h` files from the Yoga source directory.
3. Set Header Search Paths to include the parent of the `yoga/` directory.
4. Set C++ Language Dialect to C++20.
5. Build produces `libYogaCore.a`.
6. Link this library into the main app target.

### 7.4 Option B: CocoaPods

Use the existing `Yoga.podspec` from React Native:
```ruby
pod 'Yoga', :path => '../react-native/packages/react-native/ReactCommon/yoga'
```

This handles source compilation, header paths, and compiler flags automatically.

### 7.5 Option C: Swift Package Manager

Create a `Package.swift` wrapping the Yoga C++ source:
```swift
// Package.swift
let package = Package(
    name: "Yoga",
    products: [.library(name: "Yoga", targets: ["Yoga"])],
    targets: [
        .target(
            name: "Yoga",
            path: "yoga",
            sources: ["yoga"],
            publicHeadersPath: "yoga",
            cxxSettings: [
                .headerSearchPath("."),
                .define("YG_EXPORT", to: ""),
            ]
        )
    ],
    cxxLanguageStandard: .cxx20
)
```

### 7.6 Swift Interop via Bridging Header

Since Yoga exposes a C API (via `YG_EXTERN_C_BEGIN/END`), Swift can call it directly through a bridging header:

```c
// BridgingHeader.h
#include "yoga/Yoga.h"
```

Swift usage:
```swift
// Create config
let config = YGConfigNew()!
YGConfigSetPointScaleFactor(config, Float(UIScreen.main.scale))

// Create root node
let root = YGNodeNewWithConfig(config)!
YGNodeStyleSetFlexDirection(root, YGFlexDirectionColumn)
YGNodeStyleSetWidth(root, Float(UIScreen.main.bounds.width))
YGNodeStyleSetHeight(root, Float(UIScreen.main.bounds.height))

// Create child
let child = YGNodeNewWithConfig(config)!
YGNodeStyleSetHeight(child, 100)
YGNodeStyleSetWidthPercent(child, 100)
YGNodeInsertChild(root, child, 0)

// Calculate layout
YGNodeCalculateLayout(root, YGUndefined, YGUndefined, YGDirectionLTR)

// Read results
let childX = YGNodeLayoutGetLeft(child)
let childY = YGNodeLayoutGetTop(child)
let childW = YGNodeLayoutGetWidth(child)
let childH = YGNodeLayoutGetHeight(child)

// Apply to UIView
myView.frame = CGRect(x: CGFloat(childX), y: CGFloat(childY),
                       width: CGFloat(childW), height: CGFloat(childH))

// Cleanup
YGNodeFreeRecursive(root)
YGConfigFree(config)
```

### 7.7 C Interop via JS Engine (Alternative Path)

If the JS engine (JavaScriptCore or Hermes) runs in the same process, Yoga layout can also be driven from JavaScript. In this case:

1. **JS-side Yoga wrapper** -- A JavaScript module wraps the Yoga C API, exposed through the JS-native bridge.
2. **Bridge calls** -- `createNode()`, `setStyle()`, `calculateLayout()`, `getLayout()` are bridge functions.
3. **Layout results** -- JS reads layout results and sends `updateView(viewId, {frame: ...})` commands to Swift.

This is closer to the React Native architecture. However, for react-dom-native we may prefer driving Yoga from Swift for lower latency.

---

## 8. Key Differences: Yoga Defaults vs CSS Defaults

| Aspect | Yoga Default | CSS Default | Impact |
|---|---|---|---|
| **flexDirection** | column | row | Works for us (`<div>` is column) |
| **flexShrink** | 0 | 1 | Block elements don't shrink -- good for us |
| **positionType** | relative | static | Close enough; relative = static + offset support |
| **boxSizing** | border-box | content-box | Modern CSS uses border-box anyway |
| **display** | flex | block | No true block layout, but flex-column is equivalent |
| **alignContent** | flex-start | stretch | Only matters with wrapping; flex-start is fine for column |
| **inline layout** | Not supported | Core feature | Must use attributed string workaround (Section 6) |

---

## 9. YGValue Structure

```c
typedef struct YGValue {
    float value;
    YGUnit unit;
} YGValue;
```

Constants:
- `YGValueAuto` -- auto sizing
- `YGValueUndefined` -- not set
- `YGValueZero` -- zero

`YGUndefined` is `NaN` (`std::numeric_limits<float>::quiet_NaN()`).

---

## 10. Recommendations for react-dom-native

1. **Do NOT enable `useWebDefaults`.** Yoga's column-first default matches `<div>` behavior perfectly.

2. **Set `pointScaleFactor`** to `UIScreen.main.scale` (2.0 or 3.0) for proper pixel-snapping.

3. **Use `YGErrataNone`** for full W3C conformance (no legacy React Native compatibility needed).

4. **Use `YGBoxSizingBorderBox`** (the default) -- matches the universal `* { box-sizing: border-box }` CSS reset.

5. **Text measurement** -- Implement `YGMeasureFunc` using Core Text or UIKit's `NSAttributedString` measurement APIs.

6. **Inline text** -- Do not create Yoga nodes for `<span>` inside text containers. Instead, build `NSAttributedString` ranges.

7. **Integration path** -- Use CocoaPods or direct source inclusion. Avoid building a dynamic framework (unnecessary overhead for a layout engine).

8. **Single config instance** -- Create one `YGConfigRef` for the entire app, shared across all nodes. Set it up once at startup.

9. **Maintain node-view mapping** -- Use `YGNodeSetContext` to store a reference back to the native view (or a view ID), enabling efficient layout result application.

10. **Incremental layout** -- Use `YGNodeGetHasNewLayout` + `YGNodeSetHasNewLayout(false)` to only update views whose layout actually changed.
