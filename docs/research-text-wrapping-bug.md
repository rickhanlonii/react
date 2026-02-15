# Research: Text Wrapping Bug in `<p>` Elements

## Executive Summary

Text inside `<p>` elements renders as a single truncated line with "..." instead of wrapping. The confirmed root cause is that Yoga's `useWebDefaults` sets `flexDirection: row` on the temporary root node in `calculateYogaLayout()`, which causes text to be measured with unlimited width before the container is shrunk — and Yoga never re-measures after shrinking.

This document traces the complete data flow through the Yoga source code with verified evidence.

---

## 1. Symptom

```jsx
<p>This page is rendered by React Server Components on native iOS.</p>
```

**Actual**: `"This page is rendered by React Serv..."` — single line, truncated with "..."

**Expected**: Text wraps to 2 lines within the available width (~353pt after padding)

**Observation**: Short text (h1 "react-dom-native", h2 "Counter", timestamps) renders correctly because it fits on a single line regardless of measurement mode. This bug only manifests when text content exceeds the available width.

---

## 2. Complete Data Flow Trace

### 2.1 Node Creation (JS → Swift)

For `<p>This page is rendered by...</p>`, React's reconciler makes these calls:

**Step 1** — `createInstance("p", {children: "This page is rendered by..."})` (HostConfig.js:65):
```javascript
const {children, ...nativeProps} = props;
// nativeProps = {} (children stripped)
const nativeNode = $$createNode("p", surfaceId, nativeProps, isInsideTextContext, handle);
```

**Step 2** — `$$createNode("p", surfaceId, {}, ...)` (Bindings.swift:127):
```swift
var props = engine.toDictionary(args[2]) ?? [:]  // props = {}
let mergedStyle = ElementDefaults.mergedStyle(for: "p", userStyle: nil)
// mergedStyle = ["flexDirection": "column", "fontSize": 16]  (ElementDefaults.swift:97-100)
props["style"] = mergedStyle

let node = ShadowNodeWrapper(props: props, ...)
// ShadowNodeWrapper.init creates: YGNodeNewWithConfig(YogaConfig.shared)
// → Node constructor calls useWebDefaults() → flexDirection: row

YogaStyleApplier.apply(mergedStyle, to: node.yogaNode)
// → YGNodeStyleSetFlexDirection(node, .column) — overrides web default
```

**Step 3** — `shouldSetTextContent` returns `false` (HostConfig.js:129-131), so React creates a separate text instance:
```javascript
createTextInstance("This page is rendered by React Server Components on native iOS.", ...)
```

**Step 4** — `$$createTextNode(text, surfaceId, handle)` (Bindings.swift:169):
```swift
let node = ShadowNodeWrapper(props: ["text": text], ..., text: text)
YogaTextMeasure.setupMeasureFunc(on: node)
// → YGNodeSetMeasureFunc(node.yogaNode, textMeasureFunc)
// → Measure function registered with fontSize: 16 (default)
```

**Step 5** — `appendInitialChild(pInstance, textInstance)` → `$$appendChild(pId, textId)` (Bindings.swift:269):
```swift
parent.children.append(child)
YGNodeInsertChild(parent.yogaNode, child.yogaNode, 0)

// Font size inheritance: detects #text child, reads fontSize from parent style
if child.family.elementType == "#text",
   let style = parent.props["style"] as? [String: Any],
   let fontSize = style["fontSize"] as? NSNumber {
    // Re-creates measure context with parent's fontSize (16)
    YogaTextMeasure.setupMeasureFunc(on: child, fontSize: 16)
}
```

### 2.2 The Yoga Tree at Layout Time

When `$$completeRoot` runs (Bindings.swift:320), `calculateYogaLayout` receives this tree:

```
rootDiv (column, padding=20, gap=16)
  ├── h1 (column, fontSize=32, fontWeight=bold)
  │   └── #text "react-dom-native"  [measure func, fontSize=32]
  ├── p (column, fontSize=16)
  │   └── #text "This page is rendered by..."  [measure func, fontSize=16]
  ├── div (column, gap=12)
  │   ├── h2 ...
  │   └── Counter children...
  ├── div (column, gap=12)
  │   ├── h2 ...
  │   └── TextInput children...
  └── p (column, fontSize=12, color=#888)
      └── #text "Rendered at..."  [measure func, fontSize=12]
```

### 2.3 The Temporary Root Node — Where the Bug Lives

`calculateYogaLayout` (Bindings.swift:408-438):

