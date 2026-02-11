# Research: Persistent Mode vs Mutation Mode

> Comprehensive analysis of how React reconciler's persistent mode differs from mutation mode, what architectural changes are needed for react-dom-native to adopt persistent mode, and the impact on our existing design documents.

---

## 1. Overview: Two Modes of Operation

The React reconciler supports two distinct modes of operation that determine how the host tree is updated:

| Mode | Configuration | Used By | Core Concept |
|------|--------------|---------|--------------|
| **Mutation Mode** | `supportsMutation: true` | React DOM, React Native (Paper) | Mutate existing nodes in place |
| **Persistent Mode** | `supportsPersistence: true` | React Native Fabric | Clone nodes on update, replace at root |

**Key Insight**: These modes are **mutually exclusive**. You must choose one. Setting both to `true` is invalid.

### 1.1 Why This Matters for react-dom-native

Our current research documents assumed **mutation mode** based on simplicity. However, React Native Fabric uses **persistent mode**, which offers:

- Thread safety through immutability
- Support for concurrent features (React 18+)
- Structural sharing for memory efficiency
- Alignment with React's direction

---

## 2. Host Config Function Differences

### 2.1 Core Methods (Both Modes)

These functions are required regardless of mode:

```typescript
// Instance Creation
createInstance(type, props, rootContainer, hostContext, internalHandle): Instance
createTextInstance(text, rootContainer, hostContext, internalHandle): TextInstance
appendInitialChild(parent, child): void
finalizeInitialChildren(instance, type, props, hostContext): boolean
shouldSetTextContent(type, props): boolean

// Context
getRootHostContext(): HostContext
getChildHostContext(parentContext, type): HostContext
getPublicInstance(instance): PublicInstance

// Scheduling
scheduleTimeout: typeof setTimeout
cancelTimeout: typeof clearTimeout
noTimeout: -1
getCurrentUpdatePriority(): EventPriority
setCurrentUpdatePriority(priority): void
resolveUpdatePriority(): EventPriority

// Commit Lifecycle
prepareForCommit(containerInfo): null | Object
resetAfterCommit(containerInfo): void
prepareUpdate(instance, type, oldProps, newProps, hostContext): null | UpdatePayload
```

### 2.2 Mutation Mode Methods

When `supportsMutation: true`, implement these for direct DOM-style mutation:

```typescript
// Tree Mutation
appendChild(parent, child): void
appendChildToContainer(container, child): void
insertBefore(parent, child, beforeChild): void
insertInContainerBefore(container, child, beforeChild): void
removeChild(parent, child): void
removeChildFromContainer(container, child): void
clearContainer(container): void

// Property Updates
commitMount(instance, type, newProps): void
commitUpdate(instance, type, oldProps, newProps): void
commitTextUpdate(textInstance, oldText, newText): void
resetTextContent(instance): void

// Visibility
hideInstance(instance): void
hideTextInstance(textInstance): void
unhideInstance(instance, props): void
unhideTextInstance(textInstance, text): void
```

### 2.3 Persistent Mode Methods

When `supportsPersistence: true`, implement these instead:

```typescript
// Instance Cloning
cloneInstance(
  instance: Instance,
  type: Type,
  oldProps: Props,
  newProps: Props,
  keepChildren: boolean,
  recyclableInstance: null | Instance
): Instance

cloneHiddenInstance(
  instance: Instance,
  type: Type,
  props: Props,
  internalInstanceHandle: Object
): Instance

cloneHiddenTextInstance(
  instance: TextInstance,
  text: string,
  internalInstanceHandle: Object
): TextInstance

// Container Child Set (Batch Replacement)
createContainerChildSet(container: Container): ChildSet
appendChildToContainerChildSet(childSet: ChildSet, child: Instance | TextInstance): void
finalizeContainerChildren(container: Container, newChildren: ChildSet): void
replaceContainerChildren(container: Container, newChildren: ChildSet): void
```

### 2.4 Critical Differences Summary

