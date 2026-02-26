# Hydration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement React hydration for react-dom-native so SSR-rendered content becomes interactive without re-creating native views.

**Architecture:** The reconciler's built-in hydration walks a pre-rendered SSR tree (built by Swift's ShadowTreeBuilder) via new `$$getFirstSSRChild`/`$$getSSRChildOf`/`$$getNextSSRSibling` bridge functions. The HostConfig adopts SSR nodes as fiber `stateNode` values, then the persistent-mode commit swaps them in via `replaceContainerChildren`. A new `hydrateRoot` JS API uses `reconciler.createHydrationContainer()` instead of `createContainer()`.

**Tech Stack:** react-reconciler (persistent mode + hydration), JavaScriptCore bridge ($$-prefixed globals), Swift ShadowTree/ShadowNodeWrapper, Fantom test harness

**Design doc:** `docs/plans/2026-02-16-hydration-design.md`

---

### Task 1: Add SSR tree traversal bridge to TesterBridge (Swift)

The Fantom test harness needs SSR tree traversal before we can write integration tests. The TesterBridge mirrors Bindings but targets macOS (no UIKit). We add hydration traversal functions and the ability to pre-populate an SSR tree.

**Files:**
- Modify: `tools/fantom/swift/Sources/FantomTester/TesterBridge.swift`

**Step 1: Add SSR tree storage property**

After the `currentTrees` property (line 33), add:

```swift
/// SSR trees registered for hydration traversal. Keyed by surfaceId.
private var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]
```

**Step 2: Add `registerHydrationTraversal()` call**

In `registerBridgeFunctions()` (line 89), add after `registerEventHandling()` (line 95):

```swift
registerHydrationTraversal()
```

**Step 3: Implement `registerHydrationTraversal()`**

Add a new section after `registerEventHandling()` (line 450):

```swift
// MARK: - Hydration Traversal

private func registerHydrationTraversal() {
    // $$registerSSRTree(surfaceId, nodeIds) -> void
    // Called from JS to register an SSR tree for hydration.
    // nodeIds is an array of root-level SSR node IDs.
    engine.setGlobalFunction("$$registerSSRTree") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        let surfaceId = engine.toInt(args[0]) ?? 0
        let nodeRefs = engine.toArray(args[1]) ?? []
        let nodes: [ShadowNodeWrapper] = nodeRefs.compactMap { ref in
            guard let id = engine.toInt(ref) else { return nil }
            return self.nodeRegistry[id]
        }
        self.ssrTrees[surfaceId] = nodes
        return nil
    }

    // $$getFirstSSRChild(surfaceId) -> {nodeId, type} | null
    // Returns the first root-level child of the SSR tree for a surface.
    engine.setGlobalFunction("$$getFirstSSRChild") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        let surfaceId = engine.toInt(args[0]) ?? 0
        guard let tree = self.ssrTrees[surfaceId], let first = tree.first else {
            return nil
        }
        return self.makeSSRNodeRef(first, engine: engine)
    }

    // $$getSSRChildOf(nodeId) -> {nodeId, type} | null
    // Returns the first child of an SSR node.
    engine.setGlobalFunction("$$getSSRChildOf") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        guard let node = self.lookupNode(args[0]) else { return nil }
        guard let first = node.children.first else { return nil }
        return self.makeSSRNodeRef(first, engine: engine)
    }

    // $$getNextSSRSibling(nodeId) -> {nodeId, type} | null
    // Returns the next sibling of an SSR node.
    engine.setGlobalFunction("$$getNextSSRSibling") { [weak self, weak engine] args in
        guard let self = self, let engine = engine else { return nil }
        guard let node = self.lookupNode(args[0]) else { return nil }

        // Find this node in its parent's children array
        // Walk all SSR trees and current trees to find the parent
        if let sibling = self.findNextSibling(of: node) {
            return self.makeSSRNodeRef(sibling, engine: engine)
        }
        return nil
    }

    // $$clearSSRTree(surfaceId) -> void
    // Cleans up the SSR tree after hydration completes.
    engine.setGlobalFunction("$$clearSSRTree") { [weak self] args in
        guard let self = self else { return nil }
        let surfaceId = (self.engine.toInt(args[0])) ?? 0
        self.ssrTrees.removeValue(forKey: surfaceId)
        return nil
    }
}

/// Creates a JS object representing an SSR node for hydration traversal.
/// Returns { _ssrNodeRef: nodeId, _ssrFamily: nodeId, type: "div"|"#text", props: {...} }
private func makeSSRNodeRef(_ node: ShadowNodeWrapper, engine: JSEngine) -> JSValueRef? {
    let nodeId = registerNode(node)
    let obj = engine.makeObject()
    engine.setProperty(obj, "_ssrNodeRef", engine.makeNumber(Double(nodeId)))
    engine.setProperty(obj, "_ssrFamily", engine.makeNumber(Double(nodeId)))
    engine.setProperty(obj, "type", engine.makeString(node.family.elementType))
    if let text = node.text {
        engine.setProperty(obj, "text", engine.makeString(text))
    }
    return obj
}

/// Finds the next sibling of a node by searching all known trees.
private func findNextSibling(of target: ShadowNodeWrapper) -> ShadowNodeWrapper? {
    // Search SSR trees
    for (_, tree) in ssrTrees {
        if let sibling = findNextSiblingInChildren(target, children: tree) {
            return sibling
        }
    }
    return nil
}

/// Recursively searches children arrays for the target node and returns the next sibling.
private func findNextSiblingInChildren(_ target: ShadowNodeWrapper, children: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
    for (index, child) in children.enumerated() {
        if child === target {
            if index + 1 < children.count {
                return children[index + 1]
            }
            return nil
        }
        // Recurse into children
        if let found = findNextSiblingInChildren(target, children: child.children) {
            return found
        }
    }
    return nil
}
```