```swift
let rootNode = YGNodeNewWithConfig(YogaConfig.shared)!    // ← BUG IS HERE
YGNodeStyleSetWidth(rootNode, Float(bounds.width))         // 393
YGNodeStyleSetHeight(rootNode, Float(bounds.height))       // 852
// ... insert children ...
YGNodeCalculateLayout(rootNode, Float(bounds.width), Float(bounds.height), .LTR)
```

---

## 3. Root Cause: Confirmed via Yoga Source Code

### 3.1 `YGNodeNewWithConfig` sets `flexDirection: row`

The Yoga source is bundled at `packages/react-dom-native/ios/Sources/Yoga/`.

**Node.cpp:22-29** — Node constructor:
```cpp
Node::Node(const yoga::Config* config) : config_{config} {
  yoga::assertFatal(
      config != nullptr, "Attempting to construct Node with null config");

  if (config->useWebDefaults()) {
    useWebDefaults();               // ← CALLED when config has web defaults
  }
}
```

**Node.h:306-309** — `useWebDefaults()` method:
```cpp
void useWebDefaults() {
  style_.setFlexDirection(FlexDirection::Row);    // ← sets ROW
  style_.setAlignContent(Align::Stretch);
}
```

**Style.h:727-728** — Built-in default (before override):
```cpp
FlexDirection flexDirection_
    : bitCount<FlexDirection>() = FlexDirection::Column;  // ← Yoga default is COLUMN
```

**Conclusion**: Since `YogaConfig.shared` has `useWebDefaults = true` (YogaConfig.swift:5), the temp root node gets `flexDirection: row`.

### 3.2 `flexShrink` defaults to 1.0 with web defaults

**Node.cpp:440-453** — `resolveFlexShrink()`:
```cpp
float Node::resolveFlexShrink() const {
  if (owner_ == nullptr) {
    return 0.0;  // Root nodes never shrink
  }
  // ...
  return config_->useWebDefaults() ? Style::WebDefaultFlexShrink  // 1.0f
                                   : Style::DefaultFlexShrink;    // 0.0f
}
```

The root `<div>` is NOT the root of the Yoga tree (the temp node is), so it has `flexShrink: 1.0`.

### 3.3 The Failure Cascade

With the temp root as `flexDirection: row`:

```
Step 1: Temp root is ROW, width=393
        Main axis = horizontal, cross axis = vertical

Step 2: Root <div> has no explicit width
        Its main-axis (horizontal) size must be determined by content
        Yoga runs a MaxContent pass: "how wide is your content?"

Step 3: To answer, Yoga lays out rootDiv's children (column layout)
        But rootDiv's WIDTH is not yet known — it's being measured
        Children get widthMode = UNDEFINED (no constraint)

Step 4: #text measure function called with:
        width = NaN, widthMode = .undefined
        → maxWidth = .greatestFiniteMagnitude (unlimited)
        → NSString.boundingRect returns single-line rect
        → Returns: (width ≈ 490, height ≈ 19)

Step 5: rootDiv content width = max child width ≈ 490
        Temp root width = 393, rootDiv overflows by ~97pt
        rootDiv has flexShrink: 1 → shrinks to 393

Step 6: CRITICAL — Yoga does NOT re-call the measure function
        after shrinking. The #text node retains:
        width ≈ 490 (or gets clamped to ~353 after padding)
        height ≈ 19 (STALE — single-line height)

Step 7: <p> height = #text height ≈ 19 (single line)
        #text UILabel frame ≈ (0, 0, 353, 19)
        UILabel tries to render 2 lines of text in 19pt height
        → Truncates with "..."
```

### 3.4 Why Yoga Doesn't Re-Measure After Shrinking

Yoga's flex shrinking (CalculateLayout.cpp:845-874) adjusts the main-axis size of overflow items. After computing the shrunk sizes, Yoga updates the item dimensions but treats the shrinking as a **size constraint**, not a **content reflow trigger**. Leaf nodes with measure functions are not re-measured because Yoga assumes the content doesn't change shape when the container shrinks.

This is correct for most content (images, fixed-size widgets) but incorrect for text, which reflows and changes height when width changes.

---

## 4. Why `flexDirection: column` on the Temp Root is the Correct Fix

Setting `flexDirection: column` fundamentally changes how Yoga constrains the root `<div>`:

