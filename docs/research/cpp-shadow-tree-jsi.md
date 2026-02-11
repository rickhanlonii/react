# Research: C++ Shadow Tree & JSI Bindings

> Research into how a JS reconciler using `react-reconciler` (persistent mode) can call into a C++ shadow tree through JSI, following Fabric's architecture but simplified for a fixed set of HTML elements.

## Overview

React Native Fabric uses a C++ shadow tree that mirrors the React element tree. The shadow tree contains layout information (via Yoga) and is the source of truth for what gets rendered on screen. JavaScript communicates with the shadow tree through JSI (JavaScript Interface), enabling synchronous, direct function calls without JSON serialization.

For react-dom-native, we use the same architecture as Fabric:
- **Fixed element set**: Only HTML elements (`<div>`, `<span>`, `<p>`, etc.) - no dynamic component registration
- **Persistent mode**: Immutable shadow nodes with clone-on-write semantics (matching Fabric)
- **No ViewConfig**: Known props for each element type, no runtime validation
- **JavaScriptCore**: Using Swift's native JSC API instead of JSI C++

---

## 1. Fabric Architecture Reference

### 1.1 UIManagerBinding (JSI HostObject Pattern)

In React Native Fabric, `UIManagerBinding` is a C++ class that implements `jsi::HostObject`. This pattern exposes a native object to JavaScript that can have properties and methods accessed directly.

The binding is installed globally as `nativeFabricUIManager`:

```cpp
// UIManagerBinding.cpp (simplified)
void UIManagerBinding::install(jsi::Runtime& runtime, std::shared_ptr<UIManager> uiManager) {
    auto binding = std::make_shared<UIManagerBinding>(uiManager);
    auto object = jsi::Object::createFromHostObject(runtime, binding);
    runtime.global().setProperty(runtime, "nativeFabricUIManager", object);
}
```

JavaScript can then call methods directly:
```javascript
const node = global.nativeFabricUIManager.createNode(tag, 'View', surfaceId, props, instanceHandle);
```

### 1.2 Fabric's JSI API Surface

Based on analysis of `UIManagerBinding.cpp`, Fabric exposes these functions to JavaScript:

| Function | Parameters | Description |
|----------|------------|-------------|
| `createNode` | `(tag, componentName, surfaceId, props, instanceHandle)` | Creates a new ShadowNode |
| `cloneNode` | `(node)` | Clone with same children/props |
| `cloneNodeWithNewChildren` | `(node, children?)` | Clone with new children list |
| `cloneNodeWithNewProps` | `(node, newProps)` | Clone with updated props |
| `cloneNodeWithNewChildrenAndProps` | `(node, children?, props)` | Clone with both changed |
| `appendChild` | `(parentNode, childNode)` | Add child to parent |
| `completeRoot` | `(surfaceId, nodeList)` | Commit tree to native |
| `registerEventHandler` | `(callback)` | Register event dispatch callback |
| `dispatchCommand` | `(node, command, args)` | Execute native command |
| `setNativeProps` | `(node, props)` | Direct prop update (deprecated) |
| `measure` | `(node, callback)` | Get layout measurements |
| `measureInWindow` | `(node, callback)` | Window-relative measurements |
| `measureLayout` | `(node, relativeNode, failCb, successCb)` | Relative measurements |
| `getBoundingClientRect` | `(node, includeTransform)` | Get bounding rect |
| `setIsJSResponder` | `(node, isResponder, blockNativeResponder)` | Set JS responder status |
| `findNodeAtPoint` | `(node, x, y, callback)` | Hit testing |
| `compareDocumentPosition` | `(node, otherNode)` | DOM position comparison |

**Event Priority Constants:**
- `unstable_DefaultEventPriority`
- `unstable_DiscreteEventPriority`
- `unstable_ContinuousEventPriority`
- `unstable_IdleEventPriority`
- `unstable_getCurrentEventPriority()`

### 1.3 ShadowNode Structure (Fabric)

From `ShadowNode.h`, the key members are:

```cpp
class ShadowNode {
protected:
    Props::Shared props_;                    // Immutable props object
    SharedListOfShared children_;            // Vector of child nodes
    State::Shared state_;                    // Component state
    ShadowNodeFamily::Shared family_;        // Shared identity across clones
    ShadowNodeTraits traits_;                // Trait flags
    int orderIndex_;                         // Rendering order

    mutable std::atomic<bool> hasBeenMounted_{false};
    mutable bool hasBeenPromoted_{false};
    mutable std::weak_ptr<ShadowNodeWrapper> runtimeShadowNodeReference_;
};
```

