# Research: Mounting, Scheduling & Layout Pipeline

> Research into the pipeline from shadow tree commit to screen pixels: how React Native Fabric computes mutations via the Differentiator, how the MountingCoordinator delivers transactions, how the Scheduler orchestrates layout and commit, and how layout results flow to UIKit. This document analyzes Fabric's approach and describes the persistent mode design for react-dom-native.

---

## 1. React Native Fabric Pipeline Overview

React Native's Fabric renderer uses a three-phase pipeline:

### 1.1 The Three Phases

| Phase | Location | Thread | Purpose |
|-------|----------|--------|---------|
| **Render** | JavaScript | JS Thread | React executes component logic, creates React Element Tree. Renderer creates React Shadow Tree in C++. |
| **Commit** | C++ | Background Thread | Layout calculation (Yoga), tree promotion, scheduling mount. |
| **Mount** | C++ + Native | UI Thread | Tree diffing, mutation generation, UIView manipulation. |

### 1.2 Detailed Phase Breakdown

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RENDER PHASE                                       │
│                        (JavaScript Thread)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. React reconciler processes component tree                                │
│  2. Calls host config functions (createInstance, appendChild, etc.)          │
│  3. Host config calls into C++ via JSI (UIManagerBinding)                    │
│  4. C++ creates/clones ShadowNodes to build new Shadow Tree                  │
│  5. Shadow Tree is immutable, thread-safe                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMMIT PHASE                                       │
│                        (Background Thread)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Layout Calculation:                                                      │
│     - YGNodeCalculateLayout(rootNode, width, height, direction)              │
│     - Yoga traverses shadow tree, computes positions/sizes                   │
│     - Text nodes call platform-specific measure functions                    │
│                                                                              │
│  2. Tree Promotion:                                                          │
│     - New shadow tree becomes "next tree" (ready for mounting)               │
│     - Represents latest state of React Element Tree                          │
│     - Scheduled for next UI thread tick                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            MOUNT PHASE                                       │
│                          (UI Thread)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Tree Diffing (Differentiator):                                           │
│     - Compares "previously rendered tree" vs "next tree"                     │
│     - Generates list of atomic mutations                                     │
│     - View flattening optimizes away unnecessary host views                  │
│                                                                              │
│  2. Tree Promotion:                                                          │
│     - "Next tree" becomes "previously rendered tree"                         │
│     - Enables correct diffing for next update                                │
│                                                                              │
│  3. View Mounting:                                                           │
│     - Apply mutations to UIKit views (insertSubview, removeFromSuperview)    │
│     - Update view properties (backgroundColor, frame, etc.)                  │
│     - All UIKit operations synchronous on main thread                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Fabric's Differentiator

### 2.1 What the Differentiator Does

The Differentiator computes the minimal set of mutations needed to transform the old shadow tree into the new shadow tree. Located in `ReactCommon/react/renderer/mounting/Differentiator.h/.cpp`.

### 2.2 Mutation Types (ShadowViewMutation)

| Mutation | Description | UIKit Equivalent |
|----------|-------------|------------------|
| `Create` | Allocate a new native view | `UIView()` constructor |
| `Delete` | Deallocate a native view | View returned to pool or deallocated |
| `Insert` | Add view as child of parent at index | `parent.insertSubview(child, at: index)` |
| `Remove` | Remove view from parent | `child.removeFromSuperview()` |
| `Update` | Update view properties | Set view properties, frame, etc. |

### 2.3 Why Fabric Needs Tree Diffing

Fabric uses **persistent mode** (clone-on-write):
- ShadowNodes are immutable
- Every update creates a new shadow tree
- The reconciler doesn't track individual mutations
- Diffing is required to determine what changed

```cpp
// Fabric's persistent mode: reconciler returns new tree
ShadowTree::commit([](OldTree) {
    return NewTree;  // Whole new tree, must diff to find changes
});
```

### 2.4 Persistent Mode: Tree Diffing Required

react-dom-native uses **persistent mode** (same as Fabric):
- ShadowNodes are immutable
- Updates clone nodes rather than mutating in place
- The Differentiator compares old and new trees to generate mutations
- Tree diffing IS required

