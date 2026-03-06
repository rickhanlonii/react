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

    /// Performance tracer for reporting commit timings directly from Swift.
    /// Set by JSRuntime after initialization.
    var tracer: PerformanceTracer?

    /// Callback used by Swift to send inspector messages to the dev server.
    /// Wired by Root to the HotReloadClient WebSocket.
    public var sendInspectorMessage: ((String) -> Void)?

    /// Serial background queue for speculative Yoga layout during reconciliation.
    let speculativeLayoutQueue = DispatchQueue(label: "com.react-dom-native.speculative-layout")

    /// Tracks in-flight speculative layout tasks. $$completeRoot waits on this
    /// before running root layout to ensure all speculative work is complete.
    let speculativeLayoutGroup = DispatchGroup()

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
}
