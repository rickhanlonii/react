import Foundation
import UIKit
import ShadowTree
import JSEngine
import Yoga

// ---------------------------------------------------------------------------
// Bindings
//
// Registers all $$-prefixed functions via the JSEngine protocol. These
// functions implement the persistent-mode shadow node protocol that the
// React reconciler's host config calls into.
//
// Node identity crosses the JS↔Swift boundary as opaque JS objects that
// wrap direct Swift pointers via wrapNativeObject/unwrapNativeObject.
// No dictionary lookups — O(1) access on every bridge call.
//
// Threading: All calls are synchronous on the main thread. The engine,
// shadow tree, Yoga layout, and UIKit all share the main thread.
//
// Exception: $$appendChild dispatches speculative Yoga layout on a
// concurrent background queue for completed subtrees. Leaf nodes are
// skipped. Ancestor deduplication ensures only disjoint subtrees compute
// concurrently — when a parent is scheduled, pending children are removed,
// and inflight children cause the parent to skip. $$completeRoot waits
// for all speculative layouts before running root layout.
//
// Exception: $$fetch is asynchronous. The call returns immediately, and
// URLSession performs the HTTP request on a background thread. Response
// chunks are delivered via callbacks dispatched to the main thread.
// ---------------------------------------------------------------------------

public class Bindings {

    // MARK: - Properties

    public let engine: JSEngine
    public let viewRegistry: ViewRegistry
    public let differentiator: Differentiator
    public let mutationApplier: UIKitMutationApplier

    /// Handles event dispatch between native UIKit views and the JS runtime.
    let eventDispatcher: EventDispatcher

    /// Whether native commit timing collection is enabled (toggled by JS via $$setNativeTracingEnabled).
    var nativeTracingEnabled = false

    /// Whether speculative background layout is enabled. When true, $$appendChild
    /// dispatches Yoga layout for completed subtrees on a background queue. Toggled
    /// via the debug menu.
    var speculativeLayoutEnabled = true

    /// Performance tracer for reporting commit timings directly from Swift.
    /// Set by JSRuntime after initialization.
    var tracer: PerformanceTracer?

    /// Callback used by Swift to send inspector messages to the dev server.
    /// Wired by Root to the HotReloadClient WebSocket.
    public var sendInspectorMessage: ((String) -> Void)?

    /// Concurrent background queue for speculative Yoga layout during reconciliation.
    /// Independent subtrees compute in parallel; ancestor dedup prevents overlap.
    let speculativeLayoutQueue = DispatchQueue(
        label: "com.react-dom-native.speculative-layout",
        attributes: .concurrent
    )

    /// Tracks in-flight speculative layout tasks. $$completeRoot waits on this
    /// before running root layout to ensure all speculative work is complete.
    let speculativeLayoutGroup = DispatchGroup()

    /// Yoga nodes scheduled for speculative layout but not yet started.
    /// Protected by speculativeLock. When a parent is scheduled, its
    /// descendants are removed — the parent's layout encompasses them.
    var pendingSpeculativeNodes: Set<UnsafeRawPointer> = []

    /// Yoga nodes currently mid-computation on the concurrent queue.
    /// Protected by speculativeLock. Parent tasks check this to avoid
    /// computing a subtree while a child task is still writing to it.
    var inflightSpeculativeNodes: Set<UnsafeRawPointer> = []

    /// Yoga nodes that completed speculative layout this commit.
    /// Protected by speculativeLock. When a parent is about to be
    /// scheduled, we check if any of its children already completed —
    /// if so, skip the parent (root layout uses their cached results).
    /// Combined with barrier dispatch for pending/inflight children.
    var completedSpeculativeNodes: Set<UnsafeRawPointer> = []

    /// Per-node DispatchGroups for speculative layout ordering.
    /// When a parent's children are in-flight, the parent waits on their
    /// groups instead of using a global barrier — allowing unrelated
    /// siblings to compute in parallel. Protected by speculativeLock.
    var speculativeNodeGroups: [UnsafeRawPointer: DispatchGroup] = [:]

    /// Lock protecting pendingSpeculativeNodes, inflightSpeculativeNodes,
    /// completedSpeculativeNodes, and speculativeNodeGroups.
    /// os_unfair_lock is the fastest option — no syscall in the uncontended case.
    var speculativeLock = os_unfair_lock()

    /// Current tree per surface. Keyed by surfaceId.
    var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Persistent Yoga root nodes per surface. Survives across commits so
    /// Yoga's incremental layout can skip unchanged subtrees — children that
    /// remain in the tree keep their cached layout results.
    var rootYogaNodes: [Int: YGNodeRef] = [:]

    /// Root UIViews per surface. Keyed by surfaceId.
    var rootViews: [Int: UIView] = [:]

    /// SSR trees registered for hydration traversal. Keyed by surfaceId.
    var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Surfaces where hydration is in progress. Set when hydration starts,
    /// cleared on first $$completeRoot.
    var hydrationInProgress: Set<Int> = []

    /// SSR commit timings to report when tracing starts. Accumulated by Root during
    /// SSR first paint and boundary reveals, then pushed to JS when tracing is enabled.
    var pendingSSRCommitTimings: [[String: Any]] = []

