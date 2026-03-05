import Foundation
import UIKit
import ShadowTree
import Yoga

// ---------------------------------------------------------------------------
// Renderer
//
// Owns the commit pipeline for a single Root. Both the reconciler path
// ($$completeRoot) and SSR/prerender paths call commitTree() for a unified
// layout → diff → mutations → sync → timing flow.
//
// Each Root creates its own Renderer. For SSR, the Renderer starts with its
// own ViewRegistry/MutationApplier. At hydration, these are switched to
// Bindings' shared instances so the EventDispatcher can find views.
// ---------------------------------------------------------------------------

public class Renderer {

    // MARK: - Commit Infrastructure

    /// View registry — starts as own instance (SSR), switched to Bindings' at hydration/CSR.
    var viewRegistry: ViewRegistry

    /// Differentiator for diffing old vs new trees.
    var differentiator: Differentiator

    /// Mutation applier for creating/updating/removing UIKit views.
    var mutationApplier: UIKitMutationApplier

    // MARK: - Per-Root State

    /// The current committed shadow tree (promoted at end of each commit).
    private(set) var currentTree: [ShadowNodeWrapper] = []

    /// The scroll view this renderer renders into (created by registerRootView).
    private(set) var rootView: UIView?

    /// Persistent Yoga root node. Survives across commits so Yoga's incremental
    /// layout can skip unchanged subtrees.
    private var rootYogaNode: YGNodeRef?

    // MARK: - Tracing

    /// Whether commit timing collection is enabled.
    var tracingEnabled: Bool = false

    /// Called when tracing is enabled and a commit completes, with the full timing dict.
    var onTimingCollected: (([String: Any]) -> Void)?

    /// Called after every commitTree completes (regardless of tracing).
    /// Used to capture screenshots for the performance trace filmstrip.
    var onCommitPainted: (() -> Void)?

    /// Called when a real paint completes (CATransaction commit). Reports the
    /// paint timing span directly to the tracer since it fires asynchronously
    /// after commitTree returns.
    var onPaintTimingCollected: ((_ nativePaintEnd: Double) -> Void)?

    /// Sub-phase timings from the most recent calculateLayout call.
    private var lastLayoutTimings: [String: Double]?

    /// Per-node layout timings from the most recent calculateLayout call.
    private var lastLayoutNodeTimings: [(type: String, start: Double, end: Double)] = []

    // MARK: - Initialization

    public init() {
        self.viewRegistry = ViewRegistry()
        self.differentiator = Differentiator()
        self.mutationApplier = UIKitMutationApplier(viewRegistry: viewRegistry)
    }

    // MARK: - Root View

    /// Creates a UIScrollView inside the container and stores it as rootView.
    public func registerRootView(_ container: UIView) {
        let scrollView = UIScrollView(frame: container.bounds)
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrollView.contentInsetAdjustmentBehavior = .automatic
        container.addSubview(scrollView)
        rootView = scrollView
    }

    // MARK: - Commit Pipeline

