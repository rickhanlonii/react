import UIKit
import ShadowTree
import Yoga

// ---------------------------------------------------------------------------
// SSRCoordinator
//
// Coordinates the SSR instruction stream by acting as the
// InstructionStreamDelegate. Routes instructions to the ShadowTreeBuilder
// for tree construction and BoundaryManager for Suspense boundaries.
//
// For streaming Suspense:
// - During B.../B (fallback): nodes build into the main tree for immediate
//   display. The coordinator tracks which nodes are fallback for later swap.
// - During S.../S (segment): nodes build into a separate ShadowTreeBuilder.
//   Content is stored for the boundary reveal.
// - On X (reveal): fallback nodes are replaced with content nodes in the
//   shadow tree + Yoga tree, layout is recalculated, and views are updated.
// ---------------------------------------------------------------------------

class SSRCoordinator: InstructionStreamDelegate {

    private let treeBuilder: ShadowTreeBuilder
    private let boundaryManager: BoundaryManager
    private weak var rootView: UIView?

    /// Separate tree builders for segment content (one per boundary ID)
    private var segmentBuilders: [Int: ShadowTreeBuilder] = [:]

    /// The #suspense wrapper node for each boundary ID
    private var boundaryWrappers: [Int: ShadowNodeWrapper] = [:]

    /// Content nodes built by segment builders (for insertion on reveal)
    private var segmentContentNodes: [Int: [ShadowNodeWrapper]] = [:]

    /// Called after a boundary reveal updates the shadow tree.
    /// Provides both old and new root children for diffing (not full rebuild).
    var onViewsNeedUpdate: ((_ oldRootChildren: [ShadowNodeWrapper], _ newRootChildren: [ShadowNodeWrapper]) -> Void)?

    /// Tracks the current root children across boundary reveals.
    /// Starts as nil (uses treeBuilder.rootChildren), updated after each reveal.
    private(set) var currentRootChildren: [ShadowNodeWrapper]?

    /// Called after a boundary reveal completes, providing the boundary ID.
    /// Used to notify the JS side so React can fire retry callbacks.
    var onBoundaryRevealed: ((Int) -> Void)?

    /// Called when a boundary is ready to reveal. Root.swift controls timing (throttle).
    var onBoundaryRevealQueued: ((Int, [ShadowNodeWrapper]) -> Void)?

    /// Called when a JS instruction is received from the SSR stream.
    /// Used to evaluate JavaScript code in the JSC engine.
    var onJavaScriptReceived: ((String) -> Void)?

    /// Called when the SSR stream has fully completed (all data received and parsed,
    /// including D instructions that arrive after root complete).
    var onStreamComplete: (() -> Void)?

    /// Called when a bootstrap script URL is received from the SSR stream.
    var onBootstrapURLReceived: ((String) -> Void)?

    /// Called when postponed state is received from the prerender stream.
    var onPostponedStateReceived: ((Data) -> Void)?

    init(
        treeBuilder: ShadowTreeBuilder,
        boundaryManager: BoundaryManager,
        rootView: UIView
    ) {
        self.treeBuilder = treeBuilder
        self.boundaryManager = boundaryManager
        self.rootView = rootView
    }

    // MARK: - Active Builder

    /// Returns the appropriate tree builder for the current context.
    /// During segment context, routes to the segment's dedicated builder.
    /// During fallback or outside boundaries, routes to the main builder.
    private var activeBuilder: ShadowTreeBuilder {
        if let context = boundaryManager.currentBuffer() {
            if case .segment(let id) = context {
                return segmentBuilders[id] ?? treeBuilder
            }
        }
        return treeBuilder
    }

    // MARK: - InstructionStreamDelegate

    func didReceiveOpenElement(type: String, props: [String: Any]) {
        activeBuilder.openElement(type: type, props: props)
    }

    func didReceiveTextNode(text: String) {
        activeBuilder.textNode(text: text)
    }

    func didReceiveCloseElement() {
        activeBuilder.closeElement()
    }

    func didReceiveBeginBoundary(id: Int) {
        // Create a #suspense wrapper node in the tree so React's hydration
        // can match this position via canHydrateSuspenseInstance.
        // Fallback content will be added as children of the #suspense node.
        // Note: fallback=false because that flag indicates an ERROR boundary
        // (server-side error triggering client render), not a pending boundary.
        activeBuilder.openElement(type: "#suspense", props: ["pending": true, "fallback": false, "boundaryId": id])
        boundaryManager.beginBoundary(id: id)
    }

