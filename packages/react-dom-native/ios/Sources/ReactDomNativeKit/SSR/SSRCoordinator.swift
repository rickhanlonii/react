import UIKit
import ShadowTree

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
    private var flightDataBuffer: [String]

    /// Separate tree builders for segment content (one per boundary ID)
    private var segmentBuilders: [Int: ShadowTreeBuilder] = [:]

    /// Tracks where in the main tree each boundary's fallback was inserted
    private struct BoundaryPosition {
        weak var parentNode: ShadowNodeWrapper?
        let startChildIndex: Int
    }
    private var boundaryPositions: [Int: BoundaryPosition] = [:]

    /// Fallback nodes captured from the main tree (for later removal)
    private var boundaryFallbackNodes: [Int: [ShadowNodeWrapper]] = [:]

    /// Content nodes built by segment builders (for insertion on reveal)
    private var segmentContentNodes: [Int: [ShadowNodeWrapper]] = [:]

    /// Called after a boundary reveal updates the shadow tree.
    /// Provides the updated root children for view recreation.
    var onViewsNeedUpdate: (([ShadowNodeWrapper]) -> Void)?

    init(
        treeBuilder: ShadowTreeBuilder,
        boundaryManager: BoundaryManager,
        rootView: UIView,
        flightDataBuffer: [String]
    ) {
        self.treeBuilder = treeBuilder
        self.boundaryManager = boundaryManager
        self.rootView = rootView
        self.flightDataBuffer = flightDataBuffer
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
        // Record where in the main tree this boundary starts so we can
        // identify which nodes are the fallback content later.
        let parent = treeBuilder.currentParent
        let startIndex = parent?.children.count ?? treeBuilder.rootChildren.count
        boundaryPositions[id] = BoundaryPosition(
            parentNode: parent,
            startChildIndex: startIndex
        )
        boundaryManager.beginBoundary(id: id)
    }

    func didReceiveEndBoundary() {
        // Capture boundary ID before popping context
        var boundaryId: Int? = nil
        if let context = boundaryManager.currentBuffer(),
           case .fallback(let id) = context {
            boundaryId = id
        }

        // Pop the context (this clears BoundaryManager's empty fallback buffer)
        boundaryManager.endBoundary()

        // Capture the actual fallback nodes from the main tree
        if let id = boundaryId, let position = boundaryPositions[id] {
            var fallbackNodes: [ShadowNodeWrapper] = []
            if let parent = position.parentNode {
                if position.startChildIndex < parent.children.count {
                    fallbackNodes = Array(parent.children[position.startChildIndex...])
                }
            } else {
                if position.startChildIndex < treeBuilder.rootChildren.count {
                    fallbackNodes = Array(treeBuilder.rootChildren[position.startChildIndex...])
                }
            }
            boundaryFallbackNodes[id] = fallbackNodes
            // Also store in BoundaryManager for its tracking
            boundaryManager.setFallbackNodes(id: id, nodes: fallbackNodes)
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

    func didReceiveRevealBoundary(id: Int) {
        let fallbackNodes = boundaryFallbackNodes[id] ?? []
        let contentNodes = segmentContentNodes[id] ?? []
        let position = boundaryPositions[id]

        // Replace fallback nodes with content nodes in the shadow + yoga trees
        treeBuilder.revealBoundary(
            parentNode: position?.parentNode,
            fallbackNodes: fallbackNodes,
            contentNodes: contentNodes,
            atIndex: position?.startChildIndex ?? 0
        )

        // Clean up tracking state
        boundaryPositions.removeValue(forKey: id)
        boundaryFallbackNodes.removeValue(forKey: id)
        segmentContentNodes.removeValue(forKey: id)
        segmentBuilders.removeValue(forKey: id)

        boundaryManager.revealBoundary(id: id)

        // Notify Root to rebuild views from updated tree
        onViewsNeedUpdate?(treeBuilder.rootChildren)
    }

    func didReceiveRootComplete() {
        treeBuilder.rootComplete()
    }

    func didReceivePlaceholder(id: Int) {
        print("[SSR] Placeholder \(id)")
    }

    func didReceiveFlightData(row: String) {
        flightDataBuffer.append(row)
    }

    func didReceiveClientRenderBoundary(id: Int, errorDigest: String?) {
        boundaryManager.clientRenderBoundary(id: id, errorDigest: errorDigest)
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

    init(parser: InstructionStreamParser) {
        self.parser = parser
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
    }
}
