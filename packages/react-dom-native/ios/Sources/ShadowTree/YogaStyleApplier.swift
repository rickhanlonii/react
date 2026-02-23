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
        // CSS default: content-box (Yoga defaults to border-box)
        YGNodeStyleSetBoxSizing(node, .contentBox)

        // boxSizing
        if let bs = style["boxSizing"] as? String {
            switch bs {
            case "border-box":
                YGNodeStyleSetBoxSizing(node, .borderBox)
            case "content-box":
                YGNodeStyleSetBoxSizing(node, .contentBox)
            default: break
            }
        }

        // flexDirection
        if let fd = style["flexDirection"] as? String {
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

        // alignItems
        if let ai = style["alignItems"] as? String {
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

        // alignSelf
        if let as_ = style["alignSelf"] as? String {
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

        // alignContent
        if let ac = style["alignContent"] as? String {
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

        // justifyContent
        if let jc = style["justifyContent"] as? String {
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

        // gap (all gutters)
        if let gap = toFloat(style["gap"]) {
            YGNodeStyleSetGap(node, .all, gap)
        }

        // rowGap
        if let rowGap = toFloat(style["rowGap"]) {
            YGNodeStyleSetGap(node, .row, rowGap)
        }

        // columnGap
        if let columnGap = toFloat(style["columnGap"]) {
            YGNodeStyleSetGap(node, .column, columnGap)
        }

        // padding (all edges)
        if let padding = toFloat(style["padding"]) {
            YGNodeStyleSetPadding(node, .all, padding)
        }
        if let pt = toFloat(style["paddingTop"]) {
            YGNodeStyleSetPadding(node, .top, pt)
        }
        if let pr = toFloat(style["paddingRight"]) {
            YGNodeStyleSetPadding(node, .right, pr)
        }
        if let pb = toFloat(style["paddingBottom"]) {
            YGNodeStyleSetPadding(node, .bottom, pb)
        }
        if let pl = toFloat(style["paddingLeft"]) {
            YGNodeStyleSetPadding(node, .left, pl)
        }
        if let ph = toFloat(style["paddingHorizontal"]) {
            YGNodeStyleSetPadding(node, .horizontal, ph)
        }
        if let pv = toFloat(style["paddingVertical"]) {
            YGNodeStyleSetPadding(node, .vertical, pv)
        }

        // margin (all edges) — supports numeric values and "auto"
        if let margin = style["margin"] as? String, margin == "auto" {
            YGNodeStyleSetMarginAuto(node, .all)
        } else if let margin = toFloat(style["margin"]) {
            YGNodeStyleSetMargin(node, .all, margin)
        }
        if let mt = style["marginTop"] as? String, mt == "auto" {
            YGNodeStyleSetMarginAuto(node, .top)
        } else if let mt = toFloat(style["marginTop"]) {
            YGNodeStyleSetMargin(node, .top, mt)
        }
        if let mr = style["marginRight"] as? String, mr == "auto" {
            YGNodeStyleSetMarginAuto(node, .right)
        } else if let mr = toFloat(style["marginRight"]) {
            YGNodeStyleSetMargin(node, .right, mr)
        }
        if let mb = style["marginBottom"] as? String, mb == "auto" {
            YGNodeStyleSetMarginAuto(node, .bottom)
        } else if let mb = toFloat(style["marginBottom"]) {
            YGNodeStyleSetMargin(node, .bottom, mb)
        }
        if let ml = style["marginLeft"] as? String, ml == "auto" {
            YGNodeStyleSetMarginAuto(node, .left)
        } else if let ml = toFloat(style["marginLeft"]) {
            YGNodeStyleSetMargin(node, .left, ml)
        }
        if let mh = style["marginHorizontal"] as? String, mh == "auto" {
            YGNodeStyleSetMarginAuto(node, .horizontal)
        } else if let mh = toFloat(style["marginHorizontal"]) {
            YGNodeStyleSetMargin(node, .horizontal, mh)
        }
        if let mv = style["marginVertical"] as? String, mv == "auto" {
            YGNodeStyleSetMarginAuto(node, .vertical)
        } else if let mv = toFloat(style["marginVertical"]) {
            YGNodeStyleSetMargin(node, .vertical, mv)
        }

        // width / height (numeric or percentage string like "100%")
        if let w = toFloat(style["width"]) {
            YGNodeStyleSetWidth(node, w)
        } else if let wp = toPercent(style["width"]) {
            YGNodeStyleSetWidthPercent(node, wp)
        }
        if let h = toFloat(style["height"]) {
            YGNodeStyleSetHeight(node, h)
        } else if let hp = toPercent(style["height"]) {
            YGNodeStyleSetHeightPercent(node, hp)
        }

        // minWidth / minHeight / maxWidth / maxHeight
        if let mw = toFloat(style["minWidth"]) {
            YGNodeStyleSetMinWidth(node, mw)
        } else if let mwp = toPercent(style["minWidth"]) {
            YGNodeStyleSetMinWidthPercent(node, mwp)
        }
        if let mh = toFloat(style["minHeight"]) {
            YGNodeStyleSetMinHeight(node, mh)
        } else if let mhp = toPercent(style["minHeight"]) {
            YGNodeStyleSetMinHeightPercent(node, mhp)
        }
        if let mw = toFloat(style["maxWidth"]) {
            YGNodeStyleSetMaxWidth(node, mw)
        } else if let mwp = toPercent(style["maxWidth"]) {
            YGNodeStyleSetMaxWidthPercent(node, mwp)
        }
        if let mh = toFloat(style["maxHeight"]) {
            YGNodeStyleSetMaxHeight(node, mh)
        } else if let mhp = toPercent(style["maxHeight"]) {
            YGNodeStyleSetMaxHeightPercent(node, mhp)
        }

        // Yoga bug workaround: when both height and maxHeight are set as
        // point values, Yoga's flex layout incorrectly uses the unclamped
        // height when computing the auto height of an ancestor container.
        // Pre-compute the clamped height so the ancestor sees the correct
        // value. Same for width/maxWidth.
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

        // flex shorthand — expand to flexGrow/flexShrink/flexBasis per CSS spec.
        // CSS `flex: <number>` means `flex: <number> 1 0%` (basis is always 0%).
        // Yoga's YGNodeStyleSetFlex only sets basis to 0 when flex > 0, leaving
        // flex-basis as auto when flex: 0 — which is wrong (CSS collapses the item).
        //
        // Use YGNodeStyleSetFlexBasis(0) instead of YGNodeStyleSetFlexBasisPercent(0)
        // because Yoga's percentage flex-basis incorrectly falls back to auto sizing
        // in content-box mode when the item also has minWidth set. This causes the
        // item to use its intrinsic content size as the flex base instead of 0,
        // resulting in incorrect flex distribution.
        if let f = toFloat(style["flex"]) {
            YGNodeStyleSetFlexGrow(node, f)
            YGNodeStyleSetFlexShrink(node, 1)
            YGNodeStyleSetFlexBasis(node, 0)
        }
        // Explicit flexGrow/flexShrink/flexBasis override the shorthand
        if let fg = toFloat(style["flexGrow"]) {
            YGNodeStyleSetFlexGrow(node, fg)
        }
        if let fs = toFloat(style["flexShrink"]) {
            YGNodeStyleSetFlexShrink(node, fs)
        }
        if let fb = toFloat(style["flexBasis"]) {
            YGNodeStyleSetFlexBasis(node, fb)
        }

        // aspectRatio
        if let ar = toFloat(style["aspectRatio"]) {
            // Yoga's calculateBlockLayout does NOT apply aspectRatio when
            // computing child dimensions. It only works in the flex layout
            // path. Pre-compute the missing dimension here so block-layout
            // children get the correct height/width from aspectRatio.
            //
            // When we can pre-compute (exactly one dimension is set), we set
            // the missing dimension explicitly and do NOT call
            // YGNodeStyleSetAspectRatio. Yoga's native aspect ratio in flex
            // layout computes the missing dimension from the total box size
            // (including padding) in content-box mode, producing incorrect
            // values. The pre-compute uses the content-box dimension directly,
            // matching CSS behavior.
            //
            // When we can't pre-compute (neither or both dimensions set),
            // fall back to Yoga's native aspect ratio.
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

        // flexWrap
        if let fw = style["flexWrap"] as? String {
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

        // position
        if let pos = style["position"] as? String {
            switch pos {
            case "relative":
                YGNodeStyleSetPositionType(node, .relative)
            case "absolute":
                YGNodeStyleSetPositionType(node, .absolute)
            default: break
            }
        }

        // position offsets (top/left/right/bottom)
        if let top = toFloat(style["top"]) {
            YGNodeStyleSetPosition(node, .top, top)
        }
        if let left = toFloat(style["left"]) {
            YGNodeStyleSetPosition(node, .left, left)
        }
        if let right = toFloat(style["right"]) {
            YGNodeStyleSetPosition(node, .right, right)
        }
        if let bottom = toFloat(style["bottom"]) {
            YGNodeStyleSetPosition(node, .bottom, bottom)
        }

        // display
        if let display = style["display"] as? String {
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

        // overflow
        if let overflow = style["overflow"] as? String {
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

        // borderWidth (all edges)
        // CSS quirk: borderWidth computes to 0 when borderStyle is "none"
        // (the default). Only allocate border space in Yoga when borderStyle
        // is explicitly set to a visible value.
        // CSS initial border-width is "medium" (3px). When borderStyle is set
        // without an explicit borderWidth, each edge defaults to 3px.
        let borderStyle = style["borderStyle"] as? String
        let hasBorderStyle = borderStyle != nil && borderStyle != "none"
        if hasBorderStyle {
            // CSS initial border-width is "medium" = 3px
            let cssInitialBorderWidth: Float = 3
            let uniform = toFloat(style["borderWidth"]) ?? cssInitialBorderWidth
            YGNodeStyleSetBorder(node, .all, uniform)
            if let btw = toFloat(style["borderTopWidth"]) {
                YGNodeStyleSetBorder(node, .top, btw)
            }
            if let brw = toFloat(style["borderRightWidth"]) {
                YGNodeStyleSetBorder(node, .right, brw)
            }
            if let bbw = toFloat(style["borderBottomWidth"]) {
                YGNodeStyleSetBorder(node, .bottom, bbw)
            }
            if let blw = toFloat(style["borderLeftWidth"]) {
                YGNodeStyleSetBorder(node, .left, blw)
            }
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
