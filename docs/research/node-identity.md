# Research: Node Identity Without reactTag

Research into how React Native Fabric identifies nodes using `Tag` (int32_t), and how react-dom-native can implement node identity without integer tags using `InstanceHandle` (JSI object references) and `ShadowNodeFamily` pointers for stable identity across clones.

> **Note**: react-dom-native uses **persistent mode** where shadow nodes are immutable and cloned on update. This means `ShadowNode*` pointer identity changes across updates, requiring `ShadowNodeFamily` for stable identity (matching Fabric's architecture).

---

## 1. Tag Usage Inventory in Fabric

React Native Fabric uses `Tag` (int32_t) extensively. Here is a complete inventory of tag usage patterns:

### 1.1 Core Tag Generation (JS Side)

In `ReactFiberConfigNative.js` (the Fabric renderer host config):

```javascript
// Tag allocation pattern
let nextReactTag = 3;  // Starting value

function allocateTag() {
  let tag = nextReactTag;
  // Tags are incremented by 2:
  // - Even tags (% 2 === 0) indicate Fabric renderer
  // - Tags where % 10 === 1 indicate root tags
  nextReactTag = tag + 2;
  return tag;
}
```

Tags are passed to `FabricUIManager.createNode()`:
- `reactTag`: The allocated integer identifier
- `viewName`: Component type string
- `rootTag`: Surface ID for the root
- `props`: Initial properties
- `instanceHandle`: The Fiber's internal handle

### 1.2 C++ Tag Usage

| Location | Purpose | Required for react-dom-native? |
|----------|---------|-------------------------------|
| `ShadowNodeFamily` | Stores tag for debugging, event routing | No - deprecated, use InstanceHandle |
| `ShadowView` | Serialized tag for mutations | Maybe - only if mutations need identity |
| `ShadowViewMutation` | `oldChildShadowView.tag`, `newChildShadowView.tag` | No - use ShadowNode pointers |
| `UIManagerBinding.cpp` | Event target lookup via `tagFromValue()` | No - use InstanceHandle directly |
| `Differentiator` | Tree comparison | No - uses ShadowNode pointer equality |
| `MountingCoordinator` | View mapping for mutations | Maybe - depends on implementation |

### 1.3 Tag Usage Categories

**Category 1: Event Dispatch (Can Replace with InstanceHandle)**
- `dispatchEventToJS` receives tag from native touch handler
- Used to look up the fiber that should receive the event
- **Replacement**: Pass `InstanceHandle` directly from event emitter

**Category 2: Mounting Coordination (Can Replace with Pointer)**
- Maps ShadowNodes to UIViews during mount
- Used in `RCTComponentViewRegistry` to find views
- **Replacement**: Use `ShadowNode*` pointer cast to `uintptr_t` as map key

**Category 3: Debugging/DevTools (Optional)**
- DevTools displays tags for component inspection
- `findFiberByHostInstance` uses tags
- **Replacement**: Auto-increment ID for debug purposes only (not used in production paths)

**Category 4: Surface Management (Still Needed)**
- `SurfaceId` distinguishes multiple React roots
- Required for multi-root apps (e.g., multiple React Native views in one app)
- **Keep**: SurfaceId is still needed

---

## 2. InstanceHandle Deep Dive

### 2.1 What is InstanceHandle?

`InstanceHandle` is a JSI-based identity mechanism that wraps a reference to the React Fiber:

```cpp
// Conceptual structure (from Fabric source)
class InstanceHandle {
  // JSI weak object reference to the Fiber
  jsi::WeakObject weakHandle_;

public:
  // Get the Fiber's JSI value
  jsi::Value getInstanceHandle(jsi::Runtime& runtime) const {
    return weakHandle_.lock(runtime);
  }

  // Check if the Fiber is still alive
  bool isValid() const {
    return !weakHandle_.expired();
  }
};
```

### 2.2 How InstanceHandle Flows Through the System

```
┌─────────────────────────────────────────────────────────────────┐
│                        JavaScript                                │
│  createInstance(type, props, container, hostContext,            │
│                 internalInstanceHandle) ──────────────────┐     │
│                                                           │     │
│  // internalInstanceHandle is the Fiber object            │     │
└───────────────────────────────────────────────────────────│─────┘
                                                            │
                                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   JSI Bridge Layer                               │
│  FabricUIManager.createNode(reactTag, viewName, rootTag,        │
│                             props, instanceHandle) ───────┐     │
│                                                           │     │
│  // instanceHandle is passed as JSI Object                │     │
└───────────────────────────────────────────────────────────│─────┘
                                                            │
                                                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      C++ Shadow Tree                             │
│  ShadowNodeFamily {                                              │
│    InstanceHandle::Shared instanceHandle_;                       │
│    // ... other fields                                           │
│  }                                                               │
│                                                                  │
│  EventEmitter {                                                  │
│    EventTarget eventTarget_;  // holds weak ref to InstanceHandle│
│  }                                                               │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 InstanceHandle for Event Dispatch

From the Fabric commit that simplified EventEmitter/EventTarget ([source](https://github.com/facebook/react-native/commit/93dd790cad67107d0aa5181f7d70e95c6223362d)):

> "Instead of relying on an explicit `RawEventDispatchable` function, we simply check the existence of the `weak_ptr` to `EventTarget`. This is efficient and sufficient because only an EventEmitter retains an associated EventTarget."

The event flow using InstanceHandle:

```cpp
// In UIManagerBinding.cpp dispatchEventToJS
void dispatchEventToJS(
    jsi::Runtime& runtime,
    EventTarget const* eventTarget,
    std::string eventType,
    ValueFactory payloadFactory) {

  // Get InstanceHandle from EventTarget
  auto instanceHandle = eventTarget->getInstanceHandle(runtime);

  if (instanceHandle.isNull()) {
    // Node was unmounted, drop the event
    LOG(WARNING) << "instanceHandle is null, event will be dropped";
    return;
  }

  // Mix target into payload
  auto payload = payloadFactory(runtime);

  // Call JS event handler with instanceHandle (NOT tag)
  eventHandler_.call(runtime, instanceHandle, eventType, payload);
}
```

### 2.4 Advantages of InstanceHandle over Tag

| Aspect | Tag (int32_t) | InstanceHandle |
|--------|---------------|----------------|
| Memory | Fixed 4 bytes | Variable (JSI object) |
| Lookup | O(1) hash map lookup | Direct reference |
| Lifecycle | Manual invalidation needed | Automatic via weak reference |
| Thread safety | Requires synchronization | JSI handles it |
| Identity across GC | May conflict after overflow | Unique per Fiber lifetime |
| Type safety | Just a number | Typed reference to Fiber |

---

## 3. Proposed Identity Scheme for react-dom-native

### 3.1 Overview

We use a **layered identity scheme** designed for persistent mode:

1. **Stable Identity**: `ShadowNodeFamily*` provides stable identity across clones
2. **JS<->C++ Crossing**: `InstanceHandle` (JSI weak object) stored in family for event dispatch
3. **C++ -> UIKit Mounting**: `ShadowNodeFamily*` cast to `uintptr_t` as map key (NOT `ShadowNode*` which changes on clone)
4. **Individual Instances**: `ShadowNode*` for accessing current props/layout (immutable, replaced on update)
5. **Debug Only**: Auto-increment ID for DevTools (not used in hot paths)

**Critical Insight**: In persistent mode, `ShadowNode*` changes every time props or children change (the node is cloned). The `ShadowNodeFamily` is shared across all clones and provides continuity.

### 3.2 Instance Type Definition

```typescript
// In renderer host config (persistent mode)
export type Instance = {
  // The ShadowNodeFamily pointer (stable across clones)
  _nativeFamily: NativeFamily;  // JSI HostObject wrapping ShadowNodeFamily*

  // Current ShadowNode pointer (changes on each clone)
  // Note: In persistent mode, this is updated when cloneInstance returns a new node
  _nativeNode: NativeNode;  // JSI HostObject wrapping ShadowNode*

  // The original Fiber handle for event dispatch (stored in family)
  _internalInstanceHandle: Object;  // The Fiber

  // Element type for recycling
  type: string;

  // Props for diffing (immutable - from current node)
  props: Props;

  // Children array for tree operations (immutable - structural sharing)
  children: Array<Instance | TextInstance>;

  // Debug ID (only set in DEV)
  __DEV__debugId?: number;
};

export type TextInstance = {
  _nativeFamily: NativeFamily;
  _nativeNode: NativeNode;
  _internalInstanceHandle: Object;
  text: string;
  __DEV__debugId?: number;
};
```

**Persistent Mode Behavior**: When `cloneInstance` is called, a new `Instance` object is returned with:
- Same `_nativeFamily` (identity preserved)
- New `_nativeNode` (pointing to the cloned ShadowNode)
- Same `_internalInstanceHandle` (stored in family)
- New `props` (the updated props)

### 3.3 Identity Flow Diagram (Persistent Mode)

```
┌──────────────────────────────────────────────────────────────────┐
│                    React Reconciler                               │
│                                                                   │
│  createInstance(type, props, ..., internalInstanceHandle)        │
│       │                                                          │
│       │  Creates initial node AND family                         │
│       ▼                                                          │
│  cloneInstance(instance, type, oldProps, newProps, ...)          │
│       │                                                          │
│       │  Clones node, preserves family identity                  │
│       ▼                                                          │
└───────┬──────────────────────────────────────────────────────────┘
        │
        │ JSI Call: bridge.createNode / bridge.cloneNode
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    C++ Shadow Tree (Persistent Mode)              │
│                                                                   │
│  ShadowNode::Shared createNode(type, props, instanceHandle) {    │
│    // Create family (stable identity)                            │
│    auto family = std::make_shared<ShadowNodeFamily>(             │
│      instanceHandle, surfaceId);                                 │
│                                                                   │
│    // Create immutable node                                       │
│    auto node = std::make_shared<ShadowNode>(type, props, family);│
│    return node;                                                   │
│  }                                                                │
│                                                                   │
│  ShadowNode::Shared cloneNode(oldNode, newProps) {               │
│    // Family is SHARED - identity preserved                       │
│    auto newNode = std::make_shared<ShadowNode>(                  │
│      oldNode->getType(),                                         │
│      newProps,                                                   │
│      oldNode->getFamily()  // Same family!                       │
│    );                                                            │
│    return newNode;  // Different pointer, same logical identity  │
│  }                                                                │
└───────┬──────────────────────────────────────────────────────────┘
        │
        │ After layout: Diff old/new trees, generate mutations
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Mounting Layer (UIKit)                         │
│                                                                   │
│  // Map ShadowNodeFamily* -> UIView (NOT ShadowNode*)            │
│  // This is critical: family provides stable identity across     │
│  // clones, while ShadowNode* changes on every update            │
│  std::unordered_map<uintptr_t, UIView*> familyToView_;           │
│                                                                   │
│  void mount(ShadowNode::Shared node) {                           │
│    auto key = reinterpret_cast<uintptr_t>(node->getFamily().get());│
│    UIView* view = createView(node->getType());                    │
│    familyToView_[key] = view;                                     │
│  }                                                                │
│                                                                   │
│  UIView* getView(ShadowNode::Shared node) {                      │
│    auto key = reinterpret_cast<uintptr_t>(node->getFamily().get());│
│    return familyToView_[key];                                     │
│  }                                                                │
└──────────────────────────────────────────────────────────────────┘
```

**Key Difference from Mutation Mode**: In mutation mode, `ShadowNode*` would be stable and usable as a map key. In persistent mode, only `ShadowNodeFamily*` is stable.

---

## 4. Impact on Event Dispatch

### 4.1 Event Flow Without Tags

```
┌─────────────────────────────────────────────────────────────────┐
│  1. UIKit Touch Event                                            │
│     touchesBegan(_ touches: Set<UITouch>, with event: UIEvent)  │
│                         │                                        │
│                         ▼                                        │
│  2. Hit Test → Find touched UIView                               │
│     let targetView = hitTest(point, with: event)                │
│                         │                                        │
│                         ▼                                        │
│  3. Get ShadowNode* from UIView                                  │
│     let shadowNode = viewToNode[targetView]                     │
│                         │                                        │
│                         ▼                                        │
│  4. Get EventEmitter from ShadowNode                             │
│     let emitter = shadowNode.getEventEmitter()                  │
│                         │                                        │
│                         ▼                                        │
│  5. EventEmitter dispatches via InstanceHandle                   │
│     emitter.dispatchEvent("onClick", payload)                   │
│     // Uses EventTarget.getInstanceHandle(runtime)              │
│                         │                                        │
│                         ▼                                        │
│  6. JS receives event on correct Fiber                           │
│     // instanceHandle IS the Fiber, direct dispatch             │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Bidirectional View-Family Mapping (Persistent Mode)

In persistent mode, we map `ShadowNodeFamily*` to views, not `ShadowNode*`:

```cpp
class ViewRegistry {
private:
  // Forward: ShadowNodeFamily* -> UIView* (family is stable across clones)
  std::unordered_map<uintptr_t, void*> familyToView_;

  // Reverse: UIView* -> ShadowNodeFamily* (for event dispatch)
  std::unordered_map<uintptr_t, void*> viewToFamily_;

  // Current node for each family (updated on each clone)
  std::unordered_map<uintptr_t, ShadowNode::Shared> familyToCurrentNode_;

public:
  void registerView(ShadowNode::Shared node, UIView* view) {
    auto family = node->getFamily().get();
    auto familyKey = reinterpret_cast<uintptr_t>(family);
    auto viewKey = reinterpret_cast<uintptr_t>((__bridge void*)view);

    familyToView_[familyKey] = (__bridge void*)view;
    viewToFamily_[viewKey] = family;
    familyToCurrentNode_[familyKey] = node;
  }

  // Update the current node when a clone happens
  void updateCurrentNode(ShadowNode::Shared newNode) {
    auto familyKey = reinterpret_cast<uintptr_t>(newNode->getFamily().get());
    familyToCurrentNode_[familyKey] = newNode;
  }

  UIView* getView(ShadowNode::Shared node) {
    auto key = reinterpret_cast<uintptr_t>(node->getFamily().get());
    auto it = familyToView_.find(key);
    return it != familyToView_.end() ? (__bridge UIView*)it->second : nil;
  }

  // Get family from view (for event dispatch)
  ShadowNodeFamily* getFamily(UIView* view) {
    auto key = reinterpret_cast<uintptr_t>((__bridge void*)view);
    auto it = viewToFamily_.find(key);
    return it != viewToFamily_.end() ? static_cast<ShadowNodeFamily*>(it->second) : nullptr;
  }

  // Get current node for a family (to access latest props/layout)
  ShadowNode::Shared getCurrentNode(ShadowNodeFamily* family) {
    auto key = reinterpret_cast<uintptr_t>(family);
    auto it = familyToCurrentNode_.find(key);
    return it != familyToCurrentNode_.end() ? it->second : nullptr;
  }

  void unregister(ShadowNode::Shared node, UIView* view) {
    auto familyKey = reinterpret_cast<uintptr_t>(node->getFamily().get());
    familyToView_.erase(familyKey);
    familyToCurrentNode_.erase(familyKey);
    viewToFamily_.erase(reinterpret_cast<uintptr_t>((__bridge void*)view));
  }
};
```

**Why Family, Not Node**: In persistent mode, when props change, `cloneInstance` creates a new `ShadowNode` with a different pointer. If we keyed by `ShadowNode*`, the view mapping would break on every update. By keying on `ShadowNodeFamily*`, the mapping survives clones.

### 4.3 Event Dispatch Implementation (Persistent Mode)

In persistent mode, the `InstanceHandle` is stored in the `ShadowNodeFamily`, not the individual `ShadowNode`. This is critical because the family survives clones:

```cpp
// EventDispatcher.cpp
class EventDispatcher {
  jsi::Runtime& runtime_;
  jsi::Function eventHandler_;

public:
  void dispatchEvent(
      ShadowNodeFamily* targetFamily,  // Use family, not node
      const std::string& eventType,
      const EventPayload& payload) {

    // Get InstanceHandle from ShadowNodeFamily (stable across clones)
    auto instanceHandle = targetFamily->getInstanceHandle(runtime_);
    if (instanceHandle.isNull()) {
      // Node was unmounted, silently drop the event
      return;
    }

    // Dispatch to JS with instanceHandle as target
    eventHandler_.call(
      runtime_,
      instanceHandle,
      jsi::String::createFromUtf8(runtime_, eventType),
      payload.toJSI(runtime_)
    );
  }
};

// Event flow from UIKit:
// 1. Touch event on UIView
// 2. ViewRegistry.getFamily(view) -> ShadowNodeFamily*
// 3. dispatchEvent(family, "onClick", payload)
// 4. Family provides stable InstanceHandle to reach correct Fiber
```

**Why This Works in Persistent Mode**: The `InstanceHandle` is stored in the `ShadowNodeFamily`, which is shared across all clones of a logical node. Even after many prop updates (each creating a new `ShadowNode`), the same family holds the same `InstanceHandle` pointing to the same React Fiber.

---

## 5. Impact on Tree Diffing (Persistent Mode)

### 5.1 Why Diffing is Required in Persistent Mode

In persistent mode, the reconciler produces a new immutable tree on each update. Unlike mutation mode where the reconciler tells us exactly what changed via `appendChild`, `removeChild`, and `commitUpdate` calls, persistent mode requires **tree diffing** to discover the changes.

The Differentiator compares old and new trees, using `ShadowNodeFamily` pointer equality (NOT `ShadowNode*`) to match nodes across trees:

```cpp
// From Differentiator.cpp (conceptual)
void calculateDifferences(
    ShadowNode::Shared oldTree,
    ShadowNode::Shared newTree,
    std::vector<Mutation>& mutations) {

  // First check: if same object reference, structural sharing means no changes
  if (oldTree.get() == newTree.get()) {
    return;  // Unchanged subtree (structural sharing)
  }

  // Identity is determined by ShadowNodeFamily pointer
  // NOT by ShadowNode pointer (which changes on every clone)
  if (oldTree->getFamily().get() == newTree->getFamily().get()) {
    // Same logical node - check for prop/state/layout changes
    if (oldTree->getProps() != newTree->getProps() ||
        oldTree->getLayoutMetrics() != newTree->getLayoutMetrics()) {
      mutations.push_back(Mutation::Update(newTree));
    }
    // Recurse on children
    diffChildren(oldTree, newTree, mutations);
  } else {
    // Different logical nodes - remove old, insert new
    mutations.push_back(Mutation::Remove(oldTree));
    mutations.push_back(Mutation::Insert(newTree));
  }
}
```

### 5.2 ShadowNodeFamily Identity (Critical for Persistent Mode)

The `ShadowNodeFamily` is the **only stable identity** for a component instance in persistent mode. Individual `ShadowNode` instances are immutable and replaced on every prop/child change.

```cpp
class ShadowNodeFamily {
public:
  using Shared = std::shared_ptr<ShadowNodeFamily>;
  using Weak = std::weak_ptr<ShadowNodeFamily>;

private:
  // The instance handle links to the React Fiber (survives all clones)
  InstanceHandle::Shared instanceHandle_;

  // Surface ID for multi-root support
  SurfaceId surfaceId_;

  // Parent family for tree walking
  ShadowNodeFamily::Weak parent_;

  // No tag needed - family pointer IS the identity

public:
  // Get the InstanceHandle for event dispatch
  jsi::Value getInstanceHandle(jsi::Runtime& runtime) const;

  // Check if this is the same logical component
  bool isSameFamily(const ShadowNodeFamily& other) const {
    return this == &other;  // Pointer comparison
  }
};
```

### 5.3 ShadowNode with Family Reference

Each `ShadowNode` holds a shared pointer to its family:

```cpp
class ShadowNode {
public:
  using Shared = std::shared_ptr<const ShadowNode>;

private:
  ShadowNodeFamily::Shared family_;  // Stable identity
  Props::Shared props_;              // Immutable props
  SharedListOfShared children_;      // Immutable children
  LayoutMetrics layoutMetrics_;      // Computed layout

public:
  // Clone with new props (family preserved)
  Shared cloneWithNewProps(Props::Shared newProps) const {
    auto clone = std::make_shared<ShadowNode>(*this);
    clone->props_ = std::move(newProps);
    // family_ is copied - same family object shared
    return clone;
  }

  // Clone with new children (family preserved)
  Shared cloneWithNewChildren(SharedListOfShared newChildren) const {
    auto clone = std::make_shared<ShadowNode>(*this);
    clone->children_ = std::move(newChildren);
    return clone;
  }

  // Access family for identity operations
  ShadowNodeFamily::Shared getFamily() const {
    return family_;
  }
};
```

---

## 6. Impact on Mounting (Persistent Mode)

### 6.1 Mutation Operations

The Differentiator produces mutations that reference `ShadowNode::Shared`. The mounting layer uses the node's family for view lookup:

```cpp
struct Mutation {
  enum class Type { Create, Delete, Insert, Remove, Update };

  Type type;
  ShadowNode::Shared oldNode;  // For Remove, Update (old version)
  ShadowNode::Shared newNode;  // For Create, Insert, Update (new version)
  ShadowNode::Shared parentNode;  // For Insert, Remove
  int index;  // For Insert
};
```

### 6.2 Mounting Layer Implementation (Persistent Mode)

Key difference from mutation mode: We use `ShadowNodeFamily*` for view registry keys, not `ShadowNode*`:

```cpp
class MountingManager {
  ViewRegistry registry_;  // Keyed by ShadowNodeFamily*
  ViewPool viewPool_;

public:
  void performMutations(const std::vector<Mutation>& mutations) {
    for (const auto& mutation : mutations) {
      switch (mutation.type) {
        case Mutation::Type::Create: {
          auto node = mutation.newNode;
          auto view = viewPool_.dequeue(node->getType());
          if (!view) {
            view = createView(node->getType());
          }
          // Register by family, not by node pointer
          registry_.registerView(node, view);
          applyProps(view, node->getProps());
          break;
        }

        case Mutation::Type::Insert: {
          // getView uses family internally
          auto parentView = registry_.getView(mutation.parentNode);
          auto childView = registry_.getView(mutation.newNode);
          parentView.insertSubview(childView, at: mutation.index);
          break;
        }

        case Mutation::Type::Remove: {
          auto childView = registry_.getView(mutation.oldNode);
          childView.removeFromSuperview();
          break;
        }

        case Mutation::Type::Delete: {
          auto node = mutation.oldNode;
          auto view = registry_.getView(node);
          registry_.unregister(node, view);
          viewPool_.enqueue(view, node->getType());
          break;
        }

        case Mutation::Type::Update: {
          // In persistent mode, Update means props/layout changed
          // The newNode has different pointer but same family
          auto view = registry_.getView(mutation.newNode);
          // Update current node reference in registry
          registry_.updateCurrentNode(mutation.newNode);
          applyProps(view, mutation.newNode->getProps());
          break;
        }
      }
    }
  }
};
```

**Critical Persistent Mode Detail**: In the `Update` case, `mutation.oldNode` and `mutation.newNode` are different `ShadowNode` objects (different pointers) but share the same `ShadowNodeFamily`. The view lookup works because it's keyed by family, not by the individual node pointer.

---

## 7. Impact on Debugging and DevTools

### 7.1 Debug IDs (Persistent Mode)

For DevTools integration, we use a separate debug ID allocated in development. In persistent mode, the debug ID is stored in the instance (which is preserved across clones via the family reference):

```javascript
// Only in DEV builds
let __DEV__nextDebugId = 1;

function createInstance(type, props, container, hostContext, internalInstanceHandle) {
  // In persistent mode, createInstance creates both family and initial node
  const nativeFamily = bridge.createFamily(internalInstanceHandle);
  const nativeNode = bridge.createNode(type, props, nativeFamily);

  const instance = {
    _nativeFamily: nativeFamily,  // Stable identity
    _nativeNode: nativeNode,      // Current node (will change on clone)
    _internalInstanceHandle: internalInstanceHandle,
    type,
    props,
    children: [],
  };

  if (__DEV__) {
    // Debug ID attached to instance - preserved through cloneInstance
    instance.__DEV__debugId = __DEV__nextDebugId++;
  }

  return instance;
}

function cloneInstance(instance, type, oldProps, newProps, keepChildren, recyclableInstance) {
  // Clone creates new node with same family
  const newNativeNode = bridge.cloneNode(instance._nativeNode, newProps);

  return {
    _nativeFamily: instance._nativeFamily,  // Same family (identity preserved)
    _nativeNode: newNativeNode,             // New node pointer
    _internalInstanceHandle: instance._internalInstanceHandle,
    type,
    props: newProps,
    children: keepChildren ? instance.children : [],
    __DEV__debugId: instance.__DEV__debugId,  // Preserved from original
  };
}
```

### 7.2 DevTools Integration (Persistent Mode)

React DevTools uses `getInstanceFromNode` to map native views back to Fibers. In persistent mode, we go through the family:

```javascript
// In host config
export function getInstanceFromNode(node) {
  // node is a native view reference
  // In persistent mode, views are keyed by family, not node

  // Get family from view (stable across all clones)
  const family = bridge.getFamilyFromView(node);
  if (!family) return null;

  // Get InstanceHandle from family (stored there, survives clones)
  return family.getInstanceHandle();
}
```

---

## 8. SurfaceId: Still Needed

### 8.1 What SurfaceId Does

`SurfaceId` identifies distinct React roots. In a single-root app, there's only one SurfaceId. In multi-root scenarios (e.g., React Native embedded in multiple UIViews), each root has a unique SurfaceId.

### 8.2 When SurfaceId is Used

- Creating the root container
- Scoping component registries
- Event routing to the correct root
- DevTools root enumeration

### 8.3 Implementation for react-dom-native

```javascript
// In our container setup
let nextSurfaceId = 1;

function createRoot(nativeRootView) {
  const surfaceId = nextSurfaceId++;

  return {
    render(element) {
      const container = {
        surfaceId,
        nativeView: nativeRootView,
        rootNode: null,
      };

      reconciler.updateContainer(element, container, null, null);
    },

    unmount() {
      reconciler.updateContainer(null, container, null, null);
    }
  };
}
```

---

## 9. Performance Considerations

### 9.1 InstanceHandle vs Tag Performance

| Operation | Tag (int32_t) | InstanceHandle |
|-----------|---------------|----------------|
| Storage | 4 bytes | 24-32 bytes (JSI object) |
| Hash map lookup | O(1), fast integer hash | O(1), pointer hash |
| Comparison | Single integer compare | Pointer compare |
| GC pressure | None | Minimal (weak ref) |
| Creation | Increment counter | Create JSI object |

**Conclusion**: For hot paths (event dispatch, diffing), the difference is negligible. The JSI object overhead is amortized over the node's lifetime.

### 9.2 Pointer-Based Identity Performance

Using `uintptr_t` for map keys is efficient:

```cpp
// Very fast: just cast the pointer, no allocation
auto key = reinterpret_cast<uintptr_t>(node);

// Hash maps with integer keys are cache-friendly
std::unordered_map<uintptr_t, UIView*> nodeToView_;
```

### 9.3 Identity Stability in Persistent Mode

In persistent mode, pointer identity considerations differ from mutation mode:

**ShadowNode pointers**: These change on every clone (prop/child update). We deliberately do NOT use `ShadowNode*` as map keys because:
1. A logical node gets a new `ShadowNode*` on every `cloneInstance` call
2. Old `ShadowNode` objects may be deallocated, and new ones could reuse addresses

**ShadowNodeFamily pointers**: These are stable for the lifetime of a logical component:
1. Created once in `createInstance`, shared across all clones
2. Only deallocated when the component is unmounted (Delete mutation)
3. Safe to use as map keys because family outlives all its node clones

**Using shared_ptr for thread safety**:
1. `ShadowNode::Shared` (shared_ptr) ensures nodes outlive references during concurrent diff/mount
2. `ShadowNodeFamily::Shared` ensures family survives as long as any node references it
3. Old trees can be safely compared while new trees are being committed

---

## 10. Migration Notes

### 10.1 Alignment with Fabric (Persistent Mode)

Since react-dom-native uses persistent mode like Fabric, our identity scheme closely matches Fabric's approach:

| Fabric Pattern | react-dom-native Pattern |
|----------------|--------------------------|
| `Tag = int32_t` (deprecated) | No tags (omit entirely) |
| `ShadowNodeFamily` for stable identity | Same - `ShadowNodeFamily*` for stable identity |
| `InstanceHandle` in family | Same - stored in `ShadowNodeFamily` |
| Clone on update | Same - `cloneInstance` returns new node |
| Differentiator for mutations | Same - diff old/new trees |
| Family-based view registry | Same - keyed by `ShadowNodeFamily*` |

### 10.2 Simplified Code Paths

Without tags, we eliminate:
- Tag allocation logic
- Tag-based view registries
- Tag validation and bounds checking
- Tag overflow handling (Fabric has special handling for tag exhaustion)

### 10.3 What We Keep from Fabric

- `SurfaceId` for multi-root support
- `InstanceHandle` for JS<->C++ identity (stored in family)
- `ShadowNodeFamily` for stable identity across clones
- `ShadowNode::Shared` (immutable nodes with structural sharing)
- Differentiator for generating mutations
- Debug IDs (DEV only) for DevTools

---

## 11. Summary

### Key Design Decisions (Persistent Mode)

1. **No integer tags**: Use `ShadowNodeFamily*` for stable C++ identity, `InstanceHandle` for JS<->C++ crossing
2. **Family-based view mapping**: `unordered_map<ShadowNodeFamily*, UIView*>` - NOT keyed by `ShadowNode*` which changes on every clone
3. **InstanceHandle stored in family**: Family survives clones, InstanceHandle remains valid
4. **Immutable ShadowNodes**: Cloned on update, structural sharing for unchanged subtrees
5. **Differentiator required**: Must diff old/new trees to generate mutations
6. **SurfaceId preserved**: Still needed for multi-root scenarios
7. **Debug IDs optional**: Only allocate in DEV builds for DevTools

### Benefits

- Simpler code without tag management
- No tag exhaustion concerns
- Direct references instead of indirect lookups
- Full alignment with Fabric's architecture
- Thread-safe through immutability
- Supports React concurrent features
- Type-safe references instead of integer IDs

### Implementation Order

1. Define `ShadowNodeFamily` class with `InstanceHandle` storage
2. Define `ShadowNode` class with family reference and clone methods
3. Define Instance/TextInstance types with `_nativeFamily`, `_nativeNode`, and `_internalInstanceHandle`
4. Implement ViewRegistry keyed by `ShadowNodeFamily*`
5. Implement Differentiator to compare old/new trees
6. Implement EventDispatcher using family's InstanceHandle
7. Wire up `cloneInstance` to share family across clones
8. Add DEV-only debug IDs for DevTools

---

## References

- [React Native Fabric Renderer Architecture](https://reactnative.dev/architecture/fabric-renderer)
- [React Native Render Pipeline](https://reactnative.dev/architecture/render-pipeline)
- [Fabric EventEmitter Simplification Commit](https://github.com/facebook/react-native/commit/93dd790cad67107d0aa5181f7d70e95c6223362d)
- [ReactFiberConfigNative.js](https://github.com/facebook/react/blob/main/packages/react-native-renderer/src/ReactFiberConfigNative.js)
- [ReactFabricEventEmitter.js](https://github.com/facebook/react/blob/main/packages/react-native-renderer/src/ReactFabricEventEmitter.js)
- [UIManagerBinding.cpp](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/uimanager/UIManagerBinding.cpp)