```
WITH COLUMN:

Step 1: Temp root is COLUMN, width=393
        Main axis = vertical, cross axis = horizontal

Step 2: Root <div> is in the cross axis (horizontal)
        alignItems: stretch (Yoga default) → width = 393
        Width is known BEFORE content measurement!

Step 3: rootDiv lays out its children with width=393
        Inner width = 393 - 40 (padding) = 353
        Children get widthMode = EXACTLY (from stretch)

Step 4: #text measure function called with:
        width = 353, widthMode = .exactly
        → maxWidth = 353
        → NSString.boundingRect wraps text in 353pt → 2 lines
        → Returns: (width = 353, height ≈ 38)

Step 5: <p> height = #text height ≈ 38 (two lines)
        #text UILabel frame ≈ (0, 0, 353, 38)
        UILabel renders 2 lines — no truncation
```

The key difference: with **column**, the width constraint propagates **before** measurement (via cross-axis stretch). With **row**, the width is determined **after** measurement (via content sizing then shrinking), and Yoga never re-measures.

### 4.1 Yoga Source Confirmation of Stretch Behavior

**CalculateLayout.cpp:189-206** — Cross-axis stretch for column parents:
```cpp
const bool hasExactWidth =
    yoga::isDefined(width) && widthMode == SizingMode::StretchFit;
const bool childWidthStretch =
    resolveChildAlignment(node, child) == Align::Stretch &&
    childWidthSizingMode != SizingMode::StretchFit;
if (!isMainAxisRow && !isRowStyleDimDefined && hasExactWidth &&
    childWidthStretch) {
  childWidth = width;
  childWidthSizingMode = SizingMode::StretchFit;  // → MeasureMode::Exactly
```

This code runs BEFORE the measure function is called. When:
- Parent is column (`!isMainAxisRow` = true)
- Child has no explicit width (`!isRowStyleDimDefined` = true)
- Parent has exact width (`hasExactWidth` = true, from parent stretch)
- Child alignment is stretch (`childWidthStretch` = true, from default `alignItems: stretch`)

→ Child gets `widthMode = .exactly` with parent's inner width.

This propagates all the way down: temp root → rootDiv → `<p>` → `#text`.

### 4.2 Why Column is Semantically Correct

The temp root represents the iOS screen/viewport:
- HTML documents flow top-to-bottom (block layout = column)
- The viewport constrains horizontally and grows vertically
- React Native's Fabric uses `flexDirection: column` for its root surface
- The `flexDirection: row` from `useWebDefaults` is the CSS **flex container** default, but a viewport is a **block formatting context**, not a flex container

---

## 5. Hypotheses Considered and Ruled Out

| # | Hypothesis | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | `<p>` UILabel has text set directly | Ruled out | `shouldSetTextContent` returns `false` (HostConfig.js:129). `children` stripped in `createInstance` (HostConfig.js:77). Swift-side `props["children"]` is nil. |
| 2 | `clipsToBounds = true` on `<p>` | Ruled out | UILabel default is `false`. Only set for `overflow: "hidden"` (UIKitMutationApplier.swift:198-206). Not in `<p>` defaults. |
| 3 | Font mismatch between measure and render | Ruled out | Both use `UIFont.systemFont(ofSize: 16)`. Measure uses it directly; UILabel gets it via `resolveFont(style: pStyle, elementType: "p")` which resolves to the same font. |
| 4 | `NSString.boundingRect` returns wrong height | Unlikely | Standard API with `.usesLineFragmentOrigin` + `.usesFontLeading`. Result is `ceil()`'d. Widely used in production. |
| 5 | Frame modified after Yoga calculation | Ruled out | `readYogaLayout` sets `layoutFrame`, CREATE mutation sets `view.frame = node.layoutFrame`. No subsequent modification on first render. |
| 6 | `useWebDefaults` doesn't set `flexDirection: row` | **Disproved** | Yoga Node constructor (Node.cpp:26-28) explicitly calls `useWebDefaults()` which sets `FlexDirection::Row` (Node.h:307). |
| 7 | `<p>` Yoga node has wrong flexDirection | Ruled out | `pDefaults` = `["flexDirection": "column"]` (ElementDefaults.swift:97). YogaStyleApplier maps `"column"` → `.column` (YogaStyleApplier.swift:19). Applied in `$$createNode`. |
| 8 | Persistent mode tree structure issues | Ruled out | First render uses `createInstance` + `appendInitialChild` (no cloning). `$$appendChild` correctly wires Yoga children. |
| 9 | `YGConfigSetPointScaleFactor(0)` rounding | Ruled out | Value 0 = no rounding. Measure function uses `ceil()`. No precision loss for typical text heights. |
| 10 | UILabel as container clips subviews | Ruled out | UILabel inherits UIView's subview management. `clipsToBounds` defaults to `false`. `<p>` UILabel has no text, only a `#text` subview. |
| 11 | `alignItems: stretch` skips measure-func nodes | **Disproved** | CalculateLayout.cpp:189-206 sets `SizingMode::StretchFit` for children regardless of whether they have measure functions. The measure function then receives `widthMode = .exactly`. |
| 12 | `flexShrink` on `#text` causes incorrect sizing | Ruled out | `flexShrink` only applies to main-axis sizing. For `#text` in a column parent (`<p>`), main axis is vertical. `flexShrink` doesn't affect cross-axis (width) stretch. |