| Operation | Mutation Mode | Persistent Mode |
|-----------|--------------|-----------------|
| **Prop Change** | `commitUpdate(instance, ...)` mutates in place | `cloneInstance(instance, ..., newProps, ...)` returns new instance |
| **Add Child** | `appendChild(parent, child)` | Clone parent with new child list |
| **Remove Child** | `removeChild(parent, child)` | Clone parent without child |
| **Root Update** | Individual mutations | `replaceContainerChildren(container, newChildSet)` atomically |
| **Instance Lifetime** | Mutable, long-lived | Immutable, cloned on change |

---

## 3. How Persistent Mode Works

### 3.1 The Cloning Flow

In persistent mode, when props or children change, the reconciler:

1. Calls `prepareUpdate()` to check if update is needed
2. If update needed, calls `cloneInstance()` instead of `commitUpdate()`
3. Recursively clones affected ancestors (structural sharing for unchanged subtrees)
4. At commit, calls `replaceContainerChildren()` to atomically swap root children

```
                    Update Flow

Old Tree                          New Tree
   A                                 A'
  / \                               / \
 B   C                             B   C'   <- C changed, clone C and A
    / \                               / \
   D   E                             D   E' <- E changed, clone E and C
```

### 3.2 Structural Sharing

Unchanged nodes are **shared** between old and new trees:

```javascript
// When only E changes props:
const newE = cloneInstance(E, 'div', oldProps, newProps, true, E);
const newC = cloneInstance(C, 'div', cProps, cProps, false, C);
// B is shared - not cloned
// newC.children = [D, newE] where D is the same reference
```

This minimizes memory allocation and enables O(1) identity checks.

### 3.3 prepareUpdate Role

`prepareUpdate()` returns a non-null "update payload" when changes are detected:

```typescript
// Mutation mode: prepareUpdate returns payload for commitUpdate
function prepareUpdate(instance, type, oldProps, newProps, hostContext) {
  return diffProps(oldProps, newProps); // Used by commitUpdate
}

// Persistent mode: prepareUpdate return value triggers cloneInstance
function prepareUpdate(instance, type, oldProps, newProps, hostContext) {
  // Return truthy if props changed - value NOT passed to cloneInstance
  return oldProps !== newProps ? {} : null;
}
```

**Important**: In persistent mode, the return value of `prepareUpdate` signals whether `cloneInstance` should be called, but the value itself is NOT passed to `cloneInstance`. The clone receives the full `newProps`.

### 3.4 ChildSet Pattern

The `ChildSet` pattern enables atomic root updates:

```typescript
// During render phase
const childSet = createContainerChildSet(container);
appendChildToContainerChildSet(childSet, child1);
appendChildToContainerChildSet(childSet, child2);

// During commit phase
finalizeContainerChildren(container, childSet); // Prepare for swap
replaceContainerChildren(container, childSet);  // Atomic replacement
```

This is how Fabric achieves thread-safe commits.

---

## 4. The Differentiator in Persistent Mode

### 4.1 What the Differentiator Does

In Fabric's persistent mode, the **Differentiator** compares two immutable shadow trees to generate mutations:

```
Old Shadow Tree (T)     New Shadow Tree (T')     Mutations
       A                       A'
      / \           diff       / \        =>   [UpdateView(C),
     B   C         ------>    B   C'            UpdateView(E)]
        / \                      / \
       D   E                    D   E'
```

### 4.2 How Diffing Works

The Differentiator uses **ShadowNodeFamily identity** to match nodes across trees:

```cpp
// Conceptual diffing algorithm
void diff(ShadowNode const& oldTree, ShadowNode const& newTree) {
  // Same family = same logical component
  if (&oldTree.getFamily() == &newTree.getFamily()) {
    // Check for prop/layout changes
    if (oldTree.getProps() != newTree.getProps()) {
      mutations.push_back(Mutation::Update(newTree));
    }
    // Recurse on children
    diffChildren(oldTree.getChildren(), newTree.getChildren());
  } else {
    // Different component - remove old, insert new
    mutations.push_back(Mutation::Remove(oldTree));
    mutations.push_back(Mutation::Insert(newTree));
  }
}
```

### 4.3 Mutation Generation

The Differentiator outputs these mutation types:

| Mutation | When Generated |
|----------|---------------|
| `Create` | New node in new tree with no match in old tree |
| `Delete` | Node in old tree with no match in new tree |
| `Insert` | Node moved or newly attached to parent |
| `Remove` | Node detached from parent (may be reattached elsewhere) |
| `Update` | Same node with changed props/layout |

### 4.4 Why Mutation Mode Doesn't Need Differentiator

In mutation mode, the **reconciler itself** tells us what changed:

```javascript
// Reconciler directly calls these during commit
appendChild(parent, child);     // We KNOW a child was added
removeChild(parent, child);     // We KNOW a child was removed
commitUpdate(instance, ...);    // We KNOW props changed
```

In persistent mode, the reconciler gives us a new tree, and we must **discover** the changes.

---

## 5. Impact on Our Architecture

### 5.1 Shadow Tree Changes

**Mutation Mode (Current Design)**:
```cpp
class ShadowNode {
  Props props_;              // Mutable - updated in place
  std::vector<Shared> children_;  // Mutable - modified directly
  yoga::Node yogaNode_;      // Mutable - styles updated in place
};
```

**Persistent Mode (Fabric Pattern)**:
```cpp
class ShadowNode {
  Props::Shared props_;           // Immutable, shared_ptr
  SharedListOfShared children_;   // Immutable, shared between clones
  ShadowNodeFamily::Shared family_;  // Shared identity across clones
  yoga::Node yogaNode_;           // Cloned with new layout

  // Clone factory
  ShadowNode clone(const Props& newProps) const;
};
```

### 5.2 Layout Implications

**Mutation Mode**: Layout calculated on mutable Yoga tree, results applied in place.

**Persistent Mode**:
- Layout can cause additional cloning if shared nodes need different measurements
- "Layout calculation may cause shared React Shadow Nodes to be cloned" - React Native docs
- Each tree version has its own Yoga calculation

### 5.3 commitMount and commitUpdate

**Mutation Mode**:
- `commitMount`: Called after initial mount for setup (autoFocus, etc.)
- `commitUpdate`: Called to apply prop changes to existing instance

**Persistent Mode**:
- `commitMount`: Same behavior
- `commitUpdate`: **NOT USED** - props are applied during `cloneInstance`
- Changes are reflected by replacing the instance, not mutating it

### 5.4 appendChild, removeChild, etc.

**Mutation Mode**: These are called during commit to modify the live tree.

**Persistent Mode**: These are **NOT CALLED** during commit. Instead:
- Tree structure changes happen via cloning during render
- `replaceContainerChildren` atomically swaps at root

---

## 6. Threading Model Comparison

### 6.1 Mutation Mode Threading

```
       JS Thread                    Main Thread
          |                              |
   [Reconcile]                           |
          |                              |
   [Commit: call mutations] ------> [Apply to views]
          |                              |
```

Requires synchronization if JS is on different thread.

### 6.2 Persistent Mode Threading

```
     JS Thread              Background           Main Thread
         |                      |                     |
  [Reconcile]                   |                     |
  [Create new tree]             |                     |
         |                      |                     |
         +--- promote -----> [Layout]                 |
                                |                     |
                                +---- commit ---> [Diff trees]
                                                  [Apply mutations]
```

Immutability enables safe concurrent access without locks.

### 6.3 Implications for react-dom-native

If we run JS on main thread (our current plan):
- Mutation mode is simpler
- Threading benefits of persistent mode are less relevant

If we want concurrent features or background work:
- Persistent mode becomes valuable
- Enables React 18's concurrent rendering

---

## 7. Comparison with Our Research Documents

### 7.1 cpp-shadow-tree-jsi.md

**Current Statement** (Section 2.1):
> "react-dom-native will use mutation mode: Shadow nodes are mutable in place"

**For Persistent Mode**:
- Shadow nodes become immutable
- Add `clone()` method to ShadowNode
- Store `ShadowNodeFamily::Shared` for identity
- Props stored as `shared_ptr<const Props>`

**Current Statement** (Section 6.2):
> "react-dom-native will use mutation mode... Simpler implementation"

**Update**: This remains valid for v1, but persistent mode should be the long-term target for concurrent feature support.

### 7.2 mounting-scheduling.md