```javascript
// Persistent mode: reconciler clones instances, we diff to find changes
cloneInstance(instance, type, oldProps, newProps, keepChildren, recyclable);
// At commit time, replaceContainerChildren atomically swaps the tree
replaceContainerChildren(container, newChildSet);
```

**Key Insight**: For persistent mode, the Differentiator is essential. The reconciler builds a new immutable tree via cloning, and the Differentiator discovers what changed by comparing old and new trees.

---

## 3. MountingCoordinator

### 3.1 What MountingCoordinator Does in Fabric

The MountingCoordinator buffers shadow tree changes and coordinates their delivery to the mounting layer:

1. **Transaction Buffering**: Collects mutations from commit phase
2. **Thread Coordination**: Ensures mount happens on UI thread
3. **Revision Management**: Tracks which tree version is currently mounted
4. **Telemetry**: Tracks timing for performance monitoring

### 3.2 Why It Exists

Fabric runs layout on a background thread, but UIKit requires main thread access:

```
Background Thread              Main Thread
      │                            │
      ▼                            │
  Commit (layout)                  │
      │                            │
      └──── schedule ─────────────►│
                                   ▼
                              Mount (UIKit)
```

### 3.3 Do We Need MountingCoordinator?

For react-dom-native with **JS on main thread** and **persistent mode**:

| Fabric Pattern | react-dom-native | Needed? |
|----------------|------------------|---------|
| Background layout thread | Main thread layout | No thread hop |
| Transaction buffering | Atomic tree swap | Yes - for atomicity |
| Revision management | Tree versioning | Yes - for diffing |
| Async scheduling | Synchronous | No scheduler needed |

**Decision**: We need a simplified MountingCoordinator for persistent mode:
- Manages old and new tree references for diffing
- Coordinates atomic tree swap via `replaceContainerChildren()`
- No thread coordination needed (JS on main thread)
- Simpler than Fabric's full implementation

---

## 4. Scheduler

### 4.1 Fabric's Scheduler Role

The Scheduler (`ReactCommon/react/renderer/scheduler/Scheduler.h`) coordinates:

1. Surface lifecycle (start/stop surfaces)
2. Event dispatch routing
3. Layout triggering
4. Commit coordination
5. Mount scheduling

### 4.2 Threading Model in Fabric

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Thread              │ Operations                                           │
├──────────────────────┼──────────────────────────────────────────────────────┤
│  JS Thread           │ React render, reconciliation, event handlers         │
│  Background Thread   │ Layout calculation (Yoga), commit processing         │
│  UI Thread (Main)    │ UIKit operations, event capture, mounting            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Simplified Threading for react-dom-native

We collapse all threads to main thread:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MAIN THREAD (Only)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  - JavaScript execution (JavaScriptCore)                                     │
│  - React reconciliation                                                      │
│  - Yoga layout calculation                                                   │
│  - Shadow tree mutations                                                     │
│  - UIKit view updates                                                        │
│  - Event handling                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Benefits**:
- No thread synchronization needed
- No async scheduling complexity
- Discrete events execute synchronously (zero-frame response)
- Simpler debugging

**Trade-offs**:
- Long layout calculations block the main thread
- May need to optimize for large trees later (batch updates, defer work)

---

## 5. Layout Calculation Timing

### 5.1 When Yoga Layout is Triggered

In Fabric:
- Layout is calculated during the **commit phase**
- Happens on a **background thread**
- Uses `YGNodeCalculateLayout(root, width, height, direction)`

### 5.2 Layout Trigger Points

| Scenario | Trigger | Notes |
|----------|---------|-------|
| Initial render | After shadow tree complete | Full tree layout |
| Prop update | If layout-affecting props changed | Incremental, uses dirty flags |
| State update | If affects layout | May clone shared nodes |
| Container resize | External trigger | Re-layout from root |

### 5.3 Layout Calculation for react-dom-native

For persistent mode on main thread:

```javascript
// Host config - persistent mode
export function replaceContainerChildren(container, newChildren) {
    // Calculate layout on the new tree
    bridge.calculateLayout(container.rootTag, container.width, container.height);

    // Diff old tree vs new tree to generate mutations
    const mutations = bridge.diffTrees(container.oldTree, container.newTree);

    // Apply mutations to UIViews atomically
    bridge.applyMutations(mutations);

    // Promote new tree to old tree for next diff
    container.oldTree = container.newTree;
}
```

