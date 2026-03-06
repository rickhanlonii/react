import Foundation
import Yoga

/// Maps CSS-style property names from JS props to Yoga C API calls.
///
/// Style properties arrive as a `[String: Any]` dictionary from JS.
/// This enum provides a single `apply(_:to:)` function that reads known
/// keys and sets the corresponding Yoga node style properties.
public enum YogaStyleApplier {

    /// Apply style properties from a dictionary to a Yoga node.
    public static func apply(_ style: [String: Any], to node: YGNodeRef) {
        guard !style.isEmpty else { return }

        // CSS default: content-box (Yoga defaults to border-box)
        YGNodeStyleSetBoxSizing(node, .contentBox)

        // Border style is needed by border width handlers
        let borderStyle = style["borderStyle"] as? String
        let hasBorderStyle = borderStyle != nil && borderStyle != "none"

        for (key, value) in style {
            switch key {
            case "boxSizing":
                applyBoxSizing(value, to: node)
            case "flexDirection":
                applyFlexDirection(value, to: node)
            case "alignItems":
                applyAlignItems(value, to: node)
            case "alignSelf":
                applyAlignSelf(value, to: node)
            case "alignContent":
                applyAlignContent(value, to: node)
            case "justifyContent":
                applyJustifyContent(value, to: node)
            case "gap":
                applyGap(value, to: node, axis: .all)
            case "rowGap":
                applyGap(value, to: node, axis: .row)
            case "columnGap":
                applyGap(value, to: node, axis: .column)
            case "padding":
                applyPadding(value, to: node, edge: .all)
            case "paddingTop":
                applyPadding(value, to: node, edge: .top)
            case "paddingRight":
                applyPadding(value, to: node, edge: .right)
            case "paddingBottom":
                applyPadding(value, to: node, edge: .bottom)
            case "paddingLeft":
                applyPadding(value, to: node, edge: .left)
            case "paddingHorizontal":
                applyPadding(value, to: node, edge: .horizontal)
            case "paddingVertical":
                applyPadding(value, to: node, edge: .vertical)
            case "margin":
                applyMargin(value, to: node, edge: .all)
            case "marginTop":
                applyMargin(value, to: node, edge: .top)
            case "marginRight":
                applyMargin(value, to: node, edge: .right)
            case "marginBottom":
                applyMargin(value, to: node, edge: .bottom)
            case "marginLeft":
                applyMargin(value, to: node, edge: .left)
            case "marginHorizontal":
                applyMargin(value, to: node, edge: .horizontal)
            case "marginVertical":
                applyMargin(value, to: node, edge: .vertical)
            case "width":
                applyDimension(value, to: node, set: YGNodeStyleSetWidth, setPercent: YGNodeStyleSetWidthPercent)
            case "height":
                applyDimension(value, to: node, set: YGNodeStyleSetHeight, setPercent: YGNodeStyleSetHeightPercent)
            case "minWidth":
                applyDimension(value, to: node, set: YGNodeStyleSetMinWidth, setPercent: YGNodeStyleSetMinWidthPercent)
            case "minHeight":
                applyDimension(value, to: node, set: YGNodeStyleSetMinHeight, setPercent: YGNodeStyleSetMinHeightPercent)
            case "maxWidth":
                applyDimension(value, to: node, set: YGNodeStyleSetMaxWidth, setPercent: YGNodeStyleSetMaxWidthPercent)
            case "maxHeight":
                applyDimension(value, to: node, set: YGNodeStyleSetMaxHeight, setPercent: YGNodeStyleSetMaxHeightPercent)
            case "flex":
                applyFlexShorthand(value, to: node, style: style)
            case "flexGrow":
                if let fg = toFloat(value) { YGNodeStyleSetFlexGrow(node, fg) }
            case "flexShrink":
                if let fs = toFloat(value) { YGNodeStyleSetFlexShrink(node, fs) }
            case "flexBasis":
                if let fb = toFloat(value) { YGNodeStyleSetFlexBasis(node, fb) }
            case "aspectRatio":
                applyAspectRatio(value, to: node, style: style)
            case "flexWrap":
                applyFlexWrap(value, to: node)
            case "position":
                applyPosition(value, to: node)
            case "top":
                if let v = toFloat(value) { YGNodeStyleSetPosition(node, .top, v) }
            case "left":
                if let v = toFloat(value) { YGNodeStyleSetPosition(node, .left, v) }
            case "right":
                if let v = toFloat(value) { YGNodeStyleSetPosition(node, .right, v) }
            case "bottom":
                if let v = toFloat(value) { YGNodeStyleSetPosition(node, .bottom, v) }
            case "display":
                applyDisplay(value, to: node)
            case "overflow":
                applyOverflow(value, to: node)
            case "borderStyle":
                // Handled via hasBorderStyle flag; apply uniform border width
                if hasBorderStyle {
                    let uniform = toFloat(style["borderWidth"]) ?? 3 // CSS initial = "medium" = 3px
                    YGNodeStyleSetBorder(node, .all, uniform)
                }
            case "borderWidth":
                // borderWidth is applied via borderStyle case or individual edges below
                break
            case "borderTopWidth":
                if hasBorderStyle, let v = toFloat(value) { YGNodeStyleSetBorder(node, .top, v) }
            case "borderRightWidth":
                if hasBorderStyle, let v = toFloat(value) { YGNodeStyleSetBorder(node, .right, v) }
            case "borderBottomWidth":
                if hasBorderStyle, let v = toFloat(value) { YGNodeStyleSetBorder(node, .bottom, v) }
            case "borderLeftWidth":
                if hasBorderStyle, let v = toFloat(value) { YGNodeStyleSetBorder(node, .left, v) }
            default:
                break // Non-Yoga property (backgroundColor, color, etc.)
            }
        }

        // Post-pass: Yoga bug workaround — when both height and maxHeight are
        // set as point values, Yoga's flex layout incorrectly uses the unclamped
        // height when computing the auto height of an ancestor container.
        // Pre-compute the clamped height so the ancestor sees the correct value.
        // Same for width/maxWidth.
        if let h = toFloat(style["height"]),
           let maxH = toFloat(style["maxHeight"]),
           h > maxH {
            YGNodeStyleSetHeight(node, maxH)
        }
        if let w = toFloat(style["width"]),
           let maxW = toFloat(style["maxWidth"]),
           w > maxW {
            YGNodeStyleSetWidth(node, maxW)
        }
    }

