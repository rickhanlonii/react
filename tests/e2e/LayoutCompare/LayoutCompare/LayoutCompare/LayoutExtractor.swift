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
        }

        return styles
    }
}