In persistent mode, layout is calculated on the new immutable tree before diffing:

```javascript
// Persistent mode workflow in replaceContainerChildren:
// 1. Calculate layout on new tree (Yoga traversal)
// 2. Diff old tree vs new tree (Differentiator)
// 3. Apply mutations to UIViews (atomic batch)
// 4. Promote new tree for next cycle
```

**Recommendation**: Calculate layout once per commit on the new tree, then diff and apply mutations atomically.

---

## 6. Layout Results to UIKit

### 6.1 LayoutMetrics Structure

After Yoga layout, each node has computed metrics:

```cpp
struct LayoutMetrics {
    // Position relative to parent
    float left;
    float top;

    // Computed dimensions
    float width;
    float height;

    // Computed spacing
    EdgeInsets padding;
    EdgeInsets border;
    EdgeInsets margin;

    // Overflow behavior
    bool hadOverflow;
};

LayoutMetrics getLayoutMetrics(YGNodeRef node) {
    return LayoutMetrics {
        .left = YGNodeLayoutGetLeft(node),
        .top = YGNodeLayoutGetTop(node),
        .width = YGNodeLayoutGetWidth(node),
        .height = YGNodeLayoutGetHeight(node),
        .padding = {
            .top = YGNodeLayoutGetPadding(node, YGEdgeTop),
            .left = YGNodeLayoutGetPadding(node, YGEdgeLeft),
            .bottom = YGNodeLayoutGetPadding(node, YGEdgeBottom),
            .right = YGNodeLayoutGetPadding(node, YGEdgeRight),
        },
        // ... etc
    };
}
```

### 6.2 Applying Layout to UIViews

```swift
func applyLayout(view: UIView, metrics: LayoutMetrics) {
    // Validate metrics (avoid NaN/Inf)
    guard metrics.left.isFinite,
          metrics.top.isFinite,
          metrics.width.isFinite,
          metrics.height.isFinite else {
        return
    }

    // Use center + bounds (safe with transforms)
    let frame = CGRect(
        x: CGFloat(metrics.left),
        y: CGFloat(metrics.top),
        width: CGFloat(metrics.width),
        height: CGFloat(metrics.height)
    )
    view.center = CGPoint(x: frame.midX, y: frame.midY)
    view.bounds = CGRect(origin: .zero, size: frame.size)
}
```

### 6.3 Incremental Layout Application

Use `YGNodeGetHasNewLayout` to only update views whose layout changed:

```swift
func applyLayoutRecursively(node: YGNodeRef, view: UIView) {
    // Check if this node's layout changed
    if YGNodeGetHasNewLayout(node) {
        // Mark as consumed
        YGNodeSetHasNewLayout(node, false)

        // Apply new layout
        let metrics = getLayoutMetrics(node)
        applyLayout(view: view, metrics: metrics)

        // Dispatch onLayout event if handler registered
        if hasLayoutHandler(node) {
            dispatchLayoutEvent(node, metrics)
        }
    }

    // Recurse to children
    let childCount = YGNodeGetChildCount(node)
    for i in 0..<childCount {
        let childNode = YGNodeGetChild(node, i)
        let childView = view.subviews[Int(i)]
        applyLayoutRecursively(node: childNode, view: childView)
    }
}
```

---

## 7. CATransaction for Batched Updates

### 7.1 Why Use CATransaction

UIKit implicitly animates certain property changes. We want to:
1. Disable implicit animations during React-driven updates
2. Batch multiple view changes into a single screen update
3. Ensure atomic visual updates

### 7.2 Implementation Pattern

```swift
func performMountingTransaction(mutations: [Mutation]) {
    // Disable implicit animations
    CATransaction.begin()
    CATransaction.setDisableActions(true)

    // Apply all mutations
    for mutation in mutations {
        switch mutation.type {
        case .create:
            createView(mutation)
        case .insert:
            insertView(mutation)
        case .remove:
            removeView(mutation)
        case .update:
            updateView(mutation)
        case .delete:
            deleteView(mutation)
        }
    }

    CATransaction.commit()
}
```

### 7.3 When to Use CATransaction

| Scenario | Use CATransaction? |
|----------|-------------------|
| React commit | Yes - batch all mutations |
| Layout application | Yes - disable animations |
| User-triggered animations | No - let UIKit animate |
| Programmatic animations | No - use explicit UIView.animate |