    /// Unified commit: layout → diff → mutations → sync → attach → promote → timing.
    ///
    /// Called by both the reconciler path ($$completeRoot) and SSR/prerender paths.
    ///
    /// - Parameters:
    ///   - newChildren: The new root-level shadow tree children.
    ///   - label: Label for tracing (e.g. "Commit", "SSR First Paint", "SSR Reveal").
    func commitTree(newChildren: [ShadowNodeWrapper], label: String = "Commit") {
        guard let scrollView = rootView else { return }

        let tracing = tracingEnabled
        let commitStart = tracing ? performanceNow() : 0

        // 1. Layout
        let layoutStart = tracing ? performanceNow() : 0
        let contentSize = calculateLayout(for: newChildren, in: scrollView.bounds, tracing: tracing)
        let layoutEnd = tracing ? performanceNow() : 0

        // 2. Diff old vs new (inside Prepare Paint)
        let preparePaintStart = tracing ? performanceNow() : 0
        let diffStart = tracing ? performanceNow() : 0
        var diffNodeTimings: [(type: String, start: Double, end: Double)] = []
        let mutations: [Mutation]
        if tracing {
            mutations = differentiator.diff(
                oldChildren: currentTree,
                newChildren: newChildren,
                parent: nil,
                tracing: true,
                nodeTimings: &diffNodeTimings
            )
        } else {
            mutations = differentiator.diff(
                oldChildren: currentTree,
                newChildren: newChildren,
                parent: nil
            )
        }
        let diffEnd = tracing ? performanceNow() : 0

        // 3. Apply mutations + sync frames + attach (inside Prepare Paint)
        var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
        var syncNodeTimings: [(type: String, start: Double, end: Double)] = []
        let mutationsStart = tracing ? performanceNow() : 0

        if tracing {
            mutationApplier.applyMutations(mutations, rootView: scrollView, tracing: true, mutationTimings: &mutationTimings)
        } else {
            mutationApplier.applyMutations(mutations, rootView: scrollView)
        }

        let syncStart = tracing ? performanceNow() : 0
        if tracing {
            syncAllFrames(newChildren, tracing: true, nodeTimings: &syncNodeTimings)
        } else {
            syncAllFrames(newChildren)
        }
        let syncEnd = tracing ? performanceNow() : 0

        let mutationsEnd = tracing ? performanceNow() : 0

        // 4. Attach root children to rootView
        let attachStart = tracing ? performanceNow() : 0
        for child in newChildren {
            if let view = viewRegistry.view(for: child.family) {
                if view.superview == nil {
                    scrollView.addSubview(view)
                }
            }
        }

        // 5. Set scroll content size
        if let sv = scrollView as? UIScrollView {
            sv.contentSize = CGSize(
                width: sv.bounds.width,
                height: contentSize.height
            )
        }

        // 6. Promote current tree
        currentTree = newChildren
        let attachEnd = tracing ? performanceNow() : 0
        let preparePaintEnd = tracing ? performanceNow() : 0

        // Schedule real paint timing via CATransaction completion.
        // Native Paint starts at preparePaintEnd so it contains the Commit
        // bookkeeping and Screenshot phases, and extends to when Core Animation
        // actually commits the layer tree to the render server.
        if tracing {
            let callback = onPaintTimingCollected
            CATransaction.setCompletionBlock {
                let nativePaintEnd = performanceNow()
                callback?(nativePaintEnd)
            }
        }

        // 7. Fire timing if tracing
        if tracing {
            var creates = 0, inserts = 0, deletes = 0, removes = 0, updates = 0
            var affectedTypes = Set<String>()
            for mutation in mutations {
                switch mutation {
                case .create(let node): creates += 1; affectedTypes.insert(node.family.elementType)
                case .insert(_, let child, _): inserts += 1; affectedTypes.insert(child.family.elementType)
                case .delete(let node): deletes += 1; affectedTypes.insert(node.family.elementType)
                case .remove(_, let child): removes += 1; affectedTypes.insert(child.family.elementType)
                case .update(let node, _, _): updates += 1; affectedTypes.insert(node.family.elementType)
                }
            }

            let stats = computeTreeStats(newChildren)
            let commitEnd = performanceNow()

            var timing: [String: Any] = [
                "label": label,
                "commitStart": commitStart, "commitEnd": commitEnd,
                "layoutStart": layoutStart, "layoutEnd": layoutEnd,
                "diffStart": diffStart, "diffEnd": diffEnd,
                "mutationsStart": mutationsStart, "mutationsEnd": mutationsEnd,
                "syncStart": syncStart, "syncEnd": syncEnd,
                "mutationCount": mutations.count,
                "creates": creates, "inserts": inserts,
                "deletes": deletes, "removes": removes, "updates": updates,
                "nodeCount": stats.nodeCount, "treeDepth": stats.depth,
                "rootTypes": newChildren.map { $0.family.elementType }.joined(separator: ", "),
                "affectedTypes": affectedTypes.sorted().joined(separator: ", "),
            ]

            // Layout sub-phase timings (yoga, text remeasure, read frames, scroll)
            if let layoutTimings = lastLayoutTimings {
                for (key, value) in layoutTimings {
                    timing[key] = value
                }
                lastLayoutTimings = nil
            }

            // Per-node timing arrays for flame graph visualization
            var diffElements: [Any] = []
            for entry in diffNodeTimings {
                diffElements.append(entry.type)
                diffElements.append(entry.start)
                diffElements.append(entry.end)
            }
            timing["diffNodes"] = diffElements

            var mutElements: [Any] = []
            for entry in mutationTimings {
                mutElements.append(entry.mutationType)
                mutElements.append(entry.elementType)
                mutElements.append(entry.start)
                mutElements.append(entry.end)
            }
            timing["mutationNodes"] = mutElements

            let combinedLayout = lastLayoutNodeTimings + syncNodeTimings
            var layoutElements: [Any] = []
            for entry in combinedLayout {
                layoutElements.append(entry.type)
                layoutElements.append(entry.start)
                layoutElements.append(entry.end)
            }
            timing["layoutNodes"] = layoutElements
            lastLayoutNodeTimings = []

            timing["attachStart"] = attachStart
            timing["attachEnd"] = attachEnd
            timing["preparePaintStart"] = preparePaintStart
            timing["preparePaintEnd"] = preparePaintEnd

            // Capture screenshot after every paint (SSR reveals, prerender, React commits)
            let screenshotStart = performanceNow()
            onCommitPainted?()
            let screenshotEnd = performanceNow()
            timing["screenshotStart"] = screenshotStart
            timing["screenshotEnd"] = screenshotEnd

            onTimingCollected?(timing)
        } else {
            // Capture screenshot after every paint (SSR reveals, prerender, React commits)
            onCommitPainted?()
        }
    }

