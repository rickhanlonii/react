# Speculative Background Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Speculatively compute Yoga layout on a background thread for completed subtrees during reconciliation, so layout work is already done by the time `$$completeRoot` fires.

**Architecture:** In `$$appendChild`, after wiring up the Yoga parent-child relationship, dispatch a background Yoga layout on the child subtree using the parent's cached layout width as the constraint. At `$$completeRoot`, wait for in-flight speculative layouts, then run root layout as normal — Yoga's incremental layout skips subtrees whose speculative constraints matched.

**Tech Stack:** Swift, Yoga (C), DispatchQueue, DispatchGroup

**Design doc:** `docs/plans/2026-03-06-speculative-background-layout-design.md`

---

### Task 1: Add DispatchGroup and background queue to Bindings

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift:26-50`

**Step 1: Add properties to Bindings class**

Add two new properties after the existing properties (around line 50):

```swift
/// Serial background queue for speculative Yoga layout during reconciliation.
let speculativeLayoutQueue = DispatchQueue(label: "com.react-dom-native.speculative-layout")

/// Tracks in-flight speculative layout tasks. $$completeRoot waits on this
/// before running root layout to ensure all speculative work is complete.
let speculativeLayoutGroup = DispatchGroup()
```

**Step 2: Commit**

```
git commit -m "feat: add speculative layout queue and dispatch group to Bindings"
```

---

### Task 2: Dispatch speculative layout in $$appendChild

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift:186-296` (the `$$appendChild` handler)

**Step 1: Add speculative layout dispatch at the end of $$appendChild**

After all the existing work in `$$appendChild` (flex context overrides, margin collapsing, font-size inheritance, etc.), add the speculative background layout dispatch. This goes at the very end of the `$$appendChild` closure, right before `return nil`.

```swift
// --- Speculative background layout ---
// The child subtree is fully built (persistent mode guarantee).
// Speculatively compute its layout on a background thread using
// the parent's previous layout width as the constraint. If the
// constraint matches at root layout time, Yoga skips this subtree.
let parentWidth = YGNodeLayoutGetWidth(parent.yogaNode)
if parentWidth > 0 {
    let childYogaNode = child.yogaNode
    self.speculativeLayoutGroup.enter()
    self.speculativeLayoutQueue.async {
        YGNodeCalculateLayout(childYogaNode, parentWidth, .nan, .LTR)
        self.speculativeLayoutGroup.leave()
    }
}
```

Key details:
- `parentWidth > 0` guards against first render (no cached layout)
- Capture `childYogaNode` (the YGNodeRef value) to avoid capturing the ShadowNodeWrapper object
- The child subtree won't be mutated after appendChild (persistent mode), so background access is safe

**Step 2: Commit**

```
git commit -m "feat: dispatch speculative Yoga layout on background thread in appendChild"
```

---

### Task 3: Wait for speculative layouts in $$completeRoot

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift:455-510` (the `$$completeRoot` handler)

**Step 1: Add group.wait() before commitTree**

Insert `speculativeLayoutGroup.wait()` right before `renderer.commitTree(...)` (line 499). This ensures all in-flight speculative layouts are complete before root layout runs.

```swift
// Wait for any in-flight speculative layouts to complete
self.speculativeLayoutGroup.wait()

// 3. Sync tracing state and route to Renderer
renderer.tracingEnabled = tracing
renderer.commitTree(newChildren: newChildren, label: "Commit")
```

**Step 2: Commit**

```
git commit -m "feat: wait for speculative layouts before commitTree in completeRoot"
```

---

### Task 4: Update threading comment in Bindings.swift

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift:17-23`

**Step 1: Update the header comment to reflect new threading model**

```swift
// Threading: All calls are synchronous on the main thread. The engine,
// shadow tree, Yoga layout, and UIKit all share the main thread.
//
// Exception: $$appendChild dispatches speculative Yoga layout on a serial
// background queue for completed subtrees. The child's Yoga nodes are
// exclusively owned (persistent mode) so this is thread-safe. $$completeRoot
// waits for all speculative layouts before running root layout.
//
// Exception: $$fetch is asynchronous. The call returns immediately, and
// URLSession performs the HTTP request on a background thread. Response
// chunks are delivered via callbacks dispatched to the main thread.
```

**Step 2: Commit**

```
git commit -m "docs: update Bindings threading comment for speculative layout"
```

---

### Task 5: Verify with existing integration tests

**Step 1: Run layout integration tests**

Run: `/test`

All existing layout tests should pass unchanged — the speculative layout is purely an optimization. If Yoga's incremental layout works correctly, root layout validates or re-computes speculative results, producing identical frames.

**Step 2: If tests fail, debug**

If any layout test fails, it likely means the background Yoga calculation left nodes in an unexpected state. Check:
- Is `YGNodeCalculateLayout` on a subtree modifying nodes that the main thread also touches?
- Are text measurement callbacks being invoked on the background thread? (Would need main-thread dispatch)

---

### Task 6: Add tracing for speculative layout

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` (both `$$appendChild` and `$$completeRoot`)

**Step 1: Add timing to speculative dispatch in appendChild**

Track when speculative layout starts and ends. Report via the tracer so it shows up in Chrome DevTools traces.

In `$$appendChild`, wrap the speculative layout with timing:

```swift
let parentWidth = YGNodeLayoutGetWidth(parent.yogaNode)
if parentWidth > 0 {
    let childYogaNode = child.yogaNode
    let tracing = self.nativeTracingEnabled
    let childType = child.family.elementType
    self.speculativeLayoutGroup.enter()
    self.speculativeLayoutQueue.async {
        let start = tracing ? performanceNow() : 0
        YGNodeCalculateLayout(childYogaNode, parentWidth, .nan, .LTR)
        let end = tracing ? performanceNow() : 0
        if tracing {
            DispatchQueue.main.async {
                self.tracer?.reportTimeStamp(
                    label: "Speculative Layout (\(childType))",
                    start: start, end: end,
                    track: "Speculative Layout", trackGroup: "Native ⚛",
                    color: "tertiary-light"
                )
            }
        }
        self.speculativeLayoutGroup.leave()
    }
}
```

**Step 2: Add timing for the wait in completeRoot**

Track how long `group.wait()` blocks (ideally ~0 if speculative work finished during reconciliation):

```swift
let waitStart = tracing ? performanceNow() : 0
self.speculativeLayoutGroup.wait()
let waitEnd = tracing ? performanceNow() : 0

if tracing, waitEnd > waitStart + 0.001 {
    self.tracer?.reportTimeStamp(
        label: "Wait Speculative Layout",
        start: waitStart, end: waitEnd,
        track: "Shadow Tree", trackGroup: "Native ⚛",
        color: "warning"
    )
}
```

**Step 3: Commit**

```
git commit -m "feat: add Chrome DevTools tracing for speculative layout"
```

---

### Task 7: Manual performance validation

**Step 1: Build and run the demo app**

Run: `/build demo`

**Step 2: Capture a trace with speculative layout**

Use falcon-devtools MCP to start/stop a performance trace. Navigate through the app, trigger updates.

**Step 3: Verify in Chrome DevTools**

Open the trace and look for:
- "Speculative Layout" events on the background thread (green, tertiary-light)
- "Wait Speculative Layout" events should be minimal or absent (yellow, warning) — indicates speculative work finished before `$$completeRoot`
- Root "Layout" event duration should be reduced compared to before (Yoga skipping speculatively-computed subtrees)

**Step 4: Commit all work**

```
git commit -m "perf: speculative background layout during reconciliation"
```
