import Foundation
import CoreGraphics
import Yoga

#if canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// BoundaryManager
//
// Tracks Suspense boundaries during SSR instruction processing and handles
// streaming reveals. When a boundary is opened, the tree builder redirects
// output to the boundary's fallback buffer. When content arrives via
// segments, it's buffered. When a reveal instruction (X) arrives, the
// fallback is swapped for the real content.
// ---------------------------------------------------------------------------

/// Represents a pending Suspense boundary during SSR.
public struct PendingBoundary {
    /// Unique boundary ID from the instruction stream
    public let id: Int

    /// Nodes rendered as the fallback content
    public var fallbackNodes: [ShadowNodeWrapper] = []

    /// Nodes rendered as the real content (nil until segment arrives)
    public var contentNodes: [ShadowNodeWrapper]? = nil

    /// Parent node in the tree where this boundary is inserted
    public weak var parentNode: ShadowNodeWrapper?

    /// Index among siblings where the boundary sits
    public var insertionIndex: Int = 0

    /// Whether this boundary has been revealed
    public var isRevealed: Bool = false
}

public class BoundaryManager {

    /// All tracked boundaries, keyed by ID
    private var boundaries: [Int: PendingBoundary] = [:]

    /// Stack of active boundary contexts (for nesting)
    private var boundaryStack: [Int] = []

    /// Stack tracking whether we're in a fallback or segment context
    public enum BoundaryContext {
        case fallback(id: Int)
        case segment(id: Int)
    }
    private var contextStack: [BoundaryContext] = []

    /// The tree builder to redirect output to
    private weak var treeBuilder: ShadowTreeBuilder?

    /// Buffers: when inside a boundary, nodes go here instead of the main tree
    private var fallbackBuffers: [Int: [ShadowNodeWrapper]] = [:]
    private var segmentBuffers: [Int: [ShadowNodeWrapper]] = [:]

    /// Callback for when a boundary is revealed and views need updating
    public var onBoundaryRevealed: ((Int, [ShadowNodeWrapper], [ShadowNodeWrapper]) -> Void)?

    // MARK: - Initialization

    public init(treeBuilder: ShadowTreeBuilder? = nil) {
        self.treeBuilder = treeBuilder
    }

    // MARK: - Public API

    /// Whether we're currently inside a boundary context (fallback or segment).
    public var isInsideBoundary: Bool {
        return !contextStack.isEmpty
    }

    /// The current boundary context, if any.
    public var currentBoundaryId: Int? {
        return boundaryStack.last
    }

    /// Begin a new Suspense boundary. Content after this until endBoundary
    /// is the fallback.
    public func beginBoundary(id: Int) {
        var boundary = PendingBoundary(id: id)
        boundary.insertionIndex = 0 // Will be set when inserted into tree
        boundaries[id] = boundary
        boundaryStack.append(id)
        contextStack.append(.fallback(id: id))
        fallbackBuffers[id] = []
    }

    /// End the current boundary's fallback region.
    public func endBoundary() {
        guard let context = contextStack.popLast(),
              case .fallback(let id) = context else {
            print("[BoundaryManager] Warning: endBoundary called without matching beginBoundary")
            return
        }

        // Store the fallback nodes
        if let fallbackNodes = fallbackBuffers[id] {
            boundaries[id]?.fallbackNodes = fallbackNodes
        }
        fallbackBuffers.removeValue(forKey: id)
        _ = boundaryStack.popLast()
    }

    /// Begin a completed segment for a boundary.
    public func beginSegment(id: Int) {
        contextStack.append(.segment(id: id))
        segmentBuffers[id] = []
    }

    /// End the current segment.
    public func endSegment() {
        guard let context = contextStack.popLast(),
              case .segment(let id) = context else {
            print("[BoundaryManager] Warning: endSegment called without matching beginSegment")
            return
        }

        // Store the segment content as the boundary's real content
        if let segmentNodes = segmentBuffers[id] {
            boundaries[id]?.contentNodes = segmentNodes
        }
        segmentBuffers.removeValue(forKey: id)
    }

    /// Reveal a boundary — swap fallback for real content.
    public func revealBoundary(id: Int) {
        guard var boundary = boundaries[id] else {
            print("[BoundaryManager] Warning: revealBoundary called for unknown boundary \(id)")
            return
        }

        guard let contentNodes = boundary.contentNodes else {
            print("[BoundaryManager] Warning: revealBoundary called but no content for boundary \(id)")
            return
        }

        boundary.isRevealed = true
        boundaries[id] = boundary

        // Notify that views need updating
        onBoundaryRevealed?(id, boundary.fallbackNodes, contentNodes)
    }

    /// Mark a boundary for client rendering (error case).
    public func clientRenderBoundary(id: Int, errorDigest: String?) {
        // The fallback stays visible; React will handle this boundary client-side
        print("[BoundaryManager] Boundary \(id) will be client-rendered. Digest: \(errorDigest ?? "none")")
    }

    /// Get the current buffer to write nodes into (fallback, segment, or nil for main tree).
    public func currentBuffer() -> BoundaryContext? {
        return contextStack.last
    }

    /// Append a node to the current boundary context's buffer.
    public func appendNode(_ node: ShadowNodeWrapper) {
        guard let context = contextStack.last else { return }

        switch context {
        case .fallback(let id):
            fallbackBuffers[id, default: []].append(node)
        case .segment(let id):
            segmentBuffers[id, default: []].append(node)
        }
    }

    /// Check if a boundary has been registered.
    public func hasBoundary(id: Int) -> Bool {
        return boundaries[id] != nil
    }

    /// Get all pending (unrevealed) boundary IDs.
    public var pendingBoundaryIds: [Int] {
        return boundaries.filter { !$0.value.isRevealed }.map { $0.key }
    }

    /// Number of boundaries that have been revealed.
    public var revealedCount: Int {
        return boundaries.values.filter { $0.isRevealed }.count
    }

    /// Reset all state.
    public func reset() {
        boundaries.removeAll()
        boundaryStack.removeAll()
        contextStack.removeAll()
        fallbackBuffers.removeAll()
        segmentBuffers.removeAll()
    }

    /// Explicitly set fallback nodes for a boundary (when built into main tree).
    public func setFallbackNodes(id: Int, nodes: [ShadowNodeWrapper]) {
        boundaries[id]?.fallbackNodes = nodes
    }

    /// Explicitly set content nodes for a boundary (from segment builder).
    public func setContentNodes(id: Int, nodes: [ShadowNodeWrapper]) {
        boundaries[id]?.contentNodes = nodes
    }
}
