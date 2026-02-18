import Foundation
import ShadowTree
import Yoga

/// Extracts a LayoutNode tree from a ShadowNodeWrapper tree after Yoga layout.
enum LayoutExtractor {

    static func extract(from node: ShadowNodeWrapper, parentAbsX: Double = 0, parentAbsY: Double = 0) -> LayoutNode {
        let frame = node.layoutFrame
        let absX = parentAbsX + Double(frame.origin.x)
        let absY = parentAbsY + Double(frame.origin.y)
        let styles = extractStyles(from: node)

        var children: [LayoutNode] = []
        for child in node.children {
            // Skip #text nodes — web extractLayout walks el.children
            // which are element nodes only
            if child.family.elementType == "#text" {
                continue
            }
            children.append(extract(from: child, parentAbsX: absX, parentAbsY: absY))
        }

        return LayoutNode(
            type: node.family.elementType,
            x: absX,
            y: absY,
            width: Double(frame.size.width),
            height: Double(frame.size.height),
            styles: styles,
            children: children
        )
    }

    private static func extractStyles(from node: ShadowNodeWrapper) -> [String: LayoutValue] {
        var styles: [String: LayoutValue] = [:]
        let yoga = node.yogaNode

        // Layout-computed margins
        styles["marginTop"] = .number(Double(YGNodeLayoutGetMargin(yoga, .top)))
        styles["marginRight"] = .number(Double(YGNodeLayoutGetMargin(yoga, .right)))
        styles["marginBottom"] = .number(Double(YGNodeLayoutGetMargin(yoga, .bottom)))
        styles["marginLeft"] = .number(Double(YGNodeLayoutGetMargin(yoga, .left)))

        // Rendered border widths — UIKitMutationApplier only applies the shorthand
        // "borderWidth" via CALayer.borderWidth (uniform), ignoring per-side props.
        // Extract what's actually rendered so mismatches surface as diffs.
        let renderedBorder: Double
        if let styleDict = node.props["style"] as? [String: Any],
           let bw = styleDict["borderWidth"] as? NSNumber {
            renderedBorder = bw.doubleValue
        } else {
            renderedBorder = 0
        }
        styles["borderTopWidth"] = .number(renderedBorder)
        styles["borderRightWidth"] = .number(renderedBorder)
        styles["borderBottomWidth"] = .number(renderedBorder)
        styles["borderLeftWidth"] = .number(renderedBorder)

        // Layout-computed padding (fallback to style props when Yoga returns 0)
        func extractPadding(_ edge: String, _ yogaEdge: YGEdge) {
            let computed = Double(YGNodeLayoutGetPadding(yoga, yogaEdge))
            if computed != 0 {
                styles[edge] = .number(computed)
            } else if let styleDict = node.props["style"] as? [String: Any] {
                if let v = styleDict[edge] as? NSNumber {
                    styles[edge] = .number(v.doubleValue)
                } else if let v = styleDict["padding"] as? NSNumber {
                    styles[edge] = .number(v.doubleValue)
                }
            }
        }
        extractPadding("paddingTop", .top)
        extractPadding("paddingRight", .right)
        extractPadding("paddingBottom", .bottom)
        extractPadding("paddingLeft", .left)

        // Props-based values
        if let styleDict = node.props["style"] as? [String: Any] {
            if let display = styleDict["display"] as? String {
                styles["display"] = .string(display)
            }
            if let flexDirection = styleDict["flexDirection"] as? String {
                styles["flexDirection"] = .string(flexDirection)
            }
            if let alignItems = styleDict["alignItems"] as? String {
                styles["alignItems"] = .string(alignItems)
            }
            if let justifyContent = styleDict["justifyContent"] as? String {
                styles["justifyContent"] = .string(justifyContent)
            }
            if let flexWrap = styleDict["flexWrap"] as? String {
                styles["flexWrap"] = .string(flexWrap)
            }
            if let fontSize = styleDict["fontSize"] as? NSNumber {
                styles["fontSize"] = .number(fontSize.doubleValue)
            }
            if let fontWeight = styleDict["fontWeight"] as? String {
                styles["fontWeight"] = .string(fontWeight)
            }

            // Flex container spacing
            if let v = styleDict["gap"] as? NSNumber { styles["gap"] = .number(v.doubleValue) }
            if let v = styleDict["rowGap"] as? NSNumber { styles["rowGap"] = .number(v.doubleValue) }
            if let v = styleDict["columnGap"] as? NSNumber { styles["columnGap"] = .number(v.doubleValue) }

            // Text
            if let v = styleDict["lineHeight"] as? NSNumber { styles["lineHeight"] = .number(v.doubleValue) }

            // Flex item
            if let v = styleDict["flexGrow"] as? NSNumber { styles["flexGrow"] = .number(v.doubleValue) }
            if let v = styleDict["flexShrink"] as? NSNumber { styles["flexShrink"] = .number(v.doubleValue) }
            if let v = styleDict["flexBasis"] as? NSNumber { styles["flexBasis"] = .number(v.doubleValue) }

            // Dimension constraints
            if let v = styleDict["minWidth"] as? NSNumber { styles["minWidth"] = .number(v.doubleValue) }
            if let v = styleDict["maxWidth"] as? NSNumber { styles["maxWidth"] = .number(v.doubleValue) }
            if let v = styleDict["minHeight"] as? NSNumber { styles["minHeight"] = .number(v.doubleValue) }
            if let v = styleDict["maxHeight"] as? NSNumber { styles["maxHeight"] = .number(v.doubleValue) }

            // Positioning
            if let v = styleDict["top"] as? NSNumber { styles["top"] = .number(v.doubleValue) }
            if let v = styleDict["right"] as? NSNumber { styles["right"] = .number(v.doubleValue) }
            if let v = styleDict["bottom"] as? NSNumber { styles["bottom"] = .number(v.doubleValue) }
            if let v = styleDict["left"] as? NSNumber { styles["left"] = .number(v.doubleValue) }

            // Visual
            if let v = styleDict["borderRadius"] as? NSNumber { styles["borderRadius"] = .number(v.doubleValue) }
            if let v = styleDict["opacity"] as? NSNumber { styles["opacity"] = .number(v.doubleValue) }

            // String props
            if let v = styleDict["overflow"] as? String { styles["overflow"] = .string(v) }
            if let v = styleDict["position"] as? String { styles["position"] = .string(v) }
            if let v = styleDict["textAlign"] as? String { styles["textAlign"] = .string(v) }
            if let v = styleDict["color"] as? String { styles["color"] = .string(v) }
            if let v = styleDict["backgroundColor"] as? String { styles["backgroundColor"] = .string(v) }
            if let v = styleDict["borderColor"] as? String { styles["borderColor"] = .string(v) }
        }

        return styles
    }
}