    func didReceiveEndBoundary() {
        // Capture boundary ID before popping context
        var boundaryId: Int? = nil
        if let context = boundaryManager.currentBuffer(),
           case .fallback(let id) = context {
            boundaryId = id
        }

        // The #suspense node is currently on top of the tree builder's stack.
        // Capture a reference before closeElement() pops it.
        if let id = boundaryId {
            boundaryWrappers[id] = activeBuilder.currentParent
        }

        // Close the #suspense wrapper — pops from stack, appends to parent
        activeBuilder.closeElement()

        // Pop the boundary context
        boundaryManager.endBoundary()

        // Store fallback nodes (children of the #suspense wrapper)
        if let id = boundaryId, let wrapper = boundaryWrappers[id] {
            boundaryManager.setFallbackNodes(id: id, nodes: wrapper.children)
        }
    }

    func didReceiveBeginSegment(id: Int) {
        // Create a separate tree builder for this segment's content.
        // This ensures segment nodes don't get mixed into the main tree.
        let builder = ShadowTreeBuilder(
            surfaceId: treeBuilder.surfaceId,
            viewportWidth: treeBuilder.viewportWidth,
            viewportHeight: treeBuilder.viewportHeight
        )
        segmentBuilders[id] = builder
        boundaryManager.beginSegment(id: id)
    }

    func didReceiveEndSegment() {
        // Capture segment ID before popping context
        var segmentId: Int? = nil
        if let context = boundaryManager.currentBuffer(),
           case .segment(let id) = context {
            segmentId = id
        }

        // Pop the context
        boundaryManager.endSegment()

        // Store the segment builder's root children as content nodes
        if let id = segmentId, let builder = segmentBuilders[id] {
            segmentContentNodes[id] = builder.rootChildren
            boundaryManager.setContentNodes(id: id, nodes: builder.rootChildren)
            // Keep segmentBuilders[id] alive — yoga nodes must survive until reveal
        }
    }

    // MARK: - Segment Content Access

    /// Returns the assembled content nodes for a given boundary ID (for use by Root.swift during reveal).
    /// Resolves any #placeholder markers by splicing in sub-segment content.
    func segmentContentNodes(for boundaryId: Int) -> [ShadowNodeWrapper]? {
        let assembled = assembleContentNodes(for: boundaryId)
        return assembled.isEmpty ? nil : assembled
    }

    /// Assembles the final content nodes for a segment by resolving any
    /// #placeholder markers. Placeholders reference sub-segments whose content
    /// should be spliced in at that position. Resolves placeholders at all
    /// levels of the tree, not just top-level — Fizz may wrap segment content
    /// in container elements (e.g., a <div> containing async children) where
    /// placeholders appear as nested children.
    private func assembleContentNodes(for segmentId: Int) -> [ShadowNodeWrapper] {
        guard let nodes = segmentContentNodes[segmentId] else { return [] }
        var assembled: [ShadowNodeWrapper] = []
        for node in nodes {
            if node.family.elementType == "#placeholder",
               let subSegmentId = node.props["segmentId"] as? Int {
                // Replace placeholder with sub-segment content (recursive)
                let subContent = assembleContentNodes(for: subSegmentId)
                assembled.append(contentsOf: subContent)
            } else {
                // Recursively resolve any placeholders in children
                resolveNestedPlaceholders(in: node)
                assembled.append(node)
            }
        }
        return assembled
    }

    /// Recursively resolves #placeholder children within a node's subtree
    /// by replacing them with the actual sub-segment content.
    private func resolveNestedPlaceholders(in node: ShadowNodeWrapper) {
        var resolved: [ShadowNodeWrapper] = []
        var didReplace = false
        for child in node.children {
            if child.family.elementType == "#placeholder",
               let subSegmentId = child.props["segmentId"] as? Int {
                let subContent = assembleContentNodes(for: subSegmentId)
                resolved.append(contentsOf: subContent)
                didReplace = true
            } else {
                // Recurse into children of non-placeholder nodes
                resolveNestedPlaceholders(in: child)
                resolved.append(child)
            }
        }
        if didReplace {
            // Update the node's children with resolved content
            node.children = resolved
            // Update Yoga tree: remove all children and re-insert
            while YGNodeGetChildCount(node.yogaNode) > 0 {
                YGNodeRemoveChild(node.yogaNode, YGNodeGetChild(node.yogaNode, 0)!)
            }
            for (index, child) in resolved.enumerated() {
                if let owner = YGNodeGetOwner(child.yogaNode) {
                    YGNodeRemoveChild(owner, child.yogaNode)
                }
                YGNodeInsertChild(node.yogaNode, child.yogaNode, index)
            }
        }
    }

    /// Collects all sub-segment IDs referenced by #placeholder nodes in a segment's content,
    /// including placeholders nested inside container elements.
    private func collectSubSegmentIds(for segmentId: Int) -> [Int] {
        guard let nodes = segmentContentNodes[segmentId] else { return [] }
        var ids: [Int] = []
        collectSubSegmentIdsRecursive(in: nodes, ids: &ids)
        return ids
    }

