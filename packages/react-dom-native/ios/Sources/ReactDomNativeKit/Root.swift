import UIKit
import JSEngine
import ShadowTree
import Yoga

// ---------------------------------------------------------------------------
// Root
//
// A "root" is the top-level container for a React tree. This API mirrors
// react-dom/client's createRoot/root.render pattern:
//
//   // react-dom (JavaScript)
//   import { createRoot } from 'react-dom/client';
//   const root = createRoot(container);
//   root.render(<App />);
//   root.unmount();
//
//   // ReactDomNativeKit (Swift)
//   import ReactDomNativeKit
//   let root = ReactDomNativeKit.createRoot(container)
//   root.render(serverURL: "http://localhost:6000") { error in
//       if let error = error { print("Failed: \(error)") }
//   }
//   root.unmount()
//
// Root is a lightweight surface handle. The single JSContext and shared
// infrastructure (bundle, devtools, hot reload) are owned by ReactRuntime.
// ---------------------------------------------------------------------------

/// Options for configuring a Root.
public struct RootOptions {
    /// Called when a recoverable error occurs during rendering.
    public var onRecoverableError: ((Error) -> Void)?

    /// Called when an uncaught error occurs.
    public var onUncaughtError: ((Error) -> Void)?

    public init(
        onRecoverableError: ((Error) -> Void)? = nil,
        onUncaughtError: ((Error) -> Void)? = nil
    ) {
        self.onRecoverableError = onRecoverableError
        self.onUncaughtError = onUncaughtError
    }
}

/// A root container for a React tree rendered to native views.
///
/// Create a root with `ReactDomNativeKit.createRoot(_:)` or
/// `ReactDomNativeKit.createRoot(_:options:)`.
public class Root {

    // MARK: - Properties

    /// The container view this root renders into.
    public let container: UIView

    /// The options this root was created with.
    public let options: RootOptions

    /// Whether this root has been unmounted.
    public private(set) var isUnmounted: Bool = false

    /// Surface ID assigned by ReactRuntime (nil until registered).
    private var surfaceId: Int?

    /// Layout observer for viewport size changes.
    private var layoutObserver: NSKeyValueObservation?

    /// Tracks the original render mode for reload recovery.
    private enum RenderMode {
        case csr(serverURL: String)
        case ssr(ssrURL: String, flightURL: String)
    }
    private var renderMode: RenderMode?

    /// Whether this root was rendered using SSR + hydration.
    internal var isSSR: Bool {
        if case .ssr = renderMode { return true }
        return false
    }

    // MARK: - Initialization

    /// Creates a new root. Use `ReactDomNativeKit.createRoot()` instead.
    internal init(container: UIView, options: RootOptions = RootOptions()) {
        self.container = container
        self.options = options
    }

    // MARK: - Public API

    /// Renders React content by loading the framework bundle from the package.
    ///
    /// This boots the shared ReactRuntime (if needed), registers this root
    /// as a surface, then calls `renderFromURL` on the JS side to fetch
    /// and render the RSC stream from the server.
    ///
    /// - Parameters:
    ///   - serverURL: URL of the RSC server (e.g. "http://localhost:6000").
    ///   - completion: Called when rendering starts or fails.
    public func render(serverURL: String, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            completion?(RootError.alreadyUnmounted)
            return
        }

        let rt = ReactRuntime.shared

        // Boot the shared runtime (no-op if already booted)
        rt.boot { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                print("[ReactDomNativeKit] Failed to boot runtime: \(error)")
                self.options.onRecoverableError?(error)
                completion?(error)
                return
            }

            // Register surface if not yet registered
            if self.surfaceId == nil {
                self.surfaceId = rt.registerSurface(root: self, container: self.container)
                self.setupLayoutObserver()
            }

