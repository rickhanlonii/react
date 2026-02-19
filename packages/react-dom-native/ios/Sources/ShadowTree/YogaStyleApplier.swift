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

        // width / height
        if let w = toFloat(style["width"]) {
            YGNodeStyleSetWidth(node, w)
        }
        if let h = toFloat(style["height"]) {
            YGNodeStyleSetHeight(node, h)
        }

        // minWidth / minHeight / maxWidth / maxHeight
        if let mw = toFloat(style["minWidth"]) {
            YGNodeStyleSetMinWidth(node, mw)
        }
        if let mh = toFloat(style["minHeight"]) {
            YGNodeStyleSetMinHeight(node, mh)
        }
        if let mw = toFloat(style["maxWidth"]) {
            YGNodeStyleSetMaxWidth(node, mw)
        }
        if let mh = toFloat(style["maxHeight"]) {
            YGNodeStyleSetMaxHeight(node, mh)
        }

        // flex
        if let f = toFloat(style["flex"]) {
            YGNodeStyleSetFlex(node, f)
        }
        if let fg = toFloat(style["flexGrow"]) {
            YGNodeStyleSetFlexGrow(node, fg)
        }
        if let fs = toFloat(style["flexShrink"]) {
            YGNodeStyleSetFlexShrink(node, fs)
        }
        if let fb = toFloat(style["flexBasis"]) {
            YGNodeStyleSetFlexBasis(node, fb)
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
        if let bw = toFloat(style["borderWidth"]) {
            YGNodeStyleSetBorder(node, .all, bw)
        }
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
              childDisplay == .block else {
            return
        }

        YGNodeStyleSetDisplay(childYogaNode, .flex)
        // Only set flexDirection:column if the style dict doesn't already
        // have an explicit flexDirection (e.g. p/h1-h6 use flexDirection:row
        // for inline text wrapping and should keep it)
        if childStyle["flexDirection"] == nil {
            YGNodeStyleSetFlexDirection(childYogaNode, .column)
        }
    }

    // MARK: - Helpers

    /// Convert numeric style values (Int or Double) to Float.
    private static func toFloat(_ value: Any?) -> Float? {
        if let d = value as? Double {
            return Float(d)
        }
        if let i = value as? Int {
            return Float(i)
        }
        return nil
    }
}
