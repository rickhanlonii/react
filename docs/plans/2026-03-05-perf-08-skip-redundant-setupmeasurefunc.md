# Perf 08: Skip Redundant setupMeasureFunc in appendChild

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save ~0.5ms by skipping the measure function re-setup in `$$appendChild` when the parent uses the default 16pt font.

**Architecture:** When `$$appendChild` appends a `#text` child, it tears down and re-sets up the Yoga measure function to inherit the parent's font properties. But `$$createTextNode` already configures the measure func with the default 16pt font. If the parent doesn't override any font properties, the re-setup is redundant.

**Tech Stack:** Swift, Yoga

---

### Task 1: Conditionally skip setupMeasureFunc

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift`

**Step 1: Add font override check**

In `$$appendChild` (around lines 395-425), find the section that re-sets up the measure func for `#text` children. Before the cleanup/setup calls, add a check:

```swift
if child.family.elementType == "#text" {
    let parentStyle = parent.props["style"] as? [String: Any] ?? [:]
    let hasCustomFont = parentStyle["fontSize"] != nil
        || parentStyle["fontWeight"] != nil
        || parentStyle["fontFamily"] != nil
        || parentStyle["fontStyle"] != nil
        || parentStyle["lineHeight"] != nil

    let parentHasInheritedFont = ElementDefaults.textLineHeight(for: parent.family.elementType) != nil

    if hasCustomFont || parentHasInheritedFont {
        // Parent overrides font — must re-setup measure func with inherited properties
        YogaTextMeasure.cleanupMeasureContext(for: child.yogaNode)
        YogaTextMeasure.setupMeasureFunc(on: child, /* ... existing args ... */)
    }
    // else: parent uses default 16pt, $$createTextNode already set it up correctly
}
```

**Step 2: Build and run**

Run: `/build demo`
Expected: Text renders identically. Most #text nodes with default-font parents skip re-setup.

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift
git commit -m "perf: skip redundant setupMeasureFunc when parent uses default font"
```
