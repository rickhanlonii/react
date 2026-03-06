# Perf 09: Optimize YogaStyleApplier to Iterate Existing Keys

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save 0.5-1ms by iterating only the keys present in the style dictionary instead of checking ~30 keys that may not exist.

**Architecture:** `YogaStyleApplier.apply()` currently checks ~30+ property names via `if let` casts against the dictionary, even when a typical div only has 2-3 style properties. Switching to a key-iteration pattern avoids ~25 failed dictionary lookups per node.

**Tech Stack:** Swift, Yoga

---

### Task 1: Refactor apply() to iterate existing keys

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift:12`

**Step 1: Refactor the apply method**

Replace the current `apply()` implementation (lines 12-389) with a key-iteration pattern:

```swift
public static func apply(_ style: [String: Any], to node: YGNodeRef) {
    guard !style.isEmpty else { return }

    // CSS default
    YGNodeStyleSetBoxSizing(node, .contentBox)

    for (key, value) in style {
        switch key {
        case "flexDirection":
            applyFlexDirection(value, to: node)
        case "alignItems":
            applyAlignItems(value, to: node)
        case "alignSelf":
            applyAlignSelf(value, to: node)
        case "alignContent":
            applyAlignContent(value, to: node)
        case "justifyContent":
            applyJustifyContent(value, to: node)
        case "gap":
            applyGap(value, to: node)
        case "rowGap":
            applyRowGap(value, to: node)
        case "columnGap":
            applyColumnGap(value, to: node)
        // ... all other cases from the existing implementation ...
        // padding, margin, width, height, min/max, flex, aspectRatio,
        // flexWrap, position, top/right/bottom/left, display, overflow, border widths
        default:
            break  // Unknown/non-Yoga property (backgroundColor, color, etc.)
        }
    }
}
```

Extract each property handler into a small static method (e.g., `applyFlexDirection(_ value: Any, to node: YGNodeRef)`) that does the `as? String` cast and switch internally. This keeps the main loop clean and each handler self-contained.

**Important:** Preserve the exact same Yoga API calls and value parsing. This is a pure refactor — same behavior, fewer dictionary lookups.

**Step 2: Build and run**

Run: `/build demo`
Expected: Layout renders identically.

**Step 3: Run e2e layout tests**

Run: `/test`
Expected: All layout comparison tests pass.

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift
git commit -m "perf: refactor YogaStyleApplier to iterate existing keys instead of checking all"
```
