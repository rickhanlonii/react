import Foundation
import UIKit
import ShadowTree
import ReactDomNativeKit
import Yoga

/// Extracts a LayoutNode tree from a ShadowNodeWrapper tree after Yoga layout.
enum LayoutExtractor {

    /// Resolve the frame for a node: prefer the actual UIKit view frame when
    /// a ViewRegistry is available (catches rendering bugs where UIKit doesn't
    /// match Yoga), fall back to Yoga's layoutFrame.
    private static func resolvedFrame(for node: ShadowNodeWrapper, viewRegistry: ViewRegistry?) -> CGRect {
        if let viewRegistry = viewRegistry,
           let view = viewRegistry.view(for: node.family) {
            return view.frame
        }
        return node.layoutFrame
    }

    static func extract(from node: ShadowNodeWrapper, parentAbsX: Double = 0, parentAbsY: Double = 0, parentWidth: Double = 0, parentHeight: Double = 0, viewRegistry: ViewRegistry? = nil) -> LayoutNode {
        let frame = resolvedFrame(for: node, viewRegistry: viewRegistry)
        let absX = parentAbsX + Double(frame.origin.x)
        let absY = parentAbsY + Double(frame.origin.y)
        let nodeWidth = Double(frame.size.width)
        let nodeHeight = Double(frame.size.height)
        let styles = extractStyles(from: node, parentWidth: parentWidth, parentHeight: parentHeight, insideDisplayNone: false, viewRegistry: viewRegistry)

        // Determine this node's layout direction for resolving auto margins on children
        let styleDict = node.props["style"] as? [String: Any]
        let display = styleDict?["display"] as? String
        let flexDir = styleDict?["flexDirection"] as? String
        let isFlexRow = display == "flex" &&
            (flexDir == "row" || flexDir == "row-reverse")
        let isFlexColumn = display == "flex" &&
            (flexDir == nil || flexDir == "column" || flexDir == "column-reverse")

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
                let childStyles = extractStyles(from: child, parentWidth: nodeWidth, parentHeight: nodeHeight, insideDisplayNone: true, viewRegistry: viewRegistry)
                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: 0,
                    parentAbsY: 0,
                    parentWidth: 0,
                    parentHeight: 0,
                    insideDisplayNone: true,
                    viewRegistry: viewRegistry
                )
                children.append(LayoutNode(
                    type: child.family.elementType,
                    x: 0, y: 0, width: 0, height: 0,
                    styles: childStyles,
                    children: grandchildren
                ))
            } else {
                var childStyles = extractStyles(from: child, parentWidth: nodeWidth, parentHeight: nodeHeight, insideDisplayNone: false, viewRegistry: viewRegistry)

                // Resolve auto margins — YGNodeLayoutGetMargin returns 0 for auto
                // margins even though Yoga positions elements correctly. We detect
                // auto margins via YGNodeStyleGetMargin and compute resolved values.
                resolveAutoMargins(
                    child: child,
                    siblings: elementChildren,
                    parentWidth: nodeWidth,
                    parentHeight: nodeHeight,
                    isParentFlexRow: isFlexRow,
                    isParentFlexColumn: isFlexColumn,
                    styles: &childStyles
                )

                let childFrame = resolvedFrame(for: child, viewRegistry: viewRegistry)
                var childAbsX = absX + Double(childFrame.origin.x)
                var childAbsY = absY + Double(childFrame.origin.y)
                let childWidth = Double(childFrame.size.width)
                let childHeight = Double(childFrame.size.height)

                // For position:relative, Yoga's behavior differs by parent layout:
                // - Block parents: layout position is FLOW only (no offset at all)
                // - Wrapping flex parents: Yoga applies horizontal (left/right)
                //   offsets but NOT vertical (top/bottom) offsets
                // - Non-wrapping flex parents: layout position INCLUDES all offsets
                // CSS getBoundingClientRect always returns VISUAL position.
                // Skip this adjustment when using UIKit frames — UIKit frames
                // already reflect the final visual position.
                let childStyleDict = child.props["style"] as? [String: Any]
                let usedUIKitFrame = viewRegistry != nil && viewRegistry!.view(for: child.family) != nil
                if !usedUIKitFrame && childStyleDict?["position"] as? String == "relative" {
                    let parentStyle = node.props["style"] as? [String: Any]
                    let parentDisplay = parentStyle?["display"] as? String
                    let parentIsFlexContainer = parentDisplay == "flex" || parentDisplay == "inline-flex"
                    let parentFlexWrap = parentStyle?["flexWrap"] as? String
                    let parentIsWrapping = parentFlexWrap == "wrap" || parentFlexWrap == "wrap-reverse"
                    let isBlock = !parentIsFlexContainer
                    // Vertical offsets: missing in block and wrapping flex
                    if isBlock || parentIsWrapping {
                        if let top = childStyleDict?["top"] as? NSNumber {
                            childAbsY += top.doubleValue
                        } else if let bottom = childStyleDict?["bottom"] as? NSNumber {
                            childAbsY -= bottom.doubleValue
                        }
                    }
                    // Horizontal offsets: only missing in block layout
                    if isBlock {
                        if let left = childStyleDict?["left"] as? NSNumber {
                            childAbsX += left.doubleValue
                        } else if let right = childStyleDict?["right"] as? NSNumber {
                            childAbsX -= right.doubleValue
                        }
                    }
                }

                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: childAbsX,
                    parentAbsY: childAbsY,
                    parentWidth: childWidth,
                    parentHeight: childHeight,
                    insideDisplayNone: false,
                    viewRegistry: viewRegistry
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
        insideDisplayNone: Bool,
        viewRegistry: ViewRegistry? = nil
    ) -> [LayoutNode] {
        let styleDict = parent.props["style"] as? [String: Any]
        let display = styleDict?["display"] as? String
        let flexDir = styleDict?["flexDirection"] as? String
        let isFlexRow = !insideDisplayNone && display == "flex" &&
            (flexDir == "row" || flexDir == "row-reverse")
        let isFlexColumn = !insideDisplayNone && display == "flex" &&
            (flexDir == nil || flexDir == "column" || flexDir == "column-reverse")

        let elementChildren = parent.children.filter { $0.family.elementType != "#text" }

        var result: [LayoutNode] = []
        for child in elementChildren {
            let childStyleDict = child.props["style"] as? [String: Any]
            let childDisplay = childStyleDict?["display"] as? String
            let childIsHidden = insideDisplayNone || childDisplay == "none"

            if childIsHidden {
                // display:none subtree — zero coordinates, style-based margins
                let childStyles = extractStyles(from: child, parentWidth: parentWidth, parentHeight: parentHeight, insideDisplayNone: true, viewRegistry: viewRegistry)
                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: 0,
                    parentAbsY: 0,
                    parentWidth: 0,
                    parentHeight: 0,
                    insideDisplayNone: true,
                    viewRegistry: viewRegistry
                )
                result.append(LayoutNode(
                    type: child.family.elementType,
                    x: 0, y: 0, width: 0, height: 0,
                    styles: childStyles,
                    children: grandchildren
                ))
            } else {
                var childStyles = extractStyles(from: child, parentWidth: parentWidth, parentHeight: parentHeight, insideDisplayNone: false, viewRegistry: viewRegistry)

                resolveAutoMargins(
                    child: child,
                    siblings: elementChildren,
                    parentWidth: parentWidth,
                    parentHeight: parentHeight,
                    isParentFlexRow: isFlexRow,
                    isParentFlexColumn: isFlexColumn,
                    styles: &childStyles
                )

                let childFrame = resolvedFrame(for: child, viewRegistry: viewRegistry)
                var childAbsX = parentAbsX + Double(childFrame.origin.x)
                var childAbsY = parentAbsY + Double(childFrame.origin.y)
                let childWidth = Double(childFrame.size.width)
                let childHeight = Double(childFrame.size.height)

                // For position:relative, Yoga's behavior differs by parent layout:
                // - Block parents: layout position is FLOW only (no offset at all)
                // - Wrapping flex parents: Yoga applies horizontal (left/right)
                //   offsets but NOT vertical (top/bottom) offsets
                // - Non-wrapping flex parents: layout position INCLUDES all offsets
                // CSS getBoundingClientRect always returns VISUAL position.
                // Skip this adjustment when using UIKit frames — UIKit frames
                // already reflect the final visual position.
                let childStyleDict = child.props["style"] as? [String: Any]
                let usedUIKitFrame = viewRegistry != nil && viewRegistry!.view(for: child.family) != nil
                if !usedUIKitFrame && childStyleDict?["position"] as? String == "relative" {
                    let parentStyle2 = parent.props["style"] as? [String: Any]
                    let parentDisplay = parentStyle2?["display"] as? String
                    let parentIsFlexContainer = parentDisplay == "flex" || parentDisplay == "inline-flex"
                    let parentFlexWrap = parentStyle2?["flexWrap"] as? String
                    let parentIsWrapping = parentFlexWrap == "wrap" || parentFlexWrap == "wrap-reverse"
                    let isBlock = !parentIsFlexContainer
                    // Vertical offsets: missing in block and wrapping flex
                    if isBlock || parentIsWrapping {
                        if let top = childStyleDict?["top"] as? NSNumber {
                            childAbsY += top.doubleValue
                        } else if let bottom = childStyleDict?["bottom"] as? NSNumber {
                            childAbsY -= bottom.doubleValue
                        }
                    }
                    // Horizontal offsets: only missing in block layout
                    if isBlock {
                        if let left = childStyleDict?["left"] as? NSNumber {
                            childAbsX += left.doubleValue
                        } else if let right = childStyleDict?["right"] as? NSNumber {
                            childAbsX -= right.doubleValue
                        }
                    }
                }

                let grandchildren = extractChildNodes(
                    from: child,
                    parentAbsX: childAbsX,
                    parentAbsY: childAbsY,
                    parentWidth: childWidth,
                    parentHeight: childHeight,
                    insideDisplayNone: false,
                    viewRegistry: viewRegistry
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
        isParentFlexColumn: Bool,
        styles: inout [String: LayoutValue]
    ) {
        let yoga = child.yogaNode
        let frame = child.layoutFrame
        let w = Double(frame.size.width)
        let h = Double(frame.size.height)

        // CSS auto margins are computed against the parent's content box
        // (excluding padding and border), not the border box.
        // Use YGNodeStyleGet* instead of YGNodeLayoutGet* because the
        // reconciler path clears layout data (setLayout({})) when removing
        // children from the temporary root node after layout calculation.
        // Style values persist and are always available.
        var contentWidth = parentWidth
        var contentHeight = parentHeight
        if let parentYoga = YGNodeGetOwner(yoga) {
            // Read a style value for an edge, falling back through Yoga's
            // shorthand hierarchy: specific edge → horizontal/vertical → all.
            // Yoga sets padding/border via .all for shorthand (e.g. `padding: 10`)
            // and .horizontal/.vertical for directional shorthands.
            func stylePadding(_ edge: YGEdge) -> Double {
                let edgeVal = YGNodeStyleGetPadding(parentYoga, edge)
                if edgeVal.unit == .point { return Double(edgeVal.value) }
                let dirEdge: YGEdge = (edge == .left || edge == .right) ? .horizontal : .vertical
                let dirVal = YGNodeStyleGetPadding(parentYoga, dirEdge)
                if dirVal.unit == .point { return Double(dirVal.value) }
                let allVal = YGNodeStyleGetPadding(parentYoga, .all)
                if allVal.unit == .point { return Double(allVal.value) }
                return 0
            }
            func styleBorder(_ edge: YGEdge) -> Double {
                let edgeVal = YGNodeStyleGetBorder(parentYoga, edge)
                if !edgeVal.isNaN { return Double(edgeVal) }
                let allVal = YGNodeStyleGetBorder(parentYoga, .all)
                if !allVal.isNaN { return Double(allVal) }
                return 0
            }
            contentWidth -= stylePadding(.left)
            contentWidth -= stylePadding(.right)
            contentWidth -= styleBorder(.left)
            contentWidth -= styleBorder(.right)
            contentHeight -= stylePadding(.top)
            contentHeight -= stylePadding(.bottom)
            contentHeight -= styleBorder(.top)
            contentHeight -= styleBorder(.bottom)
        }

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

            let freeSpace = max(0, contentWidth - totalUsed)
            let share = totalAutoHMargins > 0 ? freeSpace / Double(totalAutoHMargins) : 0

            if leftIsAuto { styles["marginLeft"] = .number(share) }
            if rightIsAuto { styles["marginRight"] = .number(share) }
        } else if leftIsAuto || rightIsAuto {
            // Block/column layout: each child is on its own line.
            let nonAutoLeft = leftIsAuto ? 0 : Double(YGNodeLayoutGetMargin(yoga, .left))
            let nonAutoRight = rightIsAuto ? 0 : Double(YGNodeLayoutGetMargin(yoga, .right))
            let freeSpace = max(0, contentWidth - w - nonAutoLeft - nonAutoRight)
            let autoCount = (leftIsAuto ? 1 : 0) + (rightIsAuto ? 1 : 0)
            let share = freeSpace / Double(autoCount)

            if leftIsAuto { styles["marginLeft"] = .number(share) }
            if rightIsAuto { styles["marginRight"] = .number(share) }
        }

        // Vertical auto margins
        if isParentFlexColumn && (topIsAuto || bottomIsAuto) {
            // Flex column: auto vertical margins absorb remaining space after
            // all items are sized, same algorithm as flex row horizontal margins.
            var totalUsed: Double = 0
            var totalAutoVMargins = 0
            for sibling in siblings {
                let sibYoga = sibling.yogaNode
                totalUsed += Double(YGNodeLayoutGetHeight(sibYoga))
                if YGNodeStyleGetMargin(sibYoga, .top).unit == .auto {
                    totalAutoVMargins += 1
                } else {
                    totalUsed += Double(YGNodeLayoutGetMargin(sibYoga, .top))
                }
                if YGNodeStyleGetMargin(sibYoga, .bottom).unit == .auto {
                    totalAutoVMargins += 1
                } else {
                    totalUsed += Double(YGNodeLayoutGetMargin(sibYoga, .bottom))
                }
            }
            // Account for gaps between children
            if siblings.count > 1 {
                if let parentYoga = YGNodeGetOwner(yoga) {
                    var gapHeight = Double(YGNodeStyleGetGap(parentYoga, .row).value)
                    if gapHeight.isNaN || gapHeight == 0 {
                        let allGap = YGNodeStyleGetGap(parentYoga, .all)
                        if allGap.unit == .point { gapHeight = Double(allGap.value) }
                    }
                    if !gapHeight.isNaN && gapHeight > 0 {
                        totalUsed += gapHeight * Double(siblings.count - 1)
                    }
                }
            }

            let freeSpace = max(0, contentHeight - totalUsed)
            let share = totalAutoVMargins > 0 ? freeSpace / Double(totalAutoVMargins) : 0

            if topIsAuto { styles["marginTop"] = .number(share) }
            if bottomIsAuto { styles["marginBottom"] = .number(share) }
        } else if topIsAuto || bottomIsAuto {
            // Non-flex-column: position-based fallback
            let y = Double(frame.origin.y)
            if topIsAuto {
                styles["marginTop"] = .number(y)
            }
            if bottomIsAuto {
                styles["marginBottom"] = .number(parentHeight > 0 ? parentHeight - y - h : 0)
            }
        }
    }

    private static func extractStyles(from node: ShadowNodeWrapper, parentWidth: Double = 0, parentHeight: Double = 0, insideDisplayNone: Bool = false, viewRegistry: ViewRegistry? = nil) -> [String: LayoutValue] {
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
        } else if let margins = node.layoutMargins {
            // Cached margins from scroll content re-layout. Yoga's
            // YGNodeRemoveAllChildren clears layout data (setLayout({}))
            // when reparenting children, so we read from the saved values.
            styles["marginTop"] = .number(Double(margins.top))
            styles["marginRight"] = .number(Double(margins.right))
            styles["marginBottom"] = .number(Double(margins.bottom))
            styles["marginLeft"] = .number(Double(margins.left))
        } else if node.family.elementType == "legend" {
            // CSS <legend> inside <fieldset> has computed margin: 0. The
            // negative Yoga margins on the legend are a positioning workaround
            // (Yoga has no native fieldset-legend formatting), not real CSS
            // margins. Report from the style dict instead of Yoga layout.
            let styleDict = node.props["style"] as? [String: Any]
            styles["marginTop"] = .number((styleDict?["marginTop"] as? NSNumber)?.doubleValue ?? 0)
            styles["marginRight"] = .number((styleDict?["marginRight"] as? NSNumber)?.doubleValue ?? 0)
            styles["marginBottom"] = .number((styleDict?["marginBottom"] as? NSNumber)?.doubleValue ?? 0)
            styles["marginLeft"] = .number((styleDict?["marginLeft"] as? NSNumber)?.doubleValue ?? 0)
        } else {
            // Read margins from the style dict (CSS computed values), NOT from
            // Yoga layout. Yoga's layout margins may differ from CSS when:
            // - Block margin collapsing is simulated by adjusting Yoga margins
            //   (collapseBlockMargins sets smaller marginTop for layout but CSS
            //   getComputedStyle still returns the original value)
            // - Legend positioning uses negative margins as a workaround
            // These are Yoga-internal layout tricks, not CSS computed values.
            let styleDict = node.props["style"] as? [String: Any]
            // Fall back through shorthand hierarchy: marginTop → marginVertical → margin → 0
            func styleMargin(_ side: String, _ axis: String?) -> Double {
                if let v = styleDict?[side] as? NSNumber { return v.doubleValue }
                if let ax = axis, let v = styleDict?[ax] as? NSNumber { return v.doubleValue }
                if let v = styleDict?["margin"] as? NSNumber { return v.doubleValue }
                return 0
            }
            styles["marginTop"] = .number(styleMargin("marginTop", "marginVertical"))
            styles["marginRight"] = .number(styleMargin("marginRight", "marginHorizontal"))
            styles["marginBottom"] = .number(styleMargin("marginBottom", "marginVertical"))
            styles["marginLeft"] = .number(styleMargin("marginLeft", "marginHorizontal"))
        }

        // Border widths — use Yoga's layout output. YogaStyleApplier only
        // calls YGNodeStyleSetBorder when borderStyle is non-none, so
        // YGNodeLayoutGetBorder returns 0 when borders are suppressed.
        if insideDisplayNone {
            // display:none: Yoga returns 0, but CSS getComputedStyle returns
            // the specified values. Read from style dict with borderStyle suppression.
            if let styleDict = node.props["style"] as? [String: Any] {
                let elementDefaults = ElementDefaults.defaults(for: node.family.elementType)
                let hasBorderStyle: Bool = {
                    if let bs = styleDict["borderStyle"] as? String, bs != "none" { return true }
                    if let dbs = elementDefaults["borderStyle"] as? String, dbs != "none" { return true }
                    return false
                }()
                let uniform: Double = hasBorderStyle
                    ? (styleDict["borderWidth"] as? NSNumber)?.doubleValue ?? 3
                    : 0
                func sideWidth(_ sideKey: String) -> Double {
                    if !hasBorderStyle { return 0 }
                    return (styleDict[sideKey] as? NSNumber)?.doubleValue ?? uniform
                }
                styles["borderTopWidth"] = .number(sideWidth("borderTopWidth"))
                styles["borderRightWidth"] = .number(sideWidth("borderRightWidth"))
                styles["borderBottomWidth"] = .number(sideWidth("borderBottomWidth"))
                styles["borderLeftWidth"] = .number(sideWidth("borderLeftWidth"))
            }
        } else {
            styles["borderTopWidth"] = .number(Double(YGNodeLayoutGetBorder(yoga, .top)))
            styles["borderRightWidth"] = .number(Double(YGNodeLayoutGetBorder(yoga, .right)))
            styles["borderBottomWidth"] = .number(Double(YGNodeLayoutGetBorder(yoga, .bottom)))
            styles["borderLeftWidth"] = .number(Double(YGNodeLayoutGetBorder(yoga, .left)))
        }

        // Padding — use Yoga's layout output directly.
        if insideDisplayNone {
            // display:none: Yoga returns 0, CSS returns specified values.
            if let styleDict = node.props["style"] as? [String: Any] {
                func stylePaddingValue(_ key: String) -> Double {
                    if let v = styleDict[key] as? NSNumber { return v.doubleValue }
                    if let v = styleDict["padding"] as? NSNumber { return v.doubleValue }
                    return 0
                }
                styles["paddingTop"] = .number(stylePaddingValue("paddingTop"))
                styles["paddingRight"] = .number(stylePaddingValue("paddingRight"))
                styles["paddingBottom"] = .number(stylePaddingValue("paddingBottom"))
                styles["paddingLeft"] = .number(stylePaddingValue("paddingLeft"))
            } else {
                styles["paddingTop"] = .number(0)
                styles["paddingRight"] = .number(0)
                styles["paddingBottom"] = .number(0)
                styles["paddingLeft"] = .number(0)
            }
        } else {
            // Yoga-first with style dict fallback: the reconciler's
            // reparenting (setLayout({})) can clear layout data, making
            // YGNodeLayoutGetPadding return 0 even when padding was applied.
            // Fall back to style dict when Yoga returns 0.
            func yogaPadding(_ edge: YGEdge, _ key: String) -> Double {
                let computed = Double(YGNodeLayoutGetPadding(yoga, edge))
                if computed != 0 { return computed }
                if let styleDict = node.props["style"] as? [String: Any] {
                    if let v = styleDict[key] as? NSNumber { return v.doubleValue }
                    if let v = styleDict["padding"] as? NSNumber { return v.doubleValue }
                }
                return 0
            }
            styles["paddingTop"] = .number(yogaPadding(.top, "paddingTop"))
            styles["paddingRight"] = .number(yogaPadding(.right, "paddingRight"))
            styles["paddingBottom"] = .number(yogaPadding(.bottom, "paddingBottom"))
            styles["paddingLeft"] = .number(yogaPadding(.left, "paddingLeft"))
        }

        // Props-based values
        if let styleDict = node.props["style"] as? [String: Any] {
            if let display = styleDict["display"] as? String {
                styles["display"] = .string(display)
            }
            // Internal metadata: explicit height prevents CSS margin collapse-through.
            // Not compared by LayoutComparer (only listed properties are compared).
            if styleDict["height"] is NSNumber {
                styles["_hasExplicitHeight"] = .number(1)
            }
            if let flexDirection = styleDict["flexDirection"] as? String {
                styles["flexDirection"] = .string(flexDirection)
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

            // Flex item — read from Yoga APIs instead of style dict.
            // flexGrow: Yoga default (0) matches CSS default, safe to always read.
            styles["flexGrow"] = .number(Double(YGNodeStyleGetFlexGrow(yoga)))
            // flexShrink: always read from Yoga. CSS defaults to 1, Yoga defaults
            // to 0 for block-promoted elements — the comparer normalizes this.
            styles["flexShrink"] = .number(Double(YGNodeStyleGetFlexShrink(yoga)))
            if let v = styleDict["flexBasis"] as? NSNumber { styles["flexBasis"] = .number(v.doubleValue) }

            // Dimension constraints — handle both point values (NSNumber) and
            // percentage strings like "30%". CSS getComputedStyle resolves
            // min/max constraints to pixel values, so we do the same: resolve
            // percentages against the parent's corresponding dimension.
            func extractDimConstraint(_ key: String, _ ygGetter: () -> YGValue, isWidth: Bool) {
                if let v = styleDict[key] as? NSNumber {
                    styles[key] = .number(v.doubleValue)
                } else if styleDict[key] is String {
                    // Percentage string like "30%" — extract the raw number to match
                    // web's parseFloat(getComputedStyle(...).minWidth) which returns
                    // the raw percentage value (e.g. 30 from "30%"), not resolved px.
                    let ygVal = ygGetter()
                    if ygVal.unit == .percent {
                        styles[key] = .number(Double(ygVal.value))
                    } else if ygVal.unit == .point {
                        styles[key] = .number(Double(ygVal.value))
                    }
                }
            }
            extractDimConstraint("minWidth", { YGNodeStyleGetMinWidth(yoga) }, isWidth: true)
            extractDimConstraint("maxWidth", { YGNodeStyleGetMaxWidth(yoga) }, isWidth: true)
            extractDimConstraint("minHeight", { YGNodeStyleGetMinHeight(yoga) }, isWidth: false)
            extractDimConstraint("maxHeight", { YGNodeStyleGetMaxHeight(yoga) }, isWidth: false)

            // Positioning — explicit values from style dict
            if let v = styleDict["top"] as? NSNumber { styles["top"] = .number(v.doubleValue) }
            if let v = styleDict["right"] as? NSNumber { styles["right"] = .number(v.doubleValue) }
            if let v = styleDict["bottom"] as? NSNumber { styles["bottom"] = .number(v.doubleValue) }
            if let v = styleDict["left"] as? NSNumber { styles["left"] = .number(v.doubleValue) }

            // Compute missing opposite position offsets for positioned elements.
            // CSS getComputedStyle auto-computes these differently per position type.
            let position = styleDict["position"] as? String
            if position == "relative" {
                // CSS relative: opposite = -(explicit). If no offsets → all 0.
                let hasTop = styleDict["top"] as? NSNumber != nil
                let hasBottom = styleDict["bottom"] as? NSNumber != nil
                let hasLeft = styleDict["left"] as? NSNumber != nil
                let hasRight = styleDict["right"] as? NSNumber != nil

                if hasTop && !hasBottom {
                    styles["bottom"] = .number(-(styleDict["top"] as! NSNumber).doubleValue)
                } else if hasBottom && !hasTop {
                    styles["top"] = .number(-(styleDict["bottom"] as! NSNumber).doubleValue)
                }
                if hasLeft && !hasRight {
                    styles["right"] = .number(-(styleDict["left"] as! NSNumber).doubleValue)
                } else if hasRight && !hasLeft {
                    styles["left"] = .number(-(styleDict["right"] as! NSNumber).doubleValue)
                }
                // If neither side set, leave both as nil (defaults to 0 in comparison)
            } else if position == "absolute" {
                // CSS absolute: opposite = physical distance from edge
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
            // Handle both numeric (NSNumber) and percentage strings (e.g. "50%")
            let viewW = Double(node.layoutFrame.width)
            let viewH = Double(node.layoutFrame.height)
            func resolveRadius(_ value: Any?) -> Double? {
                if let num = value as? NSNumber { return num.doubleValue }
                if let str = value as? String, str.hasSuffix("%"),
                   let pct = Double(str.dropLast()) {
                    // CSS resolves to horizontal radius (pct*width/100).
                    // Web extractor uses parseFloat which extracts the first number.
                    return pct * viewW / 100
                }
                return nil
            }
            var uniformRadius = resolveRadius(styleDict["borderRadius"]) ?? 0
            // WKWebView's getComputedStyle returns borderRadius: 0 for system-
            // appearance buttons inside display:none subtrees (the system theme
            // isn't applied when the element is hidden). Match this by zeroing
            // the radius when the button still has its default system borderRadius.
            if insideDisplayNone && node.family.elementType == "button" {
                let btnDefaults = ElementDefaults.defaults(for: "button")
                if let defaultRadius = (btnDefaults["borderRadius"] as? NSNumber)?.doubleValue,
                   abs(uniformRadius - defaultRadius) < 0.01 {
                    uniformRadius = 0
                }
            }
            if uniformRadius != 0 { styles["borderRadius"] = .number(uniformRadius) }
            styles["borderTopLeftRadius"] = .number(resolveRadius(styleDict["borderTopLeftRadius"]) ?? uniformRadius)
            styles["borderTopRightRadius"] = .number(resolveRadius(styleDict["borderTopRightRadius"]) ?? uniformRadius)
            styles["borderBottomRightRadius"] = .number(resolveRadius(styleDict["borderBottomRightRadius"]) ?? uniformRadius)
            styles["borderBottomLeftRadius"] = .number(resolveRadius(styleDict["borderBottomLeftRadius"]) ?? uniformRadius)
            // opacity defaults to 1.0 in CSS; only present in style dict when explicitly set
            styles["opacity"] = .number((styleDict["opacity"] as? NSNumber)?.doubleValue ?? 1.0)

            // String props
            if let v = styleDict["position"] as? String { styles["position"] = .string(v) }
            if let v = styleDict["textAlign"] as? String {
                // Normalize CSS logical values to physical for LTR comparison:
                // "start" == "left", "end" == "right" in LTR layouts.
                let normalized: String
                switch v {
                case "start": normalized = "left"
                case "end": normalized = "right"
                default: normalized = v
                }
                styles["textAlign"] = .string(normalized)
            }
            if let v = styleDict["color"] as? String { styles["color"] = .string(v) }
            if let v = styleDict["backgroundColor"] as? String { styles["backgroundColor"] = .string(v) }

            // borderColor — compose per-side values like CSS getComputedStyle().borderColor
            let uniformBorderColor = styleDict["borderColor"] as? String
            let topColor = (styleDict["borderTopColor"] as? String) ?? uniformBorderColor
            let rightColor = (styleDict["borderRightColor"] as? String) ?? uniformBorderColor
            let bottomColor = (styleDict["borderBottomColor"] as? String) ?? uniformBorderColor
            let leftColor = (styleDict["borderLeftColor"] as? String) ?? uniformBorderColor
            if let t = topColor, let r = rightColor, let b = bottomColor, let l = leftColor {
                // All four sides have values — use CSS shorthand compression
                if t == r && t == b && t == l {
                    styles["borderColor"] = .string(t)
                } else if t == b && r == l {
                    styles["borderColor"] = .string("\(t) \(r)")
                } else if r == l {
                    styles["borderColor"] = .string("\(t) \(r) \(b)")
                } else {
                    styles["borderColor"] = .string("\(t) \(r) \(b) \(l)")
                }
            } else if let uniform = uniformBorderColor {
                styles["borderColor"] = .string(uniform)
            }

            // Text/font properties (style dict — no Yoga API)
            if let v = styleDict["fontFamily"] as? String { styles["fontFamily"] = .string(v) }
            if let v = styleDict["fontStyle"] as? String { styles["fontStyle"] = .string(v) }
            if let v = styleDict["borderStyle"] as? String { styles["borderStyle"] = .string(v) }
            if let v = styleDict["textDecorationLine"] as? String { styles["textDecorationLine"] = .string(v) }
            if let v = styleDict["objectFit"] as? String { styles["objectFit"] = .string(v) }
        }

        // Yoga-sourced style properties — read from YGNodeStyleGet*() APIs
        // to test that YogaStyleApplier applied values correctly.

        // alignItems
        switch YGNodeStyleGetAlignItems(yoga) {
        case .flexStart: styles["alignItems"] = .string("flex-start")
        case .center: styles["alignItems"] = .string("center")
        case .flexEnd: styles["alignItems"] = .string("flex-end")
        case .stretch: styles["alignItems"] = .string("stretch")
        case .baseline: styles["alignItems"] = .string("baseline")
        default: break
        }

        // justifyContent
        switch YGNodeStyleGetJustifyContent(yoga) {
        case .flexStart: styles["justifyContent"] = .string("flex-start")
        case .center: styles["justifyContent"] = .string("center")
        case .flexEnd: styles["justifyContent"] = .string("flex-end")
        case .spaceBetween: styles["justifyContent"] = .string("space-between")
        case .spaceAround: styles["justifyContent"] = .string("space-around")
        case .spaceEvenly: styles["justifyContent"] = .string("space-evenly")
        default: break
        }

        // overflow
        switch YGNodeStyleGetOverflow(yoga) {
        case .visible: styles["overflow"] = .string("visible")
        case .hidden: styles["overflow"] = .string("hidden")
        case .scroll: styles["overflow"] = .string("scroll")
        default: break
        }

        // boxSizing
        switch YGNodeStyleGetBoxSizing(yoga) {
        case .borderBox: styles["boxSizing"] = .string("border-box")
        case .contentBox: styles["boxSizing"] = .string("content-box")
        default: break
        }

        // alignSelf
        switch YGNodeStyleGetAlignSelf(yoga) {
        case .auto: styles["alignSelf"] = .string("auto")
        case .flexStart: styles["alignSelf"] = .string("flex-start")
        case .center: styles["alignSelf"] = .string("center")
        case .flexEnd: styles["alignSelf"] = .string("flex-end")
        case .stretch: styles["alignSelf"] = .string("stretch")
        case .baseline: styles["alignSelf"] = .string("baseline")
        default: break
        }

        // alignContent
        switch YGNodeStyleGetAlignContent(yoga) {
        case .flexStart: styles["alignContent"] = .string("flex-start")
        case .center: styles["alignContent"] = .string("center")
        case .flexEnd: styles["alignContent"] = .string("flex-end")
        case .stretch: styles["alignContent"] = .string("stretch")
        case .spaceBetween: styles["alignContent"] = .string("space-between")
        case .spaceAround: styles["alignContent"] = .string("space-around")
        case .spaceEvenly: styles["alignContent"] = .string("space-evenly")
        default: break
        }

        // MARK: - UIKit view-based property extraction
        // When a ViewRegistry is provided, read actual rendered properties from
        // the UIKit views rather than relying solely on the style dict. This
        // catches rendering bugs where the style dict says one thing but UIKit
        // renders differently.
        if let viewRegistry = viewRegistry,
           let view = viewRegistry.view(for: node.family) {

            // 1. textAlign — read actual UILabel.textAlignment
            if let label = view as? UILabel {
                let actualAlign: String
                switch label.textAlignment {
                case .left, .natural:
                    actualAlign = "left"
                case .center:
                    actualAlign = "center"
                case .right:
                    actualAlign = "right"
                case .justified:
                    actualAlign = "justify"
                @unknown default:
                    actualAlign = "left"
                }
                // Override the style-dict value with the actual rendered value.
                // If the style says "center" but UILabel renders as .left,
                // this will create a diff against the web's "center".
                styles["textAlign"] = .string(actualAlign)

                // 2. Text truncation — detect if UILabel is actually truncating text.
                // Check if the text's intrinsic size exceeds the label's bounds,
                // meaning text is actually being cut off (not just that lineBreakMode
                // is set to truncating, which is the UILabel default).
                if label.numberOfLines != 0 {
                    // numberOfLines is constrained — check if text overflows
                    let maxSize = CGSize(
                        width: label.bounds.width > 0 ? label.bounds.width : .greatestFiniteMagnitude,
                        height: .greatestFiniteMagnitude
                    )
                    let requiredSize = label.sizeThatFits(maxSize)
                    let isActuallyTruncated = requiredSize.height > label.bounds.height + 1 ||
                        (label.numberOfLines == 1 && requiredSize.width > label.bounds.width + 1)
                    if isActuallyTruncated {
                        styles["textOverflow"] = .string("ellipsis")
                    }
                }
            }

            // 3. Per-corner borderRadius — check actual rendered state.
            // When per-corner values differ, applyBorderRadius uses a
            // CAShapeLayer mask (layer.cornerRadius is 0). In that case,
            // trust the style dict values since the mask faithfully renders
            // them. Only override from layer.cornerRadius when all per-corner
            // values should be uniform.
            let actualRadius = Double(view.layer.cornerRadius)
            let hasMask = view.layer.mask?.name == "__corner_mask__"
            let styleTL = (node.props["style"] as? [String: Any])?["borderTopLeftRadius"]
            let styleTR = (node.props["style"] as? [String: Any])?["borderTopRightRadius"]
            let styleBR = (node.props["style"] as? [String: Any])?["borderBottomRightRadius"]
            let styleBL = (node.props["style"] as? [String: Any])?["borderBottomLeftRadius"]
            let hasPerCorner = styleTL != nil || styleTR != nil || styleBR != nil || styleBL != nil
            if hasPerCorner && !hasMask {
                // Uniform layer.cornerRadius — report what the layer renders
                styles["borderTopLeftRadius"] = .number(actualRadius)
                styles["borderTopRightRadius"] = .number(actualRadius)
                styles["borderBottomRightRadius"] = .number(actualRadius)
                styles["borderBottomLeftRadius"] = .number(actualRadius)
            }
            // When hasMask is true, per-corner values from the style dict
            // (already extracted above) are correct — the mask renders them.
        }

        return styles
    }

    // MARK: - Margin Collapse-Through Adjustment

    /// Whether a node is block-level for margin collapse purposes.
    /// Only block and list-item participate; flex/inline-block/inline do not.
    private static func isBlockLevelForCollapse(_ node: LayoutNode) -> Bool {
        guard let display = node.styles["display"]?.stringValue else {
            return true // default display is block for most elements
        }
        return display == "block" || display == "list-item"
    }

    /// Whether a node uses block formatting context for its children.
    /// Flex containers use flex formatting — no margin collapsing between flex items.
    private static func isBlockFormattingParent(_ node: LayoutNode) -> Bool {
        guard let display = node.styles["display"]?.stringValue else {
            return true
        }
        return display == "block" || display == "list-item"
    }

    /// Compute the effective top margin that would collapse through nested first children.
    /// CSS: if a block parent has no top padding/border, its first child's marginTop
    /// collapses with the parent's marginTop → effective = max(parent, child).
    private static func computeCollapseTopMargin(_ node: LayoutNode) -> Double {
        let margin = node.styles["marginTop"]?.numericValue ?? 0
        let padding = node.styles["paddingTop"]?.numericValue ?? 0
        let border = node.styles["borderTopWidth"]?.numericValue ?? 0
        let hasExplicitHeight = node.styles["_hasExplicitHeight"]?.numericValue == 1

        guard padding == 0 && border == 0 && !hasExplicitHeight &&
              !node.children.isEmpty &&
              isBlockFormattingParent(node) else {
            return margin
        }

        let firstChild = node.children[0]
        guard isBlockLevelForCollapse(firstChild) else { return margin }

        return max(margin, computeCollapseTopMargin(firstChild))
    }

    /// Compute the effective bottom margin that would collapse through nested last children.
    private static func computeCollapseBottomMargin(_ node: LayoutNode) -> Double {
        let margin = node.styles["marginBottom"]?.numericValue ?? 0
        let padding = node.styles["paddingBottom"]?.numericValue ?? 0
        let border = node.styles["borderBottomWidth"]?.numericValue ?? 0
        let hasExplicitHeight = node.styles["_hasExplicitHeight"]?.numericValue == 1

        guard padding == 0 && border == 0 && !hasExplicitHeight &&
              !node.children.isEmpty &&
              isBlockFormattingParent(node) else {
            return margin
        }

        let lastChild = node.children[node.children.count - 1]
        guard isBlockLevelForCollapse(lastChild) else { return margin }

        return max(margin, computeCollapseBottomMargin(lastChild))
    }

    /// Offset a node and all descendants by a y delta.
    /// Skips display:none nodes (zero-size) since their y=0 is correct per CSS spec.
    private static func offsetNodeY(_ node: LayoutNode, by delta: Double) -> LayoutNode {
        LayoutNode(
            type: node.type,
            x: node.x,
            y: node.y + delta,
            width: node.width,
            height: node.height,
            styles: node.styles,
            children: node.children.map { child in
                // display:none children have 0x0 size and y=0; don't offset them
                if child.width == 0 && child.height == 0 && child.x == 0 && child.y == 0 {
                    return child
                }
                return offsetNodeY(child, by: delta)
            }
        )
    }

    /// Adjust an extracted LayoutNode tree for CSS margin collapse-through.
    /// Yoga's block mode collapses margins internally (first child at y=0) but doesn't
    /// propagate them upward. This post-extraction pass adjusts positions to match CSS.
    /// Returns the adjusted tree with the root height already corrected.
    static func adjustForMarginCollapseThrough(_ node: LayoutNode) -> LayoutNode {
        let (adjusted, delta) = collapsePass(node)
        if delta != 0 {
            return LayoutNode(
                type: adjusted.type,
                x: adjusted.x,
                y: adjusted.y,
                width: adjusted.width,
                height: adjusted.height + delta,
                styles: adjusted.styles,
                children: adjusted.children
            )
        }
        return adjusted
    }

    /// Recursive collapse-through pass. Returns (adjustedNode, heightDelta).
    /// The heightDelta represents how much THIS node's content grew, which the
    /// parent must add to the node's height and use to offset subsequent siblings.
    private static func collapsePass(_ node: LayoutNode) -> (LayoutNode, Double) {
        guard isBlockFormattingParent(node) && !node.children.isEmpty else {
            return (node, 0)
        }

        var adjustedChildren: [LayoutNode] = []
        var cumulativeOffset: Double = 0

        for i in 0..<node.children.count {
            var child = node.children[i]

            // Step 1: Recursively adjust the child's subtree
            let (adjustedChild, childDelta) = collapsePass(child)
            child = adjustedChild

            // Step 2: Apply child's internal height change
            if childDelta != 0 {
                child = LayoutNode(
                    type: child.type, x: child.x, y: child.y,
                    width: child.width, height: child.height + childDelta,
                    styles: child.styles, children: child.children
                )
            }

            // Step 3: Apply cumulative offset from previous siblings
            if cumulativeOffset != 0 {
                child = offsetNodeY(child, by: cumulativeOffset)
            }

            // Step 4: Check for collapse-through at THIS parent level
            var extraTop: Double = 0
            var extraBottom: Double = 0

            if isBlockLevelForCollapse(child) && !child.children.isEmpty && isBlockFormattingParent(child) {
                // CSS: margins don't collapse through a box with explicit non-zero height.
                let hasExplicitHeight = child.styles["_hasExplicitHeight"]?.numericValue == 1
                    && child.height > 0

                if !hasExplicitHeight {
                    let childMarginTop = child.styles["marginTop"]?.numericValue ?? 0
                    let childMarginBottom = child.styles["marginBottom"]?.numericValue ?? 0
                    let childPaddingTop = child.styles["paddingTop"]?.numericValue ?? 0
                    let childBorderTop = child.styles["borderTopWidth"]?.numericValue ?? 0
                    let childPaddingBottom = child.styles["paddingBottom"]?.numericValue ?? 0
                    let childBorderBottom = child.styles["borderBottomWidth"]?.numericValue ?? 0

                    // Top collapse-through
                    if childPaddingTop == 0 && childBorderTop == 0 {
                        let firstGrandchild = child.children[0]
                        if isBlockLevelForCollapse(firstGrandchild) {
                            let collapseTop = computeCollapseTopMargin(firstGrandchild)
                            let effectiveTop = max(childMarginTop, collapseTop)

                            if i > 0 {
                                // Non-first child: extra = CSS gap - Yoga gap
                                let prevBottom = adjustedChildren[i - 1].styles["marginBottom"]?.numericValue ?? 0
                                let yogaGap = max(prevBottom, childMarginTop)
                                let cssGap = max(prevBottom, effectiveTop)
                                extraTop = max(0, cssGap - yogaGap)
                            } else {
                                // First child: collapse propagates up through parent.
                                // If parent has padding/border, the collapse stops and we
                                // adjust the child's position within the parent.
                                let parentPaddingTop = node.styles["paddingTop"]?.numericValue ?? 0
                                let parentBorderTop = node.styles["borderTopWidth"]?.numericValue ?? 0
                                if parentPaddingTop > 0 || parentBorderTop > 0 {
                                    extraTop = max(0, effectiveTop - childMarginTop)
                                }
                                // If parent has no padding, the collapse propagates
                                // further up — handled at grandparent level.
                            }
                        }
                    }

                    // Bottom collapse-through
                    if childPaddingBottom == 0 && childBorderBottom == 0 {
                        let lastGrandchild = child.children[child.children.count - 1]
                        if isBlockLevelForCollapse(lastGrandchild) {
                            let collapseBottom = computeCollapseBottomMargin(lastGrandchild)
                            let effectiveBottom = max(childMarginBottom, collapseBottom)

                            if i < node.children.count - 1 {
                                // Non-last child: extra gap to next sibling
                                let nextTop = node.children[i + 1].styles["marginTop"]?.numericValue ?? 0
                                let yogaGap = max(childMarginBottom, nextTop)
                                let cssGap = max(effectiveBottom, nextTop)
                                extraBottom = max(0, cssGap - yogaGap)
                            } else {
                                // Last child: effective margin either escapes
                                // through the parent or stays inside it.
                                let parentPaddingBottom = node.styles["paddingBottom"]?.numericValue ?? 0
                                let parentBorderBottom = node.styles["borderBottomWidth"]?.numericValue ?? 0
                                if parentPaddingBottom > 0 || parentBorderBottom > 0 {
                                    // Parent has padding/border → margin stays inside.
                                    // Yoga only adds the child's own margin (which may be 0),
                                    // but CSS adds the effective (collapsed-through) margin.
                                    let extra = effectiveBottom - childMarginBottom
                                    if extra > 0 {
                                        extraBottom = extra
                                    }
                                }
                                // If parent has no padding/border, the margin escapes
                                // through the parent — handled at grandparent level.
                            }
                        }
                    }
                }
            }

            // Step 4b: Empty-box collapse-through.
            // CSS: When a block box has zero height, no padding, no border, and no
            // in-flow content, its own top and bottom margins collapse through into
            // a single margin = max(top, bottom). This collapsed margin then
            // collapses with adjacent sibling margins, reducing the gap.
            // In Yoga, both margins are applied separately, creating extra space.
            if isBlockLevelForCollapse(child) && child.children.isEmpty && child.height == 0 {
                let emptyPadTop = child.styles["paddingTop"]?.numericValue ?? 0
                let emptyPadBot = child.styles["paddingBottom"]?.numericValue ?? 0
                let emptyBdrTop = child.styles["borderTopWidth"]?.numericValue ?? 0
                let emptyBdrBot = child.styles["borderBottomWidth"]?.numericValue ?? 0

                if emptyPadTop == 0 && emptyPadBot == 0 &&
                   emptyBdrTop == 0 && emptyBdrBot == 0 {
                    let emptyTop = child.styles["marginTop"]?.numericValue ?? 0
                    let emptyBot = child.styles["marginBottom"]?.numericValue ?? 0
                    // CSS collapses the box's own margins: effective = max(top, bottom).
                    // Then this collapses with the previous sibling's bottom margin.
                    // Yoga gap = prevBottom + emptyTop + emptyBot + nextTop (no collapse)
                    // CSS gap  = max(prevBottom, max(emptyTop, emptyBot), nextTop)
                    // The height reduction = Yoga gap - CSS gap
                    if i > 0 && i < node.children.count - 1 {
                        let prevBottom = adjustedChildren[i - 1].styles["marginBottom"]?.numericValue ?? 0
                        let nextTop = node.children[i + 1].styles["marginTop"]?.numericValue ?? 0
                        let collapsedEmpty = max(emptyTop, emptyBot)
                        let yogaGap = prevBottom + emptyTop + emptyBot + nextTop
                        let cssGap = max(prevBottom, max(collapsedEmpty, nextTop))
                        let reduction = yogaGap - cssGap
                        if reduction > 0 {
                            extraBottom = -reduction  // negative: reduce space
                        }
                    }
                }
            }

            if extraTop > 0 {
                child = offsetNodeY(child, by: extraTop)
            }

            adjustedChildren.append(child)

            // Step 5: Accumulate offset for subsequent siblings
            cumulativeOffset += childDelta + extraTop + extraBottom
        }

        return (LayoutNode(
            type: node.type,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            styles: node.styles,
            children: adjustedChildren
        ), cumulativeOffset)
    }
}
