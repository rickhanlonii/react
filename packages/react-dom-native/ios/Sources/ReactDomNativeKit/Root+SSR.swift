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

    // MARK: - SSR Rendering

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

        let boundaryManager = BoundaryManager()
        let parser = InstructionStreamParser()

        // Set up the SSR coordinator as the delegate
        let coordinator = SSRCoordinator(
            treeBuilder: treeBuilder,
            boundaryManager: boundaryManager,
            rootView: container
        )
        coordinator.onFlightDataReceived = { [weak self] row in
            guard let self = self else { return }
            if self.hydrationCommitted, let responseId = self.flightResponseId {
                // Hydration committed — forward to JS Flight client immediately
                ReactRuntime.shared.processFlightRow(responseId: responseId, row: row)
            } else if self.hydrationStarted {
                // Hydration in progress — buffer to avoid resolving lazy chunks
                // mid-render, which would restart React's render and prevent commit.
                self.postHydrationFlightBuffer.append(row)
            } else {
                // Hydration not started — buffer for replay in hydrateSurface
                self.ssrFlightDataBuffer.append(row)
            }
        }
        coordinator.onJavaScriptReceived = { [weak self] code in
            guard let self = self else { return }
            if self.hydrationStarted {
                // JS engine is booted — evaluate immediately
                ReactRuntime.shared.evaluateScript(code)
            } else {
                // Buffer for evaluation after boot
                self.ssrJavaScriptBuffer.append(code)
            }
        }
        coordinator.onBoundaryRevealQueued = { [weak self] id, contentNodes in
            self?.queueBoundaryReveal(id: id, contentNodes: contentNodes)
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

            let commitStart = CACurrentMediaTime() * 1000.0

            // 1. Calculate layout on the new tree
            let layoutStart = CACurrentMediaTime() * 1000.0
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
            let layoutEnd = CACurrentMediaTime() * 1000.0

            // 2. Diff old vs new tree (with per-node timing)
            var diffNodeTimings: [(type: String, start: Double, end: Double)] = []
            let diffStart = CACurrentMediaTime() * 1000.0
            let differentiator = Differentiator()
            let mutations = differentiator.diff(
                oldChildren: oldRootChildren,
                newChildren: newRootChildren,
                parent: nil,
                tracing: true,
                nodeTimings: &diffNodeTimings
            )
            let diffEnd = CACurrentMediaTime() * 1000.0

            // 3. Apply mutations (with per-mutation timing)
            var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
            let mutationsStart = CACurrentMediaTime() * 1000.0
            applier.applyMutations(mutations, rootView: scrollView, tracing: true, mutationTimings: &mutationTimings)

            // 4. Sync all frames (with per-node timing)
            var syncNodeTimings: [(type: String, start: Double, end: Double)] = []
            let syncStart = CACurrentMediaTime() * 1000.0
            self.syncSSRFrames(newRootChildren, tracing: true, nodeTimings: &syncNodeTimings)
            let syncEnd = CACurrentMediaTime() * 1000.0

            let mutationsEnd = CACurrentMediaTime() * 1000.0

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

            let commitEnd = CACurrentMediaTime() * 1000.0

            // Collect commit-style timing for Shadow Tree and Layout tracks
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

            // Build per-node timing arrays
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

            // Layout timing comes from ShadowTreeBuilder.rootComplete()
            // which ran ShadowTreeLayout.performLayout() before this callback.
            let layoutStart = treeBuilder.layoutStartTime
            let layoutEnd = treeBuilder.layoutEndTime

            // Generate CREATE + INSERT mutations and apply them (with per-mutation timing).
            var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
            let mutationsStart = CACurrentMediaTime() * 1000.0
            self.createViewsFromTree(rootChildren, applier: applier, rootView: self.container, mutationTimings: &mutationTimings)
            let mutationsEnd = CACurrentMediaTime() * 1000.0

            // Build per-mutation timing array
            var mutElements: [Any] = []
            for entry in mutationTimings {
                mutElements.append(entry.mutationType)
                mutElements.append(entry.elementType)
                mutElements.append(entry.start)
                mutElements.append(entry.end)
            }

            // Collect commit-style timing for Shadow Tree and Layout tracks
            let stats = Self.computeSSRTreeStats(rootChildren)
            self.ssrCommitTimings.append([
                "label": "SSR First Paint",
                "commitStart": layoutStart, "commitEnd": mutationsEnd,
                "layoutStart": layoutStart, "layoutEnd": layoutEnd,
                "mutationsStart": mutationsStart, "mutationsEnd": mutationsEnd,
                "mutationCount": stats.nodeCount * 2, // CREATE + INSERT per node
                "creates": stats.nodeCount, "inserts": stats.nodeCount,
                "deletes": 0, "removes": 0, "updates": 0,
                "nodeCount": stats.nodeCount, "treeDepth": stats.depth,
                "rootTypes": rootChildren.map { $0.family.elementType }.joined(separator: ", "),
                "mutationNodes": mutElements,
            ])

            print("[ReactDomNativeKit] SSR first paint complete (\(rootChildren.count) root children)")
            self.shellPaintTime = CACurrentMediaTime() * 1000.0
            self.ssrShellComplete = true
            completion?(nil)

            // If hydration was requested and JS is ready, start now
            if let pending = self.pendingHydration {
                self.pendingHydration = nil
                pending()
            }
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

            // Close the Flight response if hydration has committed
            if self.hydrationCommitted, let responseId = self.flightResponseId {
                ReactRuntime.shared.closeFlightResponse(responseId: responseId)
                self.flightResponseId = nil
            }

            // If hydrateRoot() was called before the stream finished,
            // execute the queued hydration now that D instructions are buffered.
            if let pending = self.pendingHydration {
                self.pendingHydration = nil
                pending()
            }

            // Clean up SSR stream infrastructure
            self.cleanupSSRState()
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

        // Wire Flight data callback (same as renderWithSSR)
        coordinator.onFlightDataReceived = { [weak self] row in
            guard let self = self else { return }
            if self.hydrationCommitted, let responseId = self.flightResponseId {
                ReactRuntime.shared.processFlightRow(responseId: responseId, row: row)
            } else if self.hydrationStarted {
                self.postHydrationFlightBuffer.append(row)
            } else {
                self.ssrFlightDataBuffer.append(row)
            }
        }
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

    // MARK: - Hydration

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

            // Wire hydration completion callback — signals that React committed
            // the initial hydration render. Now it's safe to forward boundary
            // Flight data and flush deferred SSR reveals.
            rt.bindings?.onHydrationComplete = { [weak self] surfaceId in
                self?.onHydrationCommitted()
            }

            // Wire boundary reveal callback — when the SSR stream reveals a
            // boundary after hydration has registered retry callbacks, notify
            // the JS side so React can render the resolved content.
            // Also mutate the SSR reference tree in place so React's
            // _ssrNodeRef pointers remain valid for hydration traversal.
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

                // Wire the SSR applier's event dispatch to Bindings so that
                // tap handlers on SSR-created buttons reach the JS runtime.
                if let bindings = rt.bindings {
                    self.ssrMutationApplier?.dispatchEvent = { view, eventType, payload in
                        bindings.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
                    }
                }
                rt.bindings?.registerSSRTree(
                    surfaceId: surfaceId,
                    rootChildren: currentSSRTree
                )

                // Now rewire onViewsNeedUpdate to Bindings — from this point,
                // any boundary reveals go through Bindings for proper diffing.
                // Note: We only call updateCurrentTree (visual diff + mutations),
                // NOT updateSSRTree. The SSR reference tree is updated in-place
                // by revealBoundaryInSSRTree, which preserves node identity so
                // React's _ssrNodeRef pointers remain valid for hydration.
                // Calling updateSSRTree would replace the tree with cloned nodes,
                // breaking those pointers and forcing React to fall back to
                // client-side render instead of hydration.
                self.ssrCoordinator?.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
                    guard let self = self, let bindings = rt.bindings, let surfaceId = self.surfaceId else { return }
                    bindings.updateCurrentTree(
                        surfaceId: surfaceId,
                        oldTree: oldRootChildren,
                        newTree: newRootChildren
                    )
                }

                rt.bindings?.markHydrationStarted(surfaceId: surfaceId)

                // Push accumulated SSR commit timings to Bindings for trace reporting
                if !self.ssrCommitTimings.isEmpty {
                    rt.bindings?.addSSRCommitTimings(self.ssrCommitTimings)
                    self.ssrCommitTimings.removeAll()
                }

                // Replay buffered JS instructions from the SSR stream
                for code in self.ssrJavaScriptBuffer {
                    ReactRuntime.shared.evaluateScript(code)
                }
                self.ssrJavaScriptBuffer.removeAll()

                do {
                    let responseId = try rt.hydrateSurface(
                        surfaceId: surfaceId,
                        serverURL: serverURL,
                        ssrData: self.ssrFlightDataBuffer,
                        keepOpen: true
                    )
                    self.ssrFlightDataBuffer.removeAll()
                    self.flightResponseId = responseId

                    // If the SSR stream already completed, close the Flight response
                    if self.ssrStreamComplete {
                        rt.closeFlightResponse(responseId: responseId)
                    }

                    completion?(nil)
                } catch {
                    print("[ReactDomNativeKit] Hydration failed: \(error)")
                    self.options.onRecoverableError?(error)
                    completion?(error)
                }
            }

            if self.ssrShellComplete {
                doHydrate()
            } else {
                self.pendingHydration = doHydrate
            }
        }
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
            let nodeStart = CACurrentMediaTime() * 1000.0

            if let view = registry.view(for: node.family) {
                if view.frame != node.layoutFrame {
                    view.frame = node.layoutFrame
                }
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }

            let nodeEnd = CACurrentMediaTime() * 1000.0
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

    /// Called when React commits the initial hydration render. Schedules boundary
    /// data forwarding and reveal flushing on the NEXT run loop tick, giving React
    /// time to finish setting up dehydrated Suspense fibers (registerSuspenseInstanceRetry)
    /// in a second commit before we forward D rows that would resolve lazy chunks.
    func onHydrationCommitted() {
        print("[ReactDomNativeKit] Hydration committed — scheduling boundary data forwarding")

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.hydrationCommitted = true
            print("[ReactDomNativeKit] Enabling boundary data forwarding")

        // Forward boundary Flight data that was buffered during the hydration
        // render phase. Now that React has committed the initial render with
        // dehydrated Suspense fibers, resolving lazy chunks is safe — React
        // will re-render boundaries via $$notifyBoundaryRevealed retry callbacks.
        if let responseId = self.flightResponseId, !self.postHydrationFlightBuffer.isEmpty {
            print("[ReactDomNativeKit] Forwarding \(self.postHydrationFlightBuffer.count) buffered boundary Flight rows")
            for row in self.postHydrationFlightBuffer {
                ReactRuntime.shared.processFlightRow(responseId: responseId, row: row)
            }
            self.postHydrationFlightBuffer.removeAll()
        }

        // If the SSR stream already completed, close the Flight response
        if self.ssrStreamComplete, let responseId = self.flightResponseId {
            ReactRuntime.shared.closeFlightResponse(responseId: responseId)
            self.flightResponseId = nil
        }

        // Flush any reveals deferred during hydration
        if !self.pendingReveals.isEmpty {
            self.flushPendingReveals()
        }
        }  // end DispatchQueue.main.async
    }

    /// Cleans up SSR hydration state. Called when the SSR stream completes
    /// and hydration has committed.
    func cleanupSSRState() {
        // NOTE: Don't clear ssrFlightDataBuffer here — hydrateRoot() may still
        // be booting the JS runtime (async) and hasn't consumed the buffer yet.
        // The buffer is cleared after doHydrate consumes it, or on unmount.
        postHydrationFlightBuffer.removeAll()
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