    // MARK: - Property Handlers

    private static func applyBoxSizing(_ value: Any, to node: YGNodeRef) {
        guard let bs = value as? String else { return }
        switch bs {
        case "border-box":
            YGNodeStyleSetBoxSizing(node, .borderBox)
        case "content-box":
            YGNodeStyleSetBoxSizing(node, .contentBox)
        default: break
        }
    }

    private static func applyFlexDirection(_ value: Any, to node: YGNodeRef) {
        guard let fd = value as? String else { return }
        switch fd {
        case "row":
            YGNodeStyleSetFlexDirection(node, .row)
        case "column":
            YGNodeStyleSetFlexDirection(node, .column)
        case "row-reverse":
            YGNodeStyleSetFlexDirection(node, .rowReverse)
        case "column-reverse":
            YGNodeStyleSetFlexDirection(node, .columnReverse)
        default: break
        }
    }

    private static func applyAlignItems(_ value: Any, to node: YGNodeRef) {
        guard let ai = value as? String else { return }
        switch ai {
        case "center":
            YGNodeStyleSetAlignItems(node, .center)
        case "flex-start", "flexStart":
            YGNodeStyleSetAlignItems(node, .flexStart)
        case "flex-end", "flexEnd":
            YGNodeStyleSetAlignItems(node, .flexEnd)
        case "stretch":
            YGNodeStyleSetAlignItems(node, .stretch)
        case "baseline":
            YGNodeStyleSetAlignItems(node, .baseline)
        default: break
        }
    }

    private static func applyAlignSelf(_ value: Any, to node: YGNodeRef) {
        guard let as_ = value as? String else { return }
        switch as_ {
        case "center":
            YGNodeStyleSetAlignSelf(node, .center)
        case "flex-start", "flexStart":
            YGNodeStyleSetAlignSelf(node, .flexStart)
        case "flex-end", "flexEnd":
            YGNodeStyleSetAlignSelf(node, .flexEnd)
        case "stretch":
            YGNodeStyleSetAlignSelf(node, .stretch)
        case "baseline":
            YGNodeStyleSetAlignSelf(node, .baseline)
        case "auto":
            YGNodeStyleSetAlignSelf(node, .auto)
        default: break
        }
    }

