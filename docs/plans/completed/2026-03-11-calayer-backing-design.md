# CALayer Backing for Simple Elements

## Problem

Mounting individual UIViews is too expensive. For simple container elements like `<div>` that only serve as layout boxes (background color, border, opacity), we pay the full cost of UIView creation — responder chain, accessibility, Auto Layout integration, hit testing — none of which is needed.

## Solution

Use CALayer instead of UIView for eligible elements. CALayer is ~2-4x cheaper to create than UIView while supporting all visual properties a simple container needs.

## Eligibility

A shadow node gets a CALayer instead of UIView when ALL are true:

- Element type is `div`
- No event handlers (`onClick`, `onSubmit`, etc.)
- No `id` prop (needed for accessibility/UI automation)
- Not a scroll container (`overflow` is not `scroll` or `auto`)

Everything else stays UIView. Scope is limited to `div` — the most common layout container — to minimize risk.

## Parent-Child Constraint

CALayers can contain sublayers but cannot host UIView subviews. When a UIView child needs to be inserted into a CALayer parent, the parent is **promoted** to UIView:

1. Remove the CALayer from its superlayer
2. Create a UIView in its place
3. Re-attach existing CALayer children as sublayers of the new UIView's layer
4. Insert the UIView into the parent hierarchy

This naturally limits CALayers to subtrees of simple containers, which is where the optimization matters most.

## Backing Type Transitions

Props can change between renders (e.g., a div gains `onClick`). During UPDATE mutations, the applier checks if the current backing type still matches eligibility. On mismatch, it performs a remove + create to swap CALayer↔UIView.

## Key Changes

### 1. ViewOrLayer enum

New type to represent either backing:

```swift
enum ViewOrLayer {
    case view(UIView)
    case layer(CALayer)
}
```

### 2. ShadowNodeFamily

Replace `weak var view: UIView?` with `weak var viewOrLayer: ViewOrLayer?` (or store both optionally).

### 3. ViewRegistry

Support registering/looking up both UIView and CALayer by family.

### 4. UIKitMutationApplier

- `createView()` → check eligibility, create CALayer or UIView
- `insertChild()` → branch on parent/child backing types, promote parent if needed
- `removeChild()` → `removeFromSuperlayer()` vs `removeFromSuperview()`
- `updateView()` → apply props to CALayer or UIView
- `deleteView()` → handle both types in recycling/cleanup

### 5. Prop Application

CALayer equivalents for div properties:

| UIView property | CALayer property |
|---|---|
| frame | frame |
| backgroundColor | backgroundColor |
| layer.borderWidth | borderWidth |
| layer.borderColor | borderColor |
| layer.cornerRadius | cornerRadius |
| alpha | opacity |
| clipsToBounds | masksToBounds |
| isHidden | isHidden |
| layer.shadowX | shadowX |

### 6. Eligibility Check

```swift
func shouldUseCALayer(elementType: String, props: [String: Any]) -> Bool {
    guard elementType == "div" else { return false }
    guard props["id"] == nil else { return false }
    guard props["onClick"] == nil else { return false }
    guard props["onSubmit"] == nil else { return false }
    let overflow = props["overflow"] as? String
    guard overflow != "scroll" && overflow != "auto" else { return false }
    return true
}
```

## Out of Scope

- Text elements (span, p, h1-h6) — these use UILabel, could use CATextLayer in a future pass
- `#text` nodes — currently UILabel, could use CATextLayer later
- Flattened drawing (Texture/ASDK-style) — could be layered on top later
- View recycling pool changes — CALayers are cheap enough that pooling is less critical
