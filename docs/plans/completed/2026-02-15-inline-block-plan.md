# Display: inline-block Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `display: inline-block` to Yoga so inline-block elements shrink-to-fit and flow horizontally, then set it as default for form controls and replaced elements.

**Architecture:** Add a new `Display::InlineBlock` enum to Yoga's C++ layer. Modify `calculateBlockLayout` to handle inline-block children with line-based horizontal flow (measure with shrink-to-fit, accumulate on lines, wrap when overflow). Wire through Swift style applier and element defaults.

**Tech Stack:** Yoga C++ (layout engine), Swift (style applier + element defaults), JS (Fantom integration tests)

**Design doc:** `docs/plans/2026-02-15-inline-block-design.md`

---

### Task 1: Add `YGDisplayInlineBlock` to Yoga C++ enums

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/Yoga/include/yoga/YGEnums.h:43-48`
- Modify: `packages/react-dom-native/ios/Sources/Yoga/yoga/enums/Display.h:18-23`
- Modify: `packages/react-dom-native/ios/Sources/Yoga/yoga/YGEnums.cpp:68-80`

**Step 1: Add enum value to `YGEnums.h`**

In `include/yoga/YGEnums.h`, add `YGDisplayInlineBlock` after `YGDisplayBlock`:

```c
YG_ENUM_DECL(
    YGDisplay,
    YGDisplayFlex,
    YGDisplayNone,
    YGDisplayContents,
    YGDisplayBlock,
    YGDisplayInlineBlock)
```

**Step 2: Add enum value to `Display.h`**

In `yoga/enums/Display.h`, add `InlineBlock` to the C++ enum and bump ordinal count:

```cpp
enum class Display : uint8_t {
  Flex = YGDisplayFlex,
  None = YGDisplayNone,
  Contents = YGDisplayContents,
  Block = YGDisplayBlock,
  InlineBlock = YGDisplayInlineBlock,
};

template <>
constexpr int32_t ordinalCount<Display>() {
  return 5;
}
```

**Step 3: Add toString case to `YGEnums.cpp`**

In `yoga/YGEnums.cpp`, add the `YGDisplayInlineBlock` case to `YGDisplayToString`:

```cpp
const char* YGDisplayToString(const YGDisplay value) {
  switch (value) {
    case YGDisplayFlex:
      return "flex";
    case YGDisplayNone:
      return "none";
    case YGDisplayContents:
      return "contents";
    case YGDisplayBlock:
      return "block";
    case YGDisplayInlineBlock:
      return "inline-block";
  }
  return "unknown";
}
```

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/Yoga/
git commit -m "feat(yoga): add Display::InlineBlock enum value"
```

---

