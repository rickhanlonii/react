import Foundation
import CoreGraphics
import Yoga

// ---------------------------------------------------------------------------
// ShadowTreeLayout
//
// Shared layout utilities used by both the reconciler path (Bindings) and
// the SSR path (ShadowTreeBuilder). Extracted to avoid duplicating the
// same layout pipeline in two places.
// ---------------------------------------------------------------------------

public enum ShadowTreeLayout {

    /// Full layout pipeline: calculate Yoga → read frames → remeasure text → scroll sizes.
    ///
    /// Used by ShadowTreeBuilder which owns a persistent root yoga node.
    public static func performLayout(
        rootYogaNode: YGNodeRef,
        children: [ShadowNodeWrapper],
        width: Float,
        height: Float
    ) {
        // 1. Calculate Yoga layout
        YGNodeCalculateLayout(rootYogaNode, width, height, .LTR)

        // 2. Walk tree to set layoutFrame on each node
        for child in children {
            readLayoutFrames(node: child)
        }

        // 3. Handle text nodes that need remeasurement (flex-shrunk)
        var needsRelayout = false
        for child in children {
            if markTextNodesNeedingRemeasure(child) {
                needsRelayout = true
            }
        }
        if needsRelayout {
            YGNodeCalculateLayout(rootYogaNode, width, height, .LTR)
            for child in children {
                readLayoutFrames(node: child)
            }
        }

        // 4. Compute scroll content sizes for overflow:scroll/auto elements
        for child in children {
            computeScrollContentSizes(for: child)
        }
    }

    /// Recursively apply Yoga layout results to layoutFrame on each node.
    /// Uses local (parent-relative) coordinates since UIKit subview frames
    /// are relative to their superview, not the root.
    public static func readLayoutFrames(node: ShadowNodeWrapper) {
        var x = CGFloat(YGNodeLayoutGetLeft(node.yogaNode))
        var y = CGFloat(YGNodeLayoutGetTop(node.yogaNode))
        let width = CGFloat(YGNodeLayoutGetWidth(node.yogaNode))
        let height = CGFloat(YGNodeLayoutGetHeight(node.yogaNode))

        // Yoga does NOT apply position:relative offsets in two layout modes:
        // 1. calculateBlockLayout() — block-display nodes: misses ALL offsets
        // 2. Wrapping flex (flexWrap: wrap/wrapReverse): misses only vertical
        //    (top/bottom) offsets; horizontal (left/right) ARE applied by Yoga
        // Manually apply the missing offsets to match CSS behavior.
        if YGNodeStyleGetPositionType(node.yogaNode) == .relative {
            let isBlock = YGNodeStyleGetDisplay(node.yogaNode) == .block
            let isInWrappingFlex: Bool
            if let owner = YGNodeGetOwner(node.yogaNode) {
                let parentWrap = YGNodeStyleGetFlexWrap(owner)
                isInWrappingFlex = parentWrap == .wrap || parentWrap == .wrapReverse
            } else {
                isInWrappingFlex = false
            }

            if isBlock || isInWrappingFlex {
                let style = node.props["style"] as? [String: Any]
                // Vertical offsets: missing in both block and wrapping flex
                if let top = style?["top"] as? NSNumber {
                    y += CGFloat(top.doubleValue)
                } else if let bottom = style?["bottom"] as? NSNumber {
                    y -= CGFloat(bottom.doubleValue)
                }
                // Horizontal offsets: only missing in block layout
                if isBlock {
                    if let left = style?["left"] as? NSNumber {
                        x += CGFloat(left.doubleValue)
                    } else if let right = style?["right"] as? NSNumber {
                        x -= CGFloat(right.doubleValue)
                    }
                }
            }
        }

        node.layoutFrame = CGRect(x: x, y: y, width: width, height: height)

        for child in node.children {
            readLayoutFrames(node: child)
        }
    }

    /// Recursively check for text nodes that were flex-shrunk narrower than their
    /// measured width. Marks them dirty so Yoga re-measures at the correct width.
    /// Returns true if any node was marked dirty.
    @discardableResult
    public static func markTextNodesNeedingRemeasure(_ node: ShadowNodeWrapper) -> Bool {
        var anyDirty = false
        if node.text != nil && YogaTextMeasure.needsRemeasure(yogaNode: node.yogaNode) {
            YGNodeMarkDirty(node.yogaNode)
            anyDirty = true
        }
        for child in node.children {
            if markTextNodesNeedingRemeasure(child) {
                anyDirty = true
            }
        }
        return anyDirty
    }