**Current Statement** (Section 2.4):
> "react-dom-native uses mutation mode... No tree diffing required"

**For Persistent Mode**:
- Tree diffing IS required
- Need to implement Differentiator
- Mutations generated from diff, not from reconciler calls

**Current Statement** (Section 8.3):
> "What We Eliminate: Differentiator (mutation mode provides mutations directly)"

**Update**: With persistent mode, we KEEP the Differentiator.

### 7.3 node-identity.md

**Current Statement** (Section 5.1):
> "Fabric uses clone-on-write (persistent mode)... react-dom-native will use mutation mode"

**For Persistent Mode**:
- Need `ShadowNodeFamily` for stable identity across clones
- Clone operations preserve family reference
- Identity is `ShadowNodeFamily*`, not `ShadowNode*`

---

## 8. Persistent Mode Implementation Requirements

### 8.1 Required Host Config Functions

```typescript
// Persistent mode host config
export const supportsPersistence = true;
export const supportsMutation = false;

// Cloning
export function cloneInstance(
  instance: Instance,
  type: Type,
  oldProps: Props,
  newProps: Props,
  keepChildren: boolean,
  recyclableInstance: Instance | null
): Instance {
  // Create new instance with new props
  // If keepChildren, share children array
  // Return new instance (old remains unchanged)
}

export function cloneHiddenInstance(
  instance: Instance,
  type: Type,
  props: Props,
  internalInstanceHandle: Object
): Instance {
  // Clone with hidden flag set
}

export function cloneHiddenTextInstance(
  instance: TextInstance,
  text: string,
  internalInstanceHandle: Object
): TextInstance {
  // Clone text with hidden flag
}

// Container child set management
export function createContainerChildSet(container: Container): ChildSet {
  return [];
}

export function appendChildToContainerChildSet(
  childSet: ChildSet,
  child: Instance | TextInstance
): void {
  childSet.push(child);
}

export function finalizeContainerChildren(
  container: Container,
  newChildren: ChildSet
): void {
  // Prepare for atomic swap (could be no-op)
}

export function replaceContainerChildren(
  container: Container,
  newChildren: ChildSet
): void {
  // Atomically replace root children
  // This is where we apply the new tree to native
}
```

### 8.2 Shadow Node Implementation

```cpp
class ShadowNode {
public:
  using Shared = std::shared_ptr<const ShadowNode>;

private:
  ShadowNodeFamily::Shared family_;  // Stable identity
  Props::Shared props_;              // Immutable props
  SharedListOfShared<ShadowNode> children_;  // Immutable children list
  LayoutMetrics layoutMetrics_;      // Computed layout

public:
  // Clone with new props
  Shared cloneWithNewProps(Props::Shared newProps) const {
    auto clone = std::make_shared<ShadowNode>(*this);
    clone->props_ = newProps;
    return clone;
  }

  // Clone with new children
  Shared cloneWithNewChildren(SharedListOfShared<ShadowNode> newChildren) const {
    auto clone = std::make_shared<ShadowNode>(*this);
    clone->children_ = newChildren;
    return clone;
  }

  // Identity check via family
  bool isSameLogicalNode(const ShadowNode& other) const {
    return family_.get() == other.family_.get();
  }
};

// Stable identity shared across clones
class ShadowNodeFamily {
  InstanceHandle::Shared instanceHandle_;
  SurfaceId surfaceId_;
  ShadowNodeFamily::Weak parent_;
  // NO tag - identity is the family pointer itself
};
```

### 8.3 Differentiator Implementation