**ShadowNodeFamily** holds data shared across clones:
- `Tag`: Node identifier
- `SurfaceId`: Running surface instance ID
- `ComponentHandle`/`ComponentName`: Cached component type info
- `EventEmitter`: Event handling
- `InstanceHandle`: Weak reference to JS fiber
- Parent relationship (weak pointer to parent family)
- State management with thread-safe updates

### 1.4 YogaLayoutableShadowNode

From `YogaLayoutableShadowNode.h`, Yoga integration includes:

```cpp
class YogaLayoutableShadowNode {
protected:
    yoga::Config yogaConfig_;           // Per-node Yoga config
    mutable yoga::Node yogaNode_;       // The actual Yoga layout node

    void updateYogaChildren();          // Sync Yoga tree with shadow tree
    void updateYogaProps();             // Apply style to Yoga node
    void appendChild();                 // Maintain Yoga tree consistency
    void adoptYogaChild();              // Transfer child ownership
};
```

Key pattern: Each shadow node **embeds** its Yoga node directly (not a separate tree).

### 1.5 How createNode Works in Fabric

The call flow from JS to C++ shadow node creation:

```
JS: nativeFabricUIManager.createNode(tag, "View", surfaceId, props, instanceHandle)
    │
    ▼
UIManagerBinding::get("createNode") → returns jsi::HostFunction
    │
    ▼
UIManagerBinding::createNode(runtime, args...)
    │
    ├─► Extract instanceHandle from args[4] (jsi::Object)
    ├─► Parse props from args[3] (jsi::Object → RawProps)
    │
    ▼
UIManager::createNode(tag, componentName, surfaceId, rawProps, instanceHandle)
    │
    ├─► Create ShadowNodeFamilyFragment { tag, surfaceId, nullptr }
    ├─► componentDescriptor.createFamily(fragment)
    ├─► componentDescriptor.cloneProps(nullptr, rawProps)
    ├─► componentDescriptor.createInitialState(props, family)
    │
    ▼
componentDescriptor.createShadowNode(ShadowNodeFragment { props, children, state }, family)
    │
    ▼
Return ShadowNode (wrapped in jsi::Object via NativeState)
```

### 1.6 How ShadowNodes Are Stored in JS

Fabric uses `jsi::NativeState` to attach C++ pointers to JavaScript objects:

```cpp
// primitives.h (simplified)
class ShadowNodeWrapper : public jsi::NativeState {
public:
    ShadowNode::Shared shadowNode;
};

jsi::Value valueFromShadowNode(jsi::Runtime& rt, ShadowNode::Shared node) {
    auto wrapper = std::make_shared<ShadowNodeWrapper>();
    wrapper->shadowNode = node;

    jsi::Object obj(rt);
    obj.setNativeState(rt, wrapper);
    return obj;
}

ShadowNode::Shared shadowNodeFromValue(jsi::Runtime& rt, const jsi::Value& value) {
    auto obj = value.asObject(rt);
    auto wrapper = obj.getNativeState<ShadowNodeWrapper>(rt);
    return wrapper->shadowNode;
}
```

This allows JavaScript to hold references to C++ shadow nodes without exposing pointers directly.

---

## 2. react-dom-native Design Decisions

### 2.1 Persistent Mode (Clone-on-Write)

**react-dom-native uses persistent mode (same as Fabric):**
- Every update creates a new immutable shadow tree
- Enables concurrent rendering without locks
- Structural sharing minimizes memory overhead
- Required for React 18's concurrent features
- Thread-safe by design

**How it works:**
- Shadow nodes are **immutable** - never modified after creation
- When props or children change, `cloneInstance()` creates a new node
- Unchanged nodes are **shared** between old and new trees (structural sharing)
- The `Differentiator` compares trees to generate mount mutations
- `replaceContainerChildren()` atomically swaps root children

**Why persistent mode:**
1. Matches Fabric's proven architecture
2. Enables concurrent features from the start
3. Thread-safe without locks
4. Clean separation between reconciler and mounting

### 2.2 JSI vs JavaScriptCore Swift API

**Fabric uses JSI (C++ interface):**
- Engine-agnostic (works with Hermes and JSC)
- Requires C++ code
- Integrates with existing RN infrastructure

**react-dom-native will use JSC Swift API:**
- Zero C++ required
- Native Swift integration
- Simpler development experience
- Can add JSI abstraction later if needed

**Trade-off:** We lose engine portability but gain development speed. Migration to JSI is feasible if we later want Hermes support.

### 2.3 Immutable Shadow Node Structure

For react-dom-native with persistent mode, shadow nodes must be immutable:

