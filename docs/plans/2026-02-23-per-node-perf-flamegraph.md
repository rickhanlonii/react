# Per-Node Performance Flame Graphs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show real per-node timing across Diff, Mutations, and Layout phases as separate flame graph tracks in Chrome DevTools.

**Architecture:** Instrument 4 Swift functions with per-node `CACurrentMediaTime()` calls (guarded by tracing flag). Collect timing into flat arrays, pass to JS via the existing timing dictionary, emit as `reportTimeStamp` calls on 3 new tracks. Remove the existing synthetic flame graph.

**Tech Stack:** Swift (CACurrentMediaTime, JSEngine API), JavaScript (PerformanceTracer), Chrome Trace Format

---

### Task 1: Instrument Differentiator.diff() with per-node tracing

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/Differentiator.swift`

**Step 1: Add tracing parameter and timing collection to diff()**

The `diff()` method is recursive. Add a `tracing` parameter (default `false`) and an `inout` array that accumulates `(elementType, start, end)` tuples. Wrap the per-node work (identity check + mutation emission + recursive diff) with timing calls.

```swift
public func diff(
    oldChildren: [ShadowNodeWrapper],
    newChildren: [ShadowNodeWrapper],
    parent: ShadowNodeWrapper?,
    tracing: Bool = false,
    nodeTimings: inout [(type: String, start: Double, end: Double)]
) -> [Mutation] {
    var mutations: [Mutation] = []

    var oldByFamily: [ObjectIdentifier: ShadowNodeWrapper] = [:]
    for child in oldChildren {
        let key = ObjectIdentifier(child.family)
        oldByFamily[key] = child
    }

    var matchedFamilies: Set<ObjectIdentifier> = []

    for (index, newChild) in newChildren.enumerated() {
        let familyKey = ObjectIdentifier(newChild.family)
        let nodeStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

        if let oldChild = oldByFamily[familyKey] {
            matchedFamilies.insert(familyKey)

            if oldChild !== newChild {
                mutations.append(.update(
                    node: newChild,
                    oldProps: oldChild.props,
                    newProps: newChild.props
                ))
            }

            let childMutations = diff(
                oldChildren: oldChild.children,
                newChildren: newChild.children,
                parent: newChild,
                tracing: tracing,
                nodeTimings: &nodeTimings
            )
            mutations.append(contentsOf: childMutations)
        } else {
            mutations.append(.create(node: newChild))
            if let parentNode = parent {
                mutations.append(.insert(
                    parent: parentNode,
                    child: newChild,
                    index: index
                ))
            }

            let subtreeMutations = createSubtree(
                node: newChild,
                parentIndex: 0
            )
            mutations.append(contentsOf: subtreeMutations)
        }

        if tracing {
            let nodeEnd = CACurrentMediaTime() * 1000.0
            nodeTimings.append((newChild.family.elementType, nodeStart, nodeEnd))
        }
    }

    for oldChild in oldChildren {
        let familyKey = ObjectIdentifier(oldChild.family)
        if !matchedFamilies.contains(familyKey) {
            let nodeStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
            if let parentNode = parent {
                mutations.append(.remove(parent: parentNode, child: oldChild))
            }
            mutations.append(.delete(node: oldChild))
            let deleteMutations = deleteSubtree(node: oldChild)
            mutations.append(contentsOf: deleteMutations)
            if tracing {
                let nodeEnd = CACurrentMediaTime() * 1000.0
                nodeTimings.append((oldChild.family.elementType, nodeStart, nodeEnd))
            }
        }
    }

    return mutations
}
```

Note: The timing wraps the recursive call, so parent nodes naturally have start < children start and end > children end — creating the flame graph nesting.

**Step 2: Keep the existing non-tracing overload**

Add a convenience overload that preserves the existing call signature for non-tracing callers (SSR path, `initialMutations`, tests):

```swift
public func diff(
    oldChildren: [ShadowNodeWrapper],
    newChildren: [ShadowNodeWrapper],
    parent: ShadowNodeWrapper?
) -> [Mutation] {
    var unused: [(type: String, start: Double, end: Double)] = []
    return diff(
        oldChildren: oldChildren,
        newChildren: newChildren,
        parent: parent,
        tracing: false,
        nodeTimings: &unused
    )
}
```

**Step 3: Verify it compiles**

Run: `npm test` (JS tests don't touch Differentiator but confirm nothing in JS broke)

**Step 4: Commit**

```
feat: add per-node tracing to Differentiator.diff()
```

---

### Task 2: Instrument ShadowTreeLayout.readLayoutFrames() with per-node tracing

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeLayout.swift`

