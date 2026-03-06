# Perf 02: Disable Implicit CA Animations During Mutations

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save 5-10ms off Native Paint by preventing Core Animation from creating implicit animations for every UIView property change during mutations.

**Architecture:** During Prepare Paint, every UIView frame/backgroundColor/opacity change creates an implicit CAAnimation in the current CATransaction. With ~100 views modified, CA must process all these animations even though no animation is desired. Wrapping mutations in `CATransaction.setDisableActions(true)` tells CA to skip animation creation entirely.

**Tech Stack:** Swift, UIKit, Core Animation

---

### Task 1: Wrap commitTree mutations in disabled-actions transaction

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift:94`

**Step 1: Add CATransaction around the mutation phase**

In `commitTree()`, wrap the mutation + syncAllFrames + attach phases (lines 130-168) in a disabled-actions transaction. Insert before line 130:

```swift
CATransaction.begin()
CATransaction.setDisableActions(true)
```

Insert after the tree promotion (after line 167 `currentTree = newChildren`):

```swift
CATransaction.commit()
```

The result should look like:

```swift
// 3. Apply mutations + sync frames + attach (inside Prepare Paint)
CATransaction.begin()
CATransaction.setDisableActions(true)

var mutationTimings: ...
// ... existing mutation code through line 167 ...
currentTree = newChildren

CATransaction.commit()
let attachEnd = tracing ? performanceNow() : 0
```

Note: The tracing CATransaction.setCompletionBlock at line 177 must remain OUTSIDE this inner transaction so it captures the final CA commit timing.

**Step 2: Build and run**

Run: `/build demo`
Expected: App renders identically but Native Paint should be faster.

**Step 3: Run perf trace and compare**

Compare "Native Paint" durations — should drop from ~39ms total to ~29-34ms.

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift
git commit -m "perf: disable implicit CA animations during mutation application"
```