```cpp
// Immutable shadow node for react-dom-native
class DOMShadowNode {
public:
    using Shared = std::shared_ptr<const DOMShadowNode>;

private:
    // Identity (shared across clones)
    ShadowNodeFamily::Shared family_;     // Stable identity for this logical node

    // Immutable data
    Props::Shared props_;                  // Shared pointer to immutable props
    SharedListOfShared<DOMShadowNode> children_;  // Immutable children list
    std::string elementType_;              // "div", "span", "p", etc.

    // Layout (computed during commit)
    LayoutMetrics layoutMetrics_;          // Computed layout results

    // Yoga node (cloned with the shadow node)
    yoga::Node yogaNode_;

public:
    // Clone factories (create new nodes with modifications)
    Shared cloneWithNewProps(Props::Shared newProps) const;
    Shared cloneWithNewChildren(SharedListOfShared<DOMShadowNode> newChildren) const;
    Shared cloneWithNewChildrenAndProps(SharedListOfShared<DOMShadowNode> newChildren, Props::Shared newProps) const;

    // Identity check via family (same logical node across clones)
    bool isSameLogicalNode(const DOMShadowNode& other) const {
        return family_.get() == other.family_.get();
    }

    // Accessors
    const ShadowNodeFamily& getFamily() const { return *family_; }
    const Props& getProps() const { return *props_; }
    const auto& getChildren() const { return children_; }
};
```

**What we keep from Fabric:**
- `ShadowNodeFamily` - Required for stable identity across clones
- `Props::Shared` - Immutable shared props enable structural sharing
- Clone factories for creating modified copies
- Embedded Yoga node (cloned with the shadow node)

**What we simplify:**
- `ComponentDescriptor` - Fixed element types, no dynamic dispatch
- `State::Shared` - Native view state lives in UIKit, not shadow tree
- Event handling simplified (see event research)

### 2.4 No ViewConfig / validAttributes

Fabric uses ViewConfig with `validAttributes` to:
1. Validate props at runtime
2. Transform/process props before sending to native
3. Determine which props changed for diffing

**react-dom-native approach:**
- Fixed, known set of HTML elements
- Props validated by TypeScript at compile time
- Direct prop mapping to Yoga/UIKit properties
- Diff computed by comparing old/new prop objects directly

```typescript
// Instead of ViewConfig, we have static element definitions
const HTMLElements = {
    div: {
        layoutProps: ['width', 'height', 'margin', 'padding', 'flexDirection', ...],
        visualProps: ['backgroundColor', 'borderRadius', 'opacity', ...],
        eventProps: ['onClick', 'onLayout', ...],
    },
    span: { ... },
    p: { ... },
    // etc.
};
```

---

## 3. Proposed JSI Binding API for react-dom-native

### 3.1 Swift Bridge Functions (Persistent Mode)

Since we're using JSC's Swift API and persistent mode, we expose Fabric-style clone functions:

```swift
class NativeBridge {
    private let context: JSContext
    private var shadowTree: ShadowTree

    func install() {
        // Node creation
        context.setObject(createNode, forKeyedSubscript: "$$createNode" as NSString)
        context.setObject(createTextNode, forKeyedSubscript: "$$createTextNode" as NSString)

        // Clone operations (persistent mode - these replace mutation functions)
        context.setObject(cloneNode, forKeyedSubscript: "$$cloneNode" as NSString)
        context.setObject(cloneNodeWithNewChildren, forKeyedSubscript: "$$cloneNodeWithNewChildren" as NSString)
        context.setObject(cloneNodeWithNewProps, forKeyedSubscript: "$$cloneNodeWithNewProps" as NSString)
        context.setObject(cloneNodeWithNewChildrenAndProps, forKeyedSubscript: "$$cloneNodeWithNewChildrenAndProps" as NSString)

        // Child list building (during render phase)
        context.setObject(appendChild, forKeyedSubscript: "$$appendChild" as NSString)

        // Container child set (persistent mode)
        context.setObject(createChildSet, forKeyedSubscript: "$$createChildSet" as NSString)
        context.setObject(appendChildToChildSet, forKeyedSubscript: "$$appendChildToChildSet" as NSString)

        // Container operations
        context.setObject(createContainer, forKeyedSubscript: "$$createContainer" as NSString)

        // Root commit (atomic tree replacement)
        context.setObject(completeRoot, forKeyedSubscript: "$$completeRoot" as NSString)

        // Measurement
        context.setObject(measureNode, forKeyedSubscript: "$$measureNode" as NSString)

        // Event handling
        context.setObject(registerEventHandler, forKeyedSubscript: "$$registerEventHandler" as NSString)

        // Event priority constants
        context.setObject(DefaultEventPriority, forKeyedSubscript: "$$DefaultEventPriority" as NSString)
        context.setObject(DiscreteEventPriority, forKeyedSubscript: "$$DiscreteEventPriority" as NSString)
        context.setObject(ContinuousEventPriority, forKeyedSubscript: "$$ContinuousEventPriority" as NSString)
    }
}
```