**Step 1: Add tracing overload of readLayoutFrames()**

Add a new overload that accepts `tracing` + `inout nodeTimings`. The timing wraps each node's Yoga getter calls + frame assignment + recursive children, so parents naturally encompass children.

```swift
public static func readLayoutFrames(
    node: ShadowNodeWrapper,
    tracing: Bool,
    nodeTimings: inout [(type: String, start: Double, end: Double)]
) {
    let nodeStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

    var x = CGFloat(YGNodeLayoutGetLeft(node.yogaNode))
    var y = CGFloat(YGNodeLayoutGetTop(node.yogaNode))
    let width = CGFloat(YGNodeLayoutGetWidth(node.yogaNode))
    let height = CGFloat(YGNodeLayoutGetHeight(node.yogaNode))

    if YGNodeStyleGetPositionType(node.yogaNode) == .relative {
        // ... same position:relative offset logic as existing method ...
        let isBlock = YGNodeStyleGetDisplay(node.yogaNode) == .block
        let isInWrappingFlex: Bool
        if let owner = YGNodeGetOwner(node.yogaNode) {
            let parentWrap = YGNodeStyleGetFlexWrap(owner)
            isInWrappingFlex = parentWrap == .wrap || parentWrap == .wrapReverse
        } else {
            isInWrappingFlex = false
        }

        if isBlock || isInWrappingFlex {
            let style = node.props["style"] as? [String: Any]
            if let top = style?["top"] as? NSNumber {
                y += CGFloat(top.doubleValue)
            } else if let bottom = style?["bottom"] as? NSNumber {
                y -= CGFloat(bottom.doubleValue)
            }
            if isBlock {
                if let left = style?["left"] as? NSNumber {
                    x += CGFloat(left.doubleValue)
                } else if let right = style?["right"] as? NSNumber {
                    x -= CGFloat(right.doubleValue)
                }
            }
        }
    }

    node.layoutFrame = CGRect(x: x, y: y, width: width, height: height)

    for child in node.children {
        readLayoutFrames(node: child, tracing: tracing, nodeTimings: &nodeTimings)
    }

    if tracing {
        let nodeEnd = CACurrentMediaTime() * 1000.0
        nodeTimings.append((node.family.elementType, nodeStart, nodeEnd))
    }
}
```

The existing `readLayoutFrames(node:)` stays unchanged — it's called from `performLayout()`, `computeScrollContentSizes()`, and potentially other paths that don't need tracing.

**Step 2: Commit**

```
feat: add per-node tracing to ShadowTreeLayout.readLayoutFrames()
```

---

### Task 3: Instrument UIKitMutationApplier.applyMutations() with per-mutation tracing

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

**Step 1: Add tracing parameter and timing collection**

Add `tracing` + `inout mutationTimings` to `applyMutations()`. Each tuple stores `(mutationType, elementType, start, end)`. The mutation type is a string like "CREATE", "UPDATE", etc.

