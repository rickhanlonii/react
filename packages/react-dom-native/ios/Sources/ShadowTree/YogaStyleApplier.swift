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

        // margin (all edges)
        if let margin = toFloat(style["margin"]) {
            YGNodeStyleSetMargin(node, .all, margin)
        }
        if let mt = toFloat(style["marginTop"]) {
            YGNodeStyleSetMargin(node, .top, mt)
        }
        if let mr = toFloat(style["marginRight"]) {
            YGNodeStyleSetMargin(node, .right, mr)
        }
        if let mb = toFloat(style["marginBottom"]) {
            YGNodeStyleSetMargin(node, .bottom, mb)
        }
        if let ml = toFloat(style["marginLeft"]) {
            YGNodeStyleSetMargin(node, .left, ml)
        }
        if let mh = toFloat(style["marginHorizontal"]) {
            YGNodeStyleSetMargin(node, .horizontal, mh)
        }
        if let mv = toFloat(style["marginVertical"]) {
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

        // display
        if let display = style["display"] as? String {
            switch display {
            case "flex":
                YGNodeStyleSetDisplay(node, .flex)
            case "none":
                YGNodeStyleSetDisplay(node, .none)
            default: break
            }
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