**Key difference from mutation mode:** No `commitUpdate`, `removeChild`, `insertBefore` functions. Instead, changes are expressed through cloning and atomic root replacement.

### 3.2 Function Signatures (Persistent Mode)

```typescript
// TypeScript declarations for the native bridge (persistent mode)

// Opaque node handle - represents a pointer to immutable ShadowNode
type ShadowNodeHandle = object;  // JSI object with NativeState

// Creates a shadow node for an HTML element
// Returns an opaque node handle (NOT a number - it's a JSI object wrapping ShadowNode*)
declare function $$createNode(
    type: string,           // "div", "span", "p", etc.
    surfaceId: number,      // Root surface identifier
    props: object,          // { style, className, onClick, ... }
    instanceHandle: object  // Reference to React fiber for event dispatch
): ShadowNodeHandle;

// Creates a text node
declare function $$createTextNode(
    text: string,
    surfaceId: number,
    instanceHandle: object
): ShadowNodeHandle;

// Clone operations (persistent mode - create new immutable nodes)
declare function $$cloneNode(
    node: ShadowNodeHandle
): ShadowNodeHandle;

declare function $$cloneNodeWithNewChildren(
    node: ShadowNodeHandle,
    children?: ShadowNodeHandle[]  // New children list, or undefined to clear
): ShadowNodeHandle;

declare function $$cloneNodeWithNewProps(
    node: ShadowNodeHandle,
    newProps: object
): ShadowNodeHandle;

declare function $$cloneNodeWithNewChildrenAndProps(
    node: ShadowNodeHandle,
    children: ShadowNodeHandle[] | undefined,
    newProps: object
): ShadowNodeHandle;

// Building child lists (used during render phase)
declare function $$appendChild(
    parent: ShadowNodeHandle,
    child: ShadowNodeHandle
): void;

// Container operations
declare function $$createContainer(rootViewTag: number): number;

// Commit the new tree atomically (triggers diff, layout, and mount)
declare function $$completeRoot(
    surfaceId: number,
    rootChildren: ShadowNodeHandle[]
): void;

// Measurement (async with callback)
declare function $$measureNode(
    node: ShadowNodeHandle,
    callback: (x: number, y: number, width: number, height: number) => void
): void;

// Event handling
declare function $$registerEventHandler(
    handler: (instanceHandle: object, eventType: string, payload: object) => void
): void;

// Event priority constants
declare const $$DefaultEventPriority: number;
declare const $$DiscreteEventPriority: number;
declare const $$ContinuousEventPriority: number;
```

**Key differences from mutation mode:**
1. **Opaque handles**: Nodes are JSI objects wrapping `ShadowNode*`, not integer tags
2. **Clone functions**: Replace `updateNode`, `removeChild`, `insertBefore`
3. **completeRoot**: Atomically commits new tree (replaces individual mutations)
4. **No explicit layout call**: Layout happens during commit phase

### 3.3 How createInstance Flows Through the System (Persistent Mode)

```
JS Host Config: createInstance("div", { style: { flexDirection: 'row' }, onClick: fn }, ..., instanceHandle)
    │
    ▼
$$createNode("div", surfaceId, { style: { flexDirection: 'row' }, onClick: true }, instanceHandle)
    │
    ▼
Swift NativeBridge.createNode(type, surfaceId, props, instanceHandle)
    │
    ├─► Create ShadowNodeFamily (stable identity for this logical node)
    │       - Store instanceHandle (weak ref to React fiber)
    │       - Store surfaceId
    ├─► Create immutable Props object from props
    ├─► Create DOMShadowNode with family, props (immutable)
    ├─► Create embedded Yoga node via YGNodeNew()
    ├─► Apply style props to Yoga node
    ├─► Wrap in ShadowNodeWrapper (JSC NativeState equivalent)
    │
    ▼
Return opaque JSC object wrapping ShadowNode*
    │
    ▼
JS Host Config stores the opaque handle as Instance._nativeNode
```

### 3.4 Node Identity via ShadowNodeFamily

In persistent mode, identity works through `ShadowNodeFamily` (matching Fabric):

**react-dom-native approach:**
- `ShadowNodeFamily` holds stable identity across clones
- `InstanceHandle` (weak ref to React fiber) for event dispatch
- No integer tags - opaque handles wrap `ShadowNode*` pointers