```swift
public func applyMutations(
    _ mutations: [Mutation],
    rootView: UIView,
    tracing: Bool = false,
    mutationTimings: inout [(mutationType: String, elementType: String, start: Double, end: Double)]
) {
    print("[\(logPrefix)] Applying \(mutations.count) mutations")

    for (index, mutation) in mutations.enumerated() {
        let mutStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        var mutType = ""
        var elemType = ""

        switch mutation {
        case .create(let node):
            mutType = "CREATE"
            elemType = node.family.elementType
            // ... existing create logic unchanged ...

        case .delete(let node):
            mutType = "DELETE"
            elemType = node.family.elementType
            // ... existing delete logic unchanged ...

        case .insert(let parent, let child, let index):
            mutType = "INSERT"
            elemType = child.family.elementType
            // ... existing insert logic unchanged ...

        case .remove(let parent, let child):
            mutType = "REMOVE"
            elemType = child.family.elementType
            // ... existing remove logic unchanged ...

        case .update(let node, _, let newProps):
            mutType = "UPDATE"
            elemType = node.family.elementType
            // ... existing update logic unchanged ...
        }

        if tracing {
            let mutEnd = CACurrentMediaTime() * 1000.0
            mutationTimings.append((mutType, elemType, mutStart, mutEnd))
        }
    }

    print("[\(logPrefix)] Done. Root view subviews: \(rootView.subviews.count)")
}
```

**Step 2: Keep the existing non-tracing call signature**

Add a convenience overload:

```swift
public func applyMutations(
    _ mutations: [Mutation],
    rootView: UIView
) {
    var unused: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
    applyMutations(mutations, rootView: rootView, tracing: false, mutationTimings: &unused)
}
```

**Step 3: Commit**

```
feat: add per-mutation tracing to UIKitMutationApplier.applyMutations()
```

---

### Task 4: Instrument syncAllFrames() and thread tracing through Bindings.swift

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Add tracing to syncAllFrames()**

```swift
private func syncAllFrames(
    _ nodes: [ShadowNodeWrapper],
    tracing: Bool = false,
    nodeTimings: inout [(type: String, start: Double, end: Double)]
) {
    for node in nodes {
        let nodeStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

        if let view = viewRegistry.view(for: node.family) {
            if view.frame != node.layoutFrame {
                view.frame = node.layoutFrame
            }
            if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                scrollView.contentSize = contentSize
            }
        }
        syncAllFrames(node.children, tracing: tracing, nodeTimings: &nodeTimings)

        if tracing {
            let nodeEnd = CACurrentMediaTime() * 1000.0
            nodeTimings.append((node.family.elementType, nodeStart, nodeEnd))
        }
    }
}
```

Keep the existing non-tracing `syncAllFrames(_ nodes:)` as a convenience.

**Step 2: Thread tracing through $$completeRoot**

In the `$$completeRoot` function, update the diff call to use the tracing overload, and similarly for `applyMutations` and `syncAllFrames`. Collect the timing arrays and pass them to JS.

In the diff call (around line 791):
```swift
var diffNodeTimings: [(type: String, start: Double, end: Double)] = []
let mutations = self.differentiator.diff(
    oldChildren: oldChildren,
    newChildren: newChildren,
    parent: nil,
    tracing: tracing,
    nodeTimings: &diffNodeTimings
)
```

In the layout section, update `readLayoutFrames` calls to use the tracing overload:
```swift
var layoutNodeTimings: [(type: String, start: Double, end: Double)] = []
// In calculateYogaLayout, after YGNodeCalculateLayout:
for child in children {
    ShadowTreeLayout.readLayoutFrames(
        node: child,
        tracing: tracing,
        nodeTimings: &layoutNodeTimings
    )
}
```

For `applyMutations`:
```swift
var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
self.mutationApplier.applyMutations(
    mutations,
    rootView: rootView,
    tracing: tracing,
    mutationTimings: &mutationTimings
)
```

For `syncAllFrames`:
```swift
var syncNodeTimings: [(type: String, start: Double, end: Double)] = []
self.syncAllFrames(
    newChildren,
    tracing: tracing,
    nodeTimings: &syncNodeTimings
)
```

**Step 3: Build JS arrays from collected timings and add to timing dict**

After the existing timing dict properties (around where `treeProfile` is currently set), replace the synthetic flame graph with real per-node data:

