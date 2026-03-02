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

                    // Register surface for hydration and the SSR tree
                    let currentSSRTree = self.ssrCoordinator?.currentRootChildren ?? treeBuilder.rootChildren
                    print("[ReactDomNativeKit] Registering SSR tree for hydration: \(currentSSRTree.count) root children")
                    rt.registerSurfaceForHydration(
                        surfaceId: surfaceId,
                        rootView: self.container,
                        ssrTree: currentSSRTree,
                        ssrViewRegistry: self.ssrViewRegistry ?? ViewRegistry()
                    )

                    if let bindings = rt.bindings {
                        self.ssrMutationApplier?.dispatchEvent = { view, eventType, payload in
                            bindings.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
                        }
                    }
                    rt.bindings?.registerSSRTree(
                        surfaceId: surfaceId,
                        rootChildren: currentSSRTree
                    )

                    // Rewire onViewsNeedUpdate to Bindings
                    self.ssrCoordinator?.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
                        guard let self = self, let bindings = rt.bindings, let surfaceId = self.surfaceId else { return }
                        bindings.updateCurrentTree(
                            surfaceId: surfaceId,
                            oldTree: oldRootChildren,
                            newTree: newRootChildren
                        )
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

                    // Derive the Flight server URL from the bootstrap URL
                    // Bootstrap: "http://localhost:6000/bundle.js" → Flight: "http://localhost:6000"
                    let flightServerURL: String
                    if let bootURL = URL(string: bootstrapURL),
                       let scheme = bootURL.scheme,
                       let host = bootURL.host {
                        let port = bootURL.port.map { ":\($0)" } ?? ""
                        flightServerURL = "\(scheme)://\(host)\(port)"
                    } else {
                        flightServerURL = bootstrapURL
                    }

                    // Derive the fixture path from the SSR URL
                    // SSR URL: "http://localhost:6001/ssr/05-nested-suspense"
                    // Flight URL: "http://localhost:6000/fixtures/05-nested-suspense"
                    let fixturePath: String
                    if let ssrURL = URL(string: url),
                       ssrURL.pathComponents.count >= 3,
                       ssrURL.pathComponents[1] == "ssr" {
                        fixturePath = "/fixtures/" + ssrURL.pathComponents.dropFirst(2).joined(separator: "/")
                    } else {
                        // Fallback: use the SSR path as-is
                        fixturePath = URL(string: url)?.path ?? "/"
                    }

                    let fullFlightURL = flightServerURL + fixturePath
                    rt.hydrateSurface(surfaceId: surfaceId, serverURL: fullFlightURL)
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

            guard let applier = self.ssrMutationApplier,
                  let registry = self.ssrViewRegistry else {
                return
            }

            guard let scrollView = self.container.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView else { return }

            let commitStart = performanceNow()

            let layoutStart = performanceNow()
            let width = Float(self.container.bounds.width > 0 ? self.container.bounds.width : 390)
            let rootYogaNode = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeStyleSetFlexDirection(rootYogaNode, .column)
            YGNodeStyleSetWidth(rootYogaNode, width)

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
            let layoutEnd = performanceNow()

            var diffNodeTimings: [(type: String, start: Double, end: Double)] = []
            let diffStart = performanceNow()
            let differentiator = Differentiator()
            let mutations = differentiator.diff(
                oldChildren: oldRootChildren,
                newChildren: newRootChildren,
                parent: nil,
                tracing: true,
                nodeTimings: &diffNodeTimings
            )
            let diffEnd = performanceNow()

            var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
            let mutationsStart = performanceNow()
            applier.applyMutations(mutations, rootView: scrollView, tracing: true, mutationTimings: &mutationTimings)

            var syncNodeTimings: [(type: String, start: Double, end: Double)] = []
            let syncStart = performanceNow()
            self.syncSSRFrames(newRootChildren, tracing: true, nodeTimings: &syncNodeTimings)
            let syncEnd = performanceNow()

            let mutationsEnd = performanceNow()

            for child in newRootChildren {
                if let view = registry.view(for: child.family) {
                    if view.superview == nil {
                        scrollView.addSubview(view)
                    }
                }
            }

            let contentHeight = ShadowTreeLayout.computeActualContentHeight(for: newRootChildren)
            scrollView.contentSize = CGSize(
                width: scrollView.bounds.width,
                height: contentHeight
            )

            let commitEnd = performanceNow()

            let stats = Self.computeSSRTreeStats(newRootChildren)
            var creates = 0, inserts = 0, deletes = 0, removes = 0, updates = 0
            var affectedTypes = Set<String>()
            for mutation in mutations {
                switch mutation {
                case .create(let node): creates += 1; affectedTypes.insert(node.family.elementType)
                case .insert(_, let child, _): inserts += 1; affectedTypes.insert(child.family.elementType)
                case .delete(let node): deletes += 1; affectedTypes.insert(node.family.elementType)
                case .remove(_, let child): removes += 1; affectedTypes.insert(child.family.elementType)
                case .update(let node, _, _): updates += 1; affectedTypes.insert(node.family.elementType)
                }
            }

            var diffElements: [Any] = []
            for entry in diffNodeTimings {
                diffElements.append(entry.type)
                diffElements.append(entry.start)
                diffElements.append(entry.end)
            }
            var mutElements: [Any] = []
            for entry in mutationTimings {
                mutElements.append(entry.mutationType)
                mutElements.append(entry.elementType)
                mutElements.append(entry.start)
                mutElements.append(entry.end)
            }
            var layoutElements: [Any] = []
            for entry in syncNodeTimings {
                layoutElements.append(entry.type)
                layoutElements.append(entry.start)
                layoutElements.append(entry.end)
            }

            self.ssrCommitTimings.append([
                "label": "SSR Reveal",
                "commitStart": commitStart, "commitEnd": commitEnd,
                "layoutStart": layoutStart, "layoutEnd": layoutEnd,
                "diffStart": diffStart, "diffEnd": diffEnd,
                "mutationsStart": mutationsStart, "mutationsEnd": mutationsEnd,
                "syncStart": syncStart, "syncEnd": syncEnd,
                "mutationCount": mutations.count,
                "creates": creates, "inserts": inserts,
                "deletes": deletes, "removes": removes, "updates": updates,
                "nodeCount": stats.nodeCount, "treeDepth": stats.depth,
                "rootTypes": newRootChildren.map { $0.family.elementType }.joined(separator: ", "),
                "affectedTypes": affectedTypes.sorted().joined(separator: ", "),
                "diffNodes": diffElements,
                "mutationNodes": mutElements,
                "layoutNodes": layoutElements,
            ])

            print("[ReactDomNativeKit] Boundary revealed — views updated via diff")
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

            let viewRegistry = ViewRegistry()
            let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "MutationApplier SSR")
            self.ssrViewRegistry = viewRegistry
            self.ssrMutationApplier = applier

            let layoutStart = treeBuilder.layoutStartTime
            let layoutEnd = treeBuilder.layoutEndTime

            var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
            let mutationsStart = performanceNow()
            self.createViewsFromTree(rootChildren, applier: applier, rootView: self.container, mutationTimings: &mutationTimings)
            let mutationsEnd = performanceNow()

            var mutElements: [Any] = []
            for entry in mutationTimings {
                mutElements.append(entry.mutationType)
                mutElements.append(entry.elementType)
                mutElements.append(entry.start)
                mutElements.append(entry.end)
            }

            let stats = Self.computeSSRTreeStats(rootChildren)
            self.ssrCommitTimings.append([
                "label": "SSR First Paint",
                "commitStart": layoutStart, "commitEnd": mutationsEnd,
                "layoutStart": layoutStart, "layoutEnd": layoutEnd,
                "mutationsStart": mutationsStart, "mutationsEnd": mutationsEnd,
                "mutationCount": stats.nodeCount * 2,
                "creates": stats.nodeCount, "inserts": stats.nodeCount,
                "deletes": 0, "removes": 0, "updates": 0,
                "nodeCount": stats.nodeCount, "treeDepth": stats.depth,
                "rootTypes": rootChildren.map { $0.family.elementType }.joined(separator: ", "),
                "mutationNodes": mutElements,
            ])

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

            self.cleanupSSRState()
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

            guard let applier = self.ssrMutationApplier,
                  let registry = self.ssrViewRegistry else { return }

            guard let scrollView = self.container.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView else { return }

            // 1. Calculate layout on the new tree
            let width = Float(self.container.bounds.width > 0 ? self.container.bounds.width : 390)
            let rootYogaNode = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeStyleSetFlexDirection(rootYogaNode, .column)
            YGNodeStyleSetWidth(rootYogaNode, width)

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

            // 4. Sync all frames
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

            let viewRegistry = ViewRegistry()
            let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "MutationApplier SSR Test")
            self.ssrViewRegistry = viewRegistry
            self.ssrMutationApplier = applier

            var timings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
            self.createViewsFromTree(rootChildren, applier: applier, rootView: self.container, mutationTimings: &timings)

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

    // MARK: - SSR View Creation

    /// Creates UIKit views from the SSR shadow tree and adds them to the root view.
    func createViewsFromTree(
        _ nodes: [ShadowNodeWrapper],
        applier: UIKitMutationApplier,
        rootView: UIView,
        mutationTimings: inout [(mutationType: String, elementType: String, start: Double, end: Double)]
    ) {
        // Use the Differentiator to generate CREATE + INSERT mutations,
        // then apply them via the mutation applier.
        var mutations: [Mutation] = []

        for node in nodes {
            collectCreateMutations(node: node, mutations: &mutations)
        }

        applier.applyMutations(mutations, rootView: rootView, tracing: true, mutationTimings: &mutationTimings)

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
    func collectCreateMutations(
        node: ShadowNodeWrapper,
        mutations: inout [Mutation]
    ) {
        mutations.append(.create(node: node))

        for (index, child) in node.children.enumerated() {
            collectCreateMutations(node: child, mutations: &mutations)
            mutations.append(.insert(parent: node, child: child, index: index))
        }
    }

    // MARK: - SSR Frame Sync

    /// Recursively syncs every SSR UIView's frame to match its node's layoutFrame.
    /// Mirrors Bindings.syncAllFrames for the SSR view hierarchy.
    func syncSSRFrames(_ nodes: [ShadowNodeWrapper]) {
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

    /// Recursively syncs every SSR UIView's frame to match its node's layoutFrame,
    /// with per-node timing collection for flame graph visualization.
    func syncSSRFrames(
        _ nodes: [ShadowNodeWrapper],
        tracing: Bool,
        nodeTimings: inout [(type: String, start: Double, end: Double)]
    ) {
        guard let registry = ssrViewRegistry else { return }
        for node in nodes {
            let nodeStart = performanceNow()

            if let view = registry.view(for: node.family) {
                if view.frame != node.layoutFrame {
                    view.frame = node.layoutFrame
                }
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }

            let nodeEnd = performanceNow()
            nodeTimings.append((type: node.family.elementType, start: nodeStart, end: nodeEnd))

            syncSSRFrames(node.children, tracing: tracing, nodeTimings: &nodeTimings)
        }
    }

    // MARK: - SSR Tree Statistics

    /// Computes tree statistics (total node count and max depth) for SSR timing.
    static func computeSSRTreeStats(_ roots: [ShadowNodeWrapper]) -> (nodeCount: Int, depth: Int) {
        var count = 0
        func walk(_ nodes: [ShadowNodeWrapper], currentDepth: Int, maxDepth: inout Int) {
            for node in nodes {
                count += 1
                maxDepth = max(maxDepth, currentDepth)
                walk(node.children, currentDepth: currentDepth + 1, maxDepth: &maxDepth)
            }
        }
        var maxDepth = 0
        walk(roots, currentDepth: 1, maxDepth: &maxDepth)
        return (count, maxDepth)
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
        }  // end DispatchQueue.main.async
    }

    /// Cleans up SSR hydration state. Called when the SSR stream completes
    /// and hydration has committed.
    func cleanupSSRState() {
        ssrViewRegistry = nil
        // Keep ssrMutationApplier alive — SSR-created buttons hold a weak
        // reference to it as their tap target. If deallocated, taps silently
        // stop working. It stays alive until the root is unmounted.
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