**Step 4: Build Fantom to verify**

Run: `npm run test:fantom -- --testPathPattern=basic-render`

Expected: existing tests still pass (new bridge functions are additive)

**Step 5: Commit**

```
feat: add SSR tree traversal bridge functions to TesterBridge
```

---

### Task 2: Add SSR tree traversal bridge to Bindings (Swift)

The production Bindings needs the same hydration traversal functions as TesterBridge. This is the real UIKit path.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Add SSR tree storage property**

After `rootViews` (line 44), add:

```swift
/// SSR trees registered for hydration traversal. Keyed by surfaceId.
private var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]
```

**Step 2: Add public method for Root.swift to register SSR tree**

After `unregisterSurface` (line 106), add:

```swift
/// Registers an SSR tree for hydration traversal.
/// Called by Root.hydrateRoot() after SSR first paint completes.
public func registerSSRTree(surfaceId: Int, rootChildren: [ShadowNodeWrapper]) {
    ssrTrees[surfaceId] = rootChildren
    // Register all SSR nodes so they have IDs for the bridge
    for child in rootChildren {
        registerSSRSubtree(child)
    }
}

/// Recursively registers all nodes in an SSR subtree.
private func registerSSRSubtree(_ node: ShadowNodeWrapper) {
    _ = registerNode(node)
    for child in node.children {
        registerSSRSubtree(child)
    }
}

/// Clears the SSR tree after hydration completes.
public func clearSSRTree(surfaceId: Int) {
    ssrTrees.removeValue(forKey: surfaceId)
}
```

**Step 3: Add `registerHydrationTraversal()` call**

In `registerBindingFunctions()` (line 118), add after `registerNetworking()` (line 125):

```swift
registerHydrationTraversal()
```

**Step 4: Implement `registerHydrationTraversal()`**

Same implementation as TesterBridge (from Task 1 Step 3), but using `self.engine` directly. Add after `registerNetworking()` section.

**Step 5: Build the package**

Run: `npm run test:swift` (or just build to verify compilation)

Expected: compiles without errors

**Step 6: Commit**

```
feat: add SSR tree traversal bridge functions to Bindings
```

---

### Task 3: Enable hydration in HostConfig + implement tree walking functions

This is the core JS change — flip `supportsHydration` to true and implement the functions the reconciler calls to walk and adopt the SSR tree.

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`
- Test: `packages/react-dom-native/src/renderer/__tests__/renderer.test.js`

**Step 1: Write failing tests for hydration host config functions**

Add to `renderer.test.js`, after the existing `beforeEach` block (line 44), add mocks for bridge globals:

```javascript
const mockGetFirstSSRChild = jest.fn();
const mockGetSSRChildOf = jest.fn();
const mockGetNextSSRSibling = jest.fn();