    /// Compute the actual content height by finding the maximum bottom
    /// coordinate of all children. Handles cases where Yoga's flex column
    /// parent computes a height smaller than child positions require
    /// (e.g. when block-display children have margins that extend beyond
    /// the flex container's computed height).
    public static func computeActualContentHeight(for nodes: [ShadowNodeWrapper]) -> CGFloat {
        var maxBottom: CGFloat = 0
        for node in nodes {
            let nodeBottom = node.layoutFrame.origin.y + node.layoutFrame.height
            maxBottom = max(maxBottom, nodeBottom)
            // Check children recursively — a node's children might extend
            // beyond the node's own computed height
            let childrenMaxBottom = computeActualContentHeight(for: node.children)
            if childrenMaxBottom > node.layoutFrame.height {
                maxBottom = max(maxBottom, node.layoutFrame.origin.y + childrenMaxBottom)
            }
        }
        return maxBottom
    }

    /// For nodes with overflow:scroll/auto, re-layout children with unbounded
    /// height to compute the natural content size. Yoga's flex-shrink would
    /// otherwise constrain children to the parent's height.
    public static func computeScrollContentSizes(for node: ShadowNodeWrapper) {
        let style = node.props["style"] as? [String: Any] ?? [:]
        let overflow = style["overflow"] as? String

        if overflow == "scroll" || overflow == "auto" {
            // Create temp root that mirrors the scroll container's styles
            // but with unbounded height for natural content measurement
            let tempRoot = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeCopyStyle(tempRoot, node.yogaNode)

            // Override boxSizing to border-box BEFORE setting width.
            // node.layoutFrame.width is the total outer width (including
            // padding + border), which is what YGNodeLayoutGetWidth returns
            // regardless of box-sizing. With border-box, setWidth interprets
            // the value as total outer width, giving correct content area.
            YGNodeStyleSetBoxSizing(tempRoot, .borderBox)
            YGNodeStyleSetWidth(tempRoot, Float(node.layoutFrame.width))
            // Override: unbounded height for content measurement
            YGNodeStyleSetHeightAuto(tempRoot)
            // Override: don't constrain children to container height
            YGNodeStyleSetOverflow(tempRoot, .visible)

            // Reparent children to temp root
            for (index, child) in node.children.enumerated() {
                if let owner = YGNodeGetOwner(child.yogaNode) {
                    YGNodeRemoveChild(owner, child.yogaNode)
                }
                YGNodeInsertChild(tempRoot, child.yogaNode, index)
            }

            // Layout with unbounded height
            YGNodeCalculateLayout(tempRoot, Float(node.layoutFrame.width), .nan, .LTR)

            // Read natural content size and update children's layoutFrames
            var contentHeight: CGFloat = 0
            for child in node.children {
                let bottom = CGFloat(YGNodeLayoutGetTop(child.yogaNode))
                           + CGFloat(YGNodeLayoutGetHeight(child.yogaNode))
                contentHeight = max(contentHeight, bottom)
                readLayoutFrames(node: child)
            }
            // Add bottom padding to content height
            let paddingBottom = CGFloat(YGNodeLayoutGetPadding(tempRoot, .bottom))
            contentHeight += paddingBottom
            node.scrollContentSize = CGSize(
                width: node.layoutFrame.width,
                height: contentHeight
            )

            // Save layout margins BEFORE reparenting. Yoga's
            // YGNodeRemoveAllChildren calls setLayout({}) on each child,
            // clearing cached layout results including margins.
            saveLayoutMargins(for: node.children)

            // Restore children to original parent
            YGNodeRemoveAllChildren(tempRoot)
            for (index, child) in node.children.enumerated() {
                YGNodeInsertChild(node.yogaNode, child.yogaNode, index)
            }
            YGNodeFree(tempRoot)
        }

        // Recurse (children may also be scroll containers)
        for child in node.children {
            computeScrollContentSizes(for: child)
        }
    }

    /// Recursively save layout margins from Yoga nodes to ShadowNodeWrappers.
    /// Called before YGNodeRemoveAllChildren which clears layout data.
    private static func saveLayoutMargins(for children: [ShadowNodeWrapper]) {
        for child in children {
            child.layoutMargins = (
                top: CGFloat(YGNodeLayoutGetMargin(child.yogaNode, .top)),
                right: CGFloat(YGNodeLayoutGetMargin(child.yogaNode, .right)),
                bottom: CGFloat(YGNodeLayoutGetMargin(child.yogaNode, .bottom)),
                left: CGFloat(YGNodeLayoutGetMargin(child.yogaNode, .left))
            )
            saveLayoutMargins(for: child.children)
        }
    }

