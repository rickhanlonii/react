'use strict';

// ---------------------------------------------------------------------------
// React DevTools Agent
//
// Exposes $$getComponentTree() in the JSC global scope, allowing
// Chrome DevTools Console users to inspect the React component tree.
//
// Usage in Console: $$getComponentTree()
// Returns an array of tree nodes with {name, tag, key, props, children}.
// ---------------------------------------------------------------------------

globalThis.$$getComponentTree = function () {
  var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) return null;

  var trees = [];

  if (hook._fiberRoots) {
    // Lightweight shim format: _fiberRoots is a Map of rendererId -> Set<FiberRoot>
    hook._fiberRoots.forEach(function (roots) {
      roots.forEach(function (root) {
        if (root.current) {
          trees.push(fiberToTree(root.current, 0));
        }
      });
    });
  } else if (hook.getFiberRoots) {
    // Full DevTools hook format: getFiberRoots(rendererId) returns Set<FiberRoot>
    hook.renderers.forEach(function (_, id) {
      var roots = hook.getFiberRoots(id);
      if (roots) {
        roots.forEach(function (root) {
          if (root.current) {
            trees.push(fiberToTree(root.current, 0));
          }
        });
      }
    });
  }

  return trees;
};

function fiberToTree(fiber, depth) {
  if (!fiber || depth > 20) return null; // Prevent infinite recursion

  var name = null;
  if (typeof fiber.type === 'function') {
    name = fiber.type.displayName || fiber.type.name || 'Anonymous';
  } else if (typeof fiber.type === 'string') {
    name = fiber.type;
  }

  var node = {
    name: name,
    tag: fiber.tag,
    key: fiber.key,
  };

  // Include props for host elements (tag 5) and function components (tag 0)
  if (fiber.memoizedProps && (fiber.tag === 5 || fiber.tag === 0)) {
    try {
      var propKeys = Object.keys(fiber.memoizedProps);
      node.props = {};
      for (var i = 0; i < propKeys.length && i < 10; i++) {
        var k = propKeys[i];
        var v = fiber.memoizedProps[k];
        if (typeof v !== 'function' && typeof v !== 'object') {
          node.props[k] = v;
        }
      }
    } catch (e) {}
  }

  // Recurse into children
  var children = [];
  var child = fiber.child;
  while (child) {
    var childNode = fiberToTree(child, depth + 1);
    if (childNode) children.push(childNode);
    child = child.sibling;
  }
  if (children.length > 0) node.children = children;

  return node;
}