    private static func applyAlignContent(_ value: Any, to node: YGNodeRef) {
        guard let ac = value as? String else { return }
        switch ac {
        case "center":
            YGNodeStyleSetAlignContent(node, .center)
        case "flex-start", "flexStart":
            YGNodeStyleSetAlignContent(node, .flexStart)
        case "flex-end", "flexEnd":
            YGNodeStyleSetAlignContent(node, .flexEnd)
        case "stretch":
            YGNodeStyleSetAlignContent(node, .stretch)
        case "space-between", "spaceBetween":
            YGNodeStyleSetAlignContent(node, .spaceBetween)
        case "space-around", "spaceAround":
            YGNodeStyleSetAlignContent(node, .spaceAround)
        case "space-evenly", "spaceEvenly":
            YGNodeStyleSetAlignContent(node, .spaceEvenly)
        default: break
        }
    }

    private static func applyJustifyContent(_ value: Any, to node: YGNodeRef) {
        guard let jc = value as? String else { return }
        switch jc {
        case "center":
            YGNodeStyleSetJustifyContent(node, .center)
        case "flex-start", "flexStart":
            YGNodeStyleSetJustifyContent(node, .flexStart)
        case "flex-end", "flexEnd":
            YGNodeStyleSetJustifyContent(node, .flexEnd)
        case "space-between", "spaceBetween":
            YGNodeStyleSetJustifyContent(node, .spaceBetween)
        case "space-around", "spaceAround":
            YGNodeStyleSetJustifyContent(node, .spaceAround)
        case "space-evenly", "spaceEvenly":
            YGNodeStyleSetJustifyContent(node, .spaceEvenly)
        default: break
        }
    }

    private static func applyGap(_ value: Any, to node: YGNodeRef, axis: YGGutter) {
        if let v = toFloat(value) {
            YGNodeStyleSetGap(node, axis, v)
        }
    }

    private static func applyPadding(_ value: Any, to node: YGNodeRef, edge: YGEdge) {
        if let v = toFloat(value) {
            YGNodeStyleSetPadding(node, edge, v)
        }
    }

    private static func applyMargin(_ value: Any, to node: YGNodeRef, edge: YGEdge) {
        if let str = value as? String, str == "auto" {
            YGNodeStyleSetMarginAuto(node, edge)
        } else if let v = toFloat(value) {
            YGNodeStyleSetMargin(node, edge, v)
        }
    }

    private static func applyDimension(
        _ value: Any,
        to node: YGNodeRef,
        set: (YGNodeRef?, Float) -> Void,
        setPercent: (YGNodeRef?, Float) -> Void
    ) {
        if let v = toFloat(value) {
            set(node, v)
        } else if let p = toPercent(value) {
            setPercent(node, p)
        }
    }

    private static func applyFlexShorthand(_ value: Any, to node: YGNodeRef, style: [String: Any]) {
        guard let f = toFloat(value) else { return }
        // CSS `flex: <number>` means `flex: <number> 1 0%` (basis is always 0%).
        // Only set each sub-property if no explicit override exists in the style
        // dict, so order of iteration doesn't matter.
        if style["flexGrow"] == nil {
            YGNodeStyleSetFlexGrow(node, f)
        }
        if style["flexShrink"] == nil {
            YGNodeStyleSetFlexShrink(node, 1)
        }
        if style["flexBasis"] == nil {
            // Use YGNodeStyleSetFlexBasis(0) instead of percent because Yoga's
            // percentage flex-basis incorrectly falls back to auto sizing in
            // content-box mode when the item also has minWidth set.
            YGNodeStyleSetFlexBasis(node, 0)
        }
    }

    private static func applyAspectRatio(_ value: Any, to node: YGNodeRef, style: [String: Any]) {
        guard let ar = toFloat(value) else { return }
        // Yoga's calculateBlockLayout does NOT apply aspectRatio when
        // computing child dimensions. Pre-compute the missing dimension
        // here so block-layout children get the correct height/width.
        let hasWidth = toFloat(style["width"]) != nil || toPercent(style["width"]) != nil
        let hasHeight = toFloat(style["height"]) != nil || toPercent(style["height"]) != nil
        if hasWidth && !hasHeight, let w = toFloat(style["width"]) {
            YGNodeStyleSetHeight(node, w / ar)
        } else if hasHeight && !hasWidth, let h = toFloat(style["height"]) {
            YGNodeStyleSetWidth(node, h * ar)
        } else {
            YGNodeStyleSetAspectRatio(node, ar)
        }
    }

    private static func applyFlexWrap(_ value: Any, to node: YGNodeRef) {
        guard let fw = value as? String else { return }
        switch fw {
        case "wrap":
            YGNodeStyleSetFlexWrap(node, .wrap)
        case "nowrap", "no-wrap":
            YGNodeStyleSetFlexWrap(node, .noWrap)
        case "wrap-reverse":
            YGNodeStyleSetFlexWrap(node, .wrapReverse)
        default: break
        }
    }

