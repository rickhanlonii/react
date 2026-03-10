import UIKit
import JSEngine
import ShadowTree
import Yoga
import QuartzCore

// ---------------------------------------------------------------------------
// Root+Prerender
//
// Resume flow for prerendered content. The app provides pre-fetched prelude
// bytes + postponed state (from GET /prerender/:name). This extension:
//
//   1. Replays the prelude through the parser → builds shadow tree → UIKit views (instant)
//   2. POSTs the postponed state to the resume URL → processes dynamic content
//   3. Starts hydration eagerly when boot completes + shell is painted
//
// The app owns fetching and caching — this code just consumes the data.
// ---------------------------------------------------------------------------

extension Root {

    // MARK: - Resume Entry Point

    /// Starts the resume flow from pre-fetched prerender data.
    ///
    /// Called by the free function `resumeRoot(view, data:, url:)`.
    ///
    /// - Parameters:
    ///   - data: Pre-fetched prerender result (prelude + postponed state).
    ///   - resumeURL: URL of the resume endpoint (e.g. "http://localhost:6001/resume/page").
    internal func startResume(data: PrerenderResult, resumeURL: String) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            return
        }

        ssrURL = resumeURL
        prerenderResumeURL = resumeURL
        prerenderData = data
        renderMode = .prerender(resumeURL: resumeURL)

        // Reserve surfaceId eagerly
        if surfaceId == nil {
            let rt = ReactRuntime.shared
            surfaceId = rt.reserveSurface(root: self, container: container)
            setupLayoutObserver()
        }

        // Set up SSR infrastructure (same components as startHydration)
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
        self.renderer.tracingEnabled = ReactRuntime.shared.isTracingActive
        treeBuilder.performLayoutOnComplete = false

        // Wire JS callback — buffer until hydration starts
        coordinator.onJavaScriptReceived = { [weak self] code in
            guard let self = self else { return }
            if self.hydrationStarted {
                ReactRuntime.shared.evaluateScript(code)
            } else {
                self.ssrJavaScriptBuffer.append(code)
            }
        }

        // Wire boundary reveal queueing
        coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
            self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
        }

        // Wire bootstrap URL — boot runtime eagerly (in parallel with resume)
        coordinator.onBootstrapURLReceived = { [weak self] bootstrapURL in
            guard let self = self else { return }
            print("[ReactDomNativeKit] Received bootstrap URL from prerender stream: \(bootstrapURL)")

            self.prerenderBootstrapURL = bootstrapURL

            let rt = ReactRuntime.shared
            if let bundleURL = URL(string: bootstrapURL) {
                rt.devBundleURL = bundleURL
            }
            if let urlObj = URL(string: resumeURL) {
                var components = URLComponents()
                components.scheme = urlObj.scheme
                components.host = urlObj.host
                components.port = urlObj.port
                rt.devServerURL = components.url
            }
            // Boot the runtime (downloads the bundle from the URL above)
            rt.boot { [weak self] error in
                guard let self = self else { return }

                if let error = error {
                    print("[ReactDomNativeKit] Failed to boot runtime for resume hydration: \(error)")
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
                    print("[ReactDomNativeKit] Resume hydration starting")

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
                        self.renderer.mutationApplier = UIKitMutationApplier(viewRegistry: bindings.viewRegistry)
                        self.renderer.mutationApplier.dispatchEvent = { view, eventType, payload in
                            bindings.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
                        }
                        bindings.mutationApplier.installRootTapGesture(on: self.renderer.rootView!)
                    }

                    // Register surface for hydration with the SSR tree
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
                        self?.renderer.commitTree(newChildren: newRootChildren, label: "Resume Reveal")
                    }

                    rt.bindings?.markHydrationStarted(surfaceId: surfaceId)

                    // Push accumulated SSR commit timings
                    if !self.ssrCommitTimings.isEmpty {
                        rt.bindings?.addSSRCommitTimings(self.ssrCommitTimings)
                        self.ssrCommitTimings.removeAll()
                    }

                    // Replay buffered JS instructions (Flight data from prelude + resume)
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

        // Wire postponed state capture (ignored — we already have it from data)
        coordinator.onPostponedStateReceived = { _ in }

        parser.delegate = coordinator

        // Wire boundary reveal view updates (same as startHydration)
        coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
            guard let self = self else { return }
            self.ssrRevealHasOccurred = true
            self.renderer.commitTree(newChildren: newRootChildren, label: "Resume Reveal")
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
                print("[ReactDomNativeKit] Prerender root complete skipped — reveal already occurred")
                self.ssrShellComplete = true
                if let pending = self.pendingHydration {
                    self.pendingHydration = nil
                    pending()
                }
                return
            }

            self.renderer.commitTree(newChildren: rootChildren, label: "Prerender First Paint")

            print("[ReactDomNativeKit] Prerender first paint complete (\(rootChildren.count) root children)")
            self.shellPaintTime = performanceNow()
            self.ssrShellComplete = true

            if let pending = self.pendingHydration {
                self.pendingHydration = nil
                pending()
            }
        }

        // Phase 1: Replay prelude instantly (synchronous, no network)
        print("[ReactDomNativeKit] Replaying prelude (\(data.prelude.count) bytes)")
        parser.receive(data: data.prelude)
        parser.finish()

        // Phase 2: POST postponed state to resume URL for dynamic content
        startResumeRequest(resumeURL: resumeURL, postponedState: data.postponed)
    }

    // MARK: - Resume Request

    /// Posts postponed state to the resume URL and processes the response through
    /// the same parser/coordinator that handled the prelude.
    private func startResumeRequest(resumeURL: String, postponedState: Data) {
        guard let urlObj = URL(string: resumeURL) else {
            print("[ReactDomNativeKit] Invalid resume URL: \(resumeURL)")
            return
        }
        guard let parser = self.ssrParser else { return }

        print("[ReactDomNativeKit] Starting resume request to \(resumeURL)")

        var request = URLRequest(url: urlObj)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Body: { "postponed": <deserialized state object> }
        if let postponedObj = try? JSONSerialization.jsonObject(with: postponedState) {
            let body: [String: Any] = ["postponed": postponedObj]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }

        let streamDelegate = SSRStreamDelegate(parser: parser) { [weak self] in
            guard let self = self else { return }
            self.ssrStreamComplete = true
            let revealCount = self.ssrBoundaryManager?.revealedCount ?? 0
            print("[ReactDomNativeKit] Resume stream complete, reveals processed: \(revealCount)")

            // Resume complete → cleanup if hydration already done
            self.maybeCleanupSSRState()
        }

        let session = URLSession(
            configuration: .default,
            delegate: streamDelegate,
            delegateQueue: .main
        )
        setNetworkResourceType("Document", on: &request)
        let task = session.dataTask(with: request)
        self.resumeDataTask = task
        task.resume()
    }
}
