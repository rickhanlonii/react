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
// The render() method loads the framework JS bundle from the package's own
// resources and then calls renderFromURL() on the JS side to fetch the RSC
// stream from the server.
// ---------------------------------------------------------------------------

/// Options for configuring a Root.
public struct RootOptions {
    /// Called when a recoverable error occurs during rendering.
    public var onRecoverableError: ((Error) -> Void)?

    /// Called when an uncaught error occurs.
    public var onUncaughtError: ((Error) -> Void)?

    /// Surface ID for this root (default: 1). Use different IDs for multiple roots.
    public var surfaceId: Int

    public init(
        surfaceId: Int = 1,
        onRecoverableError: ((Error) -> Void)? = nil,
        onUncaughtError: ((Error) -> Void)? = nil
    ) {
        self.surfaceId = surfaceId
        self.onRecoverableError = onRecoverableError
        self.onUncaughtError = onUncaughtError
    }
}

/// A root container for a React tree rendered to native views.
///
/// Create a root with `ReactDomNativeKit.createRoot(_:)` or
/// `ReactDomNativeKit.createRoot(_:options:)`.
public class Root {

    // MARK: - Static Configuration

    /// Optional URL for loading the bundle from a dev server instead of
    /// the package resource. Set this in DEBUG builds to enable hot reload.
    ///
    /// Example:
    /// ```swift
    /// #if DEBUG
    /// Root.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
    /// #endif
    /// ```
    public static var devBundleURL: URL?

    // MARK: - Properties

    /// The container view this root renders into.
    public let container: UIView

    /// The options this root was created with.
    public let options: RootOptions

    /// Whether this root has been unmounted.
    public private(set) var isUnmounted: Bool = false

    /// The underlying JS runtime (internal implementation detail).
    private var runtime: JSRuntime?

    /// Layout observer for viewport size changes.
    private var layoutObserver: NSKeyValueObservation?

    // MARK: - Initialization

    /// Creates a new root. Use `ReactDomNativeKit.createRoot()` instead.
    internal init(container: UIView, options: RootOptions = RootOptions()) {
        self.container = container
        self.options = options
    }

    // MARK: - Public API

    /// Renders React content by loading the framework bundle from the package.
    ///
    /// This loads and executes the framework JS bundle (embedded in the
    /// ReactDomNativeKit package), then calls `renderFromURL` on the JS side
    /// to fetch and render the RSC stream from the server.
    ///
    /// In DEBUG builds, if `Root.devBundleURL` is set, the bundle is loaded
    /// from that URL instead (for hot reload support).
    ///
    /// - Parameters:
    ///   - serverURL: URL of the RSC server (e.g. "http://localhost:6000").
    ///     After the bundle is evaluated, Swift calls
    ///     `globalThis.__REACT_DOM_NATIVE__.renderFromURL(serverURL, {surfaceId})`.
    ///   - completion: Called when rendering starts or fails.
    ///     - `nil` error means bundle loaded and executed successfully
    ///     - Non-nil error describes what went wrong
    public func render(serverURL: String, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            completion?(RootError.alreadyUnmounted)
            return
        }

        // Create runtime if needed
        if runtime == nil {
            runtime = JSRuntime()

            // Set up error handler if provided
            if let onError = options.onUncaughtError {
                runtime?.engine.exceptionHandler = { message, _ in
                    onError(RootError.jsException(message))
                }
            }

            // Register surface
            runtime?.bindings.registerSurface(surfaceId: options.surfaceId, rootView: container)

            // Observe layout changes
            setupLayoutObserver()
        }

        // Load and execute bundle, then trigger renderFromURL
        let bundleURL = resolveBundleURL()
        loadBundle(from: bundleURL) { [weak self] result in
            switch result {
            case .success(let source):
                self?.executeBundle(source: source, sourceURL: bundleURL)
                self?.callRenderFromURL(serverURL: serverURL)
                completion?(nil)
            case .failure(let error):
                print("[ReactDomNativeKit] Failed to load bundle: \(error)")
                self?.options.onRecoverableError?(error)
                completion?(error)
            }
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

        // Unregister surface
        runtime?.bindings.unregisterSurface(surfaceId: options.surfaceId)

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

        // Release runtime
        runtime = nil

        print("[ReactDomNativeKit] Root unmounted")
    }

    // MARK: - Internal

    /// Updates the viewport size. Called automatically on layout changes.
    internal func updateViewportSize() {
        runtime?.updateViewportSize(
            width: container.bounds.width,
            height: container.bounds.height
        )
    }