```typescript
// Host config Instance type (persistent mode)
type Instance = {
    _nativeNode: ShadowNodeHandle;   // Opaque handle wrapping ShadowNode*
    _internalInstanceHandle: object; // React fiber reference for events
    type: string;                    // Element type
    props: Props;                    // Current props (for diffing in JS)
    children: Array<Instance | TextInstance>;
};
```

**Identity across clones:**
```cpp
// When cloning, the family is shared - preserving logical identity
ShadowNode::Shared cloneWithNewProps(Props::Shared newProps) const {
    auto clone = std::make_shared<DOMShadowNode>();
    clone->family_ = this->family_;    // SAME family = same logical node
    clone->props_ = newProps;          // NEW props
    clone->children_ = this->children_; // Shared if unchanged
    return clone;
}

// Two nodes are the "same" if they share the same family
bool isSameLogicalNode(const ShadowNode& a, const ShadowNode& b) {
    return &a.getFamily() == &b.getFamily();
}
```

---

## 4. cloneInstance Without ViewConfig (Persistent Mode)

### 4.1 The Pattern

In persistent mode, `cloneInstance` replaces `commitUpdate`. When props change:
1. Reconciler calls `prepareUpdate()` to check if props changed
2. If changed, reconciler calls `cloneInstance()` to create new immutable node
3. New node has new props baked in at creation time

### 4.2 Host Config Implementation

```typescript
// Host config - persistent mode (no commitUpdate!)
export function prepareUpdate(
    instance: Instance,
    type: string,
    oldProps: Props,
    newProps: Props,
    hostContext: HostContext
): null | object {
    // Return truthy if props changed (triggers cloneInstance)
    // The return value is NOT passed to cloneInstance
    return oldProps !== newProps ? {} : null;
}

export function cloneInstance(
    instance: Instance,
    type: string,
    oldProps: Props,
    newProps: Props,
    keepChildren: boolean,
    recyclableInstance: Instance | null
): Instance {
    // Clone the native node with new props
    const newNativeNode = keepChildren
        ? $$cloneNodeWithNewProps(instance._nativeNode, newProps)
        : $$cloneNodeWithNewChildrenAndProps(instance._nativeNode, undefined, newProps);

    return {
        _nativeNode: newNativeNode,
        _internalInstanceHandle: instance._internalInstanceHandle,
        type,
        props: newProps,
        children: keepChildren ? instance.children : [],
    };
}

// NOTE: commitUpdate is NOT implemented in persistent mode!
// export function commitUpdate(...) { ... }  // ← NOT USED
```

### 4.3 Native Side Clone Handling

```swift
func cloneNodeWithNewProps(_ node: ShadowNodeHandle, _ newProps: [String: Any]) -> ShadowNodeHandle {
    let oldNode = unwrapShadowNode(node)

    // Create new immutable node with new props
    let newProps = Props(from: newProps)
    let newNode = oldNode.cloneWithNewProps(newProps)

    // Wrap and return
    return wrapShadowNode(newNode)
}

func cloneNodeWithNewChildrenAndProps(
    _ node: ShadowNodeHandle,
    _ newChildren: [ShadowNodeHandle]?,
    _ newProps: [String: Any]
) -> ShadowNodeHandle {
    let oldNode = unwrapShadowNode(node)

    let newChildList = newChildren?.map { unwrapShadowNode($0) } ?? []
    let newPropsObj = Props(from: newProps)

    let newNode = oldNode.cloneWithNewChildrenAndProps(newChildList, newPropsObj)

    return wrapShadowNode(newNode)
}
```

### 4.4 Props Applied at Clone Time

Unlike mutation mode where props are diffed and applied incrementally, persistent mode applies full props when creating the clone:

```cpp
ShadowNode::Shared DOMShadowNode::cloneWithNewProps(Props::Shared newProps) const {
    auto clone = std::make_shared<DOMShadowNode>();

    // Share identity
    clone->family_ = this->family_;

    // NEW props (immutable)
    clone->props_ = newProps;

    // Share children (immutable list)
    clone->children_ = this->children_;

    // Clone Yoga node with new style
    clone->yogaNode_ = YGNodeClone(this->yogaNode_);
    applyPropsToYoga(clone->yogaNode_, newProps);

    return clone;
}
```

---

## 5. Memory Management Strategy (Persistent Mode)

### 5.1 The Challenge

In persistent mode:
- Shadow nodes are immutable and managed via `shared_ptr`
- Multiple trees can reference the same node (structural sharing)
- Old tree versions must be garbage collected properly
- JavaScript holds opaque references to native nodes

### 5.2 Solution: Reference Counting via shared_ptr