            // Trigger renderFromURL on JS side
            rt.renderSurface(surfaceId: self.surfaceId!, serverURL: serverURL)
            self.renderMode = .csr(serverURL: serverURL)
            completion?(nil)
        }
    }

    /// Unmounts the React tree and cleans up resources.
    ///
    /// After calling unmount(), the root cannot be used again.
    /// Create a new root if you need to render again.
    public func unmount() {
        guard !isUnmounted else { return }

        isUnmounted = true

        // Clean up layout observer
        layoutObserver?.invalidate()
        layoutObserver = nil

        // Unregister surface from shared runtime
        if let surfaceId = surfaceId {
            ReactRuntime.shared.unregisterSurface(surfaceId: surfaceId)
        }

        // Clear container
        container.subviews.forEach { $0.removeFromSuperview() }

        // Clean up SSR state
        ssrDataTask?.cancel()
        ssrDataTask = nil
        ssrParser = nil
        ssrTreeBuilder = nil
        ssrBoundaryManager = nil
        ssrCoordinator = nil
        ssrFlightDataBuffer.removeAll()
        ssrViewRegistry = nil
        ssrMutationApplier = nil
        ssrRevealHasOccurred = false
        ssrStreamComplete = false
        pendingHydration = nil

        surfaceId = nil

        print("[ReactDomNativeKit] Root unmounted")
    }

    // MARK: - Internal

    /// Updates the viewport size. Called automatically on layout changes.
    internal func updateViewportSize() {
        ReactRuntime.shared.updateViewportSize(
            width: container.bounds.width,
            height: container.bounds.height
        )
    }

    /// Re-renders the surface using its original render mode (CSR or SSR+hydration).
    /// Called by ReactRuntime during a full reset reload.
    internal func rerender() {
        guard !isUnmounted else { return }

        // Reset surface ID so render/renderWithSSR re-registers
        surfaceId = nil
        layoutObserver?.invalidate()
        layoutObserver = nil

        // Clean up any SSR state from previous render
        ssrDataTask?.cancel()
        ssrDataTask = nil
        ssrParser = nil
        ssrTreeBuilder = nil
        ssrBoundaryManager = nil
        ssrCoordinator = nil
        ssrFlightDataBuffer.removeAll()
        ssrViewRegistry = nil
        ssrMutationApplier = nil
        ssrRevealHasOccurred = false
        ssrStreamComplete = false
        pendingHydration = nil

        // Clear container
        container.subviews.forEach { $0.removeFromSuperview() }

        switch renderMode {
        case .csr(let serverURL):
            print("[Root] Re-rendering (CSR) — \(serverURL)")
            render(serverURL: serverURL)

        case .ssr(let ssrURL, let flightURL):
            print("[Root] Re-rendering (SSR + hydration) — \(ssrURL)")
            renderWithSSR(serverURL: ssrURL) { [weak self] error in
                if let error = error {
                    print("[Root] SSR re-render failed: \(error)")
                } else {
                    self?.hydrateRoot(serverURL: flightURL) { error in
                        if let error = error {
                            print("[Root] Hydration after re-render failed: \(error)")
                        }
                    }
                }
            }

        case .none:
            print("[Root] No render mode recorded, skipping re-render")
        }
    }

    // MARK: - SSR Rendering

    /// SSR coordinator (non-nil while SSR is active)
    private var ssrParser: InstructionStreamParser?
    private var ssrTreeBuilder: ShadowTreeBuilder?
    private var ssrBoundaryManager: BoundaryManager?
    private var ssrCoordinator: SSRCoordinator?
    private var ssrDataTask: URLSessionDataTask?
    private var ssrFlightDataBuffer: [String] = []
    private var ssrViewRegistry: ViewRegistry?
    private var ssrMutationApplier: UIKitMutationApplier?
    private var ssrRevealHasOccurred: Bool = false
    private var ssrStreamComplete: Bool = false
    /// Queued hydration call waiting for SSR stream to complete (so D instructions are buffered).
    private var pendingHydration: (() -> Void)?

    /// SSR URL used for the initial render (stored for reload recovery).
    private var ssrURL: String?

    /// Renders using server-side rendering for instant display.
    ///
    /// Pipeline:
    /// 1. Start URLSession data task for /ssr endpoint
    /// 2. As data arrives, feed chunks to InstructionStreamParser
    /// 3. Parser builds shadow tree and creates UIKit views (immediate display)
    /// 4. In background: load JS bundle, boot React runtime
    /// 5. React renders → $$completeRoot → atomic swap → interactive
    ///
    /// - Parameters:
    ///   - serverURL: URL of the SSR server (e.g. "http://localhost:6001").
    ///   - completion: Called when SSR content is first displayed or an error occurs.
    public func renderWithSSR(serverURL: String, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            completion?(RootError.alreadyUnmounted)
            return
        }

        ssrURL = serverURL

        // Assign a surfaceId eagerly (SSR needs it before boot completes).
        // Use reserveSurface — don't register with bindings yet. The actual
        // bindings registration happens in hydrateRoot via registerSurfaceForHydration.
        if surfaceId == nil {
            let rt = ReactRuntime.shared
            surfaceId = rt.reserveSurface(root: self, container: container)
            setupLayoutObserver()
        }

        // Set up SSR infrastructure
        let treeBuilder = ShadowTreeBuilder(
            surfaceId: surfaceId!,
            viewportWidth: Float(container.bounds.width > 0 ? container.bounds.width : 390),
            viewportHeight: Float(container.bounds.height > 0 ? container.bounds.height : 844)
        )

        let boundaryManager = BoundaryManager(treeBuilder: treeBuilder)
        let parser = InstructionStreamParser()

        // Set up the SSR coordinator as the delegate
        let coordinator = SSRCoordinator(
            treeBuilder: treeBuilder,
            boundaryManager: boundaryManager,
            rootView: container
        )
        coordinator.onFlightDataReceived = { [weak self] row in
            self?.ssrFlightDataBuffer.append(row)
        }
        parser.delegate = coordinator

        // Wire boundary reveal callback — when streaming content arrives
        // and replaces fallback, diff old vs new trees for minimal mutations
        // instead of rebuilding all views from scratch.
        coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
            guard let self = self else { return }
            self.ssrRevealHasOccurred = true

            guard let applier = self.ssrMutationApplier,
                  let registry = self.ssrViewRegistry else {
                return
            }

            // Find the scroll view that holds the SSR views
            guard let scrollView = self.container.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView else { return }

            // 1. Calculate layout on the new tree
            let width = Float(self.container.bounds.width > 0 ? self.container.bounds.width : 390)
            let rootYogaNode = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeStyleSetFlexDirection(rootYogaNode, .column)
            YGNodeStyleSetWidth(rootYogaNode, width)

            // Insert new tree's root children into temp yoga root
            for (index, child) in newRootChildren.enumerated() {
                if let owner = YGNodeGetOwner(child.yogaNode) {
                    YGNodeRemoveChild(owner, child.yogaNode)
                }
                YGNodeInsertChild(rootYogaNode, child.yogaNode, index)
            }

            ShadowTreeLayout.performLayout(
                rootYogaNode: rootYogaNode,
                children: newRootChildren,
                width: width,
                height: .nan
            )

            YGNodeRemoveAllChildren(rootYogaNode)
            YGNodeFree(rootYogaNode)

            // 2. Diff old vs new tree
            let differentiator = Differentiator()
            let mutations = differentiator.diff(
                oldChildren: oldRootChildren,
                newChildren: newRootChildren,
                parent: nil
            )

            // 3. Apply mutations
            applier.applyMutations(mutations, rootView: scrollView)

            // 4. Sync all frames (reused nodes may have shifted positions)
            self.syncSSRFrames(newRootChildren)

            // 5. Attach new root-level views to scroll view
            for child in newRootChildren {
                if let view = registry.view(for: child.family) {
                    if view.superview == nil {
                        scrollView.addSubview(view)
                    }
                }
            }

            // 6. Update scroll content size
            let contentHeight = ShadowTreeLayout.computeActualContentHeight(for: newRootChildren)
            scrollView.contentSize = CGSize(
                width: scrollView.bounds.width,
                height: contentHeight
            )

            print("[ReactDomNativeKit] Boundary revealed — views updated via diff")
        }

        // Store references (coordinator must be retained — parser.delegate is weak)
        self.ssrParser = parser
        self.ssrTreeBuilder = treeBuilder
        self.ssrBoundaryManager = boundaryManager
        self.ssrCoordinator = coordinator

        // Handle root completion — first paint
        // Runs synchronously on the main queue (URLSession delegate queue)
        // to ensure views exist before any boundary reveal fires.
        treeBuilder.onRootComplete = { [weak self] rootChildren in
            guard let self = self else { return }

            // If a boundary reveal already ran before this callback,
            // the views are already correct — skip to avoid overwriting.
            guard !self.ssrRevealHasOccurred else {
                print("[ReactDomNativeKit] SSR root complete skipped — reveal already occurred")
                completion?(nil)
                return
            }

            // Create UIKit views from the shadow tree
            let viewRegistry = ViewRegistry()
            let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "MutationApplier SSR")
            self.ssrViewRegistry = viewRegistry
            self.ssrMutationApplier = applier

            // Generate mutations from the shadow tree and apply them.
            // For root-level nodes, we create + insert into the container.
            self.createViewsFromTree(rootChildren, applier: applier, rootView: self.container)

            print("[ReactDomNativeKit] SSR first paint complete (\(rootChildren.count) root children)")
            completion?(nil)

            // Hydration is now available via root.hydrateRoot(serverURL:)
            // called separately after renderWithSSR completes.
        }

        // Start streaming SSR data
        guard let ssrURL = URL(string: serverURL) else {
            completion?(RootError.downloadFailed(NSError(domain: "ReactDomNativeKit", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid SSR URL"])))
            return
        }

        let streamDelegate = SSRStreamDelegate(parser: parser) { [weak self] in
            guard let self = self else { return }
            self.ssrStreamComplete = true
            let revealCount = boundaryManager.revealedCount
            print("[ReactDomNativeKit] SSR stream complete, reveals processed: \(revealCount)")
            // If hydrateRoot() was called before the stream finished,
            // execute the queued hydration now that D instructions are buffered.
            if let pending = self.pendingHydration {
                self.pendingHydration = nil
                pending()
            }
        }

        let session = URLSession(
            configuration: .default,
            delegate: streamDelegate,
            delegateQueue: .main
        )
        let task = session.dataTask(with: ssrURL)
        self.ssrDataTask = task
        task.resume()
    }

    /// Hydrates SSR content by attaching React's runtime to the pre-rendered tree.
    ///
    /// Call this after `renderWithSSR()` completes its first paint. The hydration
    /// process:
    /// 1. Boots the shared ReactRuntime (if needed)
    /// 2. Registers the SSR tree for JS-side traversal
    /// 3. Fetches the RSC stream and hydrates against the SSR tree
    /// 4. Attaches event handlers — app becomes interactive
    ///
    /// - Parameters:
    ///   - serverURL: URL of the RSC server (e.g. "http://localhost:6000").
    ///   - completion: Called when hydration completes or fails.
    public func hydrateRoot(serverURL: String, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot hydrate an unmounted root.")
            completion?(RootError.alreadyUnmounted)
            return
        }

        // Store render mode for reload recovery
        renderMode = .ssr(ssrURL: ssrURL ?? "", flightURL: serverURL)

        guard let treeBuilder = ssrTreeBuilder else {
            print("[ReactDomNativeKit] Warning: No SSR tree to hydrate. Call renderWithSSR() first.")
            completion?(RootError.runtimeNotInitialized)
            return
        }

        let rt = ReactRuntime.shared

        // Boot the shared runtime (no-op if already booted)
        rt.boot { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                print("[ReactDomNativeKit] Failed to boot runtime for hydration: \(error)")
                self.options.onRecoverableError?(error)
                completion?(error)
                return
            }

            // Wire hydration completion callback to clean up SSR infrastructure
            rt.bindings?.onHydrationComplete = { [weak self] surfaceId in
                self?.cleanupSSRState()
            }

            // Wire boundary reveal callback — when the SSR stream reveals a
            // boundary after hydration has registered retry callbacks, notify
            // the JS side so React can render the resolved content.
            self.ssrCoordinator?.onBoundaryRevealed = { [weak self] boundaryId in
                guard let engine = rt.engine else { return }
                let js = "globalThis.$$notifyBoundaryRevealed(\(boundaryId))"
                engine.evaluate(js)
            }

            let doHydrate = { [weak self] in
                guard let self = self, let surfaceId = self.surfaceId else { return }

                print("[ReactDomNativeKit] Hydration starting")

                // Register surface for hydration and the SSR tree
                let currentSSRTree = self.ssrCoordinator?.currentRootChildren ?? treeBuilder.rootChildren
                print("[ReactDomNativeKit] Registering SSR tree for hydration: \(currentSSRTree.count) root children")
                rt.registerSurfaceForHydration(
                    surfaceId: surfaceId,
                    rootView: self.container,
                    ssrTree: currentSSRTree,
                    ssrViewRegistry: self.ssrViewRegistry ?? ViewRegistry()
                )

                // Wire the SSR applier's event dispatch to Bindings so that
                // tap handlers on SSR-created buttons reach the JS runtime.
                if let bindings = rt.bindings {
                    self.ssrMutationApplier?.dispatchEvent = { view, eventType, payload in
                        bindings.dispatchEvent(from: view, eventType: eventType, payload: payload)
                    }
                }
                rt.bindings?.registerSSRTree(
                    surfaceId: surfaceId,
                    rootChildren: currentSSRTree
                )

                // Now rewire onViewsNeedUpdate to Bindings — from this point,
                // any boundary reveals go through Bindings for proper diffing.
                self.ssrCoordinator?.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
                    guard let self = self, let bindings = rt.bindings, let surfaceId = self.surfaceId else { return }
                    bindings.updateCurrentTree(
                        surfaceId: surfaceId,
                        oldTree: oldRootChildren,
                        newTree: newRootChildren
                    )
                    bindings.updateSSRTree(
                        surfaceId: surfaceId,
                        newTree: newRootChildren
                    )
                }

                rt.bindings?.markHydrationStarted(surfaceId: surfaceId)
                do {
                    try rt.hydrateSurface(
                        surfaceId: surfaceId,
                        serverURL: serverURL,
                        ssrData: self.ssrFlightDataBuffer
                    )
                    completion?(nil)
                } catch {
                    print("[ReactDomNativeKit] Hydration failed: \(error)")
                    self.options.onRecoverableError?(error)
                    completion?(error)
                }
            }

            if self.ssrStreamComplete {
                doHydrate()
            } else {
                // SSR stream still delivering — queue hydration for when it finishes
                self.pendingHydration = doHydrate
            }
        }
    }

    /// Creates UIKit views from the SSR shadow tree and adds them to the root view.
    private func createViewsFromTree(
        _ nodes: [ShadowNodeWrapper],
        applier: UIKitMutationApplier,
        rootView: UIView
    ) {
        // Use the Differentiator to generate CREATE + INSERT mutations,
        // then apply them via the mutation applier.
        var mutations: [Mutation] = []

        for node in nodes {
            collectCreateMutations(node: node, mutations: &mutations)
        }

        applier.applyMutations(mutations, rootView: rootView)

        // Create a scroll view wrapper (matching Bindings.registerSurface)
        let scrollView = UIScrollView(frame: rootView.bounds)
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrollView.contentInsetAdjustmentBehavior = .automatic
        rootView.addSubview(scrollView)

        // Add root-level views as subviews of the scroll view
        guard let registry = ssrViewRegistry else { return }
        for node in nodes {
            if let view = registry.view(for: node.family) {
                scrollView.addSubview(view)
            }
        }

        // Compute content height recursively (matching reconciler path).
        // Yoga can undercompute parent height when block children have margins
        // that extend beyond the flex container's computed height.
        let contentHeight = ShadowTreeLayout.computeActualContentHeight(for: nodes)

        // Set scroll content size for document-level scrolling
        scrollView.contentSize = CGSize(
            width: scrollView.bounds.width,
            height: contentHeight
        )
    }

    /// Recursively collects CREATE + INSERT mutations for a subtree.
    private func collectCreateMutations(
        node: ShadowNodeWrapper,
        mutations: inout [Mutation]
    ) {
        mutations.append(.create(node: node))

        for (index, child) in node.children.enumerated() {
            collectCreateMutations(node: child, mutations: &mutations)
            mutations.append(.insert(parent: node, child: child, index: index))
        }
    }

    /// Recursively syncs every SSR UIView's frame to match its node's layoutFrame.
    /// Mirrors Bindings.syncAllFrames for the SSR view hierarchy.
    private func syncSSRFrames(_ nodes: [ShadowNodeWrapper]) {
        guard let registry = ssrViewRegistry else { return }
        for node in nodes {
            if let view = registry.view(for: node.family) {
                if view.frame != node.layoutFrame {
                    view.frame = node.layoutFrame
                }
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }
            syncSSRFrames(node.children)
        }
    }

    // MARK: - Private

    /// Cleans up SSR infrastructure after hydration completes.
    /// Called from Bindings.onHydrationComplete after the first $$completeRoot.
    /// React now owns the tree — SSR objects are no longer needed.
    private func cleanupSSRState() {
        ssrDataTask?.cancel()
        ssrDataTask = nil
        ssrParser = nil
        ssrTreeBuilder = nil
        ssrBoundaryManager = nil
        ssrCoordinator = nil
        ssrFlightDataBuffer.removeAll()
        ssrViewRegistry = nil
        // Keep ssrMutationApplier alive — SSR-created buttons hold a weak
        // reference to it as their tap target. If deallocated, taps silently
        // stop working. It stays alive until the root is unmounted.
        ssrRevealHasOccurred = false
        ssrStreamComplete = false
        pendingHydration = nil

        print("[ReactDomNativeKit] SSR state cleaned up after hydration")
    }

    private func setupLayoutObserver() {
        // Observe bounds changes to update viewport size
        layoutObserver = container.observe(\.bounds, options: [.new]) { [weak self] _, _ in
            self?.updateViewportSize()
        }

        // Initial size update
        updateViewportSize()
    }
}

// MARK: - Errors

/// Errors that can occur during root operations.
public enum RootError: Error, CustomStringConvertible {
    case bundleLoadFailed(Error)
    case downloadFailed(Error)
    case invalidBundleData
    case jsException(String)
    case alreadyUnmounted
    case runtimeNotInitialized
    case hydrationDataMissing
    case hydrationDataSerializationFailed

    public var description: String {
        switch self {
        case .bundleLoadFailed(let error):
            return "Failed to load bundle: \(error.localizedDescription)"
        case .downloadFailed(let error):
            return "Failed to download bundle: \(error.localizedDescription)"
        case .invalidBundleData:
            return "Bundle data could not be decoded as UTF-8"
        case .jsException(let message):
            return "JavaScript exception: \(message)"
        case .alreadyUnmounted:
            return "Cannot render to an unmounted root"
        case .runtimeNotInitialized:
            return "Runtime not initialized - call render() first"
        case .hydrationDataMissing:
            return "No SSR Flight data received — ssrFlightDataBuffer is empty"
        case .hydrationDataSerializationFailed:
            return "Failed to serialize SSR Flight data to JSON"
        }
    }
}