---

## 8. Proposed Architecture for react-dom-native

### 8.1 Persistent Mode Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ALL ON MAIN THREAD                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. React Render Phase                                                      │
│     └─► Reconciler calls host config functions                              │
│     └─► cloneInstance() creates new immutable nodes                         │
│     └─► appendInitialChild() builds new tree structure                      │
│                                                                             │
│  2. Host Config Cloning (during render)                                     │
│     └─► cloneInstance → creates new ShadowNode with new props               │
│     └─► Structural sharing: unchanged subtrees shared between old/new       │
│     └─► createContainerChildSet → collects new root children                │
│                                                                             │
│  3. Commit Phase (in replaceContainerChildren)                              │
│     └─► Calculate layout on new tree: YGNodeCalculateLayout(newRoot)        │
│     └─► Diff old tree vs new tree (Differentiator)                          │
│     └─► Generate mutation list: Create, Delete, Insert, Remove, Update      │
│                                                                             │
│  4. View Mounting (atomic batch)                                            │
│     └─► CATransaction.begin()                                               │
│     └─► Apply mutations to UIViews in order                                 │
│     └─► Apply layout results to UIView frames                               │
│     └─► CATransaction.commit()                                              │
│                                                                             │
│  5. Tree Promotion                                                          │
│     └─► New tree becomes "previously rendered tree" for next diff           │
│     └─► Dispatch onLayout events                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Key Components

| Component | Purpose | Fabric Equivalent |
|-----------|---------|-------------------|
| `ShadowTree` | Immutable shadow nodes with Yoga | `ShadowTree` (same pattern) |
| `Differentiator` | Compare old/new trees, generate mutations | `Differentiator` |
| `MountingCoordinator` | Manage tree references, atomic swap | `MountingCoordinator` (simplified) |
| `MountingManager` | Apply mutations to UIViews | Platform mounting layer |
| `ViewRegistry` | ShadowNodeFamily* <-> UIView* mapping | `RCTComponentViewRegistry` |
| `EventDispatcher` | Route events to JS | `EventDispatcher` |

### 8.3 What We Keep from Fabric

| Fabric Component | Reason for Keeping |
|------------------|------------------------|
| Differentiator | Required for persistent mode - generates mutations from tree diff |
| MountingCoordinator | Manages old/new tree references, coordinates atomic swap |
| Tree cloning | Immutable shadow nodes enable concurrent features |
| ShadowNodeFamily | Stable identity across clones for diffing |

### 8.4 What We Simplify

| Fabric Component | Simplification |
|------------------|------------------------|
| Background thread scheduling | Everything on main thread |
| Complex threading | No thread coordination needed |
| Transaction buffering | Simpler - atomic swap via replaceContainerChildren |

---

## 9. Implementation: Persistent Mode Components

### 9.1 Differentiator Interface

```cpp
// Differentiator compares two immutable shadow trees
class Differentiator {
public:
    std::vector<Mutation> diff(
        ShadowNode::Shared oldTree,
        ShadowNode::Shared newTree
    );
};

// Mutation types generated by Differentiator
enum class MutationType {
    Create,   // New node needs a UIView
    Delete,   // Node removed, deallocate UIView
    Insert,   // Attach node as child of parent at index
    Remove,   // Detach node from parent
    Update    // Props or layout changed
};

struct Mutation {
    MutationType type;
    ShadowNode::Shared node;
    ShadowNode::Shared parent;  // For Insert/Remove
    int index;                   // For Insert
    LayoutMetrics layoutMetrics; // For Update
};
```

### 9.2 MountingCoordinator Interface

```swift
protocol MountingCoordinator {
    // Tree management
    var currentTree: ShadowNode? { get }
    var pendingTree: ShadowNode? { get set }

    // Atomic commit
    func commitPendingTree() -> [Mutation]
}

class MountingCoordinatorImpl: MountingCoordinator {
    private var _currentTree: ShadowNode?
    private var _pendingTree: ShadowNode?
    private let differentiator = Differentiator()

    var currentTree: ShadowNode? { _currentTree }
    var pendingTree: ShadowNode? {
        get { _pendingTree }
        set { _pendingTree = newValue }
    }

    func commitPendingTree() -> [Mutation] {
        guard let newTree = _pendingTree else { return [] }

        // Diff old vs new tree
        let mutations = differentiator.diff(
            oldTree: _currentTree,
            newTree: newTree
        )

        // Promote new tree to current
        _currentTree = newTree
        _pendingTree = nil

        return mutations
    }
}
```