```cpp
// Shadow nodes use shared_ptr for automatic memory management
class ShadowNode {
public:
    using Shared = std::shared_ptr<const ShadowNode>;

    // Children are also shared - enables structural sharing
    SharedListOfShared<ShadowNode> children_;
};

// When a tree is replaced, old nodes are released if no longer referenced
void ShadowTree::commit(ShadowNode::Shared newRootNode) {
    // Old tree's nodes are automatically released when their
    // reference count drops to zero (no more shared_ptr references)
    currentRootNode_ = newRootNode;
}
```

### 5.3 JavaScript Reference Management

JavaScript holds opaque handles that wrap `shared_ptr`:

```swift
class ShadowNodeWrapper {
    // Prevent deallocation while JS holds reference
    let shadowNode: ShadowNode.Shared

    init(_ node: ShadowNode.Shared) {
        self.shadowNode = node
    }
}

// JSC context stores wrapper objects
func wrapShadowNode(_ node: ShadowNode.Shared) -> JSValue {
    let wrapper = ShadowNodeWrapper(node)
    // Store in JSContext - prevents dealloc while JS holds reference
    return jsContext.makeObject(wrapper)
}
```

### 5.4 Cleanup on Unmount

In persistent mode, cleanup happens automatically through reference counting:

```typescript
// Host config (persistent mode)
// No explicit removeChild/deleteNode calls needed!
// Old nodes are automatically freed when:
// 1. JS releases the handle (GC)
// 2. New tree no longer references them (structural sharing)

export function detachDeletedInstance(instance: Instance): void {
    // In persistent mode, this can be a no-op
    // Memory is managed via shared_ptr reference counting
    // The old tree keeps nodes alive until replaced
}
```

### 5.5 View Cleanup

Native views are managed separately from shadow nodes:

```cpp
void MountingManager::performMutations(const std::vector<Mutation>& mutations) {
    for (const auto& mutation : mutations) {
        if (mutation.type == Mutation::Type::Delete) {
            // Recycle or delete the native view
            auto view = viewRegistry_.getView(mutation.oldNode);
            viewRegistry_.unregister(mutation.oldNode);
            viewPool_.enqueue(view);  // Recycle for reuse
        }
    }
}
```

---

## 6. Persistent Shadow Tree Architecture

### 6.1 Why Persistent Mode

| Aspect | Benefit |
|--------|---------|
| **Concurrency** | Lock-free access - old and new trees can coexist |
| **Thread Safety** | Immutable nodes safe to read from any thread |
| **React 18** | Required for concurrent rendering features |
| **Debugging** | Each tree version is a snapshot in time |
| **Structural Sharing** | Unchanged subtrees share memory |

### 6.2 How Structural Sharing Works

When a node changes, only it and its ancestors are cloned:

```
Before:                  After (Node C changes props):
    A                        A'  ← cloned
   / \                      / \
  B   C                    B   C' ← cloned with new props
     / \                      / \
    D   E                    D   E  ← SHARED (same objects)
```

```cpp
// Cloning preserves unchanged subtrees
ShadowNode::Shared cloneWithNewProps(Props::Shared newProps) const {
    auto clone = std::make_shared<DOMShadowNode>();
    clone->family_ = this->family_;
    clone->props_ = newProps;
    clone->children_ = this->children_;  // SHARED - not copied
    return clone;
}
```

### 6.3 Thread Safety via Immutability

```cpp
// Any thread can safely read an immutable tree
void BackgroundLayoutThread::calculateLayout(ShadowNode::Shared root) {
    // Safe - root is immutable, no locks needed
    YGNodeCalculateLayout(root->getYogaNode(), width, height, YGDirectionLTR);
}

// Commits are atomic via pointer swap
void ShadowTree::commit(ShadowNode::Shared newRoot) {
    std::lock_guard<std::mutex> lock(commitMutex_);
    currentRoot_ = newRoot;  // Atomic pointer swap
}
```

### 6.4 Differentiator Integration

The Differentiator compares old and new trees to generate mount mutations:

```cpp
std::vector<Mutation> Differentiator::diff(
    ShadowNode::Shared oldTree,
    ShadowNode::Shared newTree
) {
    std::vector<Mutation> mutations;

    if (oldTree.get() == newTree.get()) {
        // Same object - structural sharing, no changes
        return mutations;
    }

    if (oldTree->isSameLogicalNode(*newTree)) {
        // Same logical node, check for prop changes
        if (oldTree->getProps() != newTree->getProps()) {
            mutations.push_back(Mutation::Update(newTree));
        }
        // Recurse on children...
    } else {
        mutations.push_back(Mutation::Remove(oldTree));
        mutations.push_back(Mutation::Insert(newTree));
    }

    return mutations;
}
```

