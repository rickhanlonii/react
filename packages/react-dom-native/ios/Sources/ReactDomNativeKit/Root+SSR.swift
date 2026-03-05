import UIKit
import JSEngine
import ShadowTree
import Yoga
import QuartzCore

// ---------------------------------------------------------------------------
// Root+SSR
//
// Server-side rendering, hydration, and related helper methods.
// Handles the SSR pipeline (streaming → shadow tree → UIKit views),
// hydration (attaching React runtime to pre-rendered tree), and
// post-hydration cleanup.
// ---------------------------------------------------------------------------

extension Root {

    // MARK: - Combined SSR + Hydration

    /// Starts the full SSR + hydration flow from a single URL.
    ///
    /// This combines the functionality of `renderWithSSR` (SSR streaming) and
    /// `hydrateRoot(serverURL:)` (hydration) into a single internal method.
    /// The bootstrap URL comes from the SSR stream's `["BOOT", url]` instruction.
    ///
    /// Called by the free function `hydrateRoot(view, url:)`.
    ///
    /// - Parameter url: URL of the SSR endpoint.
    internal func startHydration(url: String) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            return
        }

        ssrURL = url

        // Store render mode for hot reload recovery
        renderMode = .ssr(url: url)

        // Assign a surfaceId eagerly (SSR needs it before boot completes).
        if surfaceId == nil {
            let rt = ReactRuntime.shared
            surfaceId = rt.reserveSurface(root: self, container: container)
            setupLayoutObserver()
        }

        // Set up SSR infrastructure (same as renderWithSSR)
        let treeBuilder = ShadowTreeBuilder(
            surfaceId: surfaceId!,
            viewportWidth: Float(container.bounds.width > 0 ? container.bounds.width : 390),
            viewportHeight: Float(container.bounds.height > 0 ? container.bounds.height : 844)
        )

        let boundaryManager = BoundaryManager()
        let parser = InstructionStreamParser()

        let coordinator = SSRCoordinator(
            treeBuilder: treeBuilder,
            boundaryManager: boundaryManager,
            rootView: container
        )

        // Register root view for rendering and skip layout in tree builder
        // (Renderer will handle layout via commitTree)
        self.renderer.registerRootView(container)
        self.renderer.tracingEnabled = ReactRuntime.shared.isTracingActive
        treeBuilder.performLayoutOnComplete = false

        coordinator.onJavaScriptReceived = { [weak self] code in
            guard let self = self else { return }
            if self.hydrationStarted {
                ReactRuntime.shared.evaluateScript(code)
            } else {
                self.ssrJavaScriptBuffer.append(code)
            }
        }
        coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
            self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
        }

        // Wire bootstrap URL callback — when the stream provides the bundle URL,
        // boot the runtime and start the hydration flow.
        coordinator.onBootstrapURLReceived = { [weak self] bootstrapURL in
            guard let self = self else { return }
            print("[ReactDomNativeKit] Received bootstrap URL from SSR stream: \(bootstrapURL)")

            let rt = ReactRuntime.shared

            // Set the bundle URL from the stream (replaces manual devBundleURL)
            if let bundleURL = URL(string: bootstrapURL) {
                rt.devBundleURL = bundleURL
            }

            // Derive the dev server URL from the SSR URL
            // ssrURL is e.g. "http://localhost:6001/ssr/page"
            if let ssrURLObj = URL(string: url) {
                var components = URLComponents()
                components.scheme = ssrURLObj.scheme
                components.host = ssrURLObj.host
                components.port = ssrURLObj.port
                rt.devServerURL = components.url
            }

            // Boot the runtime (downloads the bundle from the URL above)
            rt.boot { [weak self] error in
                guard let self = self else { return }

                if let error = error {
                    print("[ReactDomNativeKit] Failed to boot runtime for hydration: \(error)")
                    self.options.onRecoverableError?(error)
                    return
                }

                // Wire hydration completion callback
                rt.bindings?.onHydrationComplete = { [weak self] surfaceId in
                    self?.onHydrationCommitted()
                }

                // Wire boundary reveal callback
                self.ssrCoordinator?.onBoundaryRevealed = { [weak self] boundaryId in
                    guard let self = self, let surfaceId = self.surfaceId else { return }
                    let contentNodes = self.ssrCoordinator?.segmentContentNodes(for: boundaryId) ?? []
                    rt.bindings?.revealBoundaryInSSRTree(
                        surfaceId: surfaceId, boundaryId: boundaryId, contentNodes: contentNodes
                    )
                    guard let engine = rt.engine else { return }
                    engine.evaluate("globalThis.$$notifyBoundaryRevealed(\(boundaryId))")
                }

                let doHydrate = { [weak self] in
                    guard let self = self, let surfaceId = self.surfaceId else { return }

                    self.hydrationStarted = true
                    print("[ReactDomNativeKit] Hydration starting")

                    // Switch renderer to Bindings' shared infrastructure
                    if let bindings = rt.bindings {
                        bindings.viewRegistry.merge(from: self.renderer.viewRegistry)
                        self.renderer.viewRegistry = bindings.viewRegistry
                        // Keep old mutation applier alive — SSR-created buttons hold
                        // a weak reference to it. Rewire its dispatchEvent to Bindings.
                        self.ssrMutationApplierRef = self.renderer.mutationApplier
                        self.renderer.mutationApplier.dispatchEvent = { view, eventType, payload in
                            bindings.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
                        }
                        // Create new mutation applier with Bindings' ViewRegistry for future commits
                        self.renderer.mutationApplier = UIKitMutationApplier(viewRegistry: bindings.viewRegistry, logPrefix: "MutationApplier CSR")
                        self.renderer.mutationApplier.dispatchEvent = { view, eventType, payload in
                            bindings.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
                        }
                        bindings.mutationApplier.installRootTapGesture(on: self.renderer.rootView!)
                    }

                    // Register surface for hydration and the SSR tree
                    let currentSSRTree = self.ssrCoordinator?.currentRootChildren ?? treeBuilder.rootChildren
                    print("[ReactDomNativeKit] Registering SSR tree for hydration: \(currentSSRTree.count) root children")
                    rt.registerSurfaceForHydration(
                        surfaceId: surfaceId,
                        rootView: self.container,
                        ssrTree: currentSSRTree,
                        ssrViewRegistry: self.renderer.viewRegistry
                    )

                    rt.bindings?.registerSSRTree(
                        surfaceId: surfaceId,
                        rootChildren: currentSSRTree
                    )

                    // Rewire onViewsNeedUpdate to go through Renderer
                    self.ssrCoordinator?.onViewsNeedUpdate = { [weak self] _, newRootChildren in
                        self?.renderer.commitTree(newChildren: newRootChildren, label: "SSR Reveal")
                    }

                    rt.bindings?.markHydrationStarted(surfaceId: surfaceId)

                    // Push accumulated SSR commit timings
                    if !self.ssrCommitTimings.isEmpty {
                        rt.bindings?.addSSRCommitTimings(self.ssrCommitTimings)
                        self.ssrCommitTimings.removeAll()
                    }

                    // Replay buffered JS instructions from the SSR stream
                    for code in self.ssrJavaScriptBuffer {
                        ReactRuntime.shared.evaluateScript(code)
                    }
                    self.ssrJavaScriptBuffer.removeAll()

                    rt.hydrateSurface(surfaceId: surfaceId)
                }

                if self.ssrShellComplete {
                    doHydrate()
                } else {
                    self.pendingHydration = doHydrate
                }
            }
        }

        parser.delegate = coordinator

        // Wire boundary reveal view updates (same as renderWithSSR)
        coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
            guard let self = self else { return }
            self.ssrRevealHasOccurred = true
            self.renderer.commitTree(newChildren: newRootChildren, label: "SSR Reveal")
        }

        // Store references
        self.ssrParser = parser
        self.ssrTreeBuilder = treeBuilder
        self.ssrBoundaryManager = boundaryManager
        self.ssrCoordinator = coordinator

        // Handle root completion — first paint
        treeBuilder.onRootComplete = { [weak self] rootChildren in
            guard let self = self else { return }

            guard !self.ssrRevealHasOccurred else {
                print("[ReactDomNativeKit] SSR root complete skipped — reveal already occurred")
                self.ssrShellComplete = true
                if let pending = self.pendingHydration {
                    self.pendingHydration = nil
                    pending()
                }
                return
            }

            self.renderer.commitTree(newChildren: rootChildren, label: "SSR First Paint")

            print("[ReactDomNativeKit] SSR first paint complete (\(rootChildren.count) root children)")
            self.shellPaintTime = performanceNow()
            self.ssrShellComplete = true

            if let pending = self.pendingHydration {
                self.pendingHydration = nil
                pending()
            }
        }

        // Start streaming SSR data
        guard let ssrURLObj = URL(string: url) else {
            print("[ReactDomNativeKit] Invalid SSR URL: \(url)")
            return
        }

        let streamDelegate = SSRStreamDelegate(parser: parser) { [weak self] in
            guard let self = self else { return }
            self.ssrStreamComplete = true
            let revealCount = boundaryManager.revealedCount
            print("[ReactDomNativeKit] SSR stream complete, reveals processed: \(revealCount)")

            if let pending = self.pendingHydration {
                self.pendingHydration = nil
                pending()
            }

            // Don't cleanup here — hydration may not have committed yet.
            // Pending reveals and ssrCoordinator are needed until hydration
            // flushes all deferred Suspense boundaries. Cleanup happens in
            // maybeCleanupSSRState() after both stream and hydration complete.
            self.maybeCleanupSSRState()
        }

        let session = URLSession(
            configuration: .default,
            delegate: streamDelegate,
            delegateQueue: .main
        )
        let task = session.dataTask(with: ssrURLObj)
        self.ssrDataTask = task
        task.resume()
    }

    // MARK: - Server-Only SSR (No Hydration)

    /// Starts the SSR streaming flow without hydration.
    ///
    /// This renders the server-generated instruction stream to native views
    /// but does NOT boot the JS runtime or attach React client-side.
    /// The result is a static view tree — Suspense boundaries are revealed
    /// as the stream progresses, but there is no interactivity.
    ///
    /// Called by the free function `serverOnlyRoot(view, url:)`.
    ///
    /// - Parameter url: URL of the SSR endpoint.
    internal func startServerOnly(url: String) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            return
        }

        ssrURL = url

        // Store render mode for hot reload recovery
        renderMode = .serverOnly(url: url)

        // Assign a surfaceId eagerly (SSR needs it before boot completes).
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

        let boundaryManager = BoundaryManager()
        let parser = InstructionStreamParser()

        let coordinator = SSRCoordinator(
            treeBuilder: treeBuilder,
            boundaryManager: boundaryManager,
            rootView: container
        )

        // Register root view for rendering and skip layout in tree builder
        self.renderer.registerRootView(container)
        treeBuilder.performLayoutOnComplete = false

        // Set SSR base URL for MPA form submission
        self.renderer.mutationApplier.ssrBaseURL = url

        // Wire MPA form response handler — replaces the entire tree
        self.renderer.mutationApplier.onMPAFormResponse = { [weak self] responseText in
            guard let self = self else { return }
            self.reloadFromSSRResponse(responseText)
        }

        // Ignore JS instructions — no hydration, no runtime
        coordinator.onJavaScriptReceived = { _ in }

        // Queue boundary reveals for throttled flushing
        coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
            self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
        }

        // No onBootstrapURLReceived — we don't boot the JS runtime

        // Derive the dev server URL so DevTools can connect
        let rt = ReactRuntime.shared
        if let ssrURLObj = URL(string: url) {
            var components = URLComponents()
            components.scheme = ssrURLObj.scheme
            components.host = ssrURLObj.host
            components.port = ssrURLObj.port
            rt.devServerURL = components.url
        }
        rt.setupDevToolsConnectionIfNeeded()

        parser.delegate = coordinator

        // Wire boundary reveal view updates
        coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
            guard let self = self else { return }
            self.ssrRevealHasOccurred = true
            self.renderer.commitTree(newChildren: newRootChildren, label: "Server-Only Reveal")
        }

        // Store references
        self.ssrParser = parser
        self.ssrTreeBuilder = treeBuilder
        self.ssrBoundaryManager = boundaryManager
        self.ssrCoordinator = coordinator

        // Handle root completion — first paint
        treeBuilder.onRootComplete = { [weak self] rootChildren in
            guard let self = self else { return }

            guard !self.ssrRevealHasOccurred else {
                print("[ReactDomNativeKit] Server-only root complete skipped — reveal already occurred")
                self.ssrShellComplete = true
                return
            }

            self.renderer.commitTree(newChildren: rootChildren, label: "Server-Only First Paint")

            print("[ReactDomNativeKit] Server-only first paint complete (\(rootChildren.count) root children)")
            self.shellPaintTime = performanceNow()
            self.ssrShellComplete = true
        }

        // Start streaming SSR data
        guard let ssrURLObj = URL(string: url) else {
            print("[ReactDomNativeKit] Invalid SSR URL: \(url)")
            return
        }

        let streamDelegate = SSRStreamDelegate(parser: parser) { [weak self] in
            guard let self = self else { return }
            self.ssrStreamComplete = true
            let revealCount = boundaryManager.revealedCount
            print("[ReactDomNativeKit] Server-only stream complete, reveals processed: \(revealCount)")
        }

        let session = URLSession(
            configuration: .default,
            delegate: streamDelegate,
            delegateQueue: .main
        )
        let task = session.dataTask(with: ssrURLObj)
        self.ssrDataTask = task
        task.resume()
    }

    // MARK: - MPA Form Response (Server-Only)

    /// Re-renders the Server Only tree from a new SSR instruction stream.
    /// Called when an MPA form POST returns a fresh instruction stream.
    internal func reloadFromSSRResponse(_ instructionStream: String) {
        // Remove all child views
        for subview in container.subviews {
            subview.removeFromSuperview()
        }

        // Reset SSR state
        ssrRevealHasOccurred = false
        ssrShellComplete = false
        ssrStreamComplete = false

        // Create fresh SSR infrastructure
        let treeBuilder = ShadowTreeBuilder(
            surfaceId: surfaceId!,
            viewportWidth: Float(container.bounds.width > 0 ? container.bounds.width : 390),
            viewportHeight: Float(container.bounds.height > 0 ? container.bounds.height : 844)
        )

        let boundaryManager = BoundaryManager()
        let parser = InstructionStreamParser()

        let coordinator = SSRCoordinator(
            treeBuilder: treeBuilder,
            boundaryManager: boundaryManager,
            rootView: container
        )

        // Register root view for rendering and skip layout in tree builder
        self.renderer.registerRootView(container)
        treeBuilder.performLayoutOnComplete = false

        // Re-wire MPA form submission on the new mutation applier
        self.renderer.mutationApplier.ssrBaseURL = self.ssrURL
        self.renderer.mutationApplier.onMPAFormResponse = { [weak self] responseText in
            guard let self = self else { return }
            self.reloadFromSSRResponse(responseText)
        }

        // Ignore JS instructions — no hydration, no runtime
        coordinator.onJavaScriptReceived = { _ in }

        // Queue boundary reveals
        coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
            self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
        }

        parser.delegate = coordinator

        // Wire boundary reveal view updates
        coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
            guard let self = self else { return }
            self.ssrRevealHasOccurred = true
            self.renderer.commitTree(newChildren: newRootChildren, label: "Server-Only MPA Reveal")
        }

        // Store references
        self.ssrParser = parser
        self.ssrTreeBuilder = treeBuilder
        self.ssrBoundaryManager = boundaryManager
        self.ssrCoordinator = coordinator

        // Handle root completion — paint
        treeBuilder.onRootComplete = { [weak self] rootChildren in
            guard let self = self else { return }

            guard !self.ssrRevealHasOccurred else {
                self.ssrShellComplete = true
                return
            }

            self.renderer.commitTree(newChildren: rootChildren, label: "Server-Only MPA Paint")

            print("[ReactDomNativeKit] Server-only MPA re-render complete (\(rootChildren.count) root children)")
            self.ssrShellComplete = true
        }

        // Feed the instruction stream data directly (no HTTP fetch needed)
        if let data = instructionStream.data(using: .utf8) {
            parser.receive(data: data)
        }
        parser.finish()
        ssrStreamComplete = true
    }

    // MARK: - Test Hooks (SSR)

    /// Test-only: Feeds SSR instruction data directly, bypassing HTTP.
    /// Sets up the full SSR pipeline (coordinator, parser, tree builder)
    /// and processes the instruction stream synchronously.
    ///
    /// - Parameters:
    ///   - instructions: Newline-delimited SSR instruction stream string.
    ///   - finish: Whether to signal end of stream (default true).
    ///     Pass false for incremental testing, then use `feedSSRSegment` for more data.
    ///   - completion: Called when root shell completes.
    internal func feedSSRData(_ instructions: String, finish: Bool = true, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            completion?(RootError.alreadyUnmounted)
            return
        }

        // Reserve surfaceId if needed (same as renderWithSSR)
        if surfaceId == nil {
            surfaceId = ReactRuntime.shared.reserveSurface(root: self, container: container)
        }

        // Create SSR infrastructure (same components as renderWithSSR)
        let treeBuilder = ShadowTreeBuilder(
            surfaceId: surfaceId!,
            viewportWidth: Float(container.bounds.width > 0 ? container.bounds.width : 390),
            viewportHeight: Float(container.bounds.height > 0 ? container.bounds.height : 844)
        )

        let boundaryManager = BoundaryManager()
        let parser = InstructionStreamParser()

        let coordinator = SSRCoordinator(
            treeBuilder: treeBuilder,
            boundaryManager: boundaryManager,
            rootView: container
        )

        // Register root view for rendering and skip layout in tree builder
        self.renderer.registerRootView(container)
        treeBuilder.performLayoutOnComplete = false

        // Wire JS callback (same as renderWithSSR)
        coordinator.onJavaScriptReceived = { [weak self] code in
            guard let self = self else { return }
            if self.hydrationStarted {
                ReactRuntime.shared.evaluateScript(code)
            } else {
                self.ssrJavaScriptBuffer.append(code)
            }
        }

        // Wire boundary reveal queueing (same as renderWithSSR)
        coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
            self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
        }

        parser.delegate = coordinator

        // Wire boundary reveal view updates (same core logic as renderWithSSR)
        coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
            guard let self = self else { return }
            self.ssrRevealHasOccurred = true
            self.renderer.commitTree(newChildren: newRootChildren, label: "SSR Reveal")
        }

        // Store references
        self.ssrParser = parser
        self.ssrTreeBuilder = treeBuilder
        self.ssrBoundaryManager = boundaryManager
        self.ssrCoordinator = coordinator

        // Wire root completion — first paint (same core logic as renderWithSSR)
        treeBuilder.onRootComplete = { [weak self] rootChildren in
            guard let self = self else { return }

            guard !self.ssrRevealHasOccurred else {
                completion?(nil)
                return
            }

            self.renderer.commitTree(newChildren: rootChildren, label: "SSR First Paint")

            self.ssrShellComplete = true
            completion?(nil)

            if let pending = self.pendingHydration {
                self.pendingHydration = nil
                pending()
            }
        }

        // Feed data directly (instead of URLSession streaming)
        if let data = instructions.data(using: .utf8) {
            parser.receive(data: data)
        }

        if finish {
            parser.finish()
            ssrStreamComplete = true
        }
    }

    /// Test-only: Feeds additional SSR data (segments/reveals) after the shell.
    internal func feedSSRSegment(_ instructions: String) {
        guard let parser = ssrParser,
              let data = instructions.data(using: .utf8) else { return }
        parser.receive(data: data)
    }

    /// Test-only: Flushes any pending throttled reveals immediately.
    internal func flushPendingRevealsForTesting() {
        revealTimer?.cancel()
        revealTimer = nil
        flushPendingReveals()
    }

    // MARK: - Hydration Lifecycle

    /// Called when React commits the initial hydration render. Schedules
    /// reveal flushing on the NEXT run loop tick, giving React time to finish
    /// setting up dehydrated Suspense fibers (registerSuspenseInstanceRetry).
    func onHydrationCommitted() {
        print("[ReactDomNativeKit] Hydration committed")

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.hydrationCommitted = true

            // Flush any reveals deferred during hydration
            if !self.pendingReveals.isEmpty {
                self.flushPendingReveals()
            }

            self.maybeCleanupSSRState()
        }  // end DispatchQueue.main.async
    }

    /// Checks if both the SSR stream and hydration are complete, and if so,
    /// performs cleanup. This prevents the race condition where the stream
    /// completes before hydration commits, which would clear pending reveals
    /// and nil out ssrCoordinator before they're needed.
    func maybeCleanupSSRState() {
        guard ssrStreamComplete, hydrationCommitted else { return }
        cleanupSSRState()
    }

    /// Cleans up SSR hydration state. Called when the SSR stream completes
    /// and hydration has committed.
    func cleanupSSRState() {
        ssrRevealHasOccurred = false
        pendingHydration = nil
        ssrCommitTimings.removeAll()

        // Cancel any pending throttled reveals
        revealTimer?.cancel()
        revealTimer = nil
        pendingReveals.removeAll()

        // DON'T clean up SSR tree in Bindings here — React's retry callbacks
        // (from dehydrated Suspense) run asynchronously after this and need the
        // SSR tree for hydration traversal. SSR tree is cleaned up on unmount.

        // Clean up SSR stream infrastructure
        ssrDataTask = nil
        ssrParser = nil
        ssrTreeBuilder = nil
        ssrBoundaryManager = nil
        ssrCoordinator = nil

        print("[ReactDomNativeKit] SSR state fully cleaned up")
    }
}
