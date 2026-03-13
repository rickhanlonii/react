# Implementation Plan: CALayer Backing for Simple Elements

Design: `docs/plans/2026-03-11-calayer-backing-design.md`

## Summary

Replace UIView with CALayer for eligible `<div>` elements to reduce mount cost. A div is eligible when it has no event handlers, no `id` prop, and is not a scroll container. If a UIView child is inserted into a CALayer parent, the parent is promoted to UIView.

## Steps

### Step 1: Add `ViewOrLayer` enum and update `ShadowNodeFamily`

**File**: `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeFamily.swift`

Add a `ViewOrLayer` enum to represent either backing type:

```swift
public enum ViewOrLayer {
    case view(UIView)
    case layer(CALayer)

    public var asView: UIView? {
        if case .view(let v) = self { return v }
        return nil
    }

    public var asLayer: CALayer? {
        switch self {
        case .view(let v): return v.layer
        case .layer(let l): return l
        }
    }

    public var frame: CGRect {
        get {
            switch self {
            case .view(let v): return v.frame
            case .layer(let l): return l.frame
            }
        }
        set {
            switch self {
            case .view(let v): v.frame = newValue
            case .layer(let l): l.frame = newValue
            }
        }
    }

    public var isLayer: Bool {
        if case .layer = self { return true }
        return false
    }
}
```

Update `ShadowNodeFamily`:
- Replace `public weak var view: UIView? = nil` with `public weak var viewOrLayer: ViewOrLayer?` — **BUT** enums can't be weak. Instead, keep `view` and add `public weak var layer: CALayer? = nil`. Add a computed `backing` property:

```swift
public var backing: ViewOrLayer? {
    if let v = view { return .view(v) }
    if let l = layer { return .layer(l) }
    return nil
}
```

### Step 2: Add eligibility check to `UIKitMutationApplier`

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

Add a static function:

```swift
private func shouldUseCALayer(elementType: String, props: [String: Any]) -> Bool {
    guard elementType == "div" else { return false }
    guard props["id"] == nil else { return false }
    guard props["onClick"] == nil else { return false }
    guard props["onSubmit"] == nil else { return false }
    let style = props["style"] as? [String: Any] ?? [:]
    let overflow = style["overflow"] as? String
    guard overflow != "scroll" && overflow != "auto" else { return false }
    return true
}
```

### Step 3: Add `createLayer` method and CALayer prop application

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

Add method to create and configure a CALayer:

```swift
private func createLayer(for node: ShadowNodeWrapper) -> CALayer {
    let layer = CALayer()
    applyCommonLayerProps(to: layer, props: node.props)
    return layer
}

private func applyCommonLayerProps(to layer: CALayer, props: [String: Any]) {
    guard let style = props["style"] as? [String: Any] else { return }
    if let bgColor = style["backgroundColor"] as? String {
        layer.backgroundColor = parseColor(bgColor).cgColor
    }
    if let opacity = style["opacity"] as? NSNumber {
        layer.opacity = Float(opacity.doubleValue)
    }
    if let overflow = style["overflow"] as? String {
        layer.masksToBounds = (overflow == "hidden")
    }
    if let visibility = style["visibility"] as? String {
        layer.isHidden = (visibility == "hidden")
    }
    if let zIndex = style["zIndex"] as? NSNumber {
        layer.zPosition = CGFloat(zIndex.doubleValue)
    }
    if let shadow = style["boxShadow"] as? [String: Any] {
        let offsetX = (shadow["offsetX"] as? NSNumber)?.doubleValue ?? 0
        let offsetY = (shadow["offsetY"] as? NSNumber)?.doubleValue ?? 0
        let blur = (shadow["blurRadius"] as? NSNumber)?.doubleValue ?? 0
        let color = (shadow["color"] as? String) ?? "black"
        layer.shadowOffset = CGSize(width: offsetX, height: offsetY)
        layer.shadowRadius = CGFloat(blur)
        layer.shadowColor = parseColor(color).cgColor
        layer.shadowOpacity = 1.0
    }
    // transform support
    if let transforms = style["transform"] as? [[String: Any]] {
        // Apply same transform logic but to layer.transform (CATransform3D)
    }
}
```

Also add `applyBoundsDependentLayerProps` for border/radius (mirroring `applyBoundsDependentProps`).

### Step 4: Update CREATE mutation to support CALayer

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

In the `.create` case, check eligibility before creating a UIView:

```swift
case .create(let node):
    if shouldUseCALayer(elementType: node.family.elementType, props: node.props) {
        let layer = createLayer(for: node)
        layer.frame = node.layoutFrame
        applyBoundsDependentLayerProps(to: layer, props: node.props)
        viewRegistry.registerLayer(layer: layer, family: node.family)
    } else {
        // existing UIView path (unchanged)
    }
```

### Step 5: Update ViewRegistry to support CALayer

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/ViewRegistry.swift`

Add parallel storage for layers:

```swift
private var familyToLayer: [ObjectIdentifier: CALayer] = [:]

public func registerLayer(layer: CALayer, family: ShadowNodeFamily) {
    let familyId = ObjectIdentifier(family)
    familyToLayer[familyId] = layer
    family.layer = layer
}

public func layer(for family: ShadowNodeFamily) -> CALayer? {
    return familyToLayer[ObjectIdentifier(family)]
}