---

## 6. Diagnostic Code for Verification

If the fix is applied and the issue persists, add these diagnostics to pinpoint where the width constraint is lost.

### 6.1 Text Measure Function (YogaTextMeasure.swift)

Add at the top of `textMeasureFunc` (after getting the context, around line 79):
```swift
let modeStr: String
switch widthMode {
case .exactly: modeStr = "exactly"
case .atMost: modeStr = "atMost"
default: modeStr = "undefined"
}
print("[TextMeasure] '\(context.text.prefix(40))' w=\(width) mode=\(modeStr) fontSize=\(context.fontSize)")
```

And at the bottom (before the return, around line 124):
```swift
print("[TextMeasure]  → result: \(measuredWidth) x \(measuredHeight)")
```

**Expected output WITH fix:**
```
[TextMeasure] 'This page is rendered by React Server C' w=353.0 mode=exactly fontSize=16.0
[TextMeasure]  → result: 353.0 x 38.0
```

**Expected output WITHOUT fix:**
```
[TextMeasure] 'This page is rendered by React Server C' w=nan mode=undefined fontSize=16.0
[TextMeasure]  → result: 490.0 x 19.0
```

### 6.2 Layout Results (Bindings.swift)

Add after `readYogaLayout` in `calculateYogaLayout` (after line 431):
```swift
func printLayoutTree(_ node: ShadowNodeWrapper, depth: Int = 0) {
    let indent = String(repeating: "  ", count: depth)
    let f = node.layoutFrame
    print("\(indent)\(node.family.elementType): (\(f.origin.x), \(f.origin.y), \(f.width), \(f.height))")
    for child in node.children {
        printLayoutTree(child, depth: depth + 1)
    }
}
for child in children {
    printLayoutTree(child)
}
```

### 6.3 Temp Root FlexDirection (Bindings.swift)

Add after creating the temp root (after line 412):
```swift
let fd = YGNodeStyleGetFlexDirection(rootNode)
print("[Layout] Temp root flexDirection: \(fd.rawValue)")
// 0 = column, 2 = row
```

---

## 7. The Fix

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

```swift
// In calculateYogaLayout(), after creating the temp root:
let rootNode = YGNodeNewWithConfig(YogaConfig.shared)!
YGNodeStyleSetFlexDirection(rootNode, .column)    // ← Override web default (row → column)
YGNodeStyleSetWidth(rootNode, Float(bounds.width))
YGNodeStyleSetHeight(rootNode, Float(bounds.height))
```

**Important**: This is a Swift source change. The app must be **rebuilt via Xcode** (or `build_run_sim`). The dev server only reloads JS bundle changes. Swift changes require recompilation.

### Alternative Fix: Explicit Width on Root Children

If the column fix doesn't work for unexpected reasons, an alternative is to explicitly set the width on root-level children before layout calculation:

```swift
// In calculateYogaLayout(), after inserting children into temp root:
for child in children {
    // Only set width if child doesn't already have an explicit width
    if YGNodeStyleGetWidth(child.yogaNode).unit == .undefined {
        YGNodeStyleSetWidth(child.yogaNode, Float(bounds.width))
    }
}
```

This bypasses the stretch mechanism entirely and forces the root `<div>` to have the screen width before Yoga runs, ensuring width propagation happens before any text measurement.

---

## 8. React Native Comparison

React Native's Fabric renderer uses a persistent root Yoga node per surface with `flexDirection: column` and the screen dimensions as width/height. This matches the column fix approach. The root surface node is created once and reused across renders, unlike the temporary root node in this project.

Reference: React Native sets up the root surface constraints in `SurfaceHandler.cpp`, ensuring the root always has column direction and explicit dimensions before layout calculation.