---

## 7. Call Flow Diagrams (Persistent Mode)

### 7.1 Initial Render

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         JavaScript (JS Thread)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  React Reconciler (Render Phase)                                         │
│  ───────────────────────────────                                         │
│  1. beginWork → creates fiber tree                                       │
│  2. completeWork → calls host config functions                           │
│     ├─► createInstance("div", props, instanceHandle)                     │
│     │     └─► $$createNode("div", surfaceId, props, instanceHandle) ────────┼──► Native
│     ├─► createTextInstance("Hello", instanceHandle)                      │
│     │     └─► $$createTextNode("Hello", surfaceId, instanceHandle) ─────────┼──► Native
│     ├─► appendInitialChild(parent, child)                                │
│     │     └─► $$appendChild(parent._nativeNode, child._nativeNode) ─────────┼──► Native
│     └─► finalizeInitialChildren → createContainerChildSet                │
│                                                                          │
│  React Reconciler (Commit Phase)                                         │
│  ────────────────────────────────                                        │
│  3. commitRoot                                                           │
│     └─► replaceContainerChildren(container, childSet)                    │
│           └─► $$completeRoot(surfaceId, rootChildren) ──────────────────────┼──► Native
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Native (Background Thread → UI Thread)           │
├─────────────────────────────────────────────────────────────────────────┤
│  $$createNode:                                                           │
│    1. Create ShadowNodeFamily (stable identity)                          │
│    2. Create immutable Props object                                      │
│    3. Create immutable DOMShadowNode                                     │
│    4. Create embedded YGNode, apply styles                               │
│    5. Wrap in opaque handle, return to JS                                │
│                                                                          │
│  $$appendChild:                                                          │
│    1. Unwrap parent and child ShadowNodes                                │
│    2. Clone parent with child added to children list                     │
│    3. Update Yoga tree for cloned parent                                 │
│                                                                          │
│  $$completeRoot (triggers commit pipeline):                              │
│    1. Promote new tree as "next tree"                                    │
│    2. Calculate layout (can be background thread)                        │
│    3. Diff old tree vs new tree → generate mutations                     │
│    4. Apply mutations to UIViews (UI thread)                             │
│    5. Promote "next tree" to "current tree"                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Update (cloneInstance - Persistent Mode)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         JavaScript                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  Reconciler detects prop change on <div style={{color:'red'}}>          │
│  ───────────────────────────────────────────────────────────────         │
│  Render phase:                                                           │
│    prepareUpdate(instance, "div", oldProps, newProps) → {} (truthy)     │
│    cloneInstance(instance, "div", oldProps, newProps, keepChildren)     │
│      └─► $$cloneNodeWithNewProps(node, newProps) ────────────────────────┼──► Native
│                                                                          │
│  Commit phase:                                                           │
│    replaceContainerChildren(container, newChildSet)                      │
│      └─► $$completeRoot(surfaceId, rootChildren) ────────────────────────┼──► Native
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Native                                           │
├─────────────────────────────────────────────────────────────────────────┤
│  $$cloneNodeWithNewProps(node, newProps):                                │
│    1. Unwrap existing ShadowNode                                         │
│    2. Create new immutable Props from newProps                           │
│    3. Clone ShadowNode with new props (family shared)                    │
│    4. Clone Yoga node, apply new styles                                  │
│    5. Return new opaque handle                                           │
│                                                                          │
│  $$completeRoot (commit pipeline):                                       │
│    1. Calculate layout on new tree                                       │
│    2. Diff: finds the cloned node, generates Update mutation             │
│    3. Apply Update mutation to existing UIView                           │
│    4. Swap current tree pointer                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Note:** In persistent mode, `commitUpdate` is NOT called. Changes are applied via cloning during render phase, then mutations are generated by diffing during commit.

---

## 8. C++ Shadow Node Class (Persistent Mode Design)

### 8.1 Immutable ShadowNode

