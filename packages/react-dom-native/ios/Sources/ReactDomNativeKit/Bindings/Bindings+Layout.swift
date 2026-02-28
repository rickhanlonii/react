import Foundation
import UIKit
import ShadowTree
import JSEngine
import Yoga

// ---------------------------------------------------------------------------
// Bindings+Layout
//
// Extension containing Yoga layout calculation and frame sync methods.
// ---------------------------------------------------------------------------

extension Bindings {

    // MARK: - Layout

    /// Computes tree statistics (total node count and max depth) by walking
    /// the shadow tree. Used when tracing is enabled to populate the timing
    /// dictionary with tree summary data.
    func computeTreeStats(_ roots: [ShadowNodeWrapper]) -> (nodeCount: Int, depth: Int) {
        var count = 0
        func walk(_ nodes: [ShadowNodeWrapper], currentDepth: Int, maxDepth: inout Int) {
            for node in nodes {
                count += 1
                if currentDepth > maxDepth { maxDepth = currentDepth }
                walk(node.children, currentDepth: currentDepth + 1, maxDepth: &maxDepth)
            }
        }
        var maxDepth = 0
        walk(roots, currentDepth: 1, maxDepth: &maxDepth)
        return (count, maxDepth)
    }

    /// Recursively syncs every UIView's frame to match its node's layoutFrame.
    ///
    /// The Differentiator only emits UPDATE mutations for cloned nodes, but
    /// Yoga recalculates layout for the entire tree. Reused nodes (same
    /// identity across old/new trees) may have new positions when a preceding
    /// sibling changed size. This pass ensures all frames stay in sync.
    func syncAllFrames(_ nodes: [ShadowNodeWrapper]) {
        for node in nodes {
            if let view = viewRegistry.view(for: node.family) {
                if view.frame != node.layoutFrame {
                    view.frame = node.layoutFrame
                }
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }
            syncAllFrames(node.children)
        }
    }

    /// Recursively syncs every UIView's frame to match its node's layoutFrame,
    /// with optional per-node timing collection for flame graph visualization.
    func syncAllFrames(
        _ nodes: [ShadowNodeWrapper],
        tracing: Bool,
        nodeTimings: inout [(type: String, start: Double, end: Double)]
    ) {
        for node in nodes {
            let nodeStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

            if let view = viewRegistry.view(for: node.family) {
                if view.frame != node.layoutFrame {
                    view.frame = node.layoutFrame
                }
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }
            syncAllFrames(node.children, tracing: tracing, nodeTimings: &nodeTimings)

            if tracing {
                let nodeEnd = CACurrentMediaTime() * 1000.0
                nodeTimings.append((node.family.elementType, nodeStart, nodeEnd))
            }
        }
    }

    // MARK: - Yoga Layout

    /// Calculate layout using Yoga for the given top-level children within bounds.
    ///
    /// Uses a persistent root YGNode per surface that survives across commits.
    /// YGNodeSetChildren preserves layout caches for children whose yoga nodes
    /// haven't changed (unchanged subtrees), so Yoga can skip recalculating
    /// them on subsequent commits.
    ///
    /// Returns the natural content size (width × height) from Yoga layout.
    @discardableResult
    func calculateYogaLayout(for children: [ShadowNodeWrapper], in bounds: CGRect, surfaceId: Int, tracing: Bool = false) -> CGSize {
        guard !children.isEmpty else { return .zero }

        // 1. Get or create persistent root node for this surface
        let rootNode: YGNodeRef
        if let existing = rootYogaNodes[surfaceId] {
            rootNode = existing
        } else {
            rootNode = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeStyleSetFlexDirection(rootNode, .column)
            rootYogaNodes[surfaceId] = rootNode
        }

        // Update width (may change on rotation)
        YGNodeStyleSetWidth(rootNode, Float(bounds.width))
        // Don't set height — let content determine its own height.
        // On the web, the viewport scrolls when content overflows rather
        // than shrinking children via flexShrink.

        // 2. Update root's children using YGNodeSetChildren.
        // This preserves layout caches for yoga nodes that remain in the
        // tree (unchanged subtrees) while properly cleaning up removed ones.
        // Children with other owners need to be detached first.
        for child in children {
            if let owner = YGNodeGetOwner(child.yogaNode), owner != rootNode {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
        }
        var childYogaNodes: [YGNodeRef?] = children.map { $0.yogaNode }
        childYogaNodes.withUnsafeBufferPointer { buffer in
            YGNodeSetChildren(rootNode, buffer.baseAddress, buffer.count)
        }

        // 3. Calculate layout (first pass)
        let yogaStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)

        // 3b. Post-layout text re-measurement
        let textRemeasureStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        var needsSecondPass = false
        for child in children {
            if ShadowTreeLayout.markTextNodesNeedingRemeasure(child) {
                needsSecondPass = true
            }
        }
        var didRemeasure = false
        if needsSecondPass {
            didRemeasure = true
            YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)
        }
        let textRemeasureEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0
        let yogaEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // Read content size from root (which has unbounded height)
        let yogaHeight = CGFloat(YGNodeLayoutGetHeight(rootNode))

        // 4. Walk tree reading layout results into layoutFrame
        let readFramesStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        if tracing {
            self.lastLayoutNodeTimings = []
            for child in children {
                ShadowTreeLayout.readLayoutFrames(
                    node: child, tracing: true, nodeTimings: &self.lastLayoutNodeTimings
                )
            }
        } else {
            for child in children {
                ShadowTreeLayout.readLayoutFrames(node: child)
            }
        }

        // 4a. Adjust for CSS margin collapse-through
        ShadowTreeLayout.adjustMarginCollapseThrough(children: children)

        let actualHeight = ShadowTreeLayout.computeActualContentHeight(for: children)
        let readFramesEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0
        let contentSize = CGSize(
            width: CGFloat(YGNodeLayoutGetWidth(rootNode)),
            height: max(yogaHeight, actualHeight)
        )

        // 4b. Compute scroll content sizes for overflow:scroll/auto nodes
        let scrollStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        for child in children {
            ShadowTreeLayout.computeScrollContentSizes(for: child)
        }
        let scrollEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // Children stay attached to the persistent root — their layout
        // caches are preserved for the next commit's incremental layout.

        if tracing {
            lastLayoutTimings = [
                "yogaStart": yogaStart, "yogaEnd": yogaEnd,
                "textRemeasureStart": textRemeasureStart, "textRemeasureEnd": textRemeasureEnd,
                "didRemeasure": didRemeasure ? 1.0 : 0.0,
                "readFramesStart": readFramesStart, "readFramesEnd": readFramesEnd,
                "scrollStart": scrollStart, "scrollEnd": scrollEnd,
            ]
        }

        return contentSize
    }
}