### 9.3 MountingManager Interface

```swift
protocol MountingManager {
    // Apply mutations from Differentiator to UIViews
    func applyMutations(_ mutations: [Mutation])

    // View registry
    func getView(for family: ShadowNodeFamily) -> UIView?
    func registerView(_ view: UIView, for family: ShadowNodeFamily)
}

class MountingManagerImpl: MountingManager {
    private let viewRegistry = ViewRegistry()  // ShadowNodeFamily -> UIView
    private let viewPool = ViewPool()

    func applyMutations(_ mutations: [Mutation]) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)

        for mutation in mutations {
            switch mutation.type {
            case .create:
                let view = viewPool.dequeue(type: mutation.node.type)
                    ?? createNativeView(type: mutation.node.type)
                viewRegistry.register(family: mutation.node.family, view: view)

            case .delete:
                if let view = viewRegistry.getView(mutation.node.family) {
                    viewPool.enqueue(view, type: mutation.node.type)
                    viewRegistry.unregister(family: mutation.node.family)
                }

            case .insert:
                guard let parentView = viewRegistry.getView(mutation.parent.family),
                      let childView = viewRegistry.getView(mutation.node.family) else { continue }
                parentView.insertSubview(childView, at: mutation.index)

            case .remove:
                if let childView = viewRegistry.getView(mutation.node.family) {
                    childView.removeFromSuperview()
                }

            case .update:
                if let view = viewRegistry.getView(mutation.node.family) {
                    applyProps(mutation.node.props, to: view)
                    applyLayout(mutation.layoutMetrics, to: view)
                }
            }
        }

        CATransaction.commit()
    }

    private func applyLayout(_ metrics: LayoutMetrics, to view: UIView) {
        let frame = CGRect(
            x: CGFloat(metrics.left),
            y: CGFloat(metrics.top),
            width: CGFloat(metrics.width),
            height: CGFloat(metrics.height)
        )
        view.center = CGPoint(x: frame.midX, y: frame.midY)
        view.bounds = CGRect(origin: .zero, size: frame.size)
    }
}
```

---

## 10. Host Config Integration

### 10.1 Persistent Mode Functions

```javascript
// packages/renderer/src/HostConfig.js
// Persistent mode host config

export const supportsPersistence = true;
export const supportsMutation = false;

const bridge = getNativeBridge();

export function createInstance(type, props, rootContainer, hostContext, internalInstanceHandle) {
    // Create immutable shadow node via JSI
    const shadowNode = bridge.createNode(type, props, internalInstanceHandle);
    return {
        _nativeNode: shadowNode,
        _internalInstanceHandle: internalInstanceHandle,
        type,
        props,
    };
}

// Persistent mode: clone instead of mutate
export function cloneInstance(instance, type, oldProps, newProps, keepChildren, recyclableInstance) {
    // Clone shadow node with new props (old node unchanged)
    const clonedNode = bridge.cloneNode(
        instance._nativeNode,
        newProps,
        keepChildren
    );
    return {
        _nativeNode: clonedNode,
        _internalInstanceHandle: instance._internalInstanceHandle,
        type,
        props: newProps,
    };
}

export function cloneHiddenInstance(instance, type, props, internalInstanceHandle) {
    return bridge.cloneNodeWithHiddenFlag(instance._nativeNode, true);
}

export function cloneHiddenTextInstance(instance, text, internalInstanceHandle) {
    return bridge.cloneTextNodeWithHiddenFlag(instance._nativeNode, true);
}

// Container child set for atomic root updates
export function createContainerChildSet(container) {
    return [];
}

export function appendChildToContainerChildSet(childSet, child) {
    childSet.push(child);
}

export function finalizeContainerChildren(container, newChildren) {
    // Build new tree from children - prepare for diff
    container.pendingTree = bridge.buildTree(newChildren);
}

export function replaceContainerChildren(container, newChildren) {
    // Calculate layout on new tree
    bridge.calculateLayout(
        container.pendingTree,
        container.width,
        container.height
    );

    // Diff old tree vs new tree, get mutations
    const mutations = bridge.diffTrees(
        container.currentTree,
        container.pendingTree
    );

    // Apply mutations to UIViews atomically
    bridge.applyMutations(mutations);

    // Promote new tree to current
    container.currentTree = container.pendingTree;
    container.pendingTree = null;

    // Dispatch onLayout events
    bridge.dispatchLayoutEvents();
}
```