```cpp
// DOMShadowNode.h - Persistent mode (immutable)
#pragma once

#include <yoga/yoga.h>
#include <string>
#include <vector>
#include <memory>

namespace reactdomnative {

class Props;
class ShadowNodeFamily;

class DOMShadowNode {
public:
    using Shared = std::shared_ptr<const DOMShadowNode>;  // Note: const!
    using SharedList = std::vector<Shared>;

    // Factory for initial creation
    static Shared create(
        ShadowNodeFamily::Shared family,
        Props::Shared props,
        const std::string& type
    );

    // Clone factories (create new immutable nodes)
    Shared cloneWithNewProps(Props::Shared newProps) const;
    Shared cloneWithNewChildren(SharedList newChildren) const;
    Shared cloneWithNewChildrenAndProps(SharedList newChildren, Props::Shared newProps) const;

    // Accessors (all const - node is immutable)
    const ShadowNodeFamily& getFamily() const { return *family_; }
    const Props& getProps() const { return *props_; }
    const SharedList& getChildren() const { return children_; }
    const std::string& getType() const { return type_; }
    YGNodeConstRef getYogaNode() const { return yogaNode_; }

    // Layout results (set during layout calculation)
    const LayoutMetrics& getLayoutMetrics() const { return layoutMetrics_; }
    void setLayoutMetrics(LayoutMetrics metrics) const { layoutMetrics_ = metrics; }

    // Identity check
    bool isSameLogicalNode(const DOMShadowNode& other) const {
        return family_.get() == other.family_.get();
    }

private:
    DOMShadowNode() = default;

    // Shared across clones (stable identity)
    ShadowNodeFamily::Shared family_;

    // Immutable per-clone data
    Props::Shared props_;
    SharedList children_;
    std::string type_;

    // Yoga node (cloned with the shadow node)
    YGNodeRef yogaNode_ = nullptr;

    // Layout results (mutable for layout calculation)
    mutable LayoutMetrics layoutMetrics_;
};

} // namespace reactdomnative
```

### 8.2 ShadowNodeFamily (Stable Identity)

```cpp
// ShadowNodeFamily.h
class ShadowNodeFamily {
public:
    using Shared = std::shared_ptr<ShadowNodeFamily>;
    using Weak = std::weak_ptr<ShadowNodeFamily>;

    static Shared create(
        SurfaceId surfaceId,
        InstanceHandle::Shared instanceHandle
    );

    SurfaceId getSurfaceId() const { return surfaceId_; }
    InstanceHandle::Shared getInstanceHandle() const { return instanceHandle_; }

    // Parent tracking for tree traversal
    void setParent(Weak parent) { parent_ = parent; }
    Shared getParent() const { return parent_.lock(); }

private:
    SurfaceId surfaceId_;
    InstanceHandle::Shared instanceHandle_;  // Weak ref to React fiber
    Weak parent_;
};
```

### 8.3 Props (Immutable)

```cpp
// Props.h
class Props {
public:
    using Shared = std::shared_ptr<const Props>;

    // Factory from raw props
    static Shared create(const RawProps& rawProps);

    // Accessors
    const std::optional<std::string>& getClassName() const;
    const StyleProps& getStyle() const;
    bool hasEventHandler(const std::string& eventName) const;

    // Comparison for diffing
    bool operator==(const Props& other) const;
    bool operator!=(const Props& other) const { return !(*this == other); }

private:
    std::optional<std::string> className_;
    StyleProps style_;
    std::unordered_set<std::string> eventHandlers_;
};
```

---

## 9. Summary: Key Decisions for react-dom-native

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Reconciler mode | **Persistent** | Enables concurrent features, matches Fabric |
| JS-native bridge | JSC Swift API | No C++ layer, faster development |
| Shadow node identity | **ShadowNodeFamily** | Stable identity across clones |
| Instance handles | **Opaque JSC objects** | Wrap ShadowNode* pointers |
| Yoga embedding | Direct in shadow node | Matches Fabric pattern |
| ViewConfig | None | Fixed element set, TypeScript validation |
| Prop handling | **Clone with new props** | Immutable props via cloneInstance |
| Thread model | **Background layout** | Immutability enables safe concurrency |
| Memory management | **shared_ptr + GC** | Reference counting, structural sharing |
| Tree diffing | **Differentiator** | Compares trees to generate mutations |

---

## 10. References

### Internal Documentation
- [Persistent Mode Analysis](./persistent-mode-analysis.md) - Detailed comparison of mutation vs persistent mode
- [Mounting & Scheduling](./mounting-scheduling.md) - How the commit pipeline works
- [Node Identity](./node-identity.md) - ShadowNodeFamily and InstanceHandle patterns

### External References
- [React Native Fabric Architecture](https://reactnative.dev/architecture/fabric-renderer)
- [React Native Render Pipeline](https://reactnative.dev/architecture/render-pipeline)
- [React Native UIManagerBinding.cpp](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/uimanager/UIManagerBinding.cpp)
- [React Native ShadowNode.h](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/react/renderer/core/ShadowNode.h)
- [react-reconciler npm package](https://www.npmjs.com/package/react-reconciler)
- [Fabric Deep Dive Discussion](https://github.com/reactwg/react-native-new-architecture/discussions/1)
- [JSI Cheatsheet](https://ospfranco.com/post/2023/08/15/jsi-cheatsheet-part-1-jsi/)
