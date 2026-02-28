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

    /// The registered JS event handler, called for Native -> JS event dispatch.
    /// Set via $$registerEventHandler. Protected via engine.protect().
    var eventHandler: JSValueRef?

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

        registerBindingFunctions()
        registerEventPriorityConstants()

        // Wire event dispatcher after init to avoid capturing self before initialization
        self.mutationApplier.dispatchEvent = { [weak self] view, eventType, payload in
            self?.dispatchEvent(from: view, eventType: eventType, payload: payload)
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

    /// Registers a surface for hydration, reusing existing SSR views.
    ///
    /// Unlike `registerSurface`, this method:
    /// 1. Moves existing SSR subviews from the container into the scroll view
    /// 2. Pre-populates `currentTrees` with the SSR tree so the differentiator
    ///    recognizes existing nodes (no duplicate CREATE mutations)
    /// 3. Transfers SSR view registry entries so the mutation applier can find
    ///    existing UIKit views
    public func registerSurfaceForHydration(
        surfaceId: Int,
        rootView: UIView,
        ssrTree: [ShadowNodeWrapper],
        ssrViewRegistry: ViewRegistry
    ) {
        let scrollView = UIScrollView(frame: rootView.bounds)
        scrollView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        scrollView.contentInsetAdjustmentBehavior = .automatic

        // Move existing SSR views into the scroll view (avoids visual flash)
        for subview in rootView.subviews {
            subview.removeFromSuperview()
            scrollView.addSubview(subview)
        }
        rootView.addSubview(scrollView)

        rootViews[surfaceId] = scrollView
        currentTrees[surfaceId] = ssrTree
        viewRegistry.merge(from: ssrViewRegistry)
        mutationApplier.installRootTapGesture(on: scrollView)
    }

    // MARK: - SSR Tree Management

    /// Registers an SSR tree for hydration traversal.
    /// Called by Root.hydrateRoot() after SSR first paint completes.
    public func registerSSRTree(surfaceId: Int, rootChildren: [ShadowNodeWrapper]) {
        ssrTrees[surfaceId] = rootChildren
        // Register all SSR nodes so they have IDs for the bridge
        for child in rootChildren {
            registerSSRSubtree(child)
        }
        // Build parent map for resilient sibling lookups
        for child in rootChildren {
            buildParentMap(child)
        }
    }

    /// Recursively registers all nodes in an SSR subtree.
    private func registerSSRSubtree(_ node: ShadowNodeWrapper) {
        _ = registerNode(node)
        for child in node.children {
            registerSSRSubtree(child)
        }
    }

    /// Recursively builds the parent map for an SSR subtree.
    private func buildParentMap(_ node: ShadowNodeWrapper) {
        for child in node.children {
            ssrNodeToParent[ObjectIdentifier(child)] = node
            buildParentMap(child)
        }
    }

    /// Clears the SSR tree after hydration completes.
    public func clearSSRTree(surfaceId: Int) {
        ssrTrees.removeValue(forKey: surfaceId)
        ssrNodeToParent.removeAll()
    }

    /// Mutates the SSR reference tree in place when a boundary reveals.
    /// Keeps node IDs stable so React's _ssrNodeRef references remain valid.
    public func revealBoundaryInSSRTree(surfaceId: Int, boundaryId: Int, contentNodes: [ShadowNodeWrapper]) {
        guard let tree = ssrTrees[surfaceId] else { return }
        guard let suspenseNode = findSuspenseNodeByBoundaryId(boundaryId, in: tree) else { return }

        #if DEBUG
        let nodeIdBefore = ObjectIdentifier(suspenseNode)
        #endif

        suspenseNode.children = contentNodes
        suspenseNode.props["pending"] = false
        for child in contentNodes { registerNewNodesInSubtree(child) }
        buildParentMap(suspenseNode)

        #if DEBUG
        // Assert node identity didn't change during in-place mutation
        assert(ObjectIdentifier(suspenseNode) == nodeIdBefore,
               "revealBoundaryInSSRTree: node identity changed during mutation")
        #endif
    }

    private func findSuspenseNodeByBoundaryId(_ boundaryId: Int, in nodes: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
        for node in nodes {
            if node.family.elementType == "#suspense",
               let bid = node.props["boundaryId"] as? Int,
               bid == boundaryId {
                return node
            }
            if let found = findSuspenseNodeByBoundaryId(boundaryId, in: node.children) {
                return found
            }
        }
        return nil
    }

    /// Marks hydration as in progress for a surface.
    /// While active, SSR tree updates are queued instead of applied immediately.
    public func markHydrationStarted(surfaceId: Int) {
        hydrationInProgress.insert(surfaceId)
    }

    /// Stores SSR commit timing data so it can be pushed to JS when tracing starts.
    /// Called by Root after SSR first paint and boundary reveals complete.
    ///
    /// If tracing is already active (e.g. "Reload and Profile" triggered SSR
    /// after tracing started), pushes immediately.
    public func addSSRCommitTimings(_ timings: [[String: Any]]) {
        pendingSSRCommitTimings.append(contentsOf: timings)

        if nativeTracingEnabled {
            pushPendingSSRCommitTimingsToJS()
        }
    }

    /// Updates the current tree for a surface after an SSR boundary reveal
    /// during hydration. Calculates layout, diffs old vs new, applies mutations,
    /// and updates the stored current tree.
    ///
    /// This mirrors what $$completeRoot does but for SSR boundary reveals that
    /// happen after hydration has started (React owns the view hierarchy).
    /// When tracing is enabled, collects timing and pushes to JS for the
    /// Shadow Tree and Layout tracks.
    public func updateCurrentTree(
        surfaceId: Int,
        oldTree: [ShadowNodeWrapper],
        newTree: [ShadowNodeWrapper]
    ) {
        let tracing = nativeTracingEnabled
        let commitStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // 1. Calculate layout on new tree
        let layoutStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        var contentSize: CGSize = .zero
        if let rootView = rootViews[surfaceId] {
            contentSize = calculateYogaLayout(for: newTree, in: rootView.bounds, surfaceId: surfaceId, tracing: tracing)
        }
        let layoutEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // 2. Diff old vs new
        let diffStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        var diffNodeTimings: [(type: String, start: Double, end: Double)] = []
        let mutations: [Mutation]
        if tracing {
            mutations = differentiator.diff(
                oldChildren: oldTree,
                newChildren: newTree,
                parent: nil,
                tracing: true,
                nodeTimings: &diffNodeTimings
            )
        } else {
            mutations = differentiator.diff(
                oldChildren: oldTree,
                newChildren: newTree,
                parent: nil
            )
        }
        let diffEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // 3. Apply mutations
        let mutationsStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
        var syncNodeTimings: [(type: String, start: Double, end: Double)] = []
        if let rootView = rootViews[surfaceId] {
            if tracing {
                mutationApplier.applyMutations(mutations, rootView: rootView, tracing: true, mutationTimings: &mutationTimings)
            } else {
                mutationApplier.applyMutations(mutations, rootView: rootView)
            }

            let syncStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
            if tracing {
                syncAllFrames(newTree, tracing: true, nodeTimings: &syncNodeTimings)
            } else {
                syncAllFrames(newTree)
            }
            let syncEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0
            if tracing {
                lastSyncTimings = (start: syncStart, end: syncEnd)
            }

            // Attach new root-level children
            for child in newTree {
                if let childView = viewRegistry.view(for: child.family) {
                    if childView.superview == nil {
                        rootView.addSubview(childView)
                    }
                }
            }
        }
        let mutationsEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // 4. Update scroll content size
        if let scrollView = rootViews[surfaceId] as? UIScrollView {
            scrollView.contentSize = CGSize(
                width: scrollView.bounds.width,
                height: contentSize.height
            )
        }

        // 5. Update current tree
        currentTrees[surfaceId] = newTree

        // 6. Register new nodes in the tree (content nodes + cloned path nodes)
        for child in newTree {
            registerNewNodesInSubtree(child)
        }

        let commitEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // Push timing to JS for Shadow Tree and Layout tracks
        if tracing {
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
            let stats = computeTreeStats(newTree)
            var timing: [String: Any] = [
                "label": "SSR Reveal",
                "commitStart": commitStart, "commitEnd": commitEnd,
                "layoutStart": layoutStart, "layoutEnd": layoutEnd,
                "diffStart": diffStart, "diffEnd": diffEnd,
                "mutationsStart": mutationsStart, "mutationsEnd": mutationsEnd,
                "mutationCount": mutations.count,
                "creates": creates, "inserts": inserts,
                "deletes": deletes, "removes": removes, "updates": updates,
                "nodeCount": stats.nodeCount, "treeDepth": stats.depth,
                "rootTypes": newTree.map { $0.family.elementType }.joined(separator: ", "),
                "affectedTypes": affectedTypes.sorted().joined(separator: ", "),
            ]
            if let syncTimings = lastSyncTimings {
                timing["syncStart"] = syncTimings.start
                timing["syncEnd"] = syncTimings.end
                lastSyncTimings = nil
            }
            if let layoutTimings = lastLayoutTimings {
                for (key, value) in layoutTimings {
                    timing[key] = value
                }
                lastLayoutTimings = nil
            }
            // Per-node timing arrays
            var diffElements: [Any] = []
            for entry in diffNodeTimings {
                diffElements.append(entry.type)
                diffElements.append(entry.start)
                diffElements.append(entry.end)
            }
            timing["diffNodes"] = diffElements
            var mutElements: [Any] = []
            for entry in mutationTimings {
                mutElements.append(entry.mutationType)
                mutElements.append(entry.elementType)
                mutElements.append(entry.start)
                mutElements.append(entry.end)
            }
            timing["mutationNodes"] = mutElements
            let combinedLayout = lastLayoutNodeTimings + syncNodeTimings
            var layoutElements: [Any] = []
            for entry in combinedLayout {
                layoutElements.append(entry.type)
                layoutElements.append(entry.start)
                layoutElements.append(entry.end)
            }
            timing["layoutNodes"] = layoutElements
            lastLayoutNodeTimings = []

            // Push immediately via JSON
            if let jsonData = try? JSONSerialization.data(withJSONObject: [timing]),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                engine.evaluate("globalThis.$$handleSSRCommitTimings && globalThis.$$handleSSRCommitTimings(\(jsonString))")
            }
        }
    }

    /// Applies a boundary reveal to the current committed tree (currentTrees[surfaceId])
    /// instead of the SSR coordinator's internal tree. Used post-hydration to avoid
    /// overwriting React's committed state with stale SSR data.
    public func revealBoundaryInCurrentTree(
        surfaceId: Int,
        boundaryId: Int,
        contentNodes: [ShadowNodeWrapper]
    ) {
        guard let oldTree = currentTrees[surfaceId] else { return }
        guard let suspenseNode = findSuspenseNodeByBoundaryId(boundaryId, in: oldTree) else { return }

        let newTree = ShadowTreeBuilder.revealBoundaryImmutable(
            rootChildren: oldTree,
            suspenseNode: suspenseNode,
            contentNodes: contentNodes
        )

        updateCurrentTree(surfaceId: surfaceId, oldTree: oldTree, newTree: newTree)
    }

    /// Updates the SSR tree for hydration traversal after a boundary reveal.
    /// Called when a boundary reveals after hydration has started so that
    /// $$getSSRChildOf / $$getNextSSRSibling see the content nodes.
    ///
    /// If hydration is in progress, the update is queued and applied after
    /// the first $$completeRoot to prevent mid-hydration tree mutations.
    public func updateSSRTree(surfaceId: Int, newTree: [ShadowNodeWrapper]) {
        ssrTrees[surfaceId] = newTree
        for child in newTree { registerNewNodesInSubtree(child) }
        for child in newTree { buildParentMap(child) }
    }

    /// Registers nodes in a subtree that aren't already in the node registry.
    private func registerNewNodesInSubtree(_ node: ShadowNodeWrapper) {
        // Check if already registered (any entry pointing to this exact object)
        let alreadyRegistered = nodeRegistry.values.contains(where: { $0 === node })
        if !alreadyRegistered {
            _ = registerNode(node)
        }
        for child in node.children {
            registerNewNodesInSubtree(child)
        }
    }

    // MARK: - Layout

    /// Computes tree statistics (total node count and max depth) by walking
    /// the shadow tree. Used when tracing is enabled to populate the timing
    /// dictionary with tree summary data.
    func computeTreeStats(_ roots: [ShadowNodeWrapper]) -> (nodeCount: Int, depth: Int) {
        var count = 0
        func walk(_ nodes: [ShadowNodeWrapper], currentDepth: Int, maxDepth: inout Int) {
            for node in nodes {
                count += 1
                if currentDepth > maxDepth { maxDepth = currentDepth }
                walk(node.children, currentDepth: currentDepth + 1, maxDepth: &maxDepth)
            }
        }
        var maxDepth = 0
        walk(roots, currentDepth: 1, maxDepth: &maxDepth)
        return (count, maxDepth)
    }

    /// Recursively syncs every UIView's frame to match its node's layoutFrame.
    ///
    /// The Differentiator only emits UPDATE mutations for cloned nodes, but
    /// Yoga recalculates layout for the entire tree. Reused nodes (same
    /// identity across old/new trees) may have new positions when a preceding
    /// sibling changed size. This pass ensures all frames stay in sync.
    func syncAllFrames(_ nodes: [ShadowNodeWrapper]) {
        for node in nodes {
            if let view = viewRegistry.view(for: node.family) {
                if view.frame != node.layoutFrame {
                    view.frame = node.layoutFrame
                }
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }
            syncAllFrames(node.children)
        }
    }

    /// Recursively syncs every UIView's frame to match its node's layoutFrame,
    /// with optional per-node timing collection for flame graph visualization.
    func syncAllFrames(
        _ nodes: [ShadowNodeWrapper],
        tracing: Bool,
        nodeTimings: inout [(type: String, start: Double, end: Double)]
    ) {
        for node in nodes {
            let nodeStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

            if let view = viewRegistry.view(for: node.family) {
                if view.frame != node.layoutFrame {
                    view.frame = node.layoutFrame
                }
                if let scrollView = view as? UIScrollView, let contentSize = node.scrollContentSize {
                    scrollView.contentSize = contentSize
                }
            }
            syncAllFrames(node.children, tracing: tracing, nodeTimings: &nodeTimings)

            if tracing {
                let nodeEnd = CACurrentMediaTime() * 1000.0
                nodeTimings.append((node.family.elementType, nodeStart, nodeEnd))
            }
        }
    }

    // MARK: - Yoga Layout

    /// Calculate layout using Yoga for the given top-level children within bounds.
    ///
    /// Uses a persistent root YGNode per surface that survives across commits.
    /// YGNodeSetChildren preserves layout caches for children whose yoga nodes
    /// haven't changed (unchanged subtrees), so Yoga can skip recalculating
    /// them on subsequent commits.
    ///
    /// Returns the natural content size (width × height) from Yoga layout.
    @discardableResult
    func calculateYogaLayout(for children: [ShadowNodeWrapper], in bounds: CGRect, surfaceId: Int, tracing: Bool = false) -> CGSize {
        guard !children.isEmpty else { return .zero }

        // 1. Get or create persistent root node for this surface
        let rootNode: YGNodeRef
        if let existing = rootYogaNodes[surfaceId] {
            rootNode = existing
        } else {
            rootNode = YGNodeNewWithConfig(YogaConfig.shared)!
            YGNodeStyleSetFlexDirection(rootNode, .column)
            rootYogaNodes[surfaceId] = rootNode
        }

        // Update width (may change on rotation)
        YGNodeStyleSetWidth(rootNode, Float(bounds.width))
        // Don't set height — let content determine its own height.
        // On the web, the viewport scrolls when content overflows rather
        // than shrinking children via flexShrink.

        // 2. Update root's children using YGNodeSetChildren.
        // This preserves layout caches for yoga nodes that remain in the
        // tree (unchanged subtrees) while properly cleaning up removed ones.
        // Children with other owners need to be detached first.
        for child in children {
            if let owner = YGNodeGetOwner(child.yogaNode), owner != rootNode {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
        }
        var childYogaNodes: [YGNodeRef?] = children.map { $0.yogaNode }
        childYogaNodes.withUnsafeBufferPointer { buffer in
            YGNodeSetChildren(rootNode, buffer.baseAddress, buffer.count)
        }

        // 3. Calculate layout (first pass)
        let yogaStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)

        // 3b. Post-layout text re-measurement
        let textRemeasureStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        var needsSecondPass = false
        for child in children {
            if ShadowTreeLayout.markTextNodesNeedingRemeasure(child) {
                needsSecondPass = true
            }
        }
        var didRemeasure = false
        if needsSecondPass {
            didRemeasure = true
            YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)
        }
        let textRemeasureEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0
        let yogaEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // Read content size from root (which has unbounded height)
        let yogaHeight = CGFloat(YGNodeLayoutGetHeight(rootNode))

        // 4. Walk tree reading layout results into layoutFrame
        let readFramesStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        if tracing {
            self.lastLayoutNodeTimings = []
            for child in children {
                ShadowTreeLayout.readLayoutFrames(
                    node: child, tracing: true, nodeTimings: &self.lastLayoutNodeTimings
                )
            }
        } else {
            for child in children {
                ShadowTreeLayout.readLayoutFrames(node: child)
            }
        }

        // 4a. Adjust for CSS margin collapse-through
        ShadowTreeLayout.adjustMarginCollapseThrough(children: children)

        let actualHeight = ShadowTreeLayout.computeActualContentHeight(for: children)
        let readFramesEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0
        let contentSize = CGSize(
            width: CGFloat(YGNodeLayoutGetWidth(rootNode)),
            height: max(yogaHeight, actualHeight)
        )

        // 4b. Compute scroll content sizes for overflow:scroll/auto nodes
        let scrollStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
        for child in children {
            ShadowTreeLayout.computeScrollContentSizes(for: child)
        }
        let scrollEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

        // Children stay attached to the persistent root — their layout
        // caches are preserved for the next commit's incremental layout.

        if tracing {
            lastLayoutTimings = [
                "yogaStart": yogaStart, "yogaEnd": yogaEnd,
                "textRemeasureStart": textRemeasureStart, "textRemeasureEnd": textRemeasureEnd,
                "didRemeasure": didRemeasure ? 1.0 : 0.0,
                "readFramesStart": readFramesStart, "readFramesEnd": readFramesEnd,
                "scrollStart": scrollStart, "scrollEnd": scrollEnd,
            ]
        }

        return contentSize
    }

    // MARK: - DevTools Screenshot Capture

    /// Captures a screenshot of the app window as a JPEG and sends it via
    /// `sendInspectorMessage` as a base64-encoded `screenshot-data` message.
    /// Called from the DevTools screencast proxy to capture frames in-process
    /// instead of shelling out to `xcrun simctl`.
    ///
    /// - Parameters:
    ///   - maxWidth: Maximum width in pixels for the rendered image. If the
    ///     window's pixel width exceeds this, the render is scaled down
    ///     proportionally. Pass 0 or negative to capture at full resolution.
    ///   - quality: JPEG compression quality from 0.0 (most compression) to
    ///     1.0 (least compression).
    public func captureScreenshot(maxWidth: Int, quality: CGFloat) {
        guard let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first,
              let window = windowScene.windows.first else {
            return
        }

        let scale = windowScene.screen.scale
        let bounds = window.bounds
        let pixelWidth = Int(bounds.width * scale)
        let pixelHeight = Int(bounds.height * scale)

        // Determine the render size — scale down if maxWidth is set and
        // the window's pixel width exceeds it.
        var renderSize = bounds.size
        if maxWidth > 0 && pixelWidth > maxWidth {
            let ratio = CGFloat(maxWidth) / CGFloat(pixelWidth)
            renderSize = CGSize(
                width: bounds.width * ratio,
                height: bounds.height * ratio
            )
        }

        let renderer = UIGraphicsImageRenderer(size: renderSize)
        let jpegData = renderer.jpegData(withCompressionQuality: quality) { _ in
            window.drawHierarchy(in: CGRect(origin: .zero, size: renderSize), afterScreenUpdates: false)
        }

        let base64 = jpegData.base64EncodedString()

        // Send the original pixel dimensions (not the possibly-downscaled
        // render size) so the proxy can map click coordinates correctly.
        let message = "{\"type\":\"screenshot-data\",\"data\":\"\(base64)\",\"width\":\(pixelWidth),\"height\":\(pixelHeight),\"scale\":\(Int(scale))}"
        sendInspectorMessage?(message)
    }

    // MARK: - DevTools Touch Dispatch

    /// Dispatches a synthetic tap at a point in window coordinates.
    /// Called from the DevTools screencast when the user clicks on the preview.
    public func dispatchTouchAtWindowPoint(x: Double, y: Double) {
        let windowPoint = CGPoint(x: x, y: y)

        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?.windows.first else {
            return
        }

        // Hit test from the window — UIKit finds the right view regardless
        // of whether it's in a nav bar, tab bar, scroll view, etc.
        guard let hitView = window.hitTest(windowPoint, with: nil) else {
            return
        }

        // Find the nearest UIControl (UIButton, _UIButtonBarButton, etc.)
        // and fire its primary action. This handles nav bar buttons, tab bar
        // items, and any other UIControl subclass.
        var controlSearch: UIView? = hitView
        while let view = controlSearch {
            if let control = view as? UIControl {
                control.sendActions(for: .touchUpInside)
                return
            }
            controlSearch = view.superview
        }

        // UITextField: focus it
        if hitView is UITextField {
            hitView.becomeFirstResponder()
            return
        }

        // React-managed views: walk up dispatching click events (event bubbling)
        var current: UIView? = hitView
        while let view = current {
            if let family = viewRegistry.family(for: view),
               family.hasClickHandler {
                dispatchEvent(from: view, eventType: "click", payload: ["_nativeTimestamp": CACurrentMediaTime() * 1000])
            }
            current = view.superview
        }
    }

    // MARK: - Event Dispatch (Native -> JS)

    /// Dispatches a native event to the JS event handler. Called from UIKit
    /// event handlers (tap gesture recognizers, scroll delegates, etc.).
    ///
    /// - Parameters:
    ///   - view: The UIView that received the event.
    ///   - eventType: The event type string (e.g. "click", "scroll", "change").
    ///   - payload: The event payload dictionary.
    public func dispatchEvent(
        from view: UIView,
        eventType: String,
        payload: [String: Any]
    ) {
        // 1. Look up the ShadowNodeFamily for this view
        guard let family = viewRegistry.family(for: view) else {
            // View not in registry - possibly already unmounted. Silently drop.
            return
        }

        // 2. Get the InstanceHandle from the family
        guard let instanceHandle = family.instanceHandle else {
            // InstanceHandle was GC'd - node is unmounted. Silently drop.
            return
        }

        // 3. Get the registered event handler
        guard let handler = eventHandler else {
            print("[react-dom-native] Warning: No event handler registered")
            return
        }

        // 4. Call handler(instanceHandle, eventType, payload)
        _ = engine.callFunction(handler, args: [
            instanceHandle,
            engine.makeString(eventType),
            engine.wrapNativeObject(payload as NSDictionary)
        ])
    }

    // MARK: - SSR Traversal Helpers

    /// Creates a JS object representing an SSR node for hydration traversal.
    func makeSSRNodeRef(_ node: ShadowNodeWrapper, engine: JSEngine) -> JSValueRef? {
        let nodeId = registerNode(node)
        let obj = engine.makeObject()
        engine.setProperty(obj, "_ssrNodeRef", engine.makeNumber(Double(nodeId)))
        engine.setProperty(obj, "_ssrFamily", engine.makeNumber(Double(nodeId)))
        engine.setProperty(obj, "type", engine.makeString(node.family.elementType))
        if let text = node.text {
            engine.setProperty(obj, "text", engine.makeString(text))
        }
        // For #suspense nodes, expose pending/fallback state for hydration
        if node.family.elementType == "#suspense" {
            let pending = (node.props["pending"] as? Bool) ?? false
            let fallback = (node.props["fallback"] as? Bool) ?? false
            engine.setProperty(obj, "pending", engine.makeBool(pending))
            engine.setProperty(obj, "fallback", engine.makeBool(fallback))
            if let boundaryId = node.props["boundaryId"] as? Int {
                engine.setProperty(obj, "boundaryId", engine.makeNumber(Double(boundaryId)))
            }
        }
        return obj
    }

    /// Finds the next sibling of a node by searching all known trees.
    /// Falls back to the parent map if the node is from a stale (pre-reveal) tree.
    func findNextSibling(of target: ShadowNodeWrapper) -> ShadowNodeWrapper? {
        // Primary: search current SSR trees
        for (_, tree) in ssrTrees {
            if let sibling = findNextSiblingInChildren(target, children: tree) {
                return sibling
            }
        }

        // Fallback: use parent map for stale nodes from pre-reveal trees
        if let parent = ssrNodeToParent[ObjectIdentifier(target)] {
            if let index = parent.children.firstIndex(where: { $0 === target }),
               index + 1 < parent.children.count {
                return parent.children[index + 1]
            }
        }

        return nil
    }

    /// Recursively searches children arrays for the target node and returns the next sibling.
    func findNextSiblingInChildren(_ target: ShadowNodeWrapper, children: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
        for (index, child) in children.enumerated() {
            if child === target {
                if index + 1 < children.count {
                    return children[index + 1]
                }
                return nil
            }
            if let found = findNextSiblingInChildren(target, children: child.children) {
                return found
            }
        }
        return nil
    }

    // MARK: - DevTools

    /// Delivers an inspector message from the dev server to JS.
    /// Calls the global $$onInspectorMessage function if it exists.
    public func deliverInspectorMessage(_ json: String) {
        guard let handler = engine.getGlobalProperty("$$onInspectorMessage") else { return }
        _ = engine.callFunction(handler, args: [engine.makeString(json)])
    }

    /// Counter for inspector-specific node IDs (document, body wrapper nodes).
    /// Shadow tree nodes use their nodeRegistry IDs directly.
    var inspectorNodeIdCounter = 900000

    func nextInspectorNodeId() -> Int {
        inspectorNodeIdCounter += 1
        return inspectorNodeIdCounter
    }

    /// Converts a style dictionary to a CSS-like string.
    func styleDictToCSS(_ style: [String: Any]) -> String {
        var parts: [String] = []
        for (key, value) in style.sorted(by: { $0.key < $1.key }) {
            let cssKey = camelToKebab(key)
            if let num = value as? NSNumber {
                // Unitless properties
                let unitless: Set<String> = [
                    "opacity", "flex-grow", "flex-shrink", "z-index",
                    "font-weight", "line-height", "order"
                ]
                if unitless.contains(cssKey) {
                    parts.append("\(cssKey): \(num)")
                } else {
                    parts.append("\(cssKey): \(num)px")
                }
            } else {
                parts.append("\(cssKey): \(value)")
            }
        }
        return parts.joined(separator: "; ")
    }

    /// Converts camelCase to kebab-case (e.g., "fontSize" → "font-size").
    func camelToKebab(_ str: String) -> String {
        var result = ""
        for char in str {
            if char.isUppercase {
                result += "-"
                result += char.lowercased()
            } else {
                result += String(char)
            }
        }
        return result
    }

    func nodeToHTML(_ node: ShadowNodeWrapper, depth: Int = 0) -> String {
        let elementType = node.family.elementType

        if elementType == "#text" {
            return node.text ?? ""
        }

        let indent = String(repeating: "  ", count: depth)

        // Build attributes string
        var attrParts: [String] = []
        for (key, value) in node.props.sorted(by: { $0.key < $1.key }) {
            if key == "style" {
                if let styleDict = value as? [String: Any] {
                    let css = styleDictToCSS(styleDict)
                    if !css.isEmpty {
                        attrParts.append("style=\"\(css)\"")
                    }
                }
            } else if key == "children" || key == "instanceHandle" {
                continue
            } else if value is NSNull {
                continue
            } else {
                attrParts.append("\(key)=\"\(value)\"")
            }
        }

        let attrString = attrParts.isEmpty ? "" : " " + attrParts.joined(separator: " ")

        if node.children.isEmpty {
            return "\(indent)<\(elementType)\(attrString) />"
        }

        // Check if children are all text — render inline
        let allText = node.children.allSatisfy { $0.family.elementType == "#text" }
        if allText {
            let text = node.children.map { $0.text ?? "" }.joined()
            return "\(indent)<\(elementType)\(attrString)>\(text)</\(elementType)>"
        }

        var lines = ["\(indent)<\(elementType)\(attrString)>"]
        for child in node.children {
            lines.append(nodeToHTML(child, depth: depth + 1))
        }
        lines.append("\(indent)</\(elementType)>")
        return lines.joined(separator: "\n")
    }

    func nanToZero(_ value: Float) -> Float {
        return value.isNaN ? 0 : value
    }

    func formatPx(_ value: Float) -> String {
        if value.isNaN { return "0px" }
        if value == Float(Int(value)) { return "\(Int(value))px" }
        return String(format: "%.1fpx", value)
    }

    func formatYGValue(_ value: YGValue) -> String {
        switch value.unit {
        case .point: return formatPx(value.value)
        case .percent: return "\(value.value)%"
        case .auto: return "auto"
        default: return "auto"
        }
    }

    func displayToString(_ display: YGDisplay) -> String {
        switch display {
        case .flex: return "flex"
        case .block: return "block"
        case .none: return "none"
        case .inlineBlock: return "inline-block"
        default: return "flex"
        }
    }

    func positionToString(_ position: YGPositionType) -> String {
        switch position {
        case .relative: return "relative"
        case .absolute: return "absolute"
        case .static: return "static"
        default: return "relative"
        }
    }

    func flexDirectionToString(_ dir: YGFlexDirection) -> String {
        switch dir {
        case .row: return "row"
        case .column: return "column"
        case .rowReverse: return "row-reverse"
        case .columnReverse: return "column-reverse"
        default: return "column"
        }
    }

    func justifyToString(_ justify: YGJustify) -> String {
        switch justify {
        case .flexStart: return "flex-start"
        case .center: return "center"
        case .flexEnd: return "flex-end"
        case .spaceBetween: return "space-between"
        case .spaceAround: return "space-around"
        case .spaceEvenly: return "space-evenly"
        default: return "flex-start"
        }
    }

    func alignToString(_ align: YGAlign) -> String {
        switch align {
        case .auto: return "auto"
        case .flexStart: return "flex-start"
        case .center: return "center"
        case .flexEnd: return "flex-end"
        case .stretch: return "stretch"
        case .baseline: return "baseline"
        case .spaceBetween: return "space-between"
        case .spaceAround: return "space-around"
        default: return "stretch"
        }
    }

    func flexWrapToString(_ wrap: YGWrap) -> String {
        switch wrap {
        case .noWrap: return "nowrap"
        case .wrap: return "wrap"
        case .wrapReverse: return "wrap-reverse"
        default: return "nowrap"
        }
    }

    func overflowToString(_ overflow: YGOverflow) -> String {
        switch overflow {
        case .visible: return "visible"
        case .hidden: return "hidden"
        case .scroll: return "scroll"
        default: return "visible"
        }
    }

    // MARK: - CDP Inspector Methods (Direct Swift)
    //
    // These methods return [String: Any] dictionaries for direct use by
    // Swift CDP dispatch, avoiding JS↔Swift boundary crossings.

    /// Returns the full CDP DOM.Node document tree for a surface.
    func cdpGetDocumentTree(surfaceId: Int) -> [String: Any] {
        let children: [ShadowNodeWrapper]?
        if surfaceId > 0, let tree = currentTrees[surfaceId] {
            children = tree
        } else {
            children = currentTrees.values.first(where: { !$0.isEmpty })
                ?? currentTrees.values.first
        }

        guard let children = children else {
            return makeEmptyDocumentDict()
        }

        var bodyChildren: [[String: Any]] = []
        for child in children {
            bodyChildren.append(contentsOf: serializeNodeToDict(child))
        }

        let bodyId = nextInspectorNodeId()
        let headId = nextInspectorNodeId()
        let htmlId = nextInspectorNodeId()
        let docId = nextInspectorNodeId()

        let bodyNode: [String: Any] = [
            "nodeId": bodyId, "backendNodeId": bodyId,
            "nodeType": 1, "nodeName": "BODY", "localName": "body", "nodeValue": "",
            "childNodeCount": bodyChildren.count, "children": bodyChildren, "attributes": [] as [Any],
        ]
        let headNode: [String: Any] = [
            "nodeId": headId, "backendNodeId": headId,
            "nodeType": 1, "nodeName": "HEAD", "localName": "head", "nodeValue": "",
            "childNodeCount": 0, "children": [] as [Any], "attributes": [] as [Any],
        ]
        let htmlNode: [String: Any] = [
            "nodeId": htmlId, "backendNodeId": htmlId,
            "nodeType": 1, "nodeName": "HTML", "localName": "html", "nodeValue": "",
            "childNodeCount": 2, "children": [headNode, bodyNode], "attributes": [] as [Any],
        ]
        let doc: [String: Any] = [
            "nodeId": docId, "backendNodeId": docId,
            "nodeType": 9, "nodeName": "#document", "localName": "", "nodeValue": "",
            "childNodeCount": 1, "children": [htmlNode],
            "documentURL": "falcon://app", "baseURL": "falcon://app", "xmlVersion": "",
        ]
        return ["root": doc]
    }

    /// Returns CDP computedStyle for a node.
    func cdpGetComputedStyle(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["computedStyle": [] as [Any]]
        }

        var properties: [[String: String]] = []
        let yoga = node.yogaNode
        let frame = node.layoutFrame

        properties.append(["name": "width", "value": "\(frame.width)px"])
        properties.append(["name": "height", "value": "\(frame.height)px"])
        properties.append(["name": "top", "value": "\(frame.origin.y)px"])
        properties.append(["name": "left", "value": "\(frame.origin.x)px"])

        properties.append(["name": "margin-top", "value": formatPx(YGNodeLayoutGetMargin(yoga, .top))])
        properties.append(["name": "margin-right", "value": formatPx(YGNodeLayoutGetMargin(yoga, .right))])
        properties.append(["name": "margin-bottom", "value": formatPx(YGNodeLayoutGetMargin(yoga, .bottom))])
        properties.append(["name": "margin-left", "value": formatPx(YGNodeLayoutGetMargin(yoga, .left))])

        properties.append(["name": "padding-top", "value": formatPx(YGNodeLayoutGetPadding(yoga, .top))])
        properties.append(["name": "padding-right", "value": formatPx(YGNodeLayoutGetPadding(yoga, .right))])
        properties.append(["name": "padding-bottom", "value": formatPx(YGNodeLayoutGetPadding(yoga, .bottom))])
        properties.append(["name": "padding-left", "value": formatPx(YGNodeLayoutGetPadding(yoga, .left))])

        properties.append(["name": "border-top-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .top))])
        properties.append(["name": "border-right-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .right))])
        properties.append(["name": "border-bottom-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .bottom))])
        properties.append(["name": "border-left-width", "value": formatPx(YGNodeLayoutGetBorder(yoga, .left))])

        properties.append(["name": "display", "value": displayToString(YGNodeStyleGetDisplay(yoga))])
        properties.append(["name": "position", "value": positionToString(YGNodeStyleGetPositionType(yoga))])
        properties.append(["name": "flex-direction", "value": flexDirectionToString(YGNodeStyleGetFlexDirection(yoga))])
        properties.append(["name": "justify-content", "value": justifyToString(YGNodeStyleGetJustifyContent(yoga))])
        properties.append(["name": "align-items", "value": alignToString(YGNodeStyleGetAlignItems(yoga))])
        properties.append(["name": "align-self", "value": alignToString(YGNodeStyleGetAlignSelf(yoga))])
        properties.append(["name": "align-content", "value": alignToString(YGNodeStyleGetAlignContent(yoga))])
        properties.append(["name": "flex-wrap", "value": flexWrapToString(YGNodeStyleGetFlexWrap(yoga))])
        properties.append(["name": "overflow", "value": overflowToString(YGNodeStyleGetOverflow(yoga))])

        properties.append(["name": "flex-grow", "value": "\(YGNodeStyleGetFlexGrow(yoga))"])
        properties.append(["name": "flex-shrink", "value": "\(YGNodeStyleGetFlexShrink(yoga))"])
        properties.append(["name": "flex-basis", "value": formatYGValue(YGNodeStyleGetFlexBasis(yoga))])

        let gap = YGNodeStyleGetGap(yoga, .all)
        if gap.unit != .undefined { properties.append(["name": "gap", "value": formatYGValue(gap)]) }
        let rowGap = YGNodeStyleGetGap(yoga, .row)
        if rowGap.unit != .undefined { properties.append(["name": "row-gap", "value": formatYGValue(rowGap)]) }
        let columnGap = YGNodeStyleGetGap(yoga, .column)
        if columnGap.unit != .undefined { properties.append(["name": "column-gap", "value": formatYGValue(columnGap)]) }

        let style = node.props["style"] as? [String: Any] ?? [:]
        let visualKeys = [
            "color", "backgroundColor", "opacity",
            "fontSize", "fontWeight", "fontFamily", "fontStyle",
            "borderRadius", "borderColor", "borderStyle",
            "textAlign", "textDecoration", "lineHeight"
        ]
        for key in visualKeys {
            if let val = style[key] {
                let cssKey = camelToKebab(key)
                if let num = val as? NSNumber {
                    let unitless: Set<String> = ["opacity", "font-weight", "line-height"]
                    if unitless.contains(cssKey) {
                        properties.append(["name": cssKey, "value": "\(num)"])
                    } else {
                        properties.append(["name": cssKey, "value": "\(num)px"])
                    }
                } else {
                    properties.append(["name": cssKey, "value": "\(val)"])
                }
            }
        }

        return ["computedStyle": properties]
    }

    /// Returns CDP inline style for a node.
    func cdpGetInlineStyle(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["cssProperties": [] as [Any], "shorthandEntries": [] as [Any]]
        }

        let style = node.props["style"] as? [String: Any] ?? [:]
        var cssProps: [[String: String]] = []
        for (key, value) in style.sorted(by: { $0.key < $1.key }) {
            let cssKey = camelToKebab(key)
            if let num = value as? NSNumber {
                let unitless: Set<String> = [
                    "opacity", "flex-grow", "flex-shrink", "z-index",
                    "font-weight", "line-height", "order"
                ]
                if unitless.contains(cssKey) {
                    cssProps.append(["name": cssKey, "value": "\(num)"])
                } else {
                    cssProps.append(["name": cssKey, "value": "\(num)px"])
                }
            } else {
                cssProps.append(["name": cssKey, "value": "\(value)"])
            }
        }

        return ["cssProperties": cssProps, "shorthandEntries": [] as [Any]]
    }

    /// Returns CDP outerHTML for a node.
    func cdpGetOuterHTML(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["outerHTML": ""]
        }
        return ["outerHTML": nodeToHTML(node)]
    }

    /// Returns CDP box model for a node.
    func cdpGetBoxModel(nodeId: Int) -> [String: Any] {
        guard let node = nodeRegistry[nodeId] else {
            return ["model": [
                "content": [0,0,0,0,0,0,0,0], "padding": [0,0,0,0,0,0,0,0],
                "border": [0,0,0,0,0,0,0,0], "margin": [0,0,0,0,0,0,0,0],
                "width": 0, "height": 0,
            ] as [String: Any]]
        }

        let yoga = node.yogaNode
        let frame = node.layoutFrame

        let mt = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .top)))
        let mr = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .right)))
        let mb = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .bottom)))
        let ml = CGFloat(nanToZero(YGNodeLayoutGetMargin(yoga, .left)))

        let bt = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .top)))
        let br_ = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .right)))
        let bb = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .bottom)))
        let bl = CGFloat(nanToZero(YGNodeLayoutGetBorder(yoga, .left)))

        let pt = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .top)))
        let pr = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .right)))
        let pb = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .bottom)))
        let pl = CGFloat(nanToZero(YGNodeLayoutGetPadding(yoga, .left)))

        var absX = frame.origin.x
        var absY = frame.origin.y
        if let view = viewRegistry.view(for: node.family) {
            let absFrame = view.convert(view.bounds, to: nil)
            absX = absFrame.origin.x
            absY = absFrame.origin.y
        }

        let w = frame.width
        let h = frame.height

        let mx0 = absX - ml, my0 = absY - mt
        let mx1 = absX + w + mr, my1 = absY + h + mb
        let marginQuad = [mx0, my0, mx1, my0, mx1, my1, mx0, my1].map { Double($0) }

        let bx0 = absX, by0 = absY
        let bx1 = absX + w, by1 = absY + h
        let borderQuad = [bx0, by0, bx1, by0, bx1, by1, bx0, by1].map { Double($0) }

        let px0 = absX + bl, py0 = absY + bt
        let px1 = absX + w - br_, py1 = absY + h - bb
        let paddingQuad = [px0, py0, px1, py0, px1, py1, px0, py1].map { Double($0) }

        let cx0 = px0 + pl, cy0 = py0 + pt
        let cx1 = px1 - pr, cy1 = py1 - pb
        let contentQuad = [cx0, cy0, cx1, cy0, cx1, cy1, cx0, cy1].map { Double($0) }

        return ["model": [
            "content": contentQuad, "padding": paddingQuad,
            "border": borderQuad, "margin": marginQuad,
            "width": Double(w), "height": Double(h),
        ] as [String: Any]]
    }

    /// Returns process memory stats.
    func cdpGetMemoryUsage() -> [String: Any] {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        if result == KERN_SUCCESS {
            return ["usedSize": info.resident_size, "totalSize": info.virtual_size]
        }
        return ["usedSize": 0, "totalSize": 0]
    }

    /// Returns full body HTML for web preview rendering.
    func cdpGetPreviewHTML() -> [String: Any] {
        let docResult = cdpGetDocumentTree(surfaceId: 0)
        guard let root = docResult["root"] as? [String: Any],
              let rootChildren = root["children"] as? [[String: Any]],
              let htmlNode = rootChildren.first,
              let htmlChildren = htmlNode["children"] as? [[String: Any]],
              htmlChildren.count > 1,
              let bodyNode = htmlChildren.last,
              let bodyChildren = bodyNode["children"] as? [[String: Any]] else {
            return ["html": ""]
        }

        var parts: [String] = []
        for child in bodyChildren {
            if let childNodeId = child["nodeId"] as? Int {
                let outerResult = cdpGetOuterHTML(nodeId: childNodeId)
                if let outerHTML = outerResult["outerHTML"] as? String, !outerHTML.isEmpty {
                    parts.append(outerHTML)
                }
            }
        }
        return ["html": parts.joined(separator: "\n")]
    }

    // MARK: - CDP Node Serialization (Dictionary)

    /// Recursively serializes a ShadowNodeWrapper into CDP DOM.Node dict format.
    /// Returns an array — normally one element, but #suspense nodes are flattened.
    func serializeNodeToDict(_ node: ShadowNodeWrapper) -> [[String: Any]] {
        let elementType = node.family.elementType

        if elementType == "#suspense" {
            var results: [[String: Any]] = []
            for child in node.children {
                results.append(contentsOf: serializeNodeToDict(child))
            }
            return results
        }

        var nodeId = 0
        for (id, registeredNode) in nodeRegistry where registeredNode === node {
            nodeId = id
            break
        }
        if nodeId == 0 {
            nodeId = registerNode(node)
        }

        var jsNode: [String: Any]

        if elementType == "#text" {
            jsNode = [
                "nodeId": nodeId, "backendNodeId": nodeId,
                "nodeType": 3, "nodeName": "#text", "localName": "",
                "nodeValue": node.text ?? "",
                "childNodeCount": 0, "children": [] as [Any],
            ]
        } else {
            var attrs: [String] = []
            for (key, value) in node.props {
                if key == "style" {
                    if let styleDict = value as? [String: Any] {
                        let cssString = styleDictToCSS(styleDict)
                        if !cssString.isEmpty {
                            attrs.append("style")
                            attrs.append(cssString)
                        }
                    }
                } else if key == "children" || key == "instanceHandle" {
                    continue
                } else if value is NSNull {
                    continue
                } else if let fn = value as? AnyObject, "\(type(of: fn))".contains("Function") {
                    attrs.append(key)
                    attrs.append("true")
                } else {
                    attrs.append(key)
                    attrs.append("\(value)")
                }
            }

            var childNodes: [[String: Any]] = []
            for child in node.children {
                childNodes.append(contentsOf: serializeNodeToDict(child))
            }

            jsNode = [
                "nodeId": nodeId, "backendNodeId": nodeId,
                "nodeType": 1, "nodeName": elementType.uppercased(), "localName": elementType,
                "nodeValue": "",
                "childNodeCount": childNodes.count, "children": childNodes, "attributes": attrs,
            ]
        }

        return [jsNode]
    }

    /// Returns an empty document tree as a dictionary.
    func makeEmptyDocumentDict() -> [String: Any] {
        let bodyId = nextInspectorNodeId()
        let headId = nextInspectorNodeId()
        let htmlId = nextInspectorNodeId()
        let docId = nextInspectorNodeId()

        let bodyNode: [String: Any] = [
            "nodeId": bodyId, "backendNodeId": bodyId,
            "nodeType": 1, "nodeName": "BODY", "localName": "body", "nodeValue": "",
            "childNodeCount": 0, "children": [] as [Any], "attributes": [] as [Any],
        ]
        let headNode: [String: Any] = [
            "nodeId": headId, "backendNodeId": headId,
            "nodeType": 1, "nodeName": "HEAD", "localName": "head", "nodeValue": "",
            "childNodeCount": 0, "children": [] as [Any], "attributes": [] as [Any],
        ]
        let htmlNode: [String: Any] = [
            "nodeId": htmlId, "backendNodeId": htmlId,
            "nodeType": 1, "nodeName": "HTML", "localName": "html", "nodeValue": "",
            "childNodeCount": 2, "children": [headNode, bodyNode], "attributes": [] as [Any],
        ]
        let doc: [String: Any] = [
            "nodeId": docId, "backendNodeId": docId,
            "nodeType": 9, "nodeName": "#document", "localName": "", "nodeValue": "",
            "childNodeCount": 1, "children": [htmlNode],
            "documentURL": "falcon://app", "baseURL": "falcon://app", "xmlVersion": "",
        ]
        return ["root": doc]
    }
}