### Task 2: Add `"inline-block"` case to `YogaStyleApplier.swift`

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift:199-210`

**Step 1: Add the case**

In `YogaStyleApplier.swift`, add `"inline-block"` to the display switch (after the `"block"` case):

```swift
        // display
        if let display = style["display"] as? String {
            switch display {
            case "flex":
                YGNodeStyleSetDisplay(node, .flex)
            case "none":
                YGNodeStyleSetDisplay(node, .none)
            case "block":
                YGNodeStyleSetDisplay(node, .block)
            case "inline-block":
                YGNodeStyleSetDisplay(node, .inlineBlock)
            default: break
            }
        }
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift
git commit -m "feat(style): add inline-block case to YogaStyleApplier"
```

---

### Task 3: Write failing tests for inline-block layout behavior

**Files:**
- Create: `tests/integration/inline-block-layout-itest.js`

Tests use the Fantom test harness. The root surface is 390×844. `Fantom.getRenderedOutput()` returns a JSON tree where each node has `{ type, props, frame: { x, y, width, height }, children }`.

**Step 1: Write the test file**

```js
'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Inline-block layout', function () {
  it('inline-block child shrinks to fit content width', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 100, height: 50}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child = parent.children[0];
    // inline-block with explicit width: uses that width, not parent's 300
    expect(child.frame.width).toBe(100);
    expect(child.frame.height).toBe(50);
  });

  it('multiple inline-block children flow horizontally on the same line', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 80, height: 40}} />
          <div style={{display: 'inline-block', width: 80, height: 40}} />
          <div style={{display: 'inline-block', width: 80, height: 40}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    var child3 = parent.children[2];
    // All three fit on one line (80+80+80=240 < 300)
    expect(child1.frame.x).toBe(0);
    expect(child1.frame.y).toBe(0);
    expect(child2.frame.x).toBe(80);
    expect(child2.frame.y).toBe(0);
    expect(child3.frame.x).toBe(160);
    expect(child3.frame.y).toBe(0);
  });

  it('inline-block children wrap to next line when overflowing', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 200}}>
          <div style={{display: 'inline-block', width: 120, height: 40}} />
          <div style={{display: 'inline-block', width: 120, height: 40}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    // First fits, second wraps (120+120=240 > 200)
    expect(child1.frame.x).toBe(0);
    expect(child1.frame.y).toBe(0);
    expect(child2.frame.x).toBe(0);
    expect(child2.frame.y).toBe(40);
  });

  it('inline-block does not participate in margin collapsing', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div style={{height: 50, marginBottom: 20}} />
          <div style={{display: 'inline-block', width: 80, height: 30, marginTop: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child2 = parent.children[1];
    // No margin collapsing: 50 + 20 + 30 = 100 (not 50 + 30 = 80)
    expect(child2.frame.y).toBe(100);
  });

  it('block child after inline-block starts on new line', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 80, height: 40}} />
          <div style={{height: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var inlineChild = parent.children[0];
    var blockChild = parent.children[1];
    // Block child flushes the inline line and starts below
    expect(inlineChild.frame.x).toBe(0);
    expect(inlineChild.frame.y).toBe(0);
    expect(blockChild.frame.y).toBe(40);
    // Block child stretches to full width
    expect(blockChild.frame.width).toBe(300);
  });

  it('inline-block children with different heights align to line top', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 80, height: 60}} />
          <div style={{display: 'inline-block', width: 80, height: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    // Both start at same Y (top-aligned)
    expect(child1.frame.y).toBe(0);
    expect(child2.frame.y).toBe(0);
    // Parent height is tallest child
    expect(parent.frame.height).toBe(60);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:fantom -- --testPathPattern inline-block`

Expected: All 6 tests FAIL (inline-block display value not yet handled in layout algorithm).

**Step 3: Commit**

```bash
git add tests/integration/inline-block-layout-itest.js
git commit -m "test: add failing inline-block layout tests"
```

---

### Task 4: Implement inline-block line flow in `calculateBlockLayout`

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/Yoga/yoga/algorithm/CalculateLayout.cpp:1172-1417`

This is the core change. The existing `calculateBlockLayout` iterates children in a single pass, stacking them vertically. We need to add line-based horizontal flow for `Display::InlineBlock` children.

**Step 1: Implement the algorithm**

The modified `calculateBlockLayout` function needs to handle two kinds of children:

1. **Block children** (existing behavior): flush any pending inline line, then lay out the block child with full-width stretch and margin collapsing.
2. **Inline-block children** (new): measure with shrink-to-fit width (`SizingMode::MaxContent`), accumulate on the current line, wrap to next line when overflow. No margin collapsing.

Replace the child loop (lines 1228-1357) and container height calculation (lines 1359-1397) with:

```cpp
  float currentY = paddingTop + borderTop;
  float prevMarginBottom = 0.0f;
  bool isFirstChild = true;
  float maxChildWidth = 0.0f;

  // Inline line accumulator for inline-block children
  struct InlineItem {
    yoga::Node* node;
    float width;
    float height;
    float marginLeft;
    float marginRight;
    float marginTop;
    float marginBottom;
  };
  std::vector<InlineItem> currentLine;
  float currentLineWidth = 0.0f;

  // Helper: flush the current inline line — position items left-to-right,
  // advance currentY by line height.
  auto flushInlineLine = [&]() {
    if (currentLine.empty()) return;

    // Find tallest item (including margins) for line height
    float lineHeight = 0.0f;
    for (const auto& item : currentLine) {
      float itemTotalHeight = item.marginTop + item.height + item.marginBottom;
      lineHeight = yoga::maxOrDefined(lineHeight, itemTotalHeight);
    }

    if (performLayout) {
      float lineX = paddingStart + borderStart;
      for (const auto& item : currentLine) {
        item.node->setLayoutPosition(currentY + item.marginTop, PhysicalEdge::Top);
        item.node->setLayoutPosition(lineX + item.marginLeft, startEdge);
        lineX += item.marginLeft + item.width + item.marginRight;
      }
    }

    float totalLineWidth = 0.0f;
    for (const auto& item : currentLine) {
      totalLineWidth += item.marginLeft + item.width + item.marginRight;
    }
    maxChildWidth = yoga::maxOrDefined(maxChildWidth, totalLineWidth);

    currentY += lineHeight;
    currentLine.clear();
    currentLineWidth = 0.0f;
    // Reset margin collapsing state — inline-block lines don't collapse
    prevMarginBottom = 0.0f;
    isFirstChild = false;
  };

  for (auto child : node->getLayoutChildren()) {
    child->processDimensions();

    if (child->style().display() == Display::None) {
      zeroOutLayoutRecursively(child);
      child->setHasNewLayout(true);
      child->setDirty(false);
      continue;
    }

    if (child->style().positionType() == PositionType::Absolute) {
      if (performLayout) {
        const Direction childDirection = child->resolveDirection(direction);
        child->setPosition(
            childDirection, availableInnerWidth, availableInnerHeight);
      }
      continue;
    }

    // Resolve child margins
    const float childMarginTop = child->style().computeFlexStartMargin(
        FlexDirection::Column, direction, ownerWidth);
    const float childMarginBottom = child->style().computeFlexEndMargin(
        FlexDirection::Column, direction, ownerWidth);
    const float childMarginLeft = child->style().computeInlineStartMargin(
        flexRow, direction, ownerWidth);
    const float childMarginRight = child->style().computeInlineEndMargin(
        flexRow, direction, ownerWidth);

    if (child->style().display() == Display::InlineBlock) {
      // ── Inline-block: shrink-to-fit, horizontal line flow ──

      // Measure with shrink-to-fit width
      float childWidth;
      SizingMode childWidthMode;

      if (child->hasDefiniteLength(Dimension::Width, availableInnerWidth)) {
        childWidth =
            child->getResolvedDimension(
                direction, Dimension::Width, availableInnerWidth, ownerWidth)
                .unwrap() +
            child->style().computeMarginForAxis(flexRow, ownerWidth);
        childWidthMode = SizingMode::StretchFit;
      } else {
        // Shrink-to-fit: use MaxContent to measure intrinsic width
        childWidth = availableInnerWidth;
        childWidthMode = SizingMode::MaxContent;
      }

      float childHeight = YGUndefined;
      SizingMode childHeightMode = SizingMode::MaxContent;

      if (child->hasDefiniteLength(Dimension::Height, availableInnerHeight)) {
        childHeight =
            child->getResolvedDimension(
                direction, Dimension::Height, availableInnerHeight, ownerWidth)
                .unwrap() +
            child->style().computeMarginForAxis(FlexDirection::Column, ownerWidth);
        childHeightMode = SizingMode::StretchFit;
      }

      constrainMaxSizeForMode(
          child, direction, FlexDirection::Row,
          availableInnerWidth, ownerWidth, &childWidthMode, &childWidth);
      constrainMaxSizeForMode(
          child, direction, FlexDirection::Column,
          availableInnerHeight, ownerWidth, &childHeightMode, &childHeight);

      calculateLayoutInternal(
          child,
          childWidth,
          childHeight,
          direction,
          childWidthMode,
          childHeightMode,
          availableInnerWidth,
          availableInnerHeight,
          performLayout,
          LayoutPassReason::kFlexLayout,
          layoutMarkerData,
          depth + 1,
          generationCount);

      const float measuredWidth =
          child->getLayout().measuredDimension(Dimension::Width);
      const float measuredHeight =
          child->getLayout().measuredDimension(Dimension::Height);

      const float itemTotalWidth = childMarginLeft + measuredWidth + childMarginRight;

      // Flush current line first if adding inline-block after block children
      // had pending margin state — this resets margin context.

      // Check if item fits on current line
      if (!currentLine.empty() &&
          currentLineWidth + itemTotalWidth > availableInnerWidth) {
        flushInlineLine();
      }

      currentLine.push_back({
          child, measuredWidth, measuredHeight,
          childMarginLeft, childMarginRight,
          childMarginTop, childMarginBottom});
      currentLineWidth += itemTotalWidth;

    } else {
      // ── Block child: existing behavior ──

      // Flush any pending inline line before laying out block child
      flushInlineLine();

      const bool leftMarginAuto =
          child->style().flexStartMarginIsAuto(flexRow, direction);
      const bool rightMarginAuto =
          child->style().flexEndMarginIsAuto(flexRow, direction);

      float childWidth;
      SizingMode childWidthMode;

      if (child->hasDefiniteLength(Dimension::Width, availableInnerWidth)) {
        childWidth =
            child->getResolvedDimension(
                direction, Dimension::Width, availableInnerWidth, ownerWidth)
                .unwrap() +
            child->style().computeMarginForAxis(flexRow, ownerWidth);
        childWidthMode = SizingMode::StretchFit;
      } else {
        childWidth = availableInnerWidth +
            child->style().computeMarginForAxis(flexRow, ownerWidth);
        childWidthMode = SizingMode::StretchFit;
      }

      float childHeight = YGUndefined;
      SizingMode childHeightMode = SizingMode::MaxContent;

      if (child->hasDefiniteLength(Dimension::Height, availableInnerHeight)) {
        childHeight =
            child->getResolvedDimension(
                direction, Dimension::Height, availableInnerHeight, ownerWidth)
                .unwrap() +
            child->style().computeMarginForAxis(FlexDirection::Column, ownerWidth);
        childHeightMode = SizingMode::StretchFit;
      }

      constrainMaxSizeForMode(
          child, direction, FlexDirection::Row,
          availableInnerWidth, ownerWidth, &childWidthMode, &childWidth);
      constrainMaxSizeForMode(
          child, direction, FlexDirection::Column,
          availableInnerHeight, ownerWidth, &childHeightMode, &childHeight);

      calculateLayoutInternal(
          child,
          childWidth,
          childHeight,
          direction,
          childWidthMode,
          childHeightMode,
          availableInnerWidth,
          availableInnerHeight,
          performLayout,
          LayoutPassReason::kFlexLayout,
          layoutMarkerData,
          depth + 1,
          generationCount);

      // MARGIN COLLAPSING (sibling) — block children only
      float effectiveMarginGap;
      if (isFirstChild) {
        effectiveMarginGap = childMarginTop;
        isFirstChild = false;
      } else {
        effectiveMarginGap = collapseMargins(prevMarginBottom, childMarginTop);
      }

      if (performLayout) {
        currentY += effectiveMarginGap;

        const float childLayoutWidth =
            child->getLayout().measuredDimension(Dimension::Width);
        const float remainingWidth = availableInnerWidth - childLayoutWidth;
        float childX;

        if (leftMarginAuto && rightMarginAuto) {
          childX = paddingStart + borderStart +
              yoga::maxOrDefined(0.0f, remainingWidth / 2.0f);
        } else if (leftMarginAuto) {
          childX = paddingStart + borderStart +
              yoga::maxOrDefined(0.0f, remainingWidth - childMarginRight);
        } else {
          childX = paddingStart + borderStart + childMarginLeft;
        }

        child->setLayoutPosition(currentY, PhysicalEdge::Top);
        child->setLayoutPosition(childX, startEdge);
      }

      currentY += child->getLayout().measuredDimension(Dimension::Height);
      prevMarginBottom = childMarginBottom;

      maxChildWidth = yoga::maxOrDefined(
          maxChildWidth,
          child->getLayout().measuredDimension(Dimension::Width) +
              childMarginLeft + childMarginRight);
    }
  }

  // Flush any remaining inline line
  flushInlineLine();

  // Add last block child's bottom margin
  if (!isFirstChild && prevMarginBottom != 0.0f) {
    currentY += prevMarginBottom;
  }
```

Also add `#include <vector>` at the top of the file if not already present.

**Step 2: Route `Display::InlineBlock` to `calculateBlockLayout`**

The entry point at line 1592 currently checks `node->style().display() == Display::Block`. Inline-block nodes should NOT enter block layout as *parents* — they create their own formatting context internally (flex by default). The routing is only needed for the *parent* that contains inline-block *children*, and that parent is already a block container. So no routing change is needed — the parent block already calls `calculateBlockLayout`, and the child loop now handles `Display::InlineBlock` children.

However, we need to ensure that an inline-block node that is a child of a **flex** parent (not a block parent) still works. In flex layout, `Display::InlineBlock` should behave like a regular flex item (shrink-to-fit). Since flex items already shrink-to-fit by default, no change is needed for flex parents.

**Step 3: Run tests to verify they pass**

Run: `npm run test:fantom -- --testPathPattern inline-block`

Expected: All 6 tests PASS.

**Step 4: Run existing tests to verify no regressions**

Run: `npm run test:fantom`

Expected: All existing tests still PASS.

**Step 5: Commit**

```bash
git add packages/react-dom-native/ios/Sources/Yoga/yoga/algorithm/CalculateLayout.cpp
git commit -m "feat(yoga): implement inline-block layout with line flow in block containers"
```

---

### Task 5: Update `ElementDefaults.swift` to use `display: inline-block`

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift`

**Step 1: Add `"display": "inline-block"` to element defaults**

Add `"display": "inline-block"` to each of these existing default dictionaries. Keep all other existing properties.

For **buttonDefaults** (line 346):
```swift
    private static let buttonDefaults: [String: Any] = [
        "display": "inline-block",
        "flexDirection": "row",
        "alignItems": "center",
        "justifyContent": "center",
        "paddingTop": 4,
        "paddingBottom": 4,
        "paddingLeft": 12,
        "paddingRight": 12,
        "borderRadius": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "backgroundColor": "#EFEFEF",
        "fontSize": 13.3
    ]
```

For **inputDefaults** (line 361):
```swift
    private static let inputDefaults: [String: Any] = [
        "display": "inline-block",
        "height": 32,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "fontSize": 13.3,
        "backgroundColor": "#FFFFFF"
    ]
```

For **textareaDefaults** (line 372):
```swift
    private static let textareaDefaults: [String: Any] = [
        "display": "inline-block",
        "minHeight": 48,
        "paddingTop": 4,
        "paddingBottom": 4,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "fontSize": 13.3,
        "backgroundColor": "#FFFFFF"
    ]
```

For **selectDefaults** (line 385):
```swift
    private static let selectDefaults: [String: Any] = [
        "display": "inline-block",
        "flexDirection": "row",
        "alignItems": "center",
        "height": 32,
        "paddingLeft": 4,
        "paddingRight": 4,
        "borderWidth": 1,
        "borderColor": "#767676",
        "borderRadius": 2,
        "backgroundColor": "#FFFFFF"
    ]
```

For **progressDefaults** (line 397) — also used by `meter`:
```swift
    private static let progressDefaults: [String: Any] = [
        "display": "inline-block",
        "height": 4
    ]
```

For **imgDefaults** (line 401):
```swift
    private static let imgDefaults: [String: Any] = [
        "display": "inline-block",
        "objectFit": "fill"
    ]
```

For **videoDefaults** (line 405):
```swift
    private static let videoDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 300,
        "height": 150,
        "backgroundColor": "#000000"
    ]
```

For **audioDefaults** (line 411):
```swift
    private static let audioDefaults: [String: Any] = [
        "display": "inline-block",
        "flexDirection": "row",
        "alignItems": "center",
        "height": 32
    ]
```

For **iframeDefaults** (line 417):
```swift
    private static let iframeDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 300,
        "height": 150,
        "borderWidth": 2,
        "borderColor": "#808080"
    ]