beforeEach(() => {
  // ... existing mocks ...
  mockGetFirstSSRChild.mockClear();
  mockGetSSRChildOf.mockClear();
  mockGetNextSSRSibling.mockClear();

  global.$$getFirstSSRChild = mockGetFirstSSRChild;
  global.$$getSSRChildOf = mockGetSSRChildOf;
  global.$$getNextSSRSibling = mockGetNextSSRSibling;
});

afterEach(() => {
  // ... existing cleanup ...
  delete global.$$getFirstSSRChild;
  delete global.$$getSSRChildOf;
  delete global.$$getNextSSRSibling;
});
```

Then add a new test suite:

```javascript
describe('Hydration host config', () => {
  it('supportsHydration is true', () => {
    expect(HostConfig.supportsHydration).toBe(true);
  });

  describe('getFirstHydratableChildWithinContainer', () => {
    it('calls $$getFirstSSRChild with surfaceId', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      mockGetFirstSSRChild.mockReturnValue(ssrNode);
      const result = HostConfig.getFirstHydratableChildWithinContainer({surfaceId: 1});
      expect(mockGetFirstSSRChild).toHaveBeenCalledWith(1);
      expect(result).toBe(ssrNode);
    });

    it('returns null when no SSR children', () => {
      mockGetFirstSSRChild.mockReturnValue(null);
      const result = HostConfig.getFirstHydratableChildWithinContainer({surfaceId: 1});
      expect(result).toBeNull();
    });
  });

  describe('getFirstHydratableChild', () => {
    it('calls $$getSSRChildOf with node ref', () => {
      const child = {_ssrNodeRef: 2, type: 'p'};
      mockGetSSRChildOf.mockReturnValue(child);
      const result = HostConfig.getFirstHydratableChild({_ssrNodeRef: 1});
      expect(mockGetSSRChildOf).toHaveBeenCalledWith(1);
      expect(result).toBe(child);
    });
  });

  describe('getNextHydratableSibling', () => {
    it('calls $$getNextSSRSibling with node ref', () => {
      const sibling = {_ssrNodeRef: 3, type: 'span'};
      mockGetNextSSRSibling.mockReturnValue(sibling);
      const result = HostConfig.getNextHydratableSibling({_ssrNodeRef: 2});
      expect(mockGetNextSSRSibling).toHaveBeenCalledWith(2);
      expect(result).toBe(sibling);
    });

    it('returns null at end of sibling list', () => {
      mockGetNextSSRSibling.mockReturnValue(null);
      const result = HostConfig.getNextHydratableSibling({_ssrNodeRef: 2});
      expect(result).toBeNull();
    });
  });

  describe('canHydrateInstance', () => {
    it('returns ssrNode when type matches', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateInstance(ssrNode, 'div', {});
      expect(result).toBe(ssrNode);
    });

    it('returns null when type does not match', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateInstance(ssrNode, 'span', {});
      expect(result).toBeNull();
    });

    it('returns null for text nodes', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#text'};
      const result = HostConfig.canHydrateInstance(ssrNode, 'div', {});
      expect(result).toBeNull();
    });
  });

  describe('canHydrateTextInstance', () => {
    it('returns ssrNode when it is a text node', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#text', text: 'hello'};
      const result = HostConfig.canHydrateTextInstance(ssrNode, 'hello');
      expect(result).toBe(ssrNode);
    });

    it('returns null when not a text node', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateTextInstance(ssrNode, 'hello');
      expect(result).toBeNull();
    });
  });

  describe('hydrateInstance', () => {
    it('returns adopted instance with correct shape', () => {
      const ssrNode = {_ssrNodeRef: 42, _ssrFamily: 42, type: 'div'};
      const props = {style: {color: 'red'}};
      const handle = {};
      const result = HostConfig.hydrateInstance(
        ssrNode, 'div', props, defaultContext, handle
      );
      // hydrateInstance should set the fiber stateNode — the reconciler
      // reads workInProgress.stateNode which was set during tryToClaimNextHydratableInstance.
      // The return value is used for diff warnings, not the instance itself.
      // We return null (no diff warnings).
      expect(result).toBeNull();
    });
  });

  describe('hydrateTextInstance', () => {
    it('returns false (no diff) when text matches', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#text', text: 'hello'};
      const result = HostConfig.hydrateTextInstance(ssrNode, 'hello', {});
      expect(result).toBe(false);
    });
  });

  describe('canHydrateSuspenseInstance', () => {
    it('returns ssrNode when type is #suspense', () => {
      const ssrNode = {_ssrNodeRef: 1, type: '#suspense'};
      const result = HostConfig.canHydrateSuspenseInstance(ssrNode);
      expect(result).toBe(ssrNode);
    });

    it('returns null for non-suspense nodes', () => {
      const ssrNode = {_ssrNodeRef: 1, type: 'div'};
      const result = HostConfig.canHydrateSuspenseInstance(ssrNode);
      expect(result).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --testPathPattern=renderer`

Expected: FAIL — `supportsHydration` is `false`, functions return wrong values

**Step 3: Implement hydration functions in HostConfig.js**

In `HostConfig.js`, change line 114:

```javascript
exports.supportsHydration = true;
```

Replace the hydration stubs (lines 460-503) with:

```javascript
// ---------------------------------------------------------------------------
// Tier 4: Hydration
// ---------------------------------------------------------------------------

exports.isSuspenseInstancePending = function(instance) {
  return instance.pending === true;
};
exports.isSuspenseInstanceFallback = function(instance) {
  return instance.fallback === true;
};
exports.getSuspenseInstanceFallbackErrorDetails = function() { return null; };
exports.registerSuspenseInstanceRetry = function(instance, callback) {
  if (instance._retryCallbacks) {
    instance._retryCallbacks.push(callback);
  } else {
    instance._retryCallbacks = [callback];
  }
};
exports.canHydrateFormStateMarker = function() { return false; };
exports.isFormStateMarkerMatching = function() { return false; };

exports.getNextHydratableSibling = function(instance) {
  return $$getNextSSRSibling(instance._ssrNodeRef);
};
exports.getNextHydratableSiblingAfterSingleton = function() { return null; };

exports.getFirstHydratableChild = function(instance) {
  return $$getSSRChildOf(instance._ssrNodeRef);
};
exports.getFirstHydratableChildWithinContainer = function(container) {
  return $$getFirstSSRChild(container.surfaceId);
};
exports.getFirstHydratableChildWithinActivityInstance = function() { return null; };
exports.getFirstHydratableChildWithinSuspenseInstance = function(instance) {
  return $$getSSRChildOf(instance._ssrNodeRef);
};
exports.getFirstHydratableChildWithinSingleton = function() { return null; };

exports.canHydrateInstance = function(instance, type, props, inRootOrSingleton) {
  if (instance.type === type) {
    return instance;
  }
  return null;
};
exports.canHydrateTextInstance = function(instance, text) {
  if (instance.type === '#text') {
    return instance;
  }
  return null;
};
exports.canHydrateActivityInstance = function() { return null; };
exports.canHydrateSuspenseInstance = function(instance) {
  if (instance.type === '#suspense') {
    return instance;
  }
  return null;
};

exports.hydrateInstance = function(instance, type, props, hostContext, internalHandle) {
  // The reconciler has already set workInProgress.stateNode to this instance
  // during tryToClaimNextHydratableInstance. We need to ensure the instance
  // has the shape expected by cloneInstance/replaceContainerChildren.
  //
  // The instance IS the SSR node ref — we augment it in place so that
  // the persistent mode child set builder can read _nativeNode from stateNode.
  instance._nativeNode = instance._ssrNodeRef;
  instance._nativeFamily = instance._ssrFamily;
  instance._internalInstanceHandle = internalHandle;
  instance.props = props;
  instance.children = [];
  // Return null = no hydration diff warnings
  return null;
};

exports.hydrateTextInstance = function(textInstance, text, internalHandle) {
  textInstance._nativeNode = textInstance._ssrNodeRef;
  textInstance._nativeFamily = textInstance._ssrFamily;
  textInstance._internalInstanceHandle = internalHandle;
  textInstance.text = text;
  // Return false = text matches, no update needed
  return false;
};

exports.hydrateActivityInstance = function() {};
exports.hydrateSuspenseInstance = function(suspenseInstance, internalHandle) {
  suspenseInstance._internalInstanceHandle = internalHandle;
};

exports.getNextHydratableInstanceAfterActivityInstance = function() { return null; };
exports.getNextHydratableInstanceAfterSuspenseInstance = function(instance) {
  return $$getNextSSRSibling(instance._ssrNodeRef);
};

exports.finalizeHydratedChildren = function() { return false; };
exports.commitHydratedInstance = function() {};
exports.commitHydratedContainer = function() {};
exports.commitHydratedActivityInstance = function() {};
exports.commitHydratedSuspenseInstance = function() {};
exports.flushHydrationEvents = function() {};

exports.clearActivityBoundary = function() {};
exports.clearSuspenseBoundary = function(parentInstance, suspenseInstance) {
  // Remove SSR content for this boundary so client render can replace it
};
exports.clearActivityBoundaryFromContainer = function() {};
exports.clearSuspenseBoundaryFromContainer = function(container, suspenseInstance) {
  // Remove SSR content for this boundary from the container
};

exports.hideDehydratedBoundary = function() {};
exports.unhideDehydratedBoundary = function() {};
exports.shouldDeleteUnhydratedTailInstances = function() { return false; };
exports.diffHydratedPropsForDevWarnings = function() { return null; };
exports.diffHydratedTextForDevWarnings = function() { return null; };
exports.describeHydratableInstanceForDevWarnings = function(instance) {
  return instance.type || '';
};
exports.validateHydratableInstance = function() {};
exports.validateHydratableTextInstance = function() {};
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --testPathPattern=renderer`

Expected: PASS

**Step 5: Commit**

```
feat: enable hydration in HostConfig and implement tree walking functions
```

---

### Task 4: Add `hydrateRoot` to renderer.js and entry.js

Add the JS-side `hydrateRoot` function and the `hydrateFromURL` entry point.

**Files:**
- Modify: `packages/react-dom-native/src/renderer/renderer.js`
- Modify: `packages/react-dom-native/src/renderer/index.js`
- Modify: `packages/react-dom-native/src/entry.js`
- Test: `packages/react-dom-native/src/renderer/__tests__/renderer.test.js`

**Step 1: Write failing test for hydrateRoot**

Add to `renderer.test.js`:

```javascript
describe('hydrateRoot', () => {
  let hydrateRoot;

  beforeEach(() => {
    // Need to clear module cache since HostConfig is already loaded with mocks
    jest.resetModules();
    // Re-register mocks
    global.$$createNode = mockCreateNode;
    global.$$createTextNode = mockCreateTextNode;
    global.$$appendChild = mockAppendChild;
    global.$$cloneNodeWithNewProps = mockCloneNodeWithNewProps;
    global.$$cloneNodeWithNewChildrenAndProps = mockCloneNodeWithNewChildrenAndProps;
    global.$$completeRoot = mockCompleteRoot;
    global.$$getFirstSSRChild = mockGetFirstSSRChild;
    global.$$getSSRChildOf = mockGetSSRChildOf;
    global.$$getNextSSRSibling = mockGetNextSSRSibling;
    global.$$registerEventHandler = jest.fn();
    hydrateRoot = require('../renderer').hydrateRoot;
  });

  it('is exported from renderer', () => {
    expect(typeof hydrateRoot).toBe('function');
  });

  it('returns object with render and unmount methods', () => {
    const root = hydrateRoot(
      {surfaceId: 1, width: 390, height: 844},
      null,
    );
    expect(typeof root.render).toBe('function');
    expect(typeof root.unmount).toBe('function');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern=renderer`

Expected: FAIL — `hydrateRoot` is not exported

**Step 3: Add `hydrateRoot` to renderer.js**

After the `createRoot` function (line 56), add:

```javascript
function noop() {}

function hydrateRoot(nativeRootView, initialElement, options) {
  console.log('[Renderer] hydrateRoot called with surfaceId: ' + (nativeRootView.surfaceId || 'auto'));
  const surfaceId = nativeRootView.surfaceId != null
    ? nativeRootView.surfaceId
    : nextSurfaceId++;
  const container = {
    surfaceId,
    rootView: nativeRootView,
    width: nativeRootView.width || 0,
    height: nativeRootView.height || 0,
    currentTree: null,
    pendingTree: null,
  };
  const root = reconciler.createHydrationContainer(
    initialElement,
    null,           // callback
    container,
    1,              // ConcurrentRoot
    null,           // hydrationCallbacks
    false,          // isStrictMode
    null,           // concurrentUpdatesByDefaultOverride
    '',             // identifierPrefix
    options && options.onUncaughtError ? options.onUncaughtError : noop,
    options && options.onCaughtError ? options.onCaughtError : noop,
    options && options.onRecoverableError ? options.onRecoverableError : noop,
    noop,           // onDefaultTransitionIndicator
    null,           // transitionCallbacks
    null,           // formState
  );
  console.log('[Renderer] Hydration container created for surfaceId: ' + surfaceId);
  return {
    render(element) {
      reconciler.updateContainer(element, root, null, null);
    },
    unmount() {
      reconciler.updateContainer(null, root, null, null);
    },
  };
}
```

Update the export (line 58):

```javascript
module.exports = {createRoot, hydrateRoot, reconciler};
```

**Step 4: Update `index.js`**

Replace contents of `packages/react-dom-native/src/renderer/index.js`:

```javascript
'use strict';

const {createRoot, hydrateRoot} = require('./renderer');

module.exports = {createRoot, hydrateRoot};
```

**Step 5: Add `hydrateFromURL` to entry.js**

In `packages/react-dom-native/src/entry.js`, add the import (after line 16):

```javascript
var hydrateRoot = renderer.hydrateRoot;
```

Add `hydrateFromURL` to the `globalThis.__REACT_DOM_NATIVE__` object (after `render` on line 58):

```javascript
  // Called by native to hydrate SSR content from an RSC stream.
  // Must be called after SSR tree is registered via $$registerSSRTree.
  hydrateFromURL: function hydrateFromURL(url, options) {
    var surfaceId = options && options.surfaceId ? options.surfaceId : 1;
    var fetchPromise = fetchWithBridge(url, {
      headers: {Accept: 'text/x-component'},
    });
    var tree = createFromFetch(fetchPromise, {serverURL: url});

    tree.then(function(element) {
      hydrateRoot({surfaceId: surfaceId}, element);
    }, function(error) {
      console.error('[react-dom-native] Hydration RSC stream error: ' + error);
    });
  },
```

**Step 6: Run tests**

Run: `npm test -- --testPathPattern=renderer`

Expected: PASS

**Step 7: Commit**

```
feat: add hydrateRoot to renderer and hydrateFromURL to entry point
```

---

### Task 5: Add `createHydrationRoot` to Fantom test harness

The Fantom test framework needs a way to set up an SSR tree and then hydrate against it.

**Files:**
- Modify: `tools/fantom/src/index.js`

**Step 1: Add `createHydrationRoot` function**

After the `createRoot` function (line 24), add:

```javascript
/**
 * Creates a pre-populated SSR tree and returns a hydration root.
 *
 * Usage:
 *   var root = Fantom.createHydrationRoot(<div><p>Hello</p></div>);
 *   Fantom.runTask(function() {
 *     root.hydrate(<div><p>Hello</p></div>);
 *   });
 *
 * The SSR step renders the element via createRoot (building the shadow tree),
 * then registers that tree as the SSR tree for hydration traversal.
 * The hydrate step runs hydrateRoot against the registered SSR tree.
 */
function createHydrationRoot(ssrElement) {
  var surfaceId = 1;
  var nativeRootView = {surfaceId: surfaceId, width: 390, height: 844};

  // Step 1: Render the SSR content to build the shadow tree
  var ssrRoot = renderer.createRoot(nativeRootView);
  ssrRoot.render(ssrElement);
  $$flushWork();

  // Step 2: Get the current tree node IDs and register as SSR tree
  // The $$getRenderedNodeIds function returns the node IDs of the current tree
  var nodeIds = $$getRenderedNodeIds(surfaceId);
  $$registerSSRTree(surfaceId, nodeIds);

  return {
    hydrate: function(element) {
      // Create a hydration root that will walk the SSR tree
      var hydrationRoot = renderer.hydrateRoot(nativeRootView, element);
      return hydrationRoot;
    },
    getRenderedOutput: function() {
      return JSON.parse($$getRenderedOutput(surfaceId));
    },
  };
}
```

**Step 2: Add `$$getRenderedNodeIds` to TesterBridge**

In `tools/fantom/swift/Sources/FantomTester/TesterBridge.swift`, add to `registerTestFunctions()`:

```swift
// $$getRenderedNodeIds(surfaceId) -> [nodeId]
// Returns the node IDs for the current tree's root children.
engine.setGlobalFunction("$$getRenderedNodeIds") { [weak self, weak engine] args in
    guard let self = self, let engine = engine else { return nil }
    let surfaceId = engine.toInt(args[0]) ?? 0
    guard let tree = self.currentTrees[surfaceId] else {
        return engine.makeArray([])
    }
    let ids: [JSValueRef] = tree.compactMap { node in
        // Find the node ID in the registry
        for (id, registeredNode) in self.nodeRegistry where registeredNode === node {
            return engine.makeNumber(Double(id))
        }
        return nil
    }
    return engine.makeArray(ids)
}
```

**Step 3: Export `createHydrationRoot` from Fantom**

Update the `module.exports` at the end of `tools/fantom/src/index.js`:

```javascript
module.exports = {
  createRoot: createRoot,
  createHydrationRoot: createHydrationRoot,
  renderToFlightString: renderToFlightString,
  createFromFlight: createFromFlight,
  runTask: runTask,
  getRenderedOutput: getRenderedOutput,
  dispatchEvent: dispatchEvent,
};
```

**Step 4: Build and verify**

Run: `npm run test:fantom -- --testPathPattern=basic-render`

Expected: existing tests still pass

**Step 5: Commit**

```
feat: add createHydrationRoot to Fantom test harness
```

---

### Task 6: Write hydration integration tests

End-to-end tests that verify hydration works through the full JS ↔ Swift bridge.

**Files:**
- Create: `tests/integration/hydration-itest.js`

**Step 1: Write basic hydration test**

```javascript
'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Hydration', function () {
  it('hydrates a simple div with text', function () {
    var element = (
      <div>
        <p>Hello</p>
      </div>
    );

    var root = Fantom.createHydrationRoot(element);
    Fantom.runTask(function () {
      root.hydrate(element);
    });

    var output = root.getRenderedOutput();
    expect(output.children.length).toBe(1);
    expect(output.children[0].type).toBe('div');
    expect(output.children[0].children[0].type).toBe('p');
  });

  it('hydrates nested elements', function () {
    var element = (
      <div>
        <section>
          <h1>Title</h1>
          <p>Body</p>
        </section>
      </div>
    );

    var root = Fantom.createHydrationRoot(element);
    Fantom.runTask(function () {
      root.hydrate(element);
    });

    var output = root.getRenderedOutput();
    var section = output.children[0].children[0];
    expect(section.type).toBe('section');
    expect(section.children.length).toBe(2);
    expect(section.children[0].type).toBe('h1');
    expect(section.children[1].type).toBe('p');
  });

  it('hydrates with style props preserved', function () {
    var element = <div style={{backgroundColor: 'red'}} />;

    var root = Fantom.createHydrationRoot(element);
    Fantom.runTask(function () {
      root.hydrate(element);
    });

    var output = root.getRenderedOutput();
    expect(output.children[0].props.style.backgroundColor).toBe('red');
  });

  it('supports updates after hydration', function () {
    var element = <div><p>Before</p></div>;

    var root = Fantom.createHydrationRoot(element);
    var hydrationRoot;
    Fantom.runTask(function () {
      hydrationRoot = root.hydrate(element);
    });

    // Update after hydration
    Fantom.runTask(function () {
      hydrationRoot.render(<div><p>After</p></div>);
    });

    var output = root.getRenderedOutput();
    expect(output.children[0].children[0].type).toBe('p');
  });
});
```

**Step 2: Run integration tests**

Run: `npm run test:fantom -- --testPathPattern=hydration`

Expected: Tests pass (or fail, indicating what needs fixing — iterate)

**Step 3: Commit**

```
test: add hydration integration tests
```

---

### Task 7: Add `Root.hydrateRoot()` to Swift

Wire up the Swift-side API that app developers call after SSR first paint.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Replace the stubbed `startHydration` with real `hydrateRoot`**

Replace the `startHydration` method (lines 354-371) with:

```swift
/// Hydrates SSR content by attaching React's runtime to the pre-rendered tree.
///
/// Call this after `renderWithSSR()` completes its first paint. The hydration
/// process:
/// 1. Loads the JS bundle and boots the React runtime
/// 2. Registers the SSR tree for JS-side traversal
/// 3. Fetches the RSC stream and hydrates against the SSR tree
/// 4. Attaches event handlers — app becomes interactive
///
/// - Parameters:
///   - serverURL: URL of the RSC server (e.g. "http://localhost:6000").
///   - completion: Called when hydration completes or fails.
public func hydrateRoot(serverURL: String, completion: ((Error?) -> Void)? = nil) {
    guard !isUnmounted else {
        print("[ReactDomNativeKit] Warning: Cannot hydrate an unmounted root.")
        completion?(RootError.alreadyUnmounted)
        return
    }

    guard let treeBuilder = ssrTreeBuilder else {
        print("[ReactDomNativeKit] Warning: No SSR tree to hydrate. Call renderWithSSR() first.")
        completion?(RootError.runtimeNotInitialized)
        return
    }

    // Create runtime if needed
    if runtime == nil {
        runtime = JSRuntime()

        if let onError = options.onUncaughtError {
            runtime?.engine.exceptionHandler = { message, _ in
                onError(RootError.jsException(message))
            }
        }

        runtime?.bindings.registerSurface(surfaceId: options.surfaceId, rootView: container)
        setupLayoutObserver()
    }

    // Register the SSR tree so bridge functions can traverse it
    runtime?.bindings.registerSSRTree(
        surfaceId: options.surfaceId,
        rootChildren: treeBuilder.rootChildren
    )

    // Load and execute bundle, then trigger hydrateFromURL
    let bundleURL = resolveBundleURL()
    loadBundle(from: bundleURL) { [weak self] result in
        switch result {
        case .success(let source):
            self?.executeBundle(source: source, sourceURL: bundleURL)
            self?.callHydrateFromURL(serverURL: serverURL)
            completion?(nil)

            // Clean up SSR state
            self?.ssrParser = nil
            self?.ssrTreeBuilder = nil
            self?.ssrBoundaryManager = nil
            self?.ssrCoordinator = nil
            self?.ssrFlightDataBuffer.removeAll()
            self?.ssrViewRegistry = nil
            self?.ssrMutationApplier = nil
            self?.ssrRevealHasOccurred = false

        case .failure(let error):
            print("[ReactDomNativeKit] Hydration failed to load bundle: \(error)")
            self?.options.onRecoverableError?(error)
            completion?(error)
        }
    }
}

/// Calls the JS-side hydrateFromURL after the framework bundle has been evaluated.
private func callHydrateFromURL(serverURL: String) {
    let js = "globalThis.__REACT_DOM_NATIVE__.hydrateFromURL('\(serverURL)', {surfaceId: \(options.surfaceId)})"
    runtime?.engine.evaluate(js)
}
```

**Step 2: Update the `renderWithSSR` TODO comment**

Replace line 332 (`// TODO: re-enable hydration after SSR content is verified`):

```swift
// Hydration is now available via root.hydrateRoot(serverURL:)
// called separately after renderWithSSR completes.
```

**Step 3: Build the iOS app**

Run: `npm run test:swift` (or build the Xcode project)

Expected: compiles without errors

**Step 4: Commit**

```
feat: add Root.hydrateRoot() for SSR-to-interactive transition
```

---

### Task 8: Verify end-to-end and clean up

Final verification that everything works together.

**Step 1: Run all JS unit tests**

Run: `npm test`

Expected: all pass

**Step 2: Run all Fantom integration tests**

Run: `npm run test:fantom`

Expected: all pass (including new hydration tests)

**Step 3: Run Swift tests**

Run: `npm run test:swift`

Expected: all pass

**Step 4: Commit any fixes**

If any tests fail, fix and commit with appropriate message.

**Step 5: Final commit**

```
chore: verify hydration implementation end-to-end
```