    /// Reloads the JS bundle. Used for hot reload.
    ///
    /// - Parameters:
    ///   - serverURL: URL of the RSC server.
    ///   - completion: Called when reload completes or fails.
    public func reload(serverURL: String, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            completion?(RootError.alreadyUnmounted)
            return
        }

        // Tear down existing runtime
        runtime?.bindings.unregisterSurface(surfaceId: options.surfaceId)
        container.subviews.forEach { $0.removeFromSuperview() }
        runtime = nil

        // Clean up SSR state (if any)
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

        // Recreate runtime (same logic as render())
        runtime = JSRuntime()
        if let onError = options.onUncaughtError {
            runtime?.engine.exceptionHandler = { message, _ in
                onError(RootError.jsException(message))
            }
        }
        runtime?.bindings.registerSurface(surfaceId: options.surfaceId, rootView: container)
        updateViewportSize()

        // Load and execute new bundle, then trigger renderFromURL
        let bundleURL = resolveBundleURL()
        loadBundle(from: bundleURL) { [weak self] result in
            switch result {
            case .success(let source):
                self?.executeBundle(source: source, sourceURL: bundleURL)
                self?.callRenderFromURL(serverURL: serverURL)
                completion?(nil)
            case .failure(let error):
                print("[ReactDomNativeKit] Failed to reload bundle: \(error)")
                self?.options.onRecoverableError?(error)
                completion?(error)
            }
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
    ///   - serverURL: URL of the RSC server (e.g. "http://localhost:6000").
    ///   - comp    d when SSR content is first displayed or an error occurs.
    public func renderWithSSR(serverURL: String, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            completion?(RootError.alreadyUnmounted)
            return
        }

        // Set up SSR infrastructure
        let treeBuilder = ShadowTreeBuilder(
            surfaceId: options.surfaceId,
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
                // Views haven't been created yet (root complete hasn't fired).
                // This shouldn't happen because reveals come after root complete
                // in the SSR stream, but guard defensively.
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
        guard let ssrURL = URL(string: serverURL + "/ssr") else {
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
    /// 1. Loads the JS bundle and boots the React runtime
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

        guard let treeBuilder = ssrTreeBuilder else {
            print("[ReactDomNativeKit] Warning: No SSR tree to hydrate. Call renderWithSSR() first.")
            completion?(RootError.runtimeNotInitialized)
            return
        }

        // Create runtime if needed
        if runtime == nil {
            runtime = JSRuntime()

            if let onError = options.onUncaughtError {
                runtime?.engine.exceptionHandler = { message, _ in
                    onError(RootError.jsException(message))
                }
            }

            setupLayoutObserver()

            // Wire hydration completion callback to clean up SSR infrastructure
            runtime?.bindings.onHydrationComplete = { [weak self] surfaceId in
                self?.cleanupSSRState()
            }

            // DON'T rewire onViewsNeedUpdate to Bindings yet — boundary reveals
            // may still arrive from the SSR stream before hydration starts.
            // Keep them on the SSR path so they update the shadow tree without
            // creating CSR views. We'll rewire after hydration starts.
        }

        // Wire boundary reveal callback — when the SSR stream reveals a
        // boundary after hydration has registered retry callbacks, notify
        // the JS side so React can render the resolved content.
        ssrCoordinator?.onBoundaryRevealed = { [weak self] boundaryId in
            guard let self = self, let engine = self.runtime?.engine else { return }
            let js = "globalThis.$$notifyBoundaryRevealed(\(boundaryId))"
            engine.evaluate(js)
        }

        // Load and execute bundle, then hydrate once SSR stream is complete.
        // Bundle loading happens in parallel with the SSR stream — but the
        // actual hydration call waits for the stream to finish so that all
        // D instructions (Flight data) have been buffered.
        let bundleURL = resolveBundleURL()
        loadBundle(from: bundleURL) { [weak self] result in
            switch result {
            case .success(let source):
                self?.executeBundle(source: source, sourceURL: bundleURL)

                let doHydrate = {
                    guard let self = self else { return }

                    print("[ReactDomNativeKit] Hydration starting")

                    // NOW register surface for hydration and the SSR tree,
                    // after all boundary reveals have been applied.
                    let currentSSRTree = self.ssrCoordinator?.currentRootChildren ?? treeBuilder.rootChildren
                    print("[ReactDomNativeKit] Registering SSR tree for hydration: \(currentSSRTree.count) root children")
                    self.runtime?.bindings.registerSurfaceForHydration(
                        surfaceId: self.options.surfaceId,
                        rootView: self.container,
                        ssrTree: currentSSRTree,
                        ssrViewRegistry: self.ssrViewRegistry ?? ViewRegistry()
                    )
                    self.runtime?.bindings.registerSSRTree(
                        surfaceId: self.options.surfaceId,
                        rootChildren: currentSSRTree
                    )

                    // Now rewire onViewsNeedUpdate to Bindings — from this point,
                    // any boundary reveals go through Bindings for proper diffing.
                    let surfaceId = self.options.surfaceId
                    self.ssrCoordinator?.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
                        guard let self = self, let bindings = self.runtime?.bindings else { return }
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

                    self.runtime?.bindings.markHydrationStarted(surfaceId: self.options.surfaceId)
                    self.callHydrateFromSSRData(serverURL: serverURL)
                    completion?(nil)
                }

                if self?.ssrStreamComplete == true {
                    doHydrate()
                } else {
                    // SSR stream still delivering — queue hydration for when it finishes
                    self?.pendingHydration = doHydrate
                }

            case .failure(let error):
                print("[ReactDomNativeKit] Hydration failed to load bundle: \(error)")
                self?.options.onRecoverableError?(error)
                completion?(error)
            }
        }
    }

    /// Calls the JS-side hydrateFromURL after the framework bundle has been evaluated.
    private func callHydrateFromURL(serverURL: String) {
        let js = "globalThis.__REACT_DOM_NATIVE__.hydrateFromURL('\(serverURL)', {surfaceId: \(options.surfaceId)})"
        runtime?.engine.evaluate(js)
    }

    /// Calls the JS-side hydrateFromSSRData with buffered Flight rows.
    /// Falls back to hydrateFromURL if no D instructions were received.
    private func callHydrateFromSSRData(serverURL: String) {
        guard !ssrFlightDataBuffer.isEmpty else {
            callHydrateFromURL(serverURL: serverURL)
            return
        }
        guard let jsonData = try? JSONSerialization.data(withJSONObject: ssrFlightDataBuffer),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            callHydrateFromURL(serverURL: serverURL)
            return
        }
        let js = "globalThis.__REACT_DOM_NATIVE__.hydrateFromSSRData('\(serverURL)', \(jsonString), {surfaceId: \(options.surfaceId)})"
        runtime?.engine.evaluate(js)
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
        ssrMutationApplier = nil
        ssrRevealHasOccurred = false
        ssrStreamComplete = false
        pendingHydration = nil

        print("[ReactDomNativeKit] SSR state cleaned up after hydration")
    }

    /// Resolves the bundle URL: dev server override (DEBUG) or package resource.
    private func resolveBundleURL() -> URL {
        #if DEBUG
        if let devURL = Root.devBundleURL {
            print("[ReactDomNativeKit] DEBUG — loading bundle from \(devURL)")
            return devURL
        }
        #endif

        guard let resourceURL = Bundle.module.url(
            forResource: "bundle",
            withExtension: "js"
        ) else {
            fatalError("[ReactDomNativeKit] bundle.js not found in package resources. Run `npm run build` from the example directory.")
        }
        return resourceURL
    }

    private func setupLayoutObserver() {
        // Observe bounds changes to update viewport size
        layoutObserver = container.observe(\.bounds, options: [.new]) { [weak self] _, _ in
            self?.updateViewportSize()
        }

        // Initial size update
        updateViewportSize()
    }

    private func loadBundle(from url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        if url.isFileURL {
            loadLocalBundle(from: url, completion: completion)
        } else {
            downloadRemoteBundle(from: url, completion: completion)
        }
    }

    private func loadLocalBundle(from url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        do {
            let source = try String(contentsOf: url, encoding: .utf8)
            completion(.success(source))
        } catch {
            completion(.failure(RootError.bundleLoadFailed(error)))
        }
    }

    private func downloadRemoteBundle(from url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(RootError.downloadFailed(error)))
                    return
                }

                guard let data = data,
                      let source = String(data: data, encoding: .utf8) else {
                    completion(.failure(RootError.invalidBundleData))
                    return
                }

                completion(.success(source))
            }
        }.resume()
    }

    private func executeBundle(source: String, sourceURL: URL) {
        runtime?.engine.evaluate(source, sourceURL: sourceURL)
    }

    /// Calls the JS-side renderFromURL after the framework bundle has been evaluated.
    private func callRenderFromURL(serverURL: String) {
        let js = "globalThis.__REACT_DOM_NATIVE__.renderFromURL('\(serverURL)', {surfaceId: \(options.surfaceId)})"
        runtime?.engine.evaluate(js)
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
        }
    }
}
