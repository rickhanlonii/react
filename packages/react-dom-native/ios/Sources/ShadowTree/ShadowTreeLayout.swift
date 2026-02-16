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
        node.layoutFrame = CGRect(
            x: CGFloat(YGNodeLayoutGetLeft(node.yogaNode)),
            y: CGFloat(YGNodeLayoutGetTop(node.yogaNode)),
            width: CGFloat(YGNodeLayoutGetWidth(node.yogaNode)),
            height: CGFloat(YGNodeLayoutGetHeight(node.yogaNode))
        )

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
            // Create temp root with same width but unbounded height
            let tempRoot = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeStyleSetFlexDirection(tempRoot, YGNodeStyleGetFlexDirection(node.yogaNode))
            YGNodeStyleSetWidth(tempRoot, Float(node.layoutFrame.width))

            // Copy gap from original node
            let gap = YGNodeStyleGetGap(node.yogaNode, .all)
            if gap.unit == .point {
                YGNodeStyleSetGap(tempRoot, .all, gap.value)
            } else if gap.unit == .percent {
                YGNodeStyleSetGapPercent(tempRoot, .all, gap.value)
            }

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
            node.scrollContentSize = CGSize(
                width: node.layoutFrame.width,
                height: contentHeight
            )

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
}
