# MPA Refetch Reconciliation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the full-teardown MPA form response handler with a clone-or-create tree builder that reuses `ShadowNodeFamily` from the old tree when types match, producing minimal UPDATE mutations instead of full DELETE+CREATE cycles.

**Architecture:** Modify `ShadowTreeBuilder` to accept an optional old tree cursor. During instruction processing, walk old and new trees in parallel — when types match at the same position, create new nodes that reuse the old `ShadowNodeFamily`. The existing `Differentiator` and `UIKitMutationApplier` stay unchanged; family identity matching naturally produces the correct minimal mutations.

**Tech Stack:** Swift (ShadowTree module, ReactDomNativeKit), Yoga layout

---

### Task 1: Add Old Tree Cursor to ShadowTreeBuilder

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift`

**Step 1: Add old tree cursor state**

Add properties and a method to set the old tree for reconciliation. The cursor is a stack of `(children: [ShadowNodeWrapper], index: Int)` that tracks the current position in the old tree.

In `ShadowTreeBuilder.swift`, add after the `surfaceId` property (around line 41):

```swift
/// Old tree cursor for MPA reconciliation — tracks position in previous tree.
/// When set, openElement/textNode reuse ShadowNodeFamily from matching old nodes.
private var oldTreeStack: [(children: [ShadowNodeWrapper], index: Int)] = []
private var oldRootChildren: [ShadowNodeWrapper]?
private var oldRootIndex: Int = 0
```

**Step 2: Add method to set old tree**

Add a public method after `updateViewport` (around line 87):

```swift
/// Set the old committed tree for reconciliation. When set, new nodes
/// will reuse ShadowNodeFamily from the old tree when types match at
/// the same position, enabling UPDATE mutations instead of CREATE+DELETE.
public func setOldTree(_ oldChildren: [ShadowNodeWrapper]) {
    self.oldRootChildren = oldChildren
    self.oldRootIndex = 0
}
```

**Step 3: Add helper to get matching old node**

Add a private helper that returns the old node at the current cursor position if the type matches:

```swift
/// Returns the old node at the current cursor position if its type matches,
/// then advances the cursor. Returns nil on type mismatch or if no old tree.
private func matchOldNode(type: String) -> ShadowNodeWrapper? {
    if let stack = oldTreeStack.last {
        // Inside a subtree
        let children = stack.children
        let index = stack.index
        if index < children.count && children[index].family.elementType == type {
            oldTreeStack[oldTreeStack.count - 1].index = index + 1
            return children[index]
        }
        return nil
    } else if let oldRoot = oldRootChildren {
        // At root level
        if oldRootIndex < oldRoot.count && oldRoot[oldRootIndex].family.elementType == type {
            let node = oldRoot[oldRootIndex]
            oldRootIndex += 1
            return node
        }
        return nil
    }
    return nil
}
```

**Step 4: Run the build to verify it compiles**

Run: `/build demo`
Expected: Build succeeds (new code is unused so far)

**Step 5: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift
git commit -m "feat: add old tree cursor infrastructure to ShadowTreeBuilder"
```

---

