# Perf 04: UIView Recycling Pool

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save 3-5ms by recycling deleted UIViews instead of allocating fresh ones for every CREATE mutation.

**Architecture:** Currently every CREATE mutation allocates a new UIView/UILabel/UIButton. DELETE mutations discard the view. A pool keyed by element type allows DELETE to return views and CREATE to reuse them, avoiding UIKit allocation overhead. UILabel is the most expensive (~1-2ms for #text/span creates).

**Tech Stack:** Swift, UIKit

---

### Task 1: Create ViewPool class

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/ViewPool.swift`

**Step 1: Write the pool**

```swift
import UIKit

/// Recycles UIViews to avoid repeated allocation/deallocation.
final class ViewPool {
    private var pools: [String: [UIView]] = [:]
    private let maxPerType = 20

    func dequeue(elementType: String) -> UIView? {
        return pools[elementType]?.popLast()
    }

    func recycle(view: UIView, elementType: String) {
        view.removeFromSuperview()
        // Reset common state
        view.layer.sublayers?.filter { $0.name == "__border_edge__" || $0.name == "__corner_mask__" || $0.name == "__bg_layer__" }
            .forEach { $0.removeFromSuperlayer() }
        view.layer.mask = nil
        view.alpha = 1
        view.isHidden = false
        view.transform = .identity
        view.backgroundColor = nil
        view.clipsToBounds = false

        if let label = view as? UILabel {
            label.text = nil
            label.attributedText = nil
            label.font = UIFont.systemFont(ofSize: 16)
            label.textColor = .black
            label.textAlignment = .natural
            label.numberOfLines = 0
        }

        var pool = pools[elementType, default: []]
        guard pool.count < maxPerType else { return }
        pool.append(view)
        pools[elementType] = pool
    }
}
```

---

### Task 2: Integrate pool into UIKitMutationApplier

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

**Step 1: Add pool property**

Add a `viewPool` property to `UIKitMutationApplier`:
```swift
let viewPool = ViewPool()
```

**Step 2: Use pool in CREATE**

In the CREATE handler, before calling `createView(for:)`, try the pool first:
```swift
let view: UIView
if let recycled = viewPool.dequeue(elementType: node.family.elementType) {
    view = recycled
    // Re-apply all props to recycled view
    updateView(view, for: node)
} else {
    view = createView(for: node)
}
```

**Step 3: Use pool in DELETE**

In the DELETE handler, recycle instead of just deregistering:
```swift
case .delete(let node):
    if let view = viewRegistry.view(for: node.family) {
        viewPool.recycle(view: view, elementType: node.family.elementType)
    }
    viewRegistry.deregister(family: node.family)
```

**Step 4: Build and run**

Run: `/build demo`
Expected: App renders identically. Navigate between pages to exercise create/delete cycles.

**Step 5: Run perf trace**

Compare CREATE operation timings — recycled views should be faster than fresh allocations.

**Step 6: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/ViewPool.swift \
        packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift
git commit -m "perf: add UIView recycling pool to reduce allocation overhead"
```