```cpp
class Differentiator {
public:
  std::vector<Mutation> diff(
    ShadowNode::Shared oldTree,
    ShadowNode::Shared newTree
  ) {
    std::vector<Mutation> mutations;
    diffNode(oldTree, newTree, nullptr, mutations);
    return mutations;
  }

private:
  void diffNode(
    ShadowNode::Shared oldNode,
    ShadowNode::Shared newNode,
    ShadowNode::Shared parent,
    std::vector<Mutation>& mutations
  ) {
    if (oldNode == newNode) {
      // Same object - structural sharing, no changes
      return;
    }

    if (oldNode->getFamily() == newNode->getFamily()) {
      // Same logical node
      if (oldNode->getProps() != newNode->getProps() ||
          oldNode->getLayoutMetrics() != newNode->getLayoutMetrics()) {
        mutations.push_back(Mutation::Update(newNode));
      }
      diffChildren(oldNode, newNode, mutations);
    } else {
      // Different nodes
      mutations.push_back(Mutation::Remove(oldNode, parent));
      mutations.push_back(Mutation::Insert(newNode, parent));
    }
  }

  void diffChildren(
    ShadowNode::Shared oldParent,
    ShadowNode::Shared newParent,
    std::vector<Mutation>& mutations
  ) {
    // LCS-based diffing algorithm for optimal move detection
    // ... implementation details
  }
};
```

---

## 9. Migration Path

### 9.1 Phase 1: v1 with Mutation Mode

Start with mutation mode for simplicity:
- Simpler implementation
- Sufficient for initial RSC use case
- All JS on main thread
- No concurrent features

### 9.2 Phase 2: Refactor for Persistent Mode

When ready for concurrent features:

1. **Make ShadowNode Immutable**
   - Add clone methods
   - Use shared_ptr for props and children
   - Introduce ShadowNodeFamily

2. **Implement Differentiator**
   - Compare old/new trees
   - Generate mutation list
   - Handle structural sharing

3. **Update Host Config**
   - Switch `supportsMutation: false`
   - Switch `supportsPersistence: true`
   - Implement cloneInstance and ChildSet functions
   - Remove direct mutation functions

4. **Update Threading Model**
   - Layout can move to background thread
   - Commit becomes atomic swap
   - Events can reference immutable nodes safely

### 9.3 Effort Estimate

| Component | Effort | Complexity |
|-----------|--------|------------|
| ShadowNode refactor | Medium | Make immutable, add cloning |
| ShadowNodeFamily | Low | Simple identity wrapper |
| Differentiator | High | Tree comparison algorithm |
| Host config changes | Medium | New function signatures |
| Threading changes | Medium | Move layout off main thread |

---

## 10. Summary

### 10.1 Key Differences

| Aspect | Mutation Mode | Persistent Mode |
|--------|--------------|-----------------|
| Instance mutability | Mutable | Immutable |
| Update mechanism | `commitUpdate()` | `cloneInstance()` |
| Tree structure changes | `appendChild()`, etc. | Cloning + `replaceContainerChildren()` |
| Identity | Instance pointer | ShadowNodeFamily pointer |
| Tree diffing | Not needed | Required (Differentiator) |
| Threading | Requires synchronization | Lock-free via immutability |
| Concurrent features | Limited | Full support |
| Implementation complexity | Lower | Higher |

### 10.2 Recommendation for react-dom-native

**Short term (v1)**: Use mutation mode
- Faster to implement
- Sufficient for RSC use case
- All operations on main thread
- Design for easy migration

**Long term**: Migrate to persistent mode
- Required for concurrent features
- Better threading model
- Aligns with React's direction
- Matches Fabric architecture

### 10.3 What to Update in Existing Docs

| Document | Update Needed |
|----------|---------------|
| `cpp-shadow-tree-jsi.md` | Add section on future persistent mode migration |
| `mounting-scheduling.md` | Note Differentiator will be needed for persistent mode |
| `node-identity.md` | Add ShadowNodeFamily discussion for persistent mode |
| `reconciler.md` | Update mode decision with migration path |

---

## References

- [React Reconciler README](https://github.com/facebook/react/blob/main/packages/react-reconciler/README.md)
- [react-reconciler npm package](https://www.npmjs.com/package/react-reconciler)
- [React Reconciler TypeScript Definitions](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react-reconciler/index.d.ts)
- [React Native Render Pipeline](https://reactnative.dev/architecture/render-pipeline)
- [Fabric Deep Dive Discussion](https://github.com/reactwg/react-native-new-architecture/discussions/1)
- [GitHub Issue #24645: cloneInstance behavior](https://github.com/facebook/react/issues/24645)
- [Fabric Architecture Overview](https://kryptonsveryown.hashnode.dev/react-natives-new-renderer-fabric)