public func unregisterLayer(family: ShadowNodeFamily) {
    familyToLayer.removeValue(forKey: ObjectIdentifier(family))
    family.layer = nil
}
```

Update `unregister(family:)` to also clean up layer mappings. Update `clear()` and `merge()`.

### Step 6: Update INSERT mutation to handle CALayer parent/child combinations

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

The INSERT case needs to handle 4 combinations:

1. **UIView child → UIView parent**: existing code (`insertSubview`)
2. **CALayer child → UIView parent**: `parent.layer.insertSublayer(childLayer, at: index)`
3. **CALayer child → CALayer parent**: `parent.insertSublayer(childLayer, at: index)`
4. **UIView child → CALayer parent**: **PROMOTE** — convert parent from CALayer to UIView, then insert

Promotion logic:
```swift
private func promoteLayerToView(family: ShadowNodeFamily) -> UIView {
    guard let oldLayer = family.layer else { fatalError("No layer to promote") }
    let view = UIView()
    view.frame = oldLayer.frame
    // Copy visual properties from layer to view
    view.backgroundColor = oldLayer.backgroundColor.map { UIColor(cgColor: $0) }
    view.layer.borderWidth = oldLayer.borderWidth
    view.layer.borderColor = oldLayer.borderColor
    view.layer.cornerRadius = oldLayer.cornerRadius
    view.alpha = CGFloat(oldLayer.opacity)
    view.clipsToBounds = oldLayer.masksToBounds
    view.isHidden = oldLayer.isHidden
    view.layer.zPosition = oldLayer.zPosition
    view.layer.shadowOffset = oldLayer.shadowOffset
    view.layer.shadowRadius = oldLayer.shadowRadius
    view.layer.shadowColor = oldLayer.shadowColor
    view.layer.shadowOpacity = oldLayer.shadowOpacity
    // Move existing sublayers to new view's layer
    if let sublayers = oldLayer.sublayers {
        for sublayer in sublayers {
            view.layer.addSublayer(sublayer)
        }
    }
    // Replace in parent
    if let parentLayer = oldLayer.superlayer {
        let index = parentLayer.sublayers?.firstIndex(of: oldLayer) ?? 0
        parentLayer.insertSublayer(view.layer, at: UInt32(index))
        oldLayer.removeFromSuperlayer()
    }
    // Update registry
    viewRegistry.unregisterLayer(family: family)
    viewRegistry.register(view: view, family: family)
    return view
}
```

### Step 7: Update REMOVE and DELETE mutations

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

REMOVE:
```swift
case .remove(let parent, let child):
    if let childView = child.family.view {
        childView.removeFromSuperview()
    } else if let childLayer = child.family.layer {
        childLayer.removeFromSuperlayer()
    }
```

DELETE:
```swift
case .delete(let node):
    if let view = node.family.view {
        view.removeFromSuperview()
        viewRegistry.unregister(family: node.family)
    } else if let layer = node.family.layer {
        layer.removeFromSuperlayer()
        viewRegistry.unregisterLayer(family: node.family)
    }
```

### Step 8: Update UPDATE mutation for backing type transitions

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

In the `.update` case, check if the backing type needs to change:

```swift
case .update(let node, _, let newProps):
    let needsLayer = shouldUseCALayer(elementType: node.family.elementType, props: newProps)
    let hasLayer = node.family.layer != nil
    let hasView = node.family.view != nil

    if hasLayer && !needsLayer {
        // Promote: CALayer → UIView (gained onClick or id)
        let view = promoteLayerToView(family: node.family)
        updateView(view, elementType: node.family.elementType, props: newProps)
        view.frame = node.layoutFrame
    } else if hasView && needsLayer && node.family.elementType == "div" {
        // Demote: UIView → CALayer (lost onClick and id) — optional optimization
        // For simplicity, skip demotion in v1. Once a UIView, stays a UIView.
    } else if let layer = node.family.layer {
        applyCommonLayerProps(to: layer, props: newProps)
        applyBoundsDependentLayerProps(to: layer, props: newProps)
        layer.frame = node.layoutFrame
    } else if let view = node.family.view {
        // existing UIView update path
    }
```

### Step 9: Update `syncAllFrames` in Renderer

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift`

Every `if let view = node.family.view` block needs a fallback to check `node.family.layer`:

```swift
if let view = node.family.view {
    if view.frame != node.layoutFrame {
        view.frame = node.layoutFrame
    }
} else if let layer = node.family.layer {
    if layer.frame != node.layoutFrame {
        layer.frame = node.layoutFrame
    }
}
```

### Step 10: Update snapshot/accessibility helpers

**File**: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift`

The accessibility snapshot walks `family.view`. CALayer-backed nodes have no accessibility representation (which is correct — they have no `id` and aren't interactive). Verify the snapshot walker handles `family.view == nil` gracefully (it already uses `guard let view = node.family.view else { return nil }`, which naturally skips CALayer nodes).

### Step 11: Test

Run the existing test suite to verify no regressions:
- Integration tests (Fantom): `npm run test`
- E2E layout comparison: verify layout fixtures render identically
- Demo app: verify visual correctness

## Non-goals (v1)

- Demotion (UIView → CALayer when props change) — once promoted, stays UIView
- CALayer for text elements (span, p) — future optimization with CATextLayer
- View pool support for CALayers — they're cheap enough to create fresh
- CALayer for `#text` nodes — future optimization