### Task 2: Wire Family Reuse into openElement

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift`

**Step 1: Modify openElement to reuse family when types match**

Replace the current `openElement` method (lines 90-97) with:

```swift
/// Open an element — creates a ShadowNodeWrapper and pushes to stack.
/// If an old tree cursor is set and the old node at this position has the
/// same type, the new node reuses the old ShadowNodeFamily (enabling
/// UPDATE mutations instead of CREATE+DELETE).
public func openElement(type: String, props: [String: Any]) {
    let oldMatch = matchOldNode(type: type)

    let node: ShadowNodeWrapper
    if let oldNode = oldMatch {
        // Type matches — create node reusing old family
        node = ShadowNodeWrapper.createElementNode(
            type: type,
            props: props,
            surfaceId: surfaceId,
            reuseFamily: oldNode.family
        )
        // Push old node's children as the new cursor level
        oldTreeStack.append((children: oldNode.children, index: 0))
    } else {
        // No match — create fresh node, push nil cursor
        node = ShadowNodeWrapper.createElementNode(
            type: type,
            props: props,
            surfaceId: surfaceId
        )
        // No old subtree to walk — push empty sentinel
        if oldRootChildren != nil || !oldTreeStack.isEmpty {
            oldTreeStack.append((children: [], index: 0))
        }
    }
    nodeStack.append(node)
}
```

**Step 2: Add `reuseFamily` parameter to createElementNode**

In `ShadowNodeWrapper.swift`, modify `createElementNode` (around line 130) to accept an optional family to reuse:

```swift
public static func createElementNode(
    type: String,
    props: [String: Any],
    surfaceId: Int,
    instanceHandle: AnyObject? = nil,
    reuseFamily: ShadowNodeFamily? = nil
) -> ShadowNodeWrapper {
```

Then change the family creation block (around line 152) from:

```swift
// 2. Create family
let family = ShadowNodeFamily(
    elementType: type,
    surfaceId: surfaceId,
    instanceHandle: instanceHandle
)
```

To:

```swift
// 2. Create or reuse family
let family = reuseFamily ?? ShadowNodeFamily(
    elementType: type,
    surfaceId: surfaceId,
    instanceHandle: instanceHandle
)
```

**Step 3: Run the build to verify it compiles**

Run: `/build demo`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift
git commit -m "feat: reuse ShadowNodeFamily in openElement when old tree type matches"
```

---

### Task 3: Wire Family Reuse into textNode and closeElement

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift`

**Step 1: Modify textNode to reuse family when old node is #text**

Replace the current `textNode` method (lines 100-152) — the key change is checking `matchOldNode` for "#text" and reusing its family:

```swift
/// Add a text node as child of the current stack top.
public func textNode(text: String) {
    let oldMatch = matchOldNode(type: "#text")

    let family: ShadowNodeFamily
    if let oldNode = oldMatch {
        family = oldNode.family
    } else {
        family = ShadowNodeFamily(
            elementType: "#text",
            surfaceId: surfaceId,
            instanceHandle: nil
        )
    }

    let node = ShadowNodeWrapper(
        props: [:],
        children: [],
        family: family,
        text: text
    )

    // Set up text measurement (unchanged from current code)
    var fontSize: CGFloat = 16
    var fontWeight: String? = nil
    var fontFamily: String? = nil
    var fontStyle: String? = nil
    var lineHeight: CGFloat? = nil

    if let parent = nodeStack.last {
        let parentStyle = parent.props["style"] as? [String: Any] ?? [:]
        if let fs = parentStyle["fontSize"] {
            if let d = fs as? Double { fontSize = CGFloat(d) }
            else if let i = fs as? Int { fontSize = CGFloat(i) }
        }
        fontWeight = parentStyle["fontWeight"] as? String
        fontFamily = parentStyle["fontFamily"] as? String
        fontStyle = parentStyle["fontStyle"] as? String
        if let lh = parentStyle["lineHeight"] {
            if let d = lh as? Double { lineHeight = CGFloat(d) }
            else if let i = lh as? Int { lineHeight = CGFloat(i) }
        }
        if lineHeight == nil {
            lineHeight = ElementDefaults.textLineHeight(for: parent.family.elementType)
        }
    }

    YogaTextMeasure.setupMeasureFunc(
        on: node,
        fontSize: fontSize,
        fontWeight: fontWeight,
        fontFamily: fontFamily,
        fontStyle: fontStyle,
        lineHeight: lineHeight
    )

    appendChild(node)
}
```

**Step 2: Modify closeElement to pop old tree cursor**

Replace the current `closeElement` method (lines 155-170). The change: pop the old tree stack when closing an element.

```swift
/// Close the current element — pop from stack and append to parent.
public func closeElement() {
    guard let node = nodeStack.popLast() else {
        print("[ShadowTreeBuilder] Warning: closeElement called with empty stack")
        return
    }

    // Pop old tree cursor level (if reconciling)
    if !oldTreeStack.isEmpty {
        oldTreeStack.removeLast()
    }

    if nodeStack.isEmpty {
        // This is a root-level node
        rootChildren.append(node)
        let index = YGNodeGetChildCount(rootYogaNode)
        YGNodeInsertChild(rootYogaNode, node.yogaNode, index)
    } else {
        // Append to parent on stack
        appendChild(node)
    }
}
```

**Step 3: Run the build to verify it compiles**

Run: `/build demo`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift
git commit -m "feat: reuse family in textNode and pop old cursor in closeElement"
```

---

### Task 4: Handle Suspense Boundaries in Reconciliation

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift`

**Step 1: Modify didReceiveBeginBoundary to use the old tree cursor**

The `SSRCoordinator.didReceiveBeginBoundary` calls `activeBuilder.openElement(type: "#suspense", ...)`. Since we modified `openElement` in Task 2 to check the old tree cursor, `#suspense` nodes will already be matched by type. No additional changes needed — the `ShadowTreeBuilder` handles `#suspense` like any other element type.

**Verify:** Read through `didReceiveBeginBoundary` and confirm it calls `activeBuilder.openElement(type: "#suspense", ...)` — this will automatically use the cursor matching from Task 2.

This is a no-code-change verification step. Move to Task 5.

---

### Task 5: Update reloadFromSSRResponse to Use Reconciliation

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`

This is the key integration task. Change `reloadFromSSRResponse` to pass the old committed tree to the new `ShadowTreeBuilder` instead of tearing down all views.

**Step 1: Modify reloadFromSSRResponse**

Replace the current `reloadFromSSRResponse` method (starting at line 417). Key changes:
1. **Remove** the `removeFromSuperview` loop (lines 419-421)
2. **Pass** old committed tree to the new `ShadowTreeBuilder` via `setOldTree`
3. **Use** `commitTree` for the result (which diffs old vs new, producing minimal mutations)

```swift
/// Re-renders the Server Only tree from a new SSR instruction stream.
/// Called when an MPA form POST returns a fresh instruction stream.
/// Instead of tearing down the entire view hierarchy, reconciles against
/// the existing tree — reusing UIKit views where element types match.
internal func reloadFromSSRResponse(_ instructionStream: String) {
    // Capture old committed tree for reconciliation
    let oldTree = self.renderer.currentTree

    // Reset SSR state
    ssrRevealHasOccurred = false
    ssrShellComplete = false
    ssrStreamComplete = false

    // Create fresh SSR infrastructure
    let treeBuilder = ShadowTreeBuilder(
        surfaceId: surfaceId!,
        viewportWidth: Float(container.bounds.width > 0 ? container.bounds.width : 390),
        viewportHeight: Float(container.bounds.height > 0 ? container.bounds.height : 844)
    )

    // Set old tree for reconciliation — enables family reuse
    if !oldTree.isEmpty {
        treeBuilder.setOldTree(oldTree)
    }

    let boundaryManager = BoundaryManager()
    let parser = InstructionStreamParser()

    let coordinator = SSRCoordinator(
        treeBuilder: treeBuilder,
        boundaryManager: boundaryManager,
        rootView: container
    )

    // Skip layout in tree builder — commitTree handles layout
    treeBuilder.performLayoutOnComplete = false

    // Re-wire MPA form submission on the mutation applier
    self.renderer.mutationApplier.ssrBaseURL = self.ssrURL
    self.renderer.mutationApplier.onMPAFormResponse = { [weak self] responseText in
        guard let self = self else { return }
        self.reloadFromSSRResponse(responseText)
    }

    // Ignore JS instructions — no hydration, no runtime
    coordinator.onJavaScriptReceived = { _ in }

    // Queue boundary reveals
    coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
        self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
    }

    parser.delegate = coordinator

    // Wire boundary reveal view updates
    coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
        guard let self = self else { return }
        self.ssrRevealHasOccurred = true
        self.renderer.commitTree(newChildren: newRootChildren, label: "Server-Only MPA Reveal")
    }

    // Store references
    self.ssrParser = parser
    self.ssrTreeBuilder = treeBuilder
    self.ssrBoundaryManager = boundaryManager
    self.ssrCoordinator = coordinator

    // Handle root completion — commit via diff pipeline (not full rebuild)
    treeBuilder.onRootComplete = { [weak self] rootChildren in
        guard let self = self else { return }

        guard !self.ssrRevealHasOccurred else {
            self.ssrShellComplete = true
            return
        }

        // commitTree diffs old vs new — family reuse means minimal mutations
        self.renderer.commitTree(newChildren: rootChildren, label: "Server-Only MPA Paint")

        print("[ReactDomNativeKit] Server-only MPA reconcile complete (\(rootChildren.count) root children)")
        self.ssrShellComplete = true
    }

    // Feed the instruction stream into the parser
    if let data = instructionStream.data(using: .utf8) {
        parser.receive(data: data)
        parser.finish()
    }
}
```

**Step 2: Remove the `registerRootView` call**

The old code called `self.renderer.registerRootView(container)` which re-creates the scroll view. With reconciliation, we keep the existing root view — remove this call. (It's absent from the replacement code above.)

Note: Check that `registerRootView` is no longer needed. The root view and scroll view already exist from the initial SSR render.

**Step 3: Make `Renderer.currentTree` accessible**

Check if `Renderer.currentTree` is already accessible from `Root+SSR.swift`. It's `private(set)` which means it's readable within the module (both files are in the `ReactDomNativeKit` module). No change needed.

**Step 4: Run the build**

Run: `/build demo`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift
git commit -m "feat: reconcile MPA form response against existing tree instead of full teardown"
```