    private static func applyPosition(_ value: Any, to node: YGNodeRef) {
        guard let pos = value as? String else { return }
        switch pos {
        case "relative":
            YGNodeStyleSetPositionType(node, .relative)
        case "absolute":
            YGNodeStyleSetPositionType(node, .absolute)
        default: break
        }
    }

    private static func applyDisplay(_ value: Any, to node: YGNodeRef) {
        guard let display = value as? String else { return }
        switch display {
        case "flex":
            YGNodeStyleSetDisplay(node, .flex)
        case "none":
            YGNodeStyleSetDisplay(node, .none)
        case "block":
            YGNodeStyleSetDisplay(node, .block)
        case "inline-block", "inline":
            YGNodeStyleSetDisplay(node, .inlineBlock)
        default: break
        }
    }

    private static func applyOverflow(_ value: Any, to node: YGNodeRef) {
        guard let overflow = value as? String else { return }
        switch overflow {
        case "visible":
            YGNodeStyleSetOverflow(node, .visible)
        case "hidden":
            YGNodeStyleSetOverflow(node, .hidden)
        case "scroll", "auto":
            YGNodeStyleSetOverflow(node, .scroll)
        default: break
        }
    }

    // MARK: - Flex Context Override

    /// When a block child is inserted into an explicit flex parent, CSS
    /// treats the child as a flex item (its outer display becomes `flex`).
    /// Yoga does NOT do this automatically — `display: block` uses
    /// `calculateBlockLayout()` which ignores flexGrow/flexShrink.
    ///
    /// Call this after `YGNodeInsertChild` to emulate the CSS behavior:
    /// override the child's Yoga display from `.block` to `.flex` and set
    /// `flexDirection: column` to preserve block-like vertical stacking.
    ///
    /// - Parameters:
    ///   - parentYogaNode: The parent's Yoga node.
    ///   - childYogaNode: The child's Yoga node.
    ///   - parentStyle: The parent's merged style dict. Used to check whether
    ///     the parent is an explicit flex container (display: "flex"/"inline-flex").
    ///   - childStyle: The child's merged style dict. Used to check whether
    ///     flexDirection was explicitly set (element defaults or user style).
    public static func applyFlexContextOverride(
        parent parentYogaNode: YGNodeRef,
        child childYogaNode: YGNodeRef,
        parentStyle: [String: Any],
        childStyle: [String: Any]
    ) {
        // Only override when the parent EXPLICITLY declares display:flex
        // or display:inline-flex. Yoga defaults to .flex for all nodes,
        // so checking the Yoga property would incorrectly match block
        // parents that never set display, breaking margin collapsing.
        let parentDisplayStr = parentStyle["display"] as? String
        let childDisplay = YGNodeStyleGetDisplay(childYogaNode)

        guard parentDisplayStr == "flex" || parentDisplayStr == "inline-flex",
              childDisplay == .block || childDisplay == .inlineBlock else {
            return
        }

        YGNodeStyleSetDisplay(childYogaNode, .flex)
        // Only set flexDirection:column if the style dict doesn't already
        // have an explicit flexDirection (e.g. p/h1-h6 use flexDirection:row
        // for inline text wrapping and should keep it)
        if childStyle["flexDirection"] == nil {
            YGNodeStyleSetFlexDirection(childYogaNode, .column)
        }

        // CSS: alignItems / justifyContent are flex-only properties. They have
        // no effect on block containers. When we convert a block child to flex
        // for flex-item participation, any user-supplied values for these
        // properties must be neutralised so the inner layout still behaves like
        // CSS block flow (children stretch to fill width, stack from top).
        // Only apply to display:block children — inline-block elements (e.g.
        // <button>) use alignItems/justifyContent for their internal layout.
        if childDisplay == .block {
            if childStyle["alignItems"] != nil {
                YGNodeStyleSetAlignItems(childYogaNode, .stretch)
            }
            if childStyle["justifyContent"] != nil {
                YGNodeStyleSetJustifyContent(childYogaNode, .flexStart)
            }

            // CSS block children don't flex-shrink. After promoting this
            // block container to flex, its existing children become flex
            // items that would flex-shrink by default (Yoga web defaults
            // set flexShrink: 1). Set flexShrink: 0 on each existing child
            // to preserve block layout behavior where children keep their
            // explicit sizes and overflow is clipped rather than shrunk.
            let childCount = YGNodeGetChildCount(childYogaNode)
            for i in 0..<childCount {
                if let grandchild = YGNodeGetChild(childYogaNode, i) {
                    YGNodeStyleSetFlexShrink(grandchild, 0)
                }
            }
        }
    }