    /// Maps SSR nodes to their parent for resilient sibling lookups.
    /// When a boundary reveal replaces the SSR tree, nodes from the old tree
    /// can still find siblings via their parent reference.
    var ssrNodeToParent: [ObjectIdentifier: ShadowNodeWrapper] = [:]

    /// Called when hydration completes for a surface (first $$completeRoot).
    /// Root uses this to clean up SSR infrastructure (parser, tree builder, etc.).
    public var onHydrationComplete: ((Int) -> Void)?

    /// Provides the Renderer for a given surfaceId. Defaults to looking up
    /// ReactRuntime.shared, but standalone consumers (e.g. LayoutCompare) can
    /// override this to provide their own Renderer.
    public var rendererForSurface: ((Int) -> Renderer?)?

    /// Counter for inspector-specific node IDs (document, body wrapper nodes).
    var inspectorNodeIdCounter = 900000

    /// When enabled, captures a screenshot at the end of each $$completeRoot commit
    /// and sends it as screenshot-data. Toggled by the inspector proxy during tracing.
    var commitScreenshotsEnabled = false
    var commitScreenshotMaxWidth: Int = 300
    var commitScreenshotQuality: CGFloat = 0.4

    // MARK: - DevTools Node Registry

    /// Maps integer node IDs to ShadowNodeWrapper instances for DevTools only.
    /// Populated lazily when DevTools requests the DOM tree. The hot path
    /// (create/clone/append/complete) bypasses this entirely, using opaque
    /// JS handles for O(1) access.
    var devToolsNodeRegistry: [Int: ShadowNodeWrapper] = [:]
    var devToolsNextNodeId = 1

    /// Maps integer child set IDs to arrays of ShadowNodeWrappers.
    var childSetRegistry: [Int: [ShadowNodeWrapper]] = [:]
    var nextChildSetId = 1

    // MARK: - Initialization

    public init(engine: JSEngine) {
        self.engine = engine
        self.viewRegistry = ViewRegistry()
        self.differentiator = Differentiator()
        self.mutationApplier = UIKitMutationApplier(viewRegistry: viewRegistry)
        self.eventDispatcher = EventDispatcher(engine: engine, viewRegistry: viewRegistry)

        registerBindingFunctions()
        registerEventPriorityConstants()

        // Wire event dispatcher after init to avoid capturing self before initialization
        self.mutationApplier.dispatchEvent = { [weak self] view, eventType, payload in
            self?.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
        }
    }

    // MARK: - Binding Function Registration

    private func registerBindingFunctions() {
        registerNodeCreation()
        registerCloneOperations()
        registerTreeConstruction()
        registerContainerOperations()
        registerMeasurement()
        registerEventHandling()
        registerNetworking()
        registerHydrationTraversal()
    }

    // MARK: - Surface Management

    /// Registers a root UIView for a surface. The scroll view is created by the
    /// Renderer; this just installs the tap gesture recognizer and tracks the surface.
    public func registerSurface(surfaceId: Int, rootView: UIView) {
        // The Renderer has already created the scroll view.
        // Find it and install the tap gesture for event dispatch.
        if let scrollView = rootView.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView {
            rootViews[surfaceId] = scrollView
            mutationApplier.installRootTapGesture(on: scrollView)
        }
    }

    /// Returns the current shadow tree for a surface, or nil if not registered.
    public func currentTree(forSurface surfaceId: Int) -> [ShadowNodeWrapper]? {
        return currentTrees[surfaceId]
    }

    /// Unregisters a surface and cleans up its tree and views.
    public func unregisterSurface(surfaceId: Int) {
        rootViews[surfaceId]?.removeFromSuperview()
        rootViews.removeValue(forKey: surfaceId)
        currentTrees.removeValue(forKey: surfaceId)
        if let rootYoga = rootYogaNodes.removeValue(forKey: surfaceId) {
            YGNodeRemoveAllChildren(rootYoga)
            YGNodeFree(rootYoga)
        }
    }

    // MARK: - Speculative Layout Helpers

    /// Recursively cleans up trailing old yoga children from nodes that
    /// used the swap optimization (previousYogaChildren). Called once
    /// before speculative layout wait in $$completeRoot.
    func cleanupTrailingYogaChildren(_ nodes: [ShadowNodeWrapper]) {
        for node in nodes {
            if let prevChildren = node.previousYogaChildren {
                let expectedCount = UInt32(node.children.count)
                while YGNodeGetChildCount(node.yogaNode) > expectedCount {
                    let lastIdx = YGNodeGetChildCount(node.yogaNode) - 1
                    if let trailing = YGNodeGetChild(node.yogaNode, lastIdx) {
                        YGNodeRemoveChild(node.yogaNode, trailing)
                    }
                }
                node.previousYogaChildren = nil
            }
            cleanupTrailingYogaChildren(node.children)
        }
    }

    /// Recursively removes all Yoga descendants of `yogaNode` from
    /// pendingSpeculativeNodes. Called with speculativeLock held.
    func removeDescendantsFromPending(_ yogaNode: YGNodeRef) {
        let childCount = YGNodeGetChildCount(yogaNode)
        for i in 0..<childCount {
            guard let child = YGNodeGetChild(yogaNode, i) else { continue }
            let key = UnsafeRawPointer(child)
            pendingSpeculativeNodes.remove(key)
            removeDescendantsFromPending(child)
        }
    }
}
