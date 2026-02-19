import Foundation
import ShadowTree
import Yoga

/// Extracts a LayoutNode tree from a ShadowNodeWrapper tree after Yoga layout.
enum LayoutExtractor {

    static func extract(from node: ShadowNodeWrapper, parentAbsX: Double = 0, parentAbsY: Double = 0, parentWidth: Double = 0, parentHeight: Double = 0) -> LayoutNode {
        let frame = node.layoutFrame
        let absX = parentAbsX + Double(frame.origin.x)
        let absY = parentAbsY + Double(frame.origin.y)
        let nodeWidth = Double(frame.size.width)
        let nodeHeight = Double(frame.size.height)
        let styles = extractStyles(from: node, parentWidth: parentWidth, parentHeight: parentHeight, insideDisplayNone: false)

        // Determine this node's layout direction for resolving auto margins on children
        let styleDict = node.props["style"] as? [String: Any]
        let display = styleDict?["display"] as? String
        let flexDir = styleDict?["flexDirection"] as? String
        let isFlexRow = display == "flex" &&
            (flexDir == "row" || flexDir == "row-reverse")

        // Collect element children (skip #text nodes — web extractLayout walks
        // el.children which are element nodes only)
        let elementChildren = node.children.filter { $0.family.elementType != "#text" }

        var children: [LayoutNode] = []
        for child in elementChildren {
            let childStyleDict = child.props["style"] as? [String: Any]
            let childDisplay = childStyleDict?["display"] as? String
            let childIsHidden = childDisplay == "none"

            if childIsHidden {
                // display:none — web getBoundingClientRect returns (0,0,0,0)
                // and getComputedStyle still returns the style-specified margins
                let childStyles = extractStyles(from: child, parentWidth: nodeWidth, parentHeight: nodeHeight, insideDisplayNone: true)
                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: 0,
                    parentAbsY: 0,
                    parentWidth: 0,
                    parentHeight: 0,
                    insideDisplayNone: true
                )
                children.append(LayoutNode(
                    type: child.family.elementType,
                    x: 0, y: 0, width: 0, height: 0,
                    styles: childStyles,
                    children: grandchildren
                ))
            } else {
                var childStyles = extractStyles(from: child, parentWidth: nodeWidth, parentHeight: nodeHeight, insideDisplayNone: false)

                // Resolve auto margins — YGNodeLayoutGetMargin returns 0 for auto
                // margins even though Yoga positions elements correctly. We detect
                // auto margins via YGNodeStyleGetMargin and compute resolved values.
                resolveAutoMargins(
                    child: child,
                    siblings: elementChildren,
                    parentWidth: nodeWidth,
                    parentHeight: nodeHeight,
                    isParentFlexRow: isFlexRow,
                    styles: &childStyles
                )

                let childFrame = child.layoutFrame
                let childAbsX = absX + Double(childFrame.origin.x)
                let childAbsY = absY + Double(childFrame.origin.y)
                let childWidth = Double(childFrame.size.width)
                let childHeight = Double(childFrame.size.height)

                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: childAbsX,
                    parentAbsY: childAbsY,
                    parentWidth: childWidth,
                    parentHeight: childHeight,
                    insideDisplayNone: false
                )

                children.append(LayoutNode(
                    type: child.family.elementType,
                    x: childAbsX,
                    y: childAbsY,
                    width: childWidth,
                    height: childHeight,
                    styles: childStyles,
                    children: grandchildren
                ))
            }
        }

        return LayoutNode(
            type: node.family.elementType,
            x: absX,
            y: absY,
            width: nodeWidth,
            height: nodeHeight,
            styles: styles,
            children: children
        )
    }

    /// Extract child LayoutNodes from a parent, handling auto margins at each level.
    /// This is the recursive workhorse that mirrors extract() but for children.
    private static func extractChildNodes(
        from parent: ShadowNodeWrapper,
        parentAbsX: Double,
        parentAbsY: Double,
        parentWidth: Double,
        parentHeight: Double,
        insideDisplayNone: Bool
    ) -> [LayoutNode] {
        let styleDict = parent.props["style"] as? [String: Any]
        let display = styleDict?["display"] as? String
        let flexDir = styleDict?["flexDirection"] as? String
        let isFlexRow = !insideDisplayNone && display == "flex" &&
            (flexDir == "row" || flexDir == "row-reverse")

        let elementChildren = parent.children.filter { $0.family.elementType != "#text" }

        var result: [LayoutNode] = []
        for child in elementChildren {
            let childStyleDict = child.props["style"] as? [String: Any]
            let childDisplay = childStyleDict?["display"] as? String
            let childIsHidden = insideDisplayNone || childDisplay == "none"

            if childIsHidden {
                // display:none subtree — zero coordinates, style-based margins
                let childStyles = extractStyles(from: child, parentWidth: parentWidth, parentHeight: parentHeight, insideDisplayNone: true)
                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: 0,
                    parentAbsY: 0,
                    parentWidth: 0,
                    parentHeight: 0,
                    insideDisplayNone: true
                )
                result.append(LayoutNode(
                    type: child.family.elementType,
                    x: 0, y: 0, width: 0, height: 0,
                    styles: childStyles,
                    children: grandchildren
                ))
            } else {
                var childStyles = extractStyles(from: child, parentWidth: parentWidth, parentHeight: parentHeight, insideDisplayNone: false)

                resolveAutoMargins(
                    child: child,
                    siblings: elementChildren,
                    parentWidth: parentWidth,
                    parentHeight: parentHeight,
                    isParentFlexRow: isFlexRow,
                    styles: &childStyles
                )

                let childFrame = child.layoutFrame
                let childAbsX = parentAbsX + Double(childFrame.origin.x)
                let childAbsY = parentAbsY + Double(childFrame.origin.y)
                let childWidth = Double(childFrame.size.width)
                let childHeight = Double(childFrame.size.height)

                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: childAbsX,
                    parentAbsY: childAbsY,
                    parentWidth: childWidth,
                    parentHeight: childHeight,
                    insideDisplayNone: false
                )

                result.append(LayoutNode(
                    type: child.family.elementType,
                    x: childAbsX,
                    y: childAbsY,
                    width: childWidth,
                    height: childHeight,
                    styles: childStyles,
                    children: grandchildren
                ))
            }
        }
        return result
    }

    /// Resolve auto margins for a child node. YGNodeLayoutGetMargin returns 0
    /// for auto margins, so we detect them via YGNodeStyleGetMargin and compute
    /// the resolved pixel values matching CSS getComputedStyle behavior.
    private static func resolveAutoMargins(
        child: ShadowNodeWrapper,
        siblings: [ShadowNodeWrapper],
        parentWidth: Double,
        parentHeight: Double,
        isParentFlexRow: Bool,
        styles: inout [String: LayoutValue]
    ) {
        let yoga = child.yogaNode
        let frame = child.layoutFrame
        let y = Double(frame.origin.y)
        let w = Double(frame.size.width)
        let h = Double(frame.size.height)

        let leftIsAuto = YGNodeStyleGetMargin(yoga, .left).unit == .auto
        let rightIsAuto = YGNodeStyleGetMargin(yoga, .right).unit == .auto
        let topIsAuto = YGNodeStyleGetMargin(yoga, .top).unit == .auto
        let bottomIsAuto = YGNodeStyleGetMargin(yoga, .bottom).unit == .auto

        if !leftIsAuto && !rightIsAuto && !topIsAuto && !bottomIsAuto {
            return
        }

        if isParentFlexRow && (leftIsAuto || rightIsAuto) {
            // Flex row: auto horizontal margins absorb remaining space after
            // all items are sized. Compute free space = parentWidth - total
            // used by all sibling widths + non-auto margins + gaps.
            var totalUsed: Double = 0
            var totalAutoHMargins = 0
            for sibling in siblings {
                let sibYoga = sibling.yogaNode
                totalUsed += Double(YGNodeLayoutGetWidth(sibYoga))
                if YGNodeStyleGetMargin(sibYoga, .left).unit == .auto {
                    totalAutoHMargins += 1
                } else {
                    totalUsed += Double(YGNodeLayoutGetMargin(sibYoga, .left))
                }
                if YGNodeStyleGetMargin(sibYoga, .right).unit == .auto {
                    totalAutoHMargins += 1
                } else {
                    totalUsed += Double(YGNodeLayoutGetMargin(sibYoga, .right))
                }
            }
            // Account for gaps between children
            if siblings.count > 1 {
                if let parentYoga = YGNodeGetOwner(yoga) {
                    var gapWidth = Double(YGNodeStyleGetGap(parentYoga, .column).value)
                    if gapWidth.isNaN || gapWidth == 0 {
                        let allGap = YGNodeStyleGetGap(parentYoga, .all)
                        if allGap.unit == .point { gapWidth = Double(allGap.value) }
                    }
                    if !gapWidth.isNaN && gapWidth > 0 {
                        totalUsed += gapWidth * Double(siblings.count - 1)
                    }
                }
            }

            let freeSpace = max(0, parentWidth - totalUsed)
            let share = totalAutoHMargins > 0 ? freeSpace / Double(totalAutoHMargins) : 0

            if leftIsAuto { styles["marginLeft"] = .number(share) }
            if rightIsAuto { styles["marginRight"] = .number(share) }
        } else if leftIsAuto || rightIsAuto {
            // Block/column layout: each child is on its own line.
            let nonAutoLeft = leftIsAuto ? 0 : Double(YGNodeLayoutGetMargin(yoga, .left))
            let nonAutoRight = rightIsAuto ? 0 : Double(YGNodeLayoutGetMargin(yoga, .right))
            let freeSpace = max(0, parentWidth - w - nonAutoLeft - nonAutoRight)
            let autoCount = (leftIsAuto ? 1 : 0) + (rightIsAuto ? 1 : 0)
            let share = freeSpace / Double(autoCount)

            if leftIsAuto { styles["marginLeft"] = .number(share) }
            if rightIsAuto { styles["marginRight"] = .number(share) }
        }

        // Vertical auto margins: position-based (works for both block and flex)
        if topIsAuto {
            styles["marginTop"] = .number(y)
        }
        if bottomIsAuto {
            styles["marginBottom"] = .number(parentHeight > 0 ? parentHeight - y - h : 0)
        }
    }

    private static func extractStyles(from node: ShadowNodeWrapper, parentWidth: Double = 0, parentHeight: Double = 0, insideDisplayNone: Bool = false) -> [String: LayoutValue] {
        var styles: [String: LayoutValue] = [:]
        let yoga = node.yogaNode

        if insideDisplayNone {
            // For display:none nodes, Yoga returns 0 for layout margins.
            // CSS getComputedStyle still returns the style-specified margins,
            // so read from the style dict instead.
            if let styleDict = node.props["style"] as? [String: Any] {
                styles["marginTop"] = .number((styleDict["marginTop"] as? NSNumber)?.doubleValue ?? 0)
                styles["marginRight"] = .number((styleDict["marginRight"] as? NSNumber)?.doubleValue ?? 0)
                styles["marginBottom"] = .number((styleDict["marginBottom"] as? NSNumber)?.doubleValue ?? 0)
                styles["marginLeft"] = .number((styleDict["marginLeft"] as? NSNumber)?.doubleValue ?? 0)
            } else {
                styles["marginTop"] = .number(0)
                styles["marginRight"] = .number(0)
                styles["marginBottom"] = .number(0)
                styles["marginLeft"] = .number(0)
            }
        } else {
            // Layout-computed margins. YGNodeLayoutGetMargin returns 0 for auto
            // margins; those are patched by resolveAutoMargins() at the parent level.
            styles["marginTop"] = .number(Double(YGNodeLayoutGetMargin(yoga, .top)))
            styles["marginRight"] = .number(Double(YGNodeLayoutGetMargin(yoga, .right)))
            styles["marginBottom"] = .number(Double(YGNodeLayoutGetMargin(yoga, .bottom)))
            styles["marginLeft"] = .number(Double(YGNodeLayoutGetMargin(yoga, .left)))
        }

        // Border widths — per-side values override uniform borderWidth
        if let styleDict = node.props["style"] as? [String: Any] {
            let uniform = (styleDict["borderWidth"] as? NSNumber)?.doubleValue ?? 0
            styles["borderTopWidth"] = .number((styleDict["borderTopWidth"] as? NSNumber)?.doubleValue ?? uniform)
            styles["borderRightWidth"] = .number((styleDict["borderRightWidth"] as? NSNumber)?.doubleValue ?? uniform)
            styles["borderBottomWidth"] = .number((styleDict["borderBottomWidth"] as? NSNumber)?.doubleValue ?? uniform)
            styles["borderLeftWidth"] = .number((styleDict["borderLeftWidth"] as? NSNumber)?.doubleValue ?? uniform)
        }

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

            // Flex container spacing — expand gap to rowGap/columnGap like CSS does
            let gapValue = styleDict["gap"] as? NSNumber
            if let v = gapValue { styles["gap"] = .number(v.doubleValue) }
            if let v = styleDict["rowGap"] as? NSNumber {
                styles["rowGap"] = .number(v.doubleValue)
            } else if let v = gapValue {
                styles["rowGap"] = .number(v.doubleValue)
            }
            if let v = styleDict["columnGap"] as? NSNumber {
                styles["columnGap"] = .number(v.doubleValue)
            } else if let v = gapValue {
                styles["columnGap"] = .number(v.doubleValue)
            }

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

            // Positioning — explicit values from style dict
            if let v = styleDict["top"] as? NSNumber { styles["top"] = .number(v.doubleValue) }
            if let v = styleDict["right"] as? NSNumber { styles["right"] = .number(v.doubleValue) }
            if let v = styleDict["bottom"] as? NSNumber { styles["bottom"] = .number(v.doubleValue) }
            if let v = styleDict["left"] as? NSNumber { styles["left"] = .number(v.doubleValue) }

            // Compute missing opposite position offsets for positioned elements.
            // CSS getComputedStyle auto-computes these; we replicate that behavior
            // so the native extractor reports the same values as web.
            let position = styleDict["position"] as? String
            if position == "absolute" || position == "relative" {
                let frame = node.layoutFrame
                let w = Double(frame.size.width)
                let h = Double(frame.size.height)
                let x = Double(frame.origin.x)
                let y = Double(frame.origin.y)

                if styles["top"] == nil && parentHeight > 0 {
                    styles["top"] = .number(y)
                }
                if styles["bottom"] == nil && parentHeight > 0 {
                    styles["bottom"] = .number(parentHeight - y - h)
                }
                if styles["left"] == nil && parentWidth > 0 {
                    styles["left"] = .number(x)
                }
                if styles["right"] == nil && parentWidth > 0 {
                    styles["right"] = .number(parentWidth - x - w)
                }
            }

            // Visual — expand uniform borderRadius to per-corner like CSS getComputedStyle
            let uniformRadius = (styleDict["borderRadius"] as? NSNumber)?.doubleValue ?? 0
            if uniformRadius != 0 { styles["borderRadius"] = .number(uniformRadius) }
            styles["borderTopLeftRadius"] = .number((styleDict["borderTopLeftRadius"] as? NSNumber)?.doubleValue ?? uniformRadius)
            styles["borderTopRightRadius"] = .number((styleDict["borderTopRightRadius"] as? NSNumber)?.doubleValue ?? uniformRadius)
            styles["borderBottomRightRadius"] = .number((styleDict["borderBottomRightRadius"] as? NSNumber)?.doubleValue ?? uniformRadius)
            styles["borderBottomLeftRadius"] = .number((styleDict["borderBottomLeftRadius"] as? NSNumber)?.doubleValue ?? uniformRadius)
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