    // MARK: - Block Margin Collapsing

    /// Simulates CSS block margin collapsing between adjacent siblings when a
    /// block container is promoted to flex column layout.
    ///
    /// In CSS, adjacent siblings in a block formatting context (BFC) collapse
    /// their vertical margins: the gap between them is `max(bottomMargin,
    /// topMargin)` instead of `bottomMargin + topMargin`. When we promote a
    /// block container to `display: flex; flex-direction: column` (to make
    /// flexGrow/flexShrink work), Yoga uses flex layout where margins don't
    /// collapse. This method walks the children and reduces margins to
    /// approximate BFC behavior.
    ///
    /// Call this after the cascade in `applyFlexContextOverride` has promoted
    /// all children.
    ///
    /// - Parameter parentYogaNode: The parent Yoga node whose children need
    ///   margin collapsing.
    public static func collapseBlockMargins(parentYogaNode: YGNodeRef) {
        let childCount = YGNodeGetChildCount(parentYogaNode)
        guard childCount > 1 else { return }

        for i in 1..<childCount {
            guard let child = YGNodeGetChild(parentYogaNode, i),
                  let prev = YGNodeGetChild(parentYogaNode, i - 1) else { continue }

            // Skip absolutely positioned children — they don't participate
            // in normal flow margin collapsing.
            if YGNodeStyleGetPositionType(child) == .absolute { continue }
            if YGNodeStyleGetPositionType(prev) == .absolute { continue }

            let prevBottom = marginValue(prev, edge: .bottom)
            let childTop = marginValue(child, edge: .top)

            // Only collapse when both margins are non-negative (CSS rule:
            // negative margins have different collapsing behavior).
            guard prevBottom >= 0 && childTop >= 0 else { continue }

            // Yoga gap: prevBottom + childTop. Target: max(prevBottom, childTop).
            // Reduce childTop so the sum matches the target.
            let collapsed = max(0, childTop - prevBottom)
            if abs(collapsed - childTop) > 0.01 {
                YGNodeStyleSetMargin(child, .top, collapsed)
            }
        }
    }

    /// Reads the computed margin value for an edge from a Yoga node's style.
    /// Returns 0 if not set or if the value is auto/percent.
    private static func marginValue(_ node: YGNodeRef, edge: YGEdge) -> Float {
        let val = YGNodeStyleGetMargin(node, edge)
        if val.unit == .point { return val.value }
        // Fall back to .all edge
        let allVal = YGNodeStyleGetMargin(node, .all)
        if allVal.unit == .point { return allVal.value }
        return 0
    }

    // MARK: - Nested List Override

    /// CSS user-agent stylesheet sets margin-block-start/end to 0 for nested
    /// lists (ul/ol inside li). Yoga applies the element defaults unconditionally,
    /// so we must manually clear the margins when a list is inserted into a li.
    ///
    /// Call this after `YGNodeInsertChild` when the child is a list element.
    ///
    /// - Parameters:
    ///   - parentType: The parent element type (e.g. "li").
    ///   - childYogaNode: The child list's Yoga node.
    ///   - childType: The child element type (e.g. "ul", "ol").
    public static func applyNestedListOverride(
        parentType: String,
        childYogaNode: YGNodeRef,
        childType: String
    ) {
        let listElements: Set<String> = ["ul", "ol", "menu", "dir"]
        guard parentType == "li" && listElements.contains(childType) else { return }

        YGNodeStyleSetMargin(childYogaNode, .top, 0)
        YGNodeStyleSetMargin(childYogaNode, .bottom, 0)
    }

    // MARK: - Helpers

    /// Convert numeric style values (Int, Double, or NSNumber) to Float.
    private static func toFloat(_ value: Any?) -> Float? {
        if let d = value as? Double {
            return Float(d)
        }
        if let i = value as? Int {
            return Float(i)
        }
        if let n = value as? NSNumber {
            return n.floatValue
        }
        return nil
    }

    /// Extract percentage value from a string like "100%" → 100.
    private static func toPercent(_ value: Any?) -> Float? {
        guard let str = value as? String, str.hasSuffix("%") else {
            return nil
        }
        let numStr = String(str.dropLast())
        return Float(numStr)
    }
}