    // MARK: - Layout

    /// Computes tree statistics (total node count and max depth).
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

    /// Recursively syncs every UIView's frame with per-node timing collection.
    func syncAllFrames(
        _ nodes: [ShadowNodeWrapper],
        tracing: Bool,
        nodeTimings: inout [(type: String, start: Double, end: Double)]
    ) {
        for node in nodes {
            let nodeStart = tracing ? performanceNow() : 0

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
                let nodeEnd = performanceNow()
                nodeTimings.append((node.family.elementType, nodeStart, nodeEnd))
            }
        }
    }

    /// Calculate layout using Yoga. Uses a persistent root YGNode that survives
    /// across commits, preserving layout caches for unchanged subtrees.
    @discardableResult
    func calculateLayout(for children: [ShadowNodeWrapper], in bounds: CGRect, tracing: Bool = false) -> CGSize {
        guard !children.isEmpty else { return .zero }

        // 1. Get or create persistent root node
        let rootNode: YGNodeRef
        if let existing = rootYogaNode {
            rootNode = existing
        } else {
            rootNode = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeStyleSetFlexDirection(rootNode, .column)
            rootYogaNode = rootNode
        }

        // Update width (may change on rotation)
        YGNodeStyleSetWidth(rootNode, Float(bounds.width))

        // 2. Update root's children using YGNodeSetChildren.
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
        let yogaStart = tracing ? performanceNow() : 0
        YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)

        // 3b. Post-layout text re-measurement
        let textRemeasureStart = tracing ? performanceNow() : 0
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
        let textRemeasureEnd = tracing ? performanceNow() : 0
        let yogaEnd = tracing ? performanceNow() : 0

        // Read content size from root (which has unbounded height)
        let yogaHeight = CGFloat(YGNodeLayoutGetHeight(rootNode))

        // 4. Walk tree reading layout results into layoutFrame
        let readFramesStart = tracing ? performanceNow() : 0
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
        let readFramesEnd = tracing ? performanceNow() : 0
        let contentSize = CGSize(
            width: CGFloat(YGNodeLayoutGetWidth(rootNode)),
            height: max(yogaHeight, actualHeight)
        )

        // 4b. Compute scroll content sizes for overflow:scroll/auto nodes
        let scrollStart = tracing ? performanceNow() : 0
        for child in children {
            ShadowTreeLayout.computeScrollContentSizes(for: child)
        }
        let scrollEnd = tracing ? performanceNow() : 0

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

    // MARK: - Teardown

    /// Cleans up Yoga root node and root view.
    func teardown() {
        if let rootYoga = rootYogaNode {
            YGNodeRemoveAllChildren(rootYoga)
            YGNodeFree(rootYoga)
            rootYogaNode = nil
        }
        rootView?.removeFromSuperview()
        rootView = nil
        currentTree = []
    }
}