### 10.2 Commit Lifecycle

```javascript
export function prepareForCommit(containerInfo) {
    // No-op in persistent mode - tree is built during render
    return null;
}

export function resetAfterCommit(containerInfo) {
    // In persistent mode, main work happens in replaceContainerChildren
    // This is called after the atomic tree swap is complete
}
```

---

## 11. Threading Safety Considerations

### 11.1 Main Thread Assertion

```swift
extension MountingManager {
    func assertMainThread() {
        assert(Thread.isMainThread, "MountingManager must be called on main thread")
    }

    func createView(type: String, props: [String: Any]) -> ShadowNode {
        assertMainThread()
        // ... implementation
    }
}
```

### 11.2 Future: Moving Layout Off Main Thread

If layout becomes a bottleneck, persistent mode enables safe background layout:

```swift
// Future optimization: background layout (enabled by immutable trees)
func performLayoutAsync(newTree: ShadowNode, completion: @escaping ([Mutation]) -> Void) {
    DispatchQueue.global(qos: .userInitiated).async {
        // Yoga layout is thread-safe on immutable tree
        YGNodeCalculateLayout(newTree.yogaNode, width, height, YGDirectionLTR)

        // Diff is also thread-safe with immutable trees
        let mutations = self.differentiator.diff(
            oldTree: self.currentTree,
            newTree: newTree
        )

        DispatchQueue.main.async {
            // Apply mutations to views on main thread
            self.mountingManager.applyMutations(mutations)
            self.currentTree = newTree
            completion(mutations)
        }
    }
}
```

**Key Benefit of Persistent Mode**: Immutable shadow trees enable safe concurrent access. Layout and diffing can run on background threads while the current tree remains stable for event handling.

For now, synchronous main-thread layout is simpler and sufficient.

---

## 12. Summary

### 12.1 Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tree diffing | Required (Differentiator) | Persistent mode requires comparing old/new trees |
| MountingCoordinator | Simplified version | Manages tree references for diffing and atomic swap |
| Layout thread | Main thread (initially) | Simplicity; can move to background later |
| Layout trigger | replaceContainerChildren | Batch layout once per commit on new tree |
| View updates | CATransaction | Disable animations, batch updates |
| Instance update | cloneInstance | Persistent mode clones instead of mutating |

### 12.2 Pipeline Summary

1. **Render**: React reconciler calls `cloneInstance()` to build new immutable tree
2. **Clone**: Host config clones shadow nodes with new props, structural sharing for unchanged subtrees
3. **Commit**: `replaceContainerChildren()` triggers layout on new tree
4. **Diff**: Differentiator compares old tree vs new tree, generates mutations
5. **Mount**: Apply mutations to UIViews atomically, apply layout to frames
6. **Promote**: New tree becomes current tree for next diff cycle
7. **Events**: Dispatch onLayout events to nodes with handlers

### 12.3 What We Keep from Fabric

- ShadowNode structure (immutable, with cloning)
- ShadowNodeFamily for stable identity across clones
- Differentiator for tree comparison
- Yoga integration pattern (embedded YGNode per ShadowNode)
- ViewRegistry pattern (family <-> view mapping)
- LayoutMetrics structure
- CATransaction batching
- MountingCoordinator (simplified)

### 12.4 What We Simplify

- Single-threaded execution (main thread only initially)
- No complex thread coordination
- Simpler MountingCoordinator (no async scheduling)
- No transaction buffering (atomic swap via replaceContainerChildren)

---

## References

- [React Native Render Pipeline](https://reactnative.dev/architecture/render-pipeline)
- [React Native Fabric Architecture](https://reactnative.dev/architecture/fabric-renderer)
- [Fabric Deep Dive Discussion](https://github.com/reactwg/react-native-new-architecture/discussions/1)
- [React Reconciler README](https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md)
- [react-reconciler npm package](https://www.npmjs.com/package/react-reconciler)