```

For **canvasDefaults** (line 424):
```swift
    private static let canvasDefaults: [String: Any] = [
        "display": "inline-block",
        "width": 300,
        "height": 150
    ]
```

Also update the `embed`/`object` case (line 148) to use a new `inlineBlockDefaults` instead of `spanDefaults`:

```swift
        case "embed", "object":
            return inlineBlockDefaults
```

And add:
```swift
    private static let inlineBlockDefaults: [String: Any] = [
        "display": "inline-block"
    ]
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift
git commit -m "feat(defaults): add display:inline-block to form controls and replaced elements"
```

---

### Task 6: Update element defaults tests

**Files:**
- Modify: `tests/integration/element-defaults-itest.js`

**Step 1: Update existing button test and add new inline-block tests**

Update the existing button test (line 46) to check for `display: inline-block`:

```js
  it('button gets display inline-block and centered layout defaults', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<button>Click</button>);
    });

    var output = Fantom.getRenderedOutput();
    var button = output.children[0];
    expect(button.type).toBe('button');
    expect(button.props.style.display).toBe('inline-block');
    expect(button.props.style.alignItems).toBe('center');
    expect(button.props.style.justifyContent).toBe('center');
    expect(button.props.style.flexDirection).toBe('row');
  });
```

Add new tests for other inline-block elements:

```js
  it('input gets display inline-block', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<input />);
    });

    var output = Fantom.getRenderedOutput();
    var input = output.children[0];
    expect(input.type).toBe('input');
    expect(input.props.style.display).toBe('inline-block');
  });

  it('img gets display inline-block', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<img />);
    });

    var output = Fantom.getRenderedOutput();
    var img = output.children[0];
    expect(img.type).toBe('img');
    expect(img.props.style.display).toBe('inline-block');
  });

  it('video gets display inline-block', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<video />);
    });

    var output = Fantom.getRenderedOutput();
    var video = output.children[0];
    expect(video.type).toBe('video');
    expect(video.props.style.display).toBe('inline-block');
  });
```

**Step 2: Run all tests**

Run: `npm run test:fantom`

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add tests/integration/element-defaults-itest.js
git commit -m "test: update element defaults tests for display:inline-block"
```

---

### Task 7: Build and visually verify in simulator

**Step 1: Build and run the example app**

Use the `build_run_sim` MCP tool to build and launch the app in the iOS simulator.

**Step 2: Take a screenshot**

Use the `screenshot` MCP tool. Check that buttons and form controls now shrink to fit their content instead of stretching full width.

**Step 3: Compare with web**

Run the web example (`cd web-example && npm run dev`) at `http://localhost:3000`. Compare the button/input layout visually. The native rendering should now match web more closely — form controls shrink-wrap and sit left-aligned rather than stretching.

**Step 4: Commit any fixes if needed**

If visual differences are found, fix and commit.