```swift
// Remove: buildTreeProfile / treeProfile / treeProfileTotal

// Diff node timings: [type, start, end, type, start, end, ...]
var diffElements: [JSValueRef] = []
diffElements.reserveCapacity(diffNodeTimings.count * 3)
for entry in diffNodeTimings {
    diffElements.append(engine.makeString(entry.type))
    diffElements.append(engine.makeNumber(entry.start))
    diffElements.append(engine.makeNumber(entry.end))
}
engine.setProperty(result, "diffNodes", engine.makeArray(diffElements))

// Mutation timings: [mutationType, elementType, start, end, ...]
var mutElements: [JSValueRef] = []
mutElements.reserveCapacity(mutationTimings.count * 4)
for entry in mutationTimings {
    mutElements.append(engine.makeString(entry.mutationType))
    mutElements.append(engine.makeString(entry.elementType))
    mutElements.append(engine.makeNumber(entry.start))
    mutElements.append(engine.makeNumber(entry.end))
}
engine.setProperty(result, "mutationNodes", engine.makeArray(mutElements))

// Layout node timings (readLayoutFrames + syncAllFrames combined)
var layoutElements: [JSValueRef] = []
let combinedLayout = layoutNodeTimings + syncNodeTimings
layoutElements.reserveCapacity(combinedLayout.count * 3)
for entry in combinedLayout {
    layoutElements.append(engine.makeString(entry.type))
    layoutElements.append(engine.makeNumber(entry.start))
    layoutElements.append(engine.makeNumber(entry.end))
}
engine.setProperty(result, "layoutNodes", engine.makeArray(layoutElements))
```

**Step 4: Remove buildTreeProfile() helper**

Delete the `buildTreeProfile()` method and its call site — it's replaced by real per-node data.

**Step 5: Handle lastLayoutTimings for readLayoutFrames tracing**

The `calculateYogaLayout()` method currently calls `ShadowTreeLayout.readLayoutFrames()` internally. To collect layout node timings, we need to pass the tracing state through. The simplest approach: store `layoutNodeTimings` as an instance variable that `calculateYogaLayout` populates when tracing.

Add a property:
```swift
private var lastLayoutNodeTimings: [(type: String, start: Double, end: Double)] = []
```

In `calculateYogaLayout()`, after the existing `readLayoutFrames` calls, replace them with the tracing overload when tracing is enabled:
```swift
for child in children {
    if tracing {
        ShadowTreeLayout.readLayoutFrames(
            node: child, tracing: true, nodeTimings: &self.lastLayoutNodeTimings
        )
    } else {
        ShadowTreeLayout.readLayoutFrames(node: child)
    }
}
```

Then in `$$completeRoot`, after `calculateYogaLayout` returns, read `self.lastLayoutNodeTimings` and clear it.

**Step 6: Commit**

```
feat: thread per-node tracing through Bindings.swift commit pipeline
```

---

### Task 5: Emit per-node trace events in HostConfig.js

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`

**Step 1: Remove synthetic flame graph code**

Delete the "Shadow Nodes flame graph" block at the end of `reportNativeCommitTimings` (the `treeProfile` / `treeProfileTotal` loop).

**Step 2: Add per-node flame graph emission**

Replace with three loops that emit real per-node timing on separate tracks. Native timestamps need `timeOrigin` subtracted (same as existing phase timings).

```javascript
// Diff Nodes flame graph — real per-node timing from diff phase
var diffNodes = t.diffNodes;
if (diffNodes && diffNodes.length > 0) {
  for (var i = 0; i < diffNodes.length; i += 3) {
    tracer.reportTimeStamp(diffNodes[i], diffNodes[i + 1] - origin, diffNodes[i + 2] - origin,
      'Diff Nodes \u269b', 'Native \u269b', 'primary-light');
  }
}