---

### Task 6: Clean Up Old Tree Cursor in reset()

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift`

**Step 1: Clear old tree state in reset()**

In `ShadowTreeBuilder.reset()` (around line 212), add cleanup for the old tree cursor:

```swift
public func reset() {
    nodeStack.removeAll()
    rootChildren.removeAll()
    oldTreeStack.removeAll()
    oldRootChildren = nil
    oldRootIndex = 0
    // Remove all children from root yoga node
    while YGNodeGetChildCount(rootYogaNode) > 0 {
        YGNodeRemoveChild(rootYogaNode, YGNodeGetChild(rootYogaNode, 0)!)
    }
}
```

**Step 2: Run the build**

Run: `/build demo`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift
git commit -m "chore: clean up old tree cursor state in reset()"
```

---

### Task 7: Manual Smoke Test

**Files:** None (testing only)

**Step 1: Build and run the demo app**

Run: `/build demo`
Expected: App builds and launches

**Step 2: Navigate to the todo demo fixture (server-only mode)**

Use the app to navigate to a server-only fixture that has MPA form submission (e.g., the todo demo in server-only mode).

**Step 3: Verify MPA form submit works**

1. Take a screenshot before submitting
2. Submit the form (e.g., add a todo)
3. Take a screenshot after — verify the UI updates without a full flash
4. The existing items should remain in place; only the new/changed items should update

**Step 4: Verify no regression on initial SSR render**

1. Navigate away and back to the fixture
2. Verify the initial SSR render still works correctly (no old tree cursor is set on first render)

**Step 5: Commit the design doc to complete**

```bash
mv docs/plans/2026-03-09-mpa-refetch-reconciliation-design.md docs/plans/complete/
git add docs/plans/complete/2026-03-09-mpa-refetch-reconciliation-design.md
git commit -m "docs: move MPA refetch reconciliation design to complete"
```
