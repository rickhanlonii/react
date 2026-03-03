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
//   3. Starts hydration after the resume stream delivers all Flight data
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
            // Boot eagerly — hydration will call boot again (no-op if already done)
            rt.boot { _ in }
        }

        // Wire postponed state capture (ignored — we already have it from data)
        coordinator.onPostponedStateReceived = { _ in }

        parser.delegate = coordinator

        // Wire boundary reveal view updates (same as startHydration)
        coordinator.onViewsNeedUpdate = { [weak self] oldRootChildren, newRootChildren in
            guard let self = self else { return }
            self.ssrRevealHasOccurred = true

            guard let applier = self.ssrMutationApplier,
                  let registry = self.ssrViewRegistry else { return }

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
                "label": "Resume Reveal",
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

            print("[ReactDomNativeKit] Resume boundary revealed — views updated via diff")
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
                print("[ReactDomNativeKit] Resume root complete skipped — reveal already occurred")
                self.ssrShellComplete = true
                return
            }

            let viewRegistry = ViewRegistry()
            let applier = UIKitMutationApplier(viewRegistry: viewRegistry, logPrefix: "MutationApplier Resume")
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
                "label": "Resume First Paint",
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

            print("[ReactDomNativeKit] Resume first paint complete (\(rootChildren.count) root children)")
            self.shellPaintTime = performanceNow()
            self.ssrShellComplete = true
            // Note: hydration is NOT triggered here — it starts after resume stream completes
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

            // Resume complete → start hydration phase
            self.startResumeHydration()
        }

        let session = URLSession(
            configuration: .default,
            delegate: streamDelegate,
            delegateQueue: .main
        )
        let task = session.dataTask(with: request)
        self.resumeDataTask = task
        task.resume()
    }

    // MARK: - Resume Hydration

    /// Starts hydration after the resume stream has delivered all Flight data.
    /// The runtime may already be booted (from BOOT instruction in the prelude).
    private func startResumeHydration() {
        guard let url = ssrURL,
              let bootstrapURL = prerenderBootstrapURL else {
            print("[ReactDomNativeKit] Cannot start resume hydration — missing URL or bootstrap")
            return
        }

        let rt = ReactRuntime.shared

        // boot is a no-op if already booted — calls completion immediately
        rt.boot { [weak self] error in
            guard let self = self else { return }
            guard let surfaceId = self.surfaceId else { return }

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

            self.hydrationStarted = true
            print("[ReactDomNativeKit] Resume hydration starting")

            // Register surface for hydration with the SSR tree
            let treeBuilder = self.ssrTreeBuilder!
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

            // Rewire onViewsNeedUpdate to Bindings (post-hydration path)
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

            // Replay buffered JS instructions (Flight data from prelude + resume)
            for code in self.ssrJavaScriptBuffer {
                ReactRuntime.shared.evaluateScript(code)
            }
            self.ssrJavaScriptBuffer.removeAll()

            // Derive the Flight server URL from the bootstrap URL
            let flightServerURL: String
            if let bootURL = URL(string: bootstrapURL),
               let scheme = bootURL.scheme,
               let host = bootURL.host {
                let port = bootURL.port.map { ":\($0)" } ?? ""
                flightServerURL = "\(scheme)://\(host)\(port)"
            } else {
                flightServerURL = bootstrapURL
            }

            // Derive the fixture path from the resume URL
            let fixturePath: String
            let knownPrefixes = ["ssr", "prerender", "resume"]
            if let ssrURL = URL(string: url),
               ssrURL.pathComponents.count >= 3,
               knownPrefixes.contains(ssrURL.pathComponents[1]) {
                fixturePath = "/fixtures/" + ssrURL.pathComponents.dropFirst(2).joined(separator: "/")
            } else {
                fixturePath = URL(string: url)?.path ?? "/"
            }

            let fullFlightURL = flightServerURL + fixturePath
            rt.hydrateSurface(surfaceId: surfaceId, serverURL: fullFlightURL)
        }
    }
}