    // MARK: - CSS Margin Collapse-Through

    /// Whether a node is a block-level element for margin collapse purposes.
    private static func isBlockLevelForCollapse(_ node: ShadowNodeWrapper) -> Bool {
        let style = node.props["style"] as? [String: Any]
        let display = style?["display"] as? String ?? "block"
        return display == "block" || display == "list-item"
    }

    /// Whether a node acts as a block formatting parent (block display, lays out
    /// children in block flow — not flex).
    private static func isBlockFormattingParent(_ node: ShadowNodeWrapper) -> Bool {
        let style = node.props["style"] as? [String: Any]
        let display = style?["display"] as? String ?? "block"
        return display == "block" || display == "list-item"
    }

    /// Recursively compute the effective top margin that would collapse through
    /// nested first children in CSS. Mirrors LayoutExtractor.computeCollapseTopMargin.
    static func computeCollapseTopMargin(_ node: ShadowNodeWrapper) -> CGFloat {
        let style = node.props["style"] as? [String: Any] ?? [:]
        let margin = CGFloat((style["marginTop"] as? NSNumber)?.doubleValue ?? 0)
        let padding = CGFloat((style["paddingTop"] as? NSNumber)?.doubleValue ?? 0)
        let border = CGFloat((style["borderTopWidth"] as? NSNumber)?.doubleValue ?? 0)

        guard padding == 0 && border == 0 &&
              isBlockFormattingParent(node) &&
              !node.children.isEmpty else {
            return margin
        }

        // Find first in-flow block child
        guard let firstChild = node.children.first(where: {
            $0.family.elementType != "#text" && isBlockLevelForCollapse($0)
        }) else {
            return margin
        }

        return max(margin, computeCollapseTopMargin(firstChild))
    }

    /// Same for bottom margin through nested last children.
    static func computeCollapseBottomMargin(_ node: ShadowNodeWrapper) -> CGFloat {
        let style = node.props["style"] as? [String: Any] ?? [:]
        let margin = CGFloat((style["marginBottom"] as? NSNumber)?.doubleValue ?? 0)
        let padding = CGFloat((style["paddingBottom"] as? NSNumber)?.doubleValue ?? 0)
        let border = CGFloat((style["borderBottomWidth"] as? NSNumber)?.doubleValue ?? 0)

        guard padding == 0 && border == 0 &&
              isBlockFormattingParent(node) &&
              !node.children.isEmpty else {
            return margin
        }

        guard let lastChild = node.children.last(where: {
            $0.family.elementType != "#text" && isBlockLevelForCollapse($0)
        }) else {
            return margin
        }

        return max(margin, computeCollapseBottomMargin(lastChild))
    }

    /// Post-layout pass: adjust layoutFrame values for CSS margin collapse-through.
    ///
    /// Yoga's calculateBlockLayout positions first children at Y=0 when parent
    /// has no padding/border (correctly "collapsing"), but doesn't propagate the
    /// collapsed margin to the parent's position. This pass pushes block parents
    /// down by their effective collapsed top margin, matching CSS behavior.
    ///
    /// Only adjusts root-level nodes (those directly in the `children` array).
    /// Nested collapse-through is handled by the recursive computeCollapseTopMargin
    /// which finds the deepest collapsed margin and propagates it to the outermost
    /// container in one step.
    public static func adjustMarginCollapseThrough(children: [ShadowNodeWrapper]) {
        for node in children {
            guard isBlockFormattingParent(node) && !node.children.isEmpty else { continue }

            let style = node.props["style"] as? [String: Any] ?? [:]
            let paddingTop = CGFloat((style["paddingTop"] as? NSNumber)?.doubleValue ?? 0)
            let borderTop = CGFloat((style["borderTopWidth"] as? NSNumber)?.doubleValue ?? 0)
            let ownMarginTop = CGFloat((style["marginTop"] as? NSNumber)?.doubleValue ?? 0)

            // Top margin collapse-through
            if paddingTop == 0 && borderTop == 0 {
                if let firstChild = node.children.first(where: {
                    $0.family.elementType != "#text" && isBlockLevelForCollapse($0)
                }) {
                    let effectiveTop = computeCollapseTopMargin(firstChild)
                    let delta = max(0, effectiveTop - ownMarginTop)
                    if delta > 0 {
                        // Push this node down by the escaped margin
                        node.layoutFrame.origin.y += delta
                    }
                }
            }
        }
    }
}