// Mutation Nodes flame graph — real per-mutation timing
var mutationNodes = t.mutationNodes;
if (mutationNodes && mutationNodes.length > 0) {
  for (var i = 0; i < mutationNodes.length; i += 4) {
    tracer.reportTimeStamp(
      mutationNodes[i] + ' ' + mutationNodes[i + 1],
      mutationNodes[i + 2] - origin,
      mutationNodes[i + 3] - origin,
      'Mutation Nodes \u269b', 'Native \u269b', 'primary-light');
  }
}

// Layout Nodes flame graph — real per-node timing from readLayoutFrames + syncAllFrames
var layoutNodes = t.layoutNodes;
if (layoutNodes && layoutNodes.length > 0) {
  for (var i = 0; i < layoutNodes.length; i += 3) {
    tracer.reportTimeStamp(layoutNodes[i], layoutNodes[i + 1] - origin, layoutNodes[i + 2] - origin,
      'Layout Nodes \u269b', 'Native \u269b', 'primary-light');
  }
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: Some tests may fail due to updated `makeTimings` defaults — fix in next task.

**Step 4: Commit**

```
feat: emit per-node flame graph trace events on 3 new tracks
```

---

### Task 6: Update trace-format tests

**Files:**
- Modify: `packages/react-dom-native/src/devtools/__tests__/trace-format.test.js`

**Step 1: Update makeTimings() defaults**

Remove `treeProfile` and `treeProfileTotal`. Add `diffNodes`, `mutationNodes`, `layoutNodes` with sample data. Use real-ish timestamps within the existing diff/mutation/layout windows.

```javascript
function makeTimings(overrides) {
  return Object.assign({
    commitStart: 100, commitEnd: 110,
    layoutStart: 100, layoutEnd: 104,
    diffStart: 104, diffEnd: 106,
    mutationsStart: 106, mutationsEnd: 108,
    syncStart: 108, syncEnd: 109,
    mutationCount: 5,
    yogaStart: 100, yogaEnd: 103,
    textRemeasureStart: 101, textRemeasureEnd: 102,
    didRemeasure: 0,
    scrollStart: 103, scrollEnd: 104,
    nodeCount: 12,
    treeDepth: 4,
    rootTypes: 'div, main',
    creates: 2,
    deletes: 1,
    inserts: 3,
    removes: 1,
    updates: 2,
    affectedTypes: 'div, p, span',
    // Per-node timings: [type, start, end, ...] (timestamps are absolute, origin-adjusted in JS)
    diffNodes: ['div', 104, 106, 'h1', 104.5, 105, 'p', 105, 105.8],
    mutationNodes: ['CREATE', 'div', 106, 106.5, 'UPDATE', 'p', 106.5, 107],
    layoutNodes: ['div', 100, 104, 'h1', 100.5, 102, 'p', 102, 103.5],
  }, overrides);
}
```

**Step 2: Update emitNativeTimings() helper**

Remove the synthetic flame graph loop. Add three new loops matching `reportNativeCommitTimings`:

```javascript
// Diff Nodes flame graph
var diffNodes = t.diffNodes;
if (diffNodes && diffNodes.length > 0) {
  for (var i = 0; i < diffNodes.length; i += 3) {
    tracer.reportTimeStamp(diffNodes[i], diffNodes[i + 1], diffNodes[i + 2],
      'Diff Nodes \u269b', 'Native \u269b', 'primary-light');
  }
}

// Mutation Nodes flame graph
var mutationNodes = t.mutationNodes;
if (mutationNodes && mutationNodes.length > 0) {
  for (var i = 0; i < mutationNodes.length; i += 4) {
    tracer.reportTimeStamp(
      mutationNodes[i] + ' ' + mutationNodes[i + 1],
      mutationNodes[i + 2], mutationNodes[i + 3],
      'Mutation Nodes \u269b', 'Native \u269b', 'primary-light');
  }
}

// Layout Nodes flame graph
var layoutNodes = t.layoutNodes;
if (layoutNodes && layoutNodes.length > 0) {
  for (var i = 0; i < layoutNodes.length; i += 3) {
    tracer.reportTimeStamp(layoutNodes[i], layoutNodes[i + 1], layoutNodes[i + 2],
      'Layout Nodes \u269b', 'Native \u269b', 'primary-light');
  }
}
```

Note: Test helper doesn't subtract `origin` since test timestamps are already relative.

**Step 3: Replace synthetic flame graph tests with real per-node tests**

Remove:
- `'emits Shadow Nodes flame graph events from tree profile'`
- `'flame graph spans nest correctly (parent wider than children)'`
- `'skips flame graph when treeProfile is empty'`

Add:

```javascript
it('emits Diff Nodes flame graph events from diffNodes', () => {
  tracer.startTracing();
  emitNativeTimings(makeTimings());
  const events = tracer.stopTracing();
  const begins = getBeginEvents(events);

  const diffNodeEvents = begins.filter(e => e.detail.devtools.track === 'Diff Nodes \u269b');
  expect(diffNodeEvents).toHaveLength(3);
  expect(diffNodeEvents.map(e => e.name)).toEqual(['div', 'h1', 'p']);
  for (const e of diffNodeEvents) {
    expect(e.detail.devtools.trackGroup).toBe('Native \u269b');
    expect(e.detail.devtools.color).toBe('primary-light');
  }
});

it('emits Mutation Nodes flame graph events with mutation type labels', () => {
  tracer.startTracing();
  emitNativeTimings(makeTimings());
  const events = tracer.stopTracing();
  const begins = getBeginEvents(events);

  const mutNodeEvents = begins.filter(e => e.detail.devtools.track === 'Mutation Nodes \u269b');
  expect(mutNodeEvents).toHaveLength(2);
  expect(mutNodeEvents.map(e => e.name)).toEqual(['CREATE div', 'UPDATE p']);
});

it('emits Layout Nodes flame graph events from layoutNodes', () => {
  tracer.startTracing();
  emitNativeTimings(makeTimings());
  const events = tracer.stopTracing();
  const begins = getBeginEvents(events);

  const layoutNodeEvents = begins.filter(e => e.detail.devtools.track === 'Layout Nodes \u269b');
  expect(layoutNodeEvents).toHaveLength(3);
  expect(layoutNodeEvents.map(e => e.name)).toEqual(['div', 'h1', 'p']);
});

it('skips per-node tracks when timing arrays are empty', () => {
  tracer.startTracing();
  emitNativeTimings(makeTimings({diffNodes: [], mutationNodes: [], layoutNodes: []}));
  const events = tracer.stopTracing();
  const begins = getBeginEvents(events);

  expect(begins.filter(e => e.detail.devtools.track === 'Diff Nodes \u269b')).toHaveLength(0);
  expect(begins.filter(e => e.detail.devtools.track === 'Mutation Nodes \u269b')).toHaveLength(0);
  expect(begins.filter(e => e.detail.devtools.track === 'Layout Nodes \u269b')).toHaveLength(0);
});
```

**Step 4: Update existing test expectations**

The test `'emits Shadow Tree track events with correct track and trackGroup'` counts 4 Shadow Tree events. This should still pass since we didn't change those events. Verify by running:

Run: `npm test -- --testPathPattern=trace-format`
Expected: All tests pass.

**Step 5: Run full test suite**

Run: `npm test`
Expected: All 249+ tests pass.

**Step 6: Commit**

```
test: update trace-format tests for real per-node flame graphs
```

---

### Task 7: Clean up — remove buildTreeProfile and synthetic flame graph remnants

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Remove buildTreeProfile() method**

Delete the `buildTreeProfile()` method (the one that walks the tree producing `[type, subtreeSize]` pairs).

**Step 2: Remove treeProfile/treeProfileTotal from timing dict**

Delete these lines from `$$completeRoot`:
```swift
let treeProfile = self.buildTreeProfile(newChildren, engine: engine)
engine.setProperty(result, "treeProfile", treeProfile.profile)
engine.setProperty(result, "treeProfileTotal", engine.makeNumber(Double(treeProfile.total)))
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 4: Commit**

```
refactor: remove synthetic flame graph (replaced by real per-node timing)
```
