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
// Node identity crosses the JS↔Swift boundary as integer IDs. The
// nodeRegistry maps these IDs to ShadowNodeWrapper instances. This
// decouples the ShadowTree from any engine-specific bridging requirements
// (no @objc, no NSObject, no JSC protocol conformance).
//
// Threading: All calls are synchronous on the main thread. The engine,
// shadow tree, Yoga layout, and UIKit all share the main thread.
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

    /// Sub-phase timings from the most recent calculateYogaLayout call (when tracing).
    var lastLayoutTimings: [String: Double]?

    /// Sync frame timings from the most recent $$completeRoot call (when tracing).
    var lastSyncTimings: (start: Double, end: Double)?

    /// Per-node layout timings from the most recent calculateYogaLayout call (when tracing).
    var lastLayoutNodeTimings: [(type: String, start: Double, end: Double)] = []

    /// Callback used by Swift to send inspector messages to the dev server.
    /// Wired by Root to the HotReloadClient WebSocket.
    public var sendInspectorMessage: ((String) -> Void)?

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

    /// Counter for inspector-specific node IDs (document, body wrapper nodes).
    /// Shadow tree nodes use their nodeRegistry IDs directly.
    var inspectorNodeIdCounter = 900000

    // MARK: - Node Registry

    /// Maps integer node IDs to ShadowNodeWrapper instances.
    /// Nodes cross the JS↔Swift boundary as integer IDs.
    var nodeRegistry: [Int: ShadowNodeWrapper] = [:]
    var nextNodeId = 1

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

    /// Registers a root UIView for a surface. Must be called before the
    /// renderer commits to this surface.
    public func registerSurface(surfaceId: Int, rootView: UIView) {
        let scrollView = UIScrollView(frame: rootView.bounds)
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrollView.contentInsetAdjustmentBehavior = .automatic
        rootView.addSubview(scrollView)
        rootViews[surfaceId] = scrollView
        currentTrees[surfaceId] = []
        mutationApplier.installRootTapGesture(on: scrollView)
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
}