    /// Recursively finds all #placeholder nodes and collects their segment IDs.
    private func collectSubSegmentIdsRecursive(in nodes: [ShadowNodeWrapper], ids: inout [Int]) {
        for node in nodes {
            if node.family.elementType == "#placeholder",
               let subId = node.props["segmentId"] as? Int {
                ids.append(subId)
                // Also collect sub-segments referenced within this sub-segment
                if let subNodes = segmentContentNodes[subId] {
                    collectSubSegmentIdsRecursive(in: subNodes, ids: &ids)
                }
            } else {
                // Check children for nested placeholders
                collectSubSegmentIdsRecursive(in: node.children, ids: &ids)
            }
        }
    }

    // MARK: - Reveal Processing

    /// Executes the visual update for a boundary reveal (called from Root.swift after throttle).
    func processReveal(id: Int) {
        let contentNodes = assembleContentNodes(for: id)
        let subSegmentIds = collectSubSegmentIds(for: id)
        guard let wrapper = boundaryWrappers[id] else {
            return
        }
        let oldRootChildren = currentRootChildren ?? treeBuilder.rootChildren
        let newRootChildren = ShadowTreeBuilder.revealBoundaryImmutable(
            rootChildren: oldRootChildren, suspenseNode: wrapper, contentNodes: contentNodes
        )
        currentRootChildren = newRootChildren
        boundaryWrappers.removeValue(forKey: id)
        segmentBuilders.removeValue(forKey: id)
        segmentContentNodes.removeValue(forKey: id)

        // Clean up sub-segments
        for subId in subSegmentIds {
            segmentBuilders.removeValue(forKey: subId)
            segmentContentNodes.removeValue(forKey: subId)
        }

        boundaryManager.revealBoundary(id: id)
        onViewsNeedUpdate?(oldRootChildren, newRootChildren)
    }

    /// Cleans up SSR state for a revealed boundary without triggering a visual update.
    /// Used post-hydration when reveals are applied to the current committed tree
    /// (via Bindings.revealBoundaryInCurrentTree) instead of the SSR coordinator's tree.
    func cleanupRevealState(id: Int) {
        let subSegmentIds = collectSubSegmentIds(for: id)

        boundaryWrappers.removeValue(forKey: id)
        segmentBuilders.removeValue(forKey: id)
        segmentContentNodes.removeValue(forKey: id)

        for subId in subSegmentIds {
            segmentBuilders.removeValue(forKey: subId)
            segmentContentNodes.removeValue(forKey: subId)
        }

        boundaryManager.revealBoundary(id: id)
    }

    func didReceiveRevealBoundary(id: Int) {
        print("[ReactDomNativeKit] Reveal boundary \(id)")
        let contentNodes = assembleContentNodes(for: id)
        guard boundaryWrappers[id] != nil else { return }
        onBoundaryRevealQueued?(id, contentNodes)
    }

    func didReceiveRootComplete() {
        treeBuilder.rootComplete()
    }

    func didReceivePlaceholder(id: Int) {
        // Insert a marker node in the active segment builder at this position.
        // The marker records which sub-segment's content should be spliced here.
        // Resolved before reveal in assembleContentNodes(for:).
        activeBuilder.openElement(type: "#placeholder", props: ["segmentId": id])
        activeBuilder.closeElement()
    }

    func didReceiveJavaScript(code: String) {
        onJavaScriptReceived?(code)
    }

    func didReceiveClientRenderBoundary(id: Int, errorDigest: String?) {
        boundaryManager.clientRenderBoundary(id: id, errorDigest: errorDigest)
    }

    func didReceiveBootstrapURL(_ url: String) {
        onBootstrapURLReceived?(url)
    }

    func didReceivePostponedState(data: Data) {
        onPostponedStateReceived?(data)
    }

    func didReceiveFormStateMarker(isMatching: Bool) {
        activeBuilder.didReceiveFormStateMarker(isMatching: isMatching)
    }

    func didReceiveError(_ error: Error) {
        print("[SSR] Parse error: \(error)")
    }
}

// ---------------------------------------------------------------------------
// SSRStreamDelegate
//
// URLSession delegate that feeds streaming data chunks to the
// InstructionStreamParser as they arrive from the server.
// ---------------------------------------------------------------------------

class SSRStreamDelegate: NSObject, URLSessionDataDelegate {

    private let parser: InstructionStreamParser
    private let onComplete: (() -> Void)?

    init(parser: InstructionStreamParser, onComplete: (() -> Void)? = nil) {
        self.parser = parser
        self.onComplete = onComplete
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        parser.receive(data: data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            print("[SSR] Stream error: \(error)")
            parser.delegate?.didReceiveError(error)
        } else {
            parser.finish()
        }
        onComplete?()
    }
}
