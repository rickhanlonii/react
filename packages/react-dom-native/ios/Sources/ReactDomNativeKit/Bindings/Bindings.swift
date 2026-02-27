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
    private var eventHandler: JSValueRef?

    /// Whether native commit timing collection is enabled (toggled by JS via $$setNativeTracingEnabled).
    var nativeTracingEnabled = false

    /// Sub-phase timings from the most recent calculateYogaLayout call (when tracing).
    private var lastLayoutTimings: [String: Double]?

    /// Sync frame timings from the most recent $$completeRoot call (when tracing).
    private var lastSyncTimings: (start: Double, end: Double)?

    /// Per-node layout timings from the most recent calculateYogaLayout call (when tracing).
    private var lastLayoutNodeTimings: [(type: String, start: Double, end: Double)] = []

    /// Callback invoked when JS calls $$sendInspectorMessage.
    /// Wired by Root to send messages to the dev server via HotReloadClient.
    public var sendInspectorMessage: ((String) -> Void)?

    /// Current tree per surface. Keyed by surfaceId.
    private var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Persistent Yoga root nodes per surface. Survives across commits so
    /// Yoga's incremental layout can skip unchanged subtrees — children that
    /// remain in the tree keep their cached layout results.
    private var rootYogaNodes: [Int: YGNodeRef] = [:]

    /// Root UIViews per surface. Keyed by surfaceId.
    private var rootViews: [Int: UIView] = [:]

    /// SSR trees registered for hydration traversal. Keyed by surfaceId.
    private var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Surfaces where hydration is in progress. Set when hydration starts,
    /// cleared on first $$completeRoot.
    private var hydrationInProgress: Set<Int> = []

    /// SSR commit timings to report when tracing starts. Accumulated by Root during
    /// SSR first paint and boundary reveals, then pushed to JS when tracing is enabled.
    private var pendingSSRCommitTimings: [[String: Any]] = []

    /// Maps SSR nodes to their parent for resilient sibling lookups.
    /// When a boundary reveal replaces the SSR tree, nodes from the old tree
    /// can still find siblings via their parent reference.
    private var ssrNodeToParent: [ObjectIdentifier: ShadowNodeWrapper] = [:]

    /// Called when hydration completes for a surface (first $$completeRoot).
    /// Root uses this to clean up SSR infrastructure (parser, tree builder, etc.).
    public var onHydrationComplete: ((Int) -> Void)?

    // MARK: - Node Registry

    /// Maps integer node IDs to ShadowNodeWrapper instances.
    /// Nodes cross the JS↔Swift boundary as integer IDs.
    private var nodeRegistry: [Int: ShadowNodeWrapper] = [:]
    private var nextNodeId = 1

    /// Highlight overlay for DevTools element inspection.
    private var highlightOverlay: ElementHighlightOverlay?

    /// Maps integer child set IDs to arrays of ShadowNodeWrappers.
    private var childSetRegistry: [Int: [ShadowNodeWrapper]] = [:]
    private var nextChildSetId = 1

    /// Registers a node and returns its integer ID.
    private func registerNode(_ node: ShadowNodeWrapper) -> Int {
        let id = nextNodeId
        nextNodeId += 1
        nodeRegistry[id] = node
        return id
    }

    /// Looks up a node by its integer ID.
    private func lookupNode(_ ref: JSValueRef) -> ShadowNodeWrapper? {
        guard let id = engine.toInt(ref) else { return nil }
        return nodeRegistry[id]
    }

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

    /// Removes the SSR tree for a surface. Called after the SSR stream completes
    /// and all boundary retries have been processed.
    public func cleanupSSRTree(surfaceId: Int) {
        ssrTrees.removeValue(forKey: surfaceId)
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

    /// Serializes pending SSR commit timings to JSON and pushes them to JS
    /// via globalThis.$$handleSSRCommitTimings for reporting on Shadow Tree
    /// and Layout tracks.
    func pushPendingSSRCommitTimingsToJS() {
        guard !pendingSSRCommitTimings.isEmpty else { return }
        let timings = pendingSSRCommitTimings
        pendingSSRCommitTimings.removeAll()

        if let jsonData = try? JSONSerialization.data(withJSONObject: timings),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            engine.evaluate("globalThis.$$handleSSRCommitTimings && globalThis.$$handleSSRCommitTimings(\(jsonString))")
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

    // MARK: - Event Priority Constants

    private func registerEventPriorityConstants() {
        engine.setGlobalProperty("$$DefaultEventPriority", engine.makeNumber(32))
        engine.setGlobalProperty("$$DiscreteEventPriority", engine.makeNumber(2))
        engine.setGlobalProperty("$$ContinuousEventPriority", engine.makeNumber(8))
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
        registerDevTools()
        registerElementsInspector()
    }

    // MARK: - Node Creation

    private func registerNodeCreation() {
        // $$createNode(type, surfaceId, props, isInsideTextContext, instanceHandle) -> nodeId
        engine.setGlobalFunction("$$createNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let type = engine.toString(args[0]) ?? "div"
            let surfaceId = engine.toInt(args[1]) ?? 0
            let props = engine.toDictionary(args[2]) ?? [:]
            // args[3] = isInsideTextContext (unused for now)
            let instanceHandle = args[4]

            // Protect the instance handle from GC
            engine.protect(instanceHandle)

            let node = ShadowNodeWrapper.createElementNode(
                type: type,
                props: props,
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )

            let nodeId = self.registerNode(node)
            return engine.makeNumber(Double(nodeId))
        }

        // $$createTextNode(text, surfaceId, instanceHandle) -> nodeId
        engine.setGlobalFunction("$$createTextNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let text = engine.toString(args[0]) ?? ""
            let surfaceId = engine.toInt(args[1]) ?? 0
            let instanceHandle = args[2]

            let family = ShadowNodeFamily(
                elementType: "#text",
                surfaceId: surfaceId,
                instanceHandle: instanceHandle
            )

            engine.protect(instanceHandle)

            let node = ShadowNodeWrapper(
                props: ["text": text],
                children: [],
                family: family,
                text: text
            )

            // Set up text measurement on the yogaNode
            YogaTextMeasure.setupMeasureFunc(on: node)

            let nodeId = self.registerNode(node)
            return engine.makeNumber(Double(nodeId))
        }
    }

    // MARK: - Clone Operations

    private func registerCloneOperations() {
        // $$cloneNode(nodeId) -> nodeId
        engine.setGlobalFunction("$$cloneNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let cloned = node.clone()
            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }

        // $$cloneNodeWithNewProps(nodeId, newProps) -> nodeId
        engine.setGlobalFunction("$$cloneNodeWithNewProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            var newProps = engine.toDictionary(args[1]) ?? [:]
            // Merge element-type defaults with user-supplied style
            let elementType = node.family.elementType
            let userStyle = newProps["style"] as? [String: Any]
            let mergedStyle = ElementDefaults.mergedStyle(for: elementType, userStyle: userStyle)
            if !mergedStyle.isEmpty {
                newProps["style"] = mergedStyle
            }
            let cloned = node.cloneWithNewProps(newProps)
            // Apply merged style to the cloned yogaNode
            if let style = newProps["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: cloned.yogaNode)
            }
            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }

        // $$cloneNodeWithNewChildren(nodeId, children?) -> nodeId
        engine.setGlobalFunction("$$cloneNodeWithNewChildren") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }

            // Preserve #suspense children from old node — they stay until hydrated
            let preserved = node.children.filter { $0.family.elementType == "#suspense" }

            let cloned = node.cloneWithNewChildren(preserved)

            // Save old ordering for $$appendChild interleaving
            if !preserved.isEmpty {
                cloned.oldChildFamilies = node.children.map { $0.family }
            }

            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }

        // $$cloneNodeWithNewChildrenAndProps(nodeId, children?, newProps) -> nodeId
        engine.setGlobalFunction("$$cloneNodeWithNewChildrenAndProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            var newProps = engine.toDictionary(args[2]) ?? [:]
            // Merge element-type defaults with user-supplied style
            let elementType = node.family.elementType
            let userStyle = newProps["style"] as? [String: Any]
            let mergedStyle = ElementDefaults.mergedStyle(for: elementType, userStyle: userStyle)
            if !mergedStyle.isEmpty {
                newProps["style"] = mergedStyle
            }

            // Preserve #suspense children from old node — they stay until hydrated
            let preserved = node.children.filter { $0.family.elementType == "#suspense" }

            let cloned = node.cloneWithNewChildrenAndProps(preserved, newProps)
            // Apply merged style to the cloned yogaNode
            if let style = newProps["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: cloned.yogaNode)
            }

            // Save old ordering for $$appendChild interleaving
            if !preserved.isEmpty {
                cloned.oldChildFamilies = node.children.map { $0.family }
            }

            let newId = self.registerNode(cloned)
            return engine.makeNumber(Double(newId))
        }
    }

    // MARK: - Tree Construction

    private func registerTreeConstruction() {
        // $$appendChild(parentNodeId, childNodeId) -> void
        engine.setGlobalFunction("$$appendChild") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let parent = self.lookupNode(args[0]),
                  let child = self.lookupNode(args[1]) else {
                return nil
            }

            // --- Self-flatten: detect hydrated boundary ---
            // If this child's family exists inside a preserved #suspense sibling,
            // the boundary just hydrated. Flatten the #suspense.
            for (i, existing) in parent.children.enumerated() {
                if existing.family.elementType == "#suspense" {
                    let isContentOf = existing.children.contains { $0.family === child.family }
                    if isContentOf {
                        self.reparentSuspenseContentViews(suspenseNode: existing)
                        // Remove #suspense from yoga tree
                        YGNodeRemoveChild(parent.yogaNode, existing.yogaNode)
                        parent.children.remove(at: i)
                        // Splice content children's families into oldChildFamilies
                        // at the position where the #suspense was, so findInsertionIndex
                        // can locate them for correct ordering.
                        if var families = parent.oldChildFamilies,
                           let suspenseIdx = families.firstIndex(where: { $0 === existing.family }) {
                            let contentFamilies = existing.children.map { $0.family }
                            families.remove(at: suspenseIdx)
                            families.insert(contentsOf: contentFamilies, at: suspenseIdx)
                            parent.oldChildFamilies = families
                        }
                        break
                    }
                }
            }

            // --- Interleave: find correct insertion position ---
            let insertionIndex: Int
            if let oldFamilies = parent.oldChildFamilies {
                insertionIndex = self.findInsertionIndex(
                    parent: parent, child: child, oldFamilies: oldFamilies
                )
            } else {
                insertionIndex = parent.children.count
            }

            parent.children.insert(child, at: insertionIndex)
            // Wire up Yoga parent-child relationship
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(parent.yogaNode, child.yogaNode, insertionIndex)

            // CSS: block children of flex parents participate in flex layout.
            // Yoga doesn't do this automatically — override display:block to
            // display:flex + flexDirection:column so flexGrow/flexShrink work.
            // Also handles CSS blockification: inline-block → block in flex ctx.
            let parentStyle = parent.props["style"] as? [String: Any] ?? [:]
            let childStyle = child.props["style"] as? [String: Any] ?? [:]
            let childDisplayBefore = childStyle["display"] as? String
            let childDisplayYogaBefore = YGNodeStyleGetDisplay(child.yogaNode)
            YogaStyleApplier.applyFlexContextOverride(
                parent: parent.yogaNode,
                child: child.yogaNode,
                parentStyle: parentStyle,
                childStyle: childStyle
            )
            // Cascade: if the child was just promoted from block→flex, its
            // existing block grandchildren that are simple containers (no
            // explicit flexDirection) also need the override. Without this,
            // Yoga's content-box flex distribution computes incorrectly when
            // a flex item (display:flex) contains display:block children.
            // Skip text containers (p, h1-h6, etc.) that have explicit
            // flexDirection — they use row+wrap for inline text flow.
            if childDisplayYogaBefore != YGNodeStyleGetDisplay(child.yogaNode) {
                let overriddenParentStyle: [String: Any] = ["display": "flex"]
                for grandchild in child.children {
                    let gcStyle = grandchild.props["style"] as? [String: Any] ?? [:]
                    YogaStyleApplier.applyFlexContextOverride(
                        parent: child.yogaNode,
                        child: grandchild.yogaNode,
                        parentStyle: overriddenParentStyle,
                        childStyle: gcStyle
                    )
                }
                // CSS block margin collapsing: in BFC, adjacent sibling margins
                // collapse to max(bottom, top). Yoga flex layout sums them.
                // Simulate collapsing now that the container has been promoted.
                YogaStyleApplier.collapseBlockMargins(parentYogaNode: child.yogaNode)
            }
            // Update style dict to reflect CSS blockification
            if childDisplayBefore == "inline-block",
               (parentStyle["display"] as? String == "flex" || parentStyle["display"] as? String == "inline-flex") {
                var updatedStyle = childStyle
                updatedStyle["display"] = "block"
                child.props["style"] = updatedStyle
            }

            // CSS: nested lists (ul/ol inside li) have margin 0
            YogaStyleApplier.applyNestedListOverride(
                parentType: parent.family.elementType,
                childYogaNode: child.yogaNode,
                childType: child.family.elementType
            )
            // Keep the style dict in sync so the LayoutExtractor (which reads
            // margins from the style dict) reports 0 matching web's computed style.
            if parent.family.elementType == "li" {
                let listElements: Set<String> = ["ul", "ol", "menu", "dir"]
                if listElements.contains(child.family.elementType) {
                    var updatedStyle = child.props["style"] as? [String: Any] ?? [:]
                    updatedStyle["marginTop"] = 0
                    updatedStyle["marginBottom"] = 0
                    child.props["style"] = updatedStyle
                }
            }

            // CSS font-size inheritance for em-relative margins.
            // Elements like <p> have margin: 1em 0, where 1em resolves to
            // the computed font-size. When a <p> is inside a container with
            // a different font-size (e.g. <address style="font-size:14px">),
            // the margins must scale. We recompute at insertion time since
            // we don't have full CSS inheritance.
            if let parentFS = (parentStyle["fontSize"] as? NSNumber).map({ $0.doubleValue })
                ?? (parentStyle["fontSize"] as? Double) {
                if let updated = ElementDefaults.recomputeEmMargins(
                    childType: child.family.elementType,
                    childStyle: childStyle,
                    parentFontSize: parentFS
                ) {
                    child.props["style"] = updated
                    YogaStyleApplier.apply(updated, to: child.yogaNode)
                    // Update Yoga minHeight for text containers whose fontSize
                    // changed due to inheritance (e.g. <p> inside <address
                    // style="fontSize:14">). The minHeight was set during
                    // createElementNode using the default fontSize, but now
                    // the inherited fontSize is different.
                    if let newFS = (updated["fontSize"] as? NSNumber)?.doubleValue
                        ?? (updated["fontSize"] as? Double) {
                        if let minH = ElementDefaults.yogaTextContainerMinHeight(
                            for: child.family.elementType, fontSize: CGFloat(newFS)) {
                            YGNodeStyleSetMinHeight(child.yogaNode, Float(minH))
                        }
                        // Re-measure text children with inherited fontSize.
                        // Text nodes were measured when appended to the child
                        // (before fontSize changed), so they use the old size.
                        let fontSize = CGFloat(newFS)
                        let fontWeight = updated["fontWeight"] as? String
                        let fontFamily = updated["fontFamily"] as? String
                        let fontStyle = updated["fontStyle"] as? String
                        let lineHeight: CGFloat?
                        if let lh = updated["lineHeight"] as? NSNumber {
                            lineHeight = CGFloat(lh.doubleValue)
                        } else {
                            lineHeight = ElementDefaults.textLineHeight(for: child.family.elementType)
                        }
                        for textChild in child.children where textChild.family.elementType == "#text" {
                            YogaTextMeasure.cleanupMeasureContext(for: textChild.yogaNode)
                            YogaTextMeasure.setupMeasureFunc(
                                on: textChild,
                                fontSize: fontSize,
                                fontWeight: fontWeight,
                                fontFamily: fontFamily,
                                fontStyle: fontStyle,
                                lineHeight: lineHeight
                            )
                        }
                    }
                }
            }

            // HTML <details> without `open` hides all children except <summary>.
            // Set non-summary children to display:none at insertion time.
            if parent.family.elementType == "details",
               parent.props["open"] == nil,
               child.family.elementType != "summary" {
                YGNodeStyleSetDisplay(child.yogaNode, .none)
            }

            // CSS <legend> inside <fieldset>: legend sits ON the fieldset's
            // top border, not inside the content area. Apply a negative top
            // margin to pull it up by (borderTop + paddingTop), centering it
            // on the border edge.
            //
            // CSS also positions content after the legend starting at
            // legendBottom + paddingTop. The negative margin consumes the
            // paddingTop for the legend's position, so we add paddingTop
            // as the legend's marginBottom to restore the gap between the
            // legend and subsequent content.
            if parent.family.elementType == "fieldset",
               child.family.elementType == "legend" {
                let borderTopVal = YGNodeStyleGetBorder(parent.yogaNode, .top)
                let borderAllVal = YGNodeStyleGetBorder(parent.yogaNode, .all)
                let borderTop = !borderTopVal.isNaN ? borderTopVal : (!borderAllVal.isNaN ? borderAllVal : 0)

                let paddingTopEdge = YGNodeStyleGetPadding(parent.yogaNode, .top)
                let paddingAllEdge = YGNodeStyleGetPadding(parent.yogaNode, .all)
                let paddingTop: Float
                if paddingTopEdge.unit == .point {
                    paddingTop = paddingTopEdge.value
                } else if paddingAllEdge.unit == .point {
                    paddingTop = paddingAllEdge.value
                } else {
                    paddingTop = 0
                }
                let offset = borderTop + paddingTop
                YGNodeStyleSetMargin(child.yogaNode, .top, -offset)
                YGNodeStyleSetMargin(child.yogaNode, .bottom, paddingTop)
            }

            // If the child is a #text node, inherit font properties from parent for
            // accurate Yoga measurement. Without this, text nodes default to
            // 16pt regular and get clipped inside larger elements (e.g. h1 at 32pt bold).
            if child.family.elementType == "#text" {
                let style = parent.props["style"] as? [String: Any] ?? [:]
                let fontSize: CGFloat
                if let fs = style["fontSize"] as? NSNumber {
                    fontSize = CGFloat(fs.doubleValue)
                } else {
                    fontSize = 16
                }
                let fontWeight = style["fontWeight"] as? String
                let fontFamily = style["fontFamily"] as? String
                let fontStyle = style["fontStyle"] as? String
                let lineHeight: CGFloat?
                if let lh = style["lineHeight"] as? NSNumber {
                    lineHeight = CGFloat(lh.doubleValue)
                } else {
                    // Monospace elements (code, kbd, samp) need a CSS "normal"
                    // line-height for measurement but don't store it in the
                    // style dict to avoid false style comparison diffs.
                    lineHeight = ElementDefaults.textLineHeight(for: parent.family.elementType)
                }

                YogaTextMeasure.cleanupMeasureContext(for: child.yogaNode)
                YogaTextMeasure.setupMeasureFunc(
                    on: child,
                    fontSize: fontSize,
                    fontWeight: fontWeight,
                    fontFamily: fontFamily,
                    fontStyle: fontStyle,
                    lineHeight: lineHeight
                )
            }
            return nil
        }
    }

    // MARK: - Container Operations

    private func registerContainerOperations() {
        // $$createChildSet() -> childSetId
        engine.setGlobalFunction("$$createChildSet") { [weak self, weak engine] _ in
            guard let self = self, let engine = engine else { return nil }
            let id = self.nextChildSetId
            self.nextChildSetId += 1
            self.childSetRegistry[id] = []
            return engine.makeNumber(Double(id))
        }

        // $$appendChildToChildSet(childSetId, childNodeId) -> void
        engine.setGlobalFunction("$$appendChildToChildSet") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let childSetId = engine.toInt(args[0]) ?? 0
            guard let child = self.lookupNode(args[1]) else { return nil }
            self.childSetRegistry[childSetId]?.append(child)
            return nil
        }

        // $$completeRoot(surfaceId, childNodeIds) -> timings | void
        // This is the core commit function. Triggers layout, diff, and UIKit mutations.
        // The JS host config passes an array of native node IDs (integers).
        // When nativeTracingEnabled is true, returns a timing dictionary to JS.
        engine.setGlobalFunction("$$completeRoot") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let tracing = self.nativeTracingEnabled
            let commitStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

            let surfaceId = engine.toInt(args[0]) ?? 0

            // 0. Resolve node IDs and prepare trees
            let prepareStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // args[1] is an array of native node IDs from the JS host config
            let childRefs = engine.toArray(args[1]) ?? []
            let newChildren: [ShadowNodeWrapper] = childRefs.compactMap { ref in
                guard let id = engine.toInt(ref) else { return nil }
                return self.nodeRegistry[id]
            }

            // 1. Get old tree (empty on first commit)
            let oldChildren = self.currentTrees[surfaceId] ?? []

            // Debug: dump old and new tree structures with family identity
            print("[completeRoot] surfaceId=\(surfaceId) oldChildren=\(oldChildren.count) newChildren=\(newChildren.count)")
            self.debugDumpTree("  OLD", oldChildren, depth: 0)
            self.debugDumpTree("  NEW", newChildren, depth: 0)

            // 1b. Unwrap revealed #suspense nodes from old tree before diffing.
            // The hydration commit preserves #suspense wrapper nodes from SSR,
            // but React's retry render produces trees WITHOUT these wrappers
            // (Suspense children are placed directly). Unwrapping here aligns
            // the old tree structure with the new tree, so the diff sees matching
            // families and produces 0 content mutations instead of redundant
            // CREATE+DELETE pairs for the entire subtree.
            //
            // Safe during the initial hydration commit because the method only
            // unwraps nodes where pending == false. During the initial hydration
            // commit all boundaries are still pending, so nothing unwraps.
            self.unwrapRevealedSuspenseNodesInTree(oldChildren)

            #if DEBUG
            // Assert no revealed #suspense wrappers remain after unwrapping.
            // If any remain, the unwrap logic has a bug.
            self.assertNoRevealedSuspenseWrappers(oldChildren)
            #endif

            let prepareEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 2. Calculate layout using Yoga
            let layoutStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
            var contentSize: CGSize = .zero
            if let rootView = self.rootViews[surfaceId] {
                let bounds = rootView.bounds
                contentSize = self.calculateYogaLayout(for: newChildren, in: bounds, surfaceId: surfaceId, tracing: tracing)
            }
            let layoutEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 3. Diff old tree vs new tree
            let diffStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
            var diffNodeTimings: [(type: String, start: Double, end: Double)] = []
            let mutations = self.differentiator.diff(
                oldChildren: oldChildren,
                newChildren: newChildren,
                parent: nil,
                tracing: tracing,
                nodeTimings: &diffNodeTimings
            )
            let diffEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 3b. Categorize mutations for tracing (zero-cost when not tracing)
            var creates = 0, deletes = 0, inserts = 0, removes = 0, updates = 0
            var affectedTypes = Set<String>()
            if tracing {
                for mutation in mutations {
                    switch mutation {
                    case .create(let node):
                        creates += 1
                        affectedTypes.insert(node.family.elementType)
                    case .delete(let node):
                        deletes += 1
                        affectedTypes.insert(node.family.elementType)
                    case .insert(_, let child, _):
                        inserts += 1
                        affectedTypes.insert(child.family.elementType)
                    case .remove(_, let child):
                        removes += 1
                        affectedTypes.insert(child.family.elementType)
                    case .update(let node, _, _):
                        updates += 1
                        affectedTypes.insert(node.family.elementType)
                    }
                }
            }

            // 4. Apply mutations to UIViews atomically
            let mutationsStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
            var mutationTimings: [(mutationType: String, elementType: String, start: Double, end: Double)] = []
            var syncNodeTimings: [(type: String, start: Double, end: Double)] = []
            if let rootView = self.rootViews[surfaceId] {
                self.mutationApplier.applyMutations(mutations, rootView: rootView, tracing: tracing, mutationTimings: &mutationTimings)

                // 4b. Sync frames for ALL nodes in the tree.
                // The Differentiator only emits UPDATE mutations for cloned
                // nodes (oldChild !== newChild). But Yoga layout recalculates
                // positions for the entire tree — reused sibling nodes may
                // have new Y positions when a preceding sibling changed size.
                // This pass ensures every UIView's frame matches Yoga layout.
                let syncStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
                if tracing {
                    self.syncAllFrames(newChildren, tracing: true, nodeTimings: &syncNodeTimings)
                } else {
                    self.syncAllFrames(newChildren)
                }
                let syncEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0
                if tracing {
                    self.lastSyncTimings = (start: syncStart, end: syncEnd)
                }

                // 4c. Attach root-level children to the UIKit rootView
                for child in newChildren {
                    if let childView = self.viewRegistry.view(for: child.family) {
                        if childView.superview == nil {
                            rootView.addSubview(childView)
                        }
                    }
                }
            } else {
                print("[react-dom-native] Warning: No rootView for surfaceId \(surfaceId)")
            }
            let mutationsEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 5-8. Post-mutation cleanup
            let cleanupStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 5-6. Promote new tree
            let treePromoteStart = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 5. Set scroll view content size for document-level scrolling
            if let scrollView = self.rootViews[surfaceId] as? UIScrollView {
                scrollView.contentSize = CGSize(
                    width: scrollView.bounds.width,
                    height: contentSize.height
                )
            }

            // 6. Promote new tree to current tree
            self.currentTrees[surfaceId] = newChildren

            // 6b. Initial hydration commit — apply any queued SSR tree updates
            // and fire onHydrationComplete. After completion, SSR trees are
            // cleaned up since #suspense nodes are preserved in currentTrees.
            if self.hydrationInProgress.contains(surfaceId) {
                self.hydrationInProgress.remove(surfaceId)
                print("[ReactDomNativeKit] Hydration initial commit for surfaceId \(surfaceId)")

                self.onHydrationComplete?(surfaceId)

                // SSR trees no longer needed — #suspense nodes live in currentTrees
                self.ssrTrees.removeValue(forKey: surfaceId)
            }
            let treePromoteEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 7. Clean up stale nodes from registry
            let nodeGCStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
            // Collect all node IDs still reachable from any current tree
            var liveNodes = Set<Int>()
            for (_, tree) in self.currentTrees {
                self.collectNodeIds(from: tree, into: &liveNodes)
            }
            // Remove nodes not in any current tree
            let staleIds = self.nodeRegistry.keys.filter { !liveNodes.contains($0) }
            for id in staleIds {
                self.nodeRegistry.removeValue(forKey: id)
            }
            let nodeGCEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // 8. Notify DevTools that the DOM tree changed
            let devtoolsNotifyStart = tracing ? CACurrentMediaTime() * 1000.0 : 0
            if self.sendInspectorMessage != nil {
                self.sendInspectorMessage?("{\"type\":\"dom-updated\",\"surfaceId\":\(surfaceId)}")
            }
            let devtoolsNotifyEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            let cleanupEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            let commitEnd = tracing ? CACurrentMediaTime() * 1000.0 : 0

            // Return timing dictionary when tracing is enabled
            guard tracing else { return nil }

            let result = engine.makeObject()
            engine.setProperty(result, "commitStart", engine.makeNumber(commitStart))
            engine.setProperty(result, "commitEnd", engine.makeNumber(commitEnd))
            engine.setProperty(result, "layoutStart", engine.makeNumber(layoutStart))
            engine.setProperty(result, "layoutEnd", engine.makeNumber(layoutEnd))
            engine.setProperty(result, "diffStart", engine.makeNumber(diffStart))
            engine.setProperty(result, "diffEnd", engine.makeNumber(diffEnd))
            engine.setProperty(result, "mutationsStart", engine.makeNumber(mutationsStart))
            engine.setProperty(result, "mutationsEnd", engine.makeNumber(mutationsEnd))
            engine.setProperty(result, "mutationCount", engine.makeNumber(Double(mutations.count)))
            engine.setProperty(result, "prepareStart", engine.makeNumber(prepareStart))
            engine.setProperty(result, "prepareEnd", engine.makeNumber(prepareEnd))
            engine.setProperty(result, "cleanupStart", engine.makeNumber(cleanupStart))
            engine.setProperty(result, "cleanupEnd", engine.makeNumber(cleanupEnd))
            engine.setProperty(result, "treePromoteStart", engine.makeNumber(treePromoteStart))
            engine.setProperty(result, "treePromoteEnd", engine.makeNumber(treePromoteEnd))
            engine.setProperty(result, "nodeGCStart", engine.makeNumber(nodeGCStart))
            engine.setProperty(result, "nodeGCEnd", engine.makeNumber(nodeGCEnd))
            engine.setProperty(result, "devtoolsNotifyStart", engine.makeNumber(devtoolsNotifyStart))
            engine.setProperty(result, "devtoolsNotifyEnd", engine.makeNumber(devtoolsNotifyEnd))

            // Tree stats
            let stats = self.computeTreeStats(newChildren)
            engine.setProperty(result, "nodeCount", engine.makeNumber(Double(stats.nodeCount)))
            engine.setProperty(result, "treeDepth", engine.makeNumber(Double(stats.depth)))

            // Root element types (e.g. "div, main, footer")
            let rootTypes = newChildren.map { $0.family.elementType }.joined(separator: ", ")
            engine.setProperty(result, "rootTypes", engine.makeString(rootTypes))

            // Mutation breakdown
            engine.setProperty(result, "creates", engine.makeNumber(Double(creates)))
            engine.setProperty(result, "deletes", engine.makeNumber(Double(deletes)))
            engine.setProperty(result, "inserts", engine.makeNumber(Double(inserts)))
            engine.setProperty(result, "removes", engine.makeNumber(Double(removes)))
            engine.setProperty(result, "updates", engine.makeNumber(Double(updates)))

            // Affected element types
            let affectedTypesStr = affectedTypes.sorted().joined(separator: ", ")
            engine.setProperty(result, "affectedTypes", engine.makeString(affectedTypesStr))

            // syncStart/syncEnd are scoped inside the rootView conditional.
            // Use mutationsStart as fallback when rootView was nil (no sync happened).
            // The actual sync values are captured via lastSyncTimings.
            if let syncTimings = self.lastSyncTimings {
                engine.setProperty(result, "syncStart", engine.makeNumber(syncTimings.start))
                engine.setProperty(result, "syncEnd", engine.makeNumber(syncTimings.end))
                self.lastSyncTimings = nil
            } else {
                engine.setProperty(result, "syncStart", engine.makeNumber(mutationsEnd))
                engine.setProperty(result, "syncEnd", engine.makeNumber(mutationsEnd))
            }

            // Merge sub-phase layout timings
            if let layoutTimings = self.lastLayoutTimings {
                for (key, value) in layoutTimings {
                    engine.setProperty(result, key, engine.makeNumber(value))
                }
                self.lastLayoutTimings = nil
            }

            // Per-node timing arrays for flame graph visualization

            // Diff node timings: [type, start, end, type, start, end, ...]
            var diffElements: [JSValueRef] = []
            diffElements.reserveCapacity(diffNodeTimings.count * 3)
            for entry in diffNodeTimings {
                diffElements.append(engine.makeString(entry.type))
                diffElements.append(engine.makeNumber(entry.start))
                diffElements.append(engine.makeNumber(entry.end))
            }
            engine.setProperty(result, "diffNodes", engine.makeArray(diffElements))

            // Mutation timings: [mutationType, elementType, start, end, ...]
            var mutElements: [JSValueRef] = []
            mutElements.reserveCapacity(mutationTimings.count * 4)
            for entry in mutationTimings {
                mutElements.append(engine.makeString(entry.mutationType))
                mutElements.append(engine.makeString(entry.elementType))
                mutElements.append(engine.makeNumber(entry.start))
                mutElements.append(engine.makeNumber(entry.end))
            }
            engine.setProperty(result, "mutationNodes", engine.makeArray(mutElements))

            // Layout node timings (readLayoutFrames + syncAllFrames combined)
            let combinedLayout = self.lastLayoutNodeTimings + syncNodeTimings
            var layoutElements: [JSValueRef] = []
            layoutElements.reserveCapacity(combinedLayout.count * 3)
            for entry in combinedLayout {
                layoutElements.append(engine.makeString(entry.type))
                layoutElements.append(engine.makeNumber(entry.start))
                layoutElements.append(engine.makeNumber(entry.end))
            }
            engine.setProperty(result, "layoutNodes", engine.makeArray(layoutElements))
            self.lastLayoutNodeTimings = []

            return result
        }

        // Hydration-only commit signal — called when React's hydration render
        // commits but doesn't need to swap container children (dehydrated Suspense
        // case). The SSR tree is already in place; this just signals completion.
        engine.setGlobalFunction("$$onHydrationCommit") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0

            if self.hydrationInProgress.contains(surfaceId) {
                self.hydrationInProgress.remove(surfaceId)
                print("[ReactDomNativeKit] Hydration commit (dehydrated) for surfaceId \(surfaceId)")
                self.onHydrationComplete?(surfaceId)
                // DON'T remove ssrTrees here — dehydrated boundary retries still
                // need the SSR tree for hydration traversal via revealBoundaryInSSRTree.
                // Cleanup happens when the SSR stream completes.
            }
            return nil
        }
    }

    /// Computes tree statistics (total node count and max depth) by walking
    /// the shadow tree. Used when tracing is enabled to populate the timing
    /// dictionary with tree summary data.
    private func computeTreeStats(_ roots: [ShadowNodeWrapper]) -> (nodeCount: Int, depth: Int) {
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

    /// Recursively collects all node IDs reachable from the given tree.
    private func collectNodeIds(from nodes: [ShadowNodeWrapper], into ids: inout Set<Int>) {
        for node in nodes {
            // Find this node's ID in the registry (reverse lookup)
            for (id, registeredNode) in nodeRegistry where registeredNode === node {
                ids.insert(id)
            }
            collectNodeIds(from: node.children, into: &ids)
        }
    }

    // MARK: - Suspense Interleaving

    // MARK: - Debug Tree Dump

    /// Recursively dumps the tree structure with family identity (ObjectIdentifier)
    /// and key props for debugging diff/mutation issues.
    private func debugDumpTree(_ label: String, _ nodes: [ShadowNodeWrapper], depth: Int) {
        let indent = String(repeating: "  ", count: depth)
        for (i, node) in nodes.enumerated() {
            let familyId = ObjectIdentifier(node.family)
            let nodeId = ObjectIdentifier(node)
            let text = node.text ?? ""
            let pending = node.props["pending"] as? Bool
            let boundaryId = node.props["boundaryId"] as? Int
            var extra = ""
            if !text.isEmpty { extra += " text=\"\(text)\"" }
            if let p = pending { extra += " pending=\(p)" }
            if let bid = boundaryId { extra += " boundaryId=\(bid)" }
            let hasView = viewRegistry.view(for: node.family) != nil
            print("\(label) \(indent)[\(i)] <\(node.family.elementType)> family=\(familyId) node=\(nodeId) hasView=\(hasView)\(extra)")
            debugDumpTree(label, node.children, depth: depth + 1)
        }
    }

    /// Finds the correct insertion index for a new child among preserved
    /// #suspense siblings, using the old child ordering as reference.
    ///
    /// Example: old children were [A, #suspense, B, C].
    /// Preserved #suspense sits at index 0 in the clone.
    /// When appendChild(A') is called, A was at oldIndex 0 → insert at 0 (before #suspense at old index 1).
    /// When appendChild(B') is called, B was at oldIndex 2 → insert at 2 (after #suspense).
    private func findInsertionIndex(
        parent: ShadowNodeWrapper,
        child: ShadowNodeWrapper,
        oldFamilies: [ShadowNodeFamily]
    ) -> Int {
        // Find this child's position in the old ordering
        let childOldIndex = oldFamilies.firstIndex(where: { $0 === child.family })

        // Walk current children to find where this child fits
        // relative to the preserved #suspense nodes
        var insertAt = parent.children.count  // default: append
        for (i, existing) in parent.children.enumerated() {
            guard existing.family.elementType == "#suspense" else { continue }
            let suspenseOldIndex = oldFamilies.firstIndex(where: { $0 === existing.family })
            if let childIdx = childOldIndex, let suspIdx = suspenseOldIndex {
                if childIdx < suspIdx {
                    // Child was before this #suspense in old tree
                    insertAt = i
                    break
                }
            }
        }
        return insertAt
    }

    // MARK: - Suspense Flattening for Hydration

    /// Moves content UIKit views from a #suspense view to its parent view,
    /// adjusting frames for the new parent coordinate space. Then removes
    /// the #suspense view and unregisters it from the view registry.
    private func reparentSuspenseContentViews(suspenseNode: ShadowNodeWrapper) {
        guard let suspenseView = viewRegistry.view(for: suspenseNode.family),
              let parentView = suspenseView.superview else { return }

        let suspenseOrigin = suspenseView.frame.origin

        // Find the insertion index (where #suspense is among siblings)
        let insertionIndex = parentView.subviews.firstIndex(of: suspenseView)
            ?? parentView.subviews.count

        // Move each content child view to the parent
        for (i, child) in suspenseNode.children.enumerated() {
            if let childView = viewRegistry.view(for: child.family) {
                // Adjust frame: was relative to #suspense, now relative to parent
                childView.frame = CGRect(
                    x: childView.frame.origin.x + suspenseOrigin.x,
                    y: childView.frame.origin.y + suspenseOrigin.y,
                    width: childView.frame.size.width,
                    height: childView.frame.size.height
                )
                childView.removeFromSuperview()
                parentView.insertSubview(childView, at: insertionIndex + i)
            }
        }

        // Remove the #suspense view itself
        suspenseView.removeFromSuperview()
        viewRegistry.unregister(family: suspenseNode.family)
    }

    /// Recursively unwraps revealed #suspense nodes from the committed tree.
    ///
    /// After the hydration commit, the stored tree may contain #suspense wrapper
    /// nodes from SSR. React's retry render produces a tree WITHOUT these wrappers
    /// (Suspense children are placed directly). This structural mismatch causes
    /// the Differentiator to treat the entire subtree as a replacement, generating
    /// redundant CREATE/DELETE mutations.
    ///
    /// This method aligns the stored tree with what the retry render will produce
    /// by replacing each revealed #suspense node with its children. Only revealed
    /// boundaries (pending=false) are unwrapped — pending boundaries keep their
    /// #suspense wrapper until the content arrives.
    private func unwrapRevealedSuspenseNodes(in parent: ShadowNodeWrapper) {
        var i = 0
        while i < parent.children.count {
            let child = parent.children[i]
            if child.family.elementType == "#suspense" {
                let pending = (child.props["pending"] as? Bool) ?? false
                if !pending {
                    // Only modify the children array — NOT Yoga nodes or UIKit views.
                    // In persistent mode, leaf nodes are shared between old and new trees.
                    // Their Yoga nodes are already parented in the new tree (via $appendChild
                    // during React's clone pass). Touching Yoga here would corrupt the
                    // new tree's layout hierarchy. The mutation applier and syncAllFrames
                    // handle UIKit views and Yoga layout for the new tree independently.
                    parent.children.remove(at: i)
                    for (j, grandchild) in child.children.enumerated() {
                        parent.children.insert(grandchild, at: i + j)
                    }
                    // Don't increment i — check inserted children for nested #suspense
                    continue
                }
            }
            // Recurse into non-#suspense children
            unwrapRevealedSuspenseNodes(in: child)
            i += 1
        }
    }

    /// Walks the root-level children and unwraps revealed #suspense nodes.
    /// Called after the hydration commit to align the stored tree with what
    /// React's retry render will produce.
    private func unwrapRevealedSuspenseNodesInTree(_ roots: [ShadowNodeWrapper]) {
        for root in roots {
            unwrapRevealedSuspenseNodes(in: root)
        }
    }

    #if DEBUG
    /// Asserts no revealed (pending=false) #suspense wrapper nodes remain in the tree.
    private func assertNoRevealedSuspenseWrappers(_ roots: [ShadowNodeWrapper]) {
        for root in roots {
            assertNoRevealedSuspenseWrappersRecursive(root)
        }
    }

    private func assertNoRevealedSuspenseWrappersRecursive(_ node: ShadowNodeWrapper) {
        for child in node.children {
            if child.family.elementType == "#suspense" {
                let pending = (child.props["pending"] as? Bool) ?? false
                assert(pending, "Revealed #suspense wrapper (pending=false) still present after unwrap")
            }
            assertNoRevealedSuspenseWrappersRecursive(child)
        }
    }
    #endif

    /// Recursively syncs every UIView's frame to match its node's layoutFrame.
    ///
    /// The Differentiator only emits UPDATE mutations for cloned nodes, but
    /// Yoga recalculates layout for the entire tree. Reused nodes (same
    /// identity across old/new trees) may have new positions when a preceding
    /// sibling changed size. This pass ensures all frames stay in sync.
    private func syncAllFrames(_ nodes: [ShadowNodeWrapper]) {
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
    private func syncAllFrames(
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
    private func calculateYogaLayout(for children: [ShadowNodeWrapper], in bounds: CGRect, surfaceId: Int, tracing: Bool = false) -> CGSize {
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

    // MARK: - Measurement

    private func registerMeasurement() {
        // $$measureNode(nodeId, callback) -> void
        engine.setGlobalFunction("$$measureNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            let callback = args[1]
            let frame = node.layoutFrame
            _ = engine.callFunction(callback, args: [
                engine.makeNumber(Double(frame.origin.x)),
                engine.makeNumber(Double(frame.origin.y)),
                engine.makeNumber(Double(frame.size.width)),
                engine.makeNumber(Double(frame.size.height))
            ])
            return nil
        }
    }

    // MARK: - Event Handling

    private func registerEventHandling() {
        // $$registerEventHandler(handler) -> void
        engine.setGlobalFunction("$$registerEventHandler") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let handler = args[0]
            engine.protect(handler)
            // Unprotect the old handler if there was one
            if let oldHandler = self.eventHandler {
                engine.unprotect(oldHandler)
            }
            self.eventHandler = handler
            return nil
        }
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

    // MARK: - Networking

    private func registerNetworking() {
        // $$fetch(url, headers, callback) -> void
        // Asynchronous - URLSession runs on background thread, callbacks
        // dispatched to main thread.
        engine.setGlobalFunction("$$fetch") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let urlString = engine.toString(args[0]) ?? ""
            let headersDict = engine.toDictionary(args[1]) ?? [:]
            let callback = args[2]

            guard let url = URL(string: urlString) else {
                DispatchQueue.main.async { [weak engine] in
                    guard let engine = engine else { return }
                    _ = engine.callFunction(callback, args: [
                        engine.makeString("error"),
                        engine.makeString("Invalid URL: \(urlString)")
                    ])
                }
                return nil
            }

            var request = URLRequest(url: url)
            for (key, value) in headersDict {
                if let stringValue = value as? String {
                    request.setValue(stringValue, forHTTPHeaderField: key)
                }
            }

            // Protect callback from GC during async work
            engine.protect(callback)

            let task = URLSession.shared.dataTask(with: request) { data, response, error in
                DispatchQueue.main.async { [weak engine] in
                    guard let engine = engine else { return }

                    if let error = error {
                        _ = engine.callFunction(callback, args: [
                            engine.makeString("error"),
                            engine.makeString(error.localizedDescription)
                        ])
                        engine.unprotect(callback)
                        return
                    }

                    if let httpResponse = response as? HTTPURLResponse,
                       httpResponse.statusCode >= 400 {
                        print("[react-dom-native] Fetch error: HTTP \(httpResponse.statusCode) for \(urlString)")
                    }

                    if let data = data, let text = String(data: data, encoding: .utf8) {
                        _ = engine.callFunction(callback, args: [
                            engine.makeString("data"),
                            engine.makeString(text)
                        ])
                    }

                    _ = engine.callFunction(callback, args: [
                        engine.makeString("end"),
                        engine.makeString("")
                    ])
                    engine.unprotect(callback)
                }
            }
            task.resume()
            return nil
        }
    }

    // MARK: - Hydration Traversal

    private func registerHydrationTraversal() {
        // $$registerSSRTree(surfaceId, nodeIds) -> void
        // Called from JS to register an SSR tree for hydration.
        // nodeIds is an array of root-level SSR node IDs.
        engine.setGlobalFunction("$$registerSSRTree") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0
            let nodeRefs = engine.toArray(args[1]) ?? []
            let nodes: [ShadowNodeWrapper] = nodeRefs.compactMap { ref in
                guard let id = engine.toInt(ref) else { return nil }
                return self.nodeRegistry[id]
            }
            self.ssrTrees[surfaceId] = nodes
            return nil
        }

        // $$getFirstSSRChild(surfaceId) -> {nodeId, type} | null
        // Returns the first root-level child of the SSR tree for a surface.
        engine.setGlobalFunction("$$getFirstSSRChild") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0
            guard let tree = self.ssrTrees[surfaceId], let first = tree.first else {
                print("[ReactDomNativeKit] Hydration traversal: getFirstSSRChild(\(surfaceId)) -> nil")
                return nil
            }
            print("[ReactDomNativeKit] Hydration traversal: getFirstSSRChild(\(surfaceId)) -> \(first.family.elementType)")
            return self.makeSSRNodeRef(first, engine: engine)
        }

        // $$getSSRChildOf(nodeId) -> {nodeId, type} | null
        // Returns the first child of an SSR node.
        engine.setGlobalFunction("$$getSSRChildOf") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }
            guard let first = node.children.first else { return nil }
            return self.makeSSRNodeRef(first, engine: engine)
        }

        // $$getNextSSRSibling(nodeId) -> {nodeId, type} | null
        // Returns the next sibling of an SSR node.
        engine.setGlobalFunction("$$getNextSSRSibling") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.lookupNode(args[0]) else { return nil }

            if let sibling = self.findNextSibling(of: node) {
                return self.makeSSRNodeRef(sibling, engine: engine)
            }
            return nil
        }

        // $$clearSSRTree(surfaceId) -> void
        // Cleans up the SSR tree after hydration completes.
        engine.setGlobalFunction("$$clearSSRTree") { [weak self] args in
            guard let self = self else { return nil }
            let surfaceId = (self.engine.toInt(args[0])) ?? 0
            self.ssrTrees.removeValue(forKey: surfaceId)
            self.ssrNodeToParent.removeAll()
            return nil
        }

        // $$markBoundaryRevealed(nodeId) -> void
        // Called from JS when a boundary is revealed to sync pending=false
        // to the Swift-side ShadowNodeWrapper props.
        engine.setGlobalFunction("$$markBoundaryRevealed") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let nodeId = engine.toInt(args[0]) else { return nil }
            guard let node = self.nodeRegistry[nodeId] else { return nil }
            node.props["pending"] = false
            return nil
        }

        // $$setInstanceHandle(nodeId, instanceHandle, hasClickHandler) -> void
        // Called during hydration to attach the React fiber reference to an
        // SSR-created node's family so that event dispatch works.
        engine.setGlobalFunction("$$setInstanceHandle") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let nodeId = engine.toInt(args[0]) else { return nil }
            guard let node = self.nodeRegistry[nodeId] else { return nil }
            let instanceHandle = args[1]
            engine.protect(instanceHandle)
            node.family.instanceHandle = instanceHandle
            if args.count > 2, engine.toBool(args[2]) == true {
                node.family.hasClickHandler = true
            }
            return nil
        }
    }

    /// Creates a JS object representing an SSR node for hydration traversal.
    private func makeSSRNodeRef(_ node: ShadowNodeWrapper, engine: JSEngine) -> JSValueRef? {
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
    private func findNextSibling(of target: ShadowNodeWrapper) -> ShadowNodeWrapper? {
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
    private func findNextSiblingInChildren(_ target: ShadowNodeWrapper, children: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
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

    private func registerDevTools() {
        // $$performanceNow() -> milliseconds (high-resolution)
        engine.setGlobalFunction("$$performanceNow") { [weak engine] _ in
            return engine?.makeNumber(CACurrentMediaTime() * 1000.0)
        }

        // $$sendInspectorMessage(data) -> void
        // Sends a string message from JS to the dev server via the hot reload WebSocket.
        engine.setGlobalFunction("$$sendInspectorMessage") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let data = engine.toString(args[0]) else { return nil }
            self.sendInspectorMessage?(data)
            return nil
        }

        // $$getMemoryUsage() -> {usedSize, totalSize}
        // Returns process memory stats via mach_task_basic_info.
        engine.setGlobalFunction("$$getMemoryUsage") { [weak engine] _ in
            guard let engine = engine else { return nil }
            var info = mach_task_basic_info()
            var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
            let result = withUnsafeMutablePointer(to: &info) {
                $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                    task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
                }
            }
            let obj = engine.makeObject()
            if result == KERN_SUCCESS {
                engine.setProperty(obj, "usedSize", engine.makeNumber(Double(info.resident_size)))
                engine.setProperty(obj, "totalSize", engine.makeNumber(Double(info.virtual_size)))
            } else {
                engine.setProperty(obj, "usedSize", engine.makeNumber(0))
                engine.setProperty(obj, "totalSize", engine.makeNumber(0))
            }
            return obj
        }
    }

    /// Delivers an inspector message from the dev server to JS.
    /// Calls the global $$onInspectorMessage function if it exists.
    public func deliverInspectorMessage(_ json: String) {
        guard let handler = engine.getGlobalProperty("$$onInspectorMessage") else { return }
        _ = engine.callFunction(handler, args: [engine.makeString(json)])
    }

    // MARK: - Elements Inspector (CDP DOM/CSS)

    private func registerElementsInspector() {
        // $$getDocumentTree(surfaceId) -> DOM.Node tree
        // Walks currentTrees[surfaceId] and serializes each ShadowNodeWrapper
        // into CDP DOM.Node format for the Chrome DevTools Elements tab.
        engine.setGlobalFunction("$$getDocumentTree") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let requestedId = engine.toInt(args[0]) ?? 0

            // Find the tree: use requested surfaceId, or fall back to first available
            let children: [ShadowNodeWrapper]?
            if requestedId > 0, let tree = self.currentTrees[requestedId] {
                children = tree
            } else {
                children = self.currentTrees.values.first(where: { !$0.isEmpty })
                    ?? self.currentTrees.values.first
            }

            guard let children = children else {
                return self.makeEmptyDocument(engine: engine)
            }

            // Build body children
            var bodyChildren: [JSValueRef] = []
            for child in children {
                bodyChildren.append(contentsOf: self.serializeNodes(child, engine: engine))
            }

            // <body> node wrapping all root children
            let bodyId = self.nextInspectorNodeId()
            let bodyNode = engine.makeObject()
            engine.setProperty(bodyNode, "nodeId", engine.makeNumber(Double(bodyId)))
            engine.setProperty(bodyNode, "backendNodeId", engine.makeNumber(Double(bodyId)))
            engine.setProperty(bodyNode, "nodeType", engine.makeNumber(1))
            engine.setProperty(bodyNode, "nodeName", engine.makeString("BODY"))
            engine.setProperty(bodyNode, "localName", engine.makeString("body"))
            engine.setProperty(bodyNode, "nodeValue", engine.makeString(""))
            engine.setProperty(bodyNode, "childNodeCount", engine.makeNumber(Double(bodyChildren.count)))
            engine.setProperty(bodyNode, "children", engine.makeArray(bodyChildren))
            engine.setProperty(bodyNode, "attributes", engine.makeArray([]))

            // <head> node (empty, required by Chrome DevTools)
            let headId = self.nextInspectorNodeId()
            let headNode = engine.makeObject()
            engine.setProperty(headNode, "nodeId", engine.makeNumber(Double(headId)))
            engine.setProperty(headNode, "backendNodeId", engine.makeNumber(Double(headId)))
            engine.setProperty(headNode, "nodeType", engine.makeNumber(1))
            engine.setProperty(headNode, "nodeName", engine.makeString("HEAD"))
            engine.setProperty(headNode, "localName", engine.makeString("head"))
            engine.setProperty(headNode, "nodeValue", engine.makeString(""))
            engine.setProperty(headNode, "childNodeCount", engine.makeNumber(0))
            engine.setProperty(headNode, "children", engine.makeArray([]))
            engine.setProperty(headNode, "attributes", engine.makeArray([]))

            // <html> node wrapping head + body
            let htmlId = self.nextInspectorNodeId()
            let htmlNode = engine.makeObject()
            engine.setProperty(htmlNode, "nodeId", engine.makeNumber(Double(htmlId)))
            engine.setProperty(htmlNode, "backendNodeId", engine.makeNumber(Double(htmlId)))
            engine.setProperty(htmlNode, "nodeType", engine.makeNumber(1))
            engine.setProperty(htmlNode, "nodeName", engine.makeString("HTML"))
            engine.setProperty(htmlNode, "localName", engine.makeString("html"))
            engine.setProperty(htmlNode, "nodeValue", engine.makeString(""))
            engine.setProperty(htmlNode, "childNodeCount", engine.makeNumber(2))
            engine.setProperty(htmlNode, "children", engine.makeArray([headNode, bodyNode]))
            engine.setProperty(htmlNode, "attributes", engine.makeArray([]))

            // #document root
            let docId = self.nextInspectorNodeId()
            let doc = engine.makeObject()
            engine.setProperty(doc, "nodeId", engine.makeNumber(Double(docId)))
            engine.setProperty(doc, "backendNodeId", engine.makeNumber(Double(docId)))
            engine.setProperty(doc, "nodeType", engine.makeNumber(9))
            engine.setProperty(doc, "nodeName", engine.makeString("#document"))
            engine.setProperty(doc, "localName", engine.makeString(""))
            engine.setProperty(doc, "nodeValue", engine.makeString(""))
            engine.setProperty(doc, "childNodeCount", engine.makeNumber(1))
            engine.setProperty(doc, "children", engine.makeArray([htmlNode]))
            engine.setProperty(doc, "documentURL", engine.makeString("falcon://app"))
            engine.setProperty(doc, "baseURL", engine.makeString("falcon://app"))
            engine.setProperty(doc, "xmlVersion", engine.makeString(""))

            let result = engine.makeObject()
            engine.setProperty(result, "root", doc)
            return result
        }

        // $$getComputedStyle(nodeId) -> {computedStyle: [{name, value}, ...]}
        // Reads Yoga computed layout values and visual style props.
        engine.setGlobalFunction("$$getComputedStyle") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let nodeId = engine.toInt(args[0]),
                  let node = self.nodeRegistry[nodeId] else {
                return engine.makeObject()
            }

            var properties: [(String, String)] = []
            let yoga = node.yogaNode

            // Layout computed values
            let frame = node.layoutFrame
            properties.append(("width", "\(frame.width)px"))
            properties.append(("height", "\(frame.height)px"))
            properties.append(("top", "\(frame.origin.y)px"))
            properties.append(("left", "\(frame.origin.x)px"))

            // Box model — margins
            let marginTop = YGNodeLayoutGetMargin(yoga, .top)
            let marginRight = YGNodeLayoutGetMargin(yoga, .right)
            let marginBottom = YGNodeLayoutGetMargin(yoga, .bottom)
            let marginLeft = YGNodeLayoutGetMargin(yoga, .left)
            properties.append(("margin-top", self.formatPx(marginTop)))
            properties.append(("margin-right", self.formatPx(marginRight)))
            properties.append(("margin-bottom", self.formatPx(marginBottom)))
            properties.append(("margin-left", self.formatPx(marginLeft)))

            // Box model — padding
            let paddingTop = YGNodeLayoutGetPadding(yoga, .top)
            let paddingRight = YGNodeLayoutGetPadding(yoga, .right)
            let paddingBottom = YGNodeLayoutGetPadding(yoga, .bottom)
            let paddingLeft = YGNodeLayoutGetPadding(yoga, .left)
            properties.append(("padding-top", self.formatPx(paddingTop)))
            properties.append(("padding-right", self.formatPx(paddingRight)))
            properties.append(("padding-bottom", self.formatPx(paddingBottom)))
            properties.append(("padding-left", self.formatPx(paddingLeft)))

            // Box model — border
            let borderTop = YGNodeLayoutGetBorder(yoga, .top)
            let borderRight = YGNodeLayoutGetBorder(yoga, .right)
            let borderBottom = YGNodeLayoutGetBorder(yoga, .bottom)
            let borderLeft = YGNodeLayoutGetBorder(yoga, .left)
            properties.append(("border-top-width", self.formatPx(borderTop)))
            properties.append(("border-right-width", self.formatPx(borderRight)))
            properties.append(("border-bottom-width", self.formatPx(borderBottom)))
            properties.append(("border-left-width", self.formatPx(borderLeft)))

            // Yoga style enum values
            properties.append(("display", self.displayToString(YGNodeStyleGetDisplay(yoga))))
            properties.append(("position", self.positionToString(YGNodeStyleGetPositionType(yoga))))
            properties.append(("flex-direction", self.flexDirectionToString(YGNodeStyleGetFlexDirection(yoga))))
            properties.append(("justify-content", self.justifyToString(YGNodeStyleGetJustifyContent(yoga))))
            properties.append(("align-items", self.alignToString(YGNodeStyleGetAlignItems(yoga))))
            properties.append(("align-self", self.alignToString(YGNodeStyleGetAlignSelf(yoga))))
            properties.append(("align-content", self.alignToString(YGNodeStyleGetAlignContent(yoga))))
            properties.append(("flex-wrap", self.flexWrapToString(YGNodeStyleGetFlexWrap(yoga))))
            properties.append(("overflow", self.overflowToString(YGNodeStyleGetOverflow(yoga))))

            // Yoga numeric style values
            let flexGrow = YGNodeStyleGetFlexGrow(yoga)
            properties.append(("flex-grow", "\(flexGrow)"))
            let flexShrink = YGNodeStyleGetFlexShrink(yoga)
            properties.append(("flex-shrink", "\(flexShrink)"))
            let flexBasis = YGNodeStyleGetFlexBasis(yoga)
            properties.append(("flex-basis", self.formatYGValue(flexBasis)))

            let gap = YGNodeStyleGetGap(yoga, .all)
            if gap.unit != .undefined { properties.append(("gap", self.formatYGValue(gap))) }
            let rowGap = YGNodeStyleGetGap(yoga, .row)
            if rowGap.unit != .undefined { properties.append(("row-gap", self.formatYGValue(rowGap))) }
            let columnGap = YGNodeStyleGetGap(yoga, .column)
            if columnGap.unit != .undefined { properties.append(("column-gap", self.formatYGValue(columnGap))) }

            // Visual properties from style dict
            let style = node.props["style"] as? [String: Any] ?? [:]
            let visualKeys = [
                "color", "backgroundColor", "opacity",
                "fontSize", "fontWeight", "fontFamily", "fontStyle",
                "borderRadius", "borderColor", "borderStyle",
                "textAlign", "textDecoration", "lineHeight"
            ]
            for key in visualKeys {
                if let val = style[key] {
                    let cssKey = self.camelToKebab(key)
                    if let num = val as? NSNumber {
                        let unitless: Set<String> = ["opacity", "font-weight", "line-height"]
                        if unitless.contains(cssKey) {
                            properties.append((cssKey, "\(num)"))
                        } else {
                            properties.append((cssKey, "\(num)px"))
                        }
                    } else {
                        properties.append((cssKey, "\(val)"))
                    }
                }
            }

            // Serialize as CDP computedStyle array
            var jsProps: [JSValueRef] = []
            for (name, value) in properties {
                let prop = engine.makeObject()
                engine.setProperty(prop, "name", engine.makeString(name))
                engine.setProperty(prop, "value", engine.makeString(value))
                jsProps.append(prop)
            }

            let result = engine.makeObject()
            engine.setProperty(result, "computedStyle", engine.makeArray(jsProps))
            return result
        }

        // $$getInlineStyle(nodeId) -> {cssProperties: [{name, value}, ...], shorthandEntries: []}
        // Returns the node's props.style as a CDP CSSStyle object.
        engine.setGlobalFunction("$$getInlineStyle") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let nodeId = engine.toInt(args[0]),
                  let node = self.nodeRegistry[nodeId] else {
                return engine.makeObject()
            }

            let style = node.props["style"] as? [String: Any] ?? [:]
            var cssProps: [JSValueRef] = []
            for (key, value) in style.sorted(by: { $0.key < $1.key }) {
                let prop = engine.makeObject()
                let cssKey = self.camelToKebab(key)
                engine.setProperty(prop, "name", engine.makeString(cssKey))
                if let num = value as? NSNumber {
                    let unitless: Set<String> = [
                        "opacity", "flex-grow", "flex-shrink", "z-index",
                        "font-weight", "line-height", "order"
                    ]
                    if unitless.contains(cssKey) {
                        engine.setProperty(prop, "value", engine.makeString("\(num)"))
                    } else {
                        engine.setProperty(prop, "value", engine.makeString("\(num)px"))
                    }
                } else {
                    engine.setProperty(prop, "value", engine.makeString("\(value)"))
                }
                cssProps.append(prop)
            }

            let result = engine.makeObject()
            engine.setProperty(result, "cssProperties", engine.makeArray(cssProps))
            engine.setProperty(result, "shorthandEntries", engine.makeArray([]))
            return result
        }

        // $$getOuterHTML(nodeId) -> {outerHTML: "<div ...>...</div>"}
        // Reconstructs HTML from the shadow node for DevTools preview.
        engine.setGlobalFunction("$$getOuterHTML") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let nodeId = engine.toInt(args[0]),
                  let node = self.nodeRegistry[nodeId] else {
                let result = engine.makeObject()
                engine.setProperty(result, "outerHTML", engine.makeString(""))
                return result
            }

            let html = self.nodeToHTML(node)
            let result = engine.makeObject()
            engine.setProperty(result, "outerHTML", engine.makeString(html))
            return result
        }

        // $$getBoxModel(nodeId) -> {model: {content, padding, border, margin, width, height}}
        // Returns CDP BoxModel with quad coordinates for the element.
        engine.setGlobalFunction("$$getBoxModel") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let nodeId = engine.toInt(args[0]),
                  let node = self.nodeRegistry[nodeId] else { return nil }

            let yoga = node.yogaNode
            let frame = node.layoutFrame

            // Read box model insets from Yoga
            let mt = CGFloat(self.nanToZero(YGNodeLayoutGetMargin(yoga, .top)))
            let mr = CGFloat(self.nanToZero(YGNodeLayoutGetMargin(yoga, .right)))
            let mb = CGFloat(self.nanToZero(YGNodeLayoutGetMargin(yoga, .bottom)))
            let ml = CGFloat(self.nanToZero(YGNodeLayoutGetMargin(yoga, .left)))

            let bt = CGFloat(self.nanToZero(YGNodeLayoutGetBorder(yoga, .top)))
            let br = CGFloat(self.nanToZero(YGNodeLayoutGetBorder(yoga, .right)))
            let bb = CGFloat(self.nanToZero(YGNodeLayoutGetBorder(yoga, .bottom)))
            let bl = CGFloat(self.nanToZero(YGNodeLayoutGetBorder(yoga, .left)))

            let pt = CGFloat(self.nanToZero(YGNodeLayoutGetPadding(yoga, .top)))
            let pr = CGFloat(self.nanToZero(YGNodeLayoutGetPadding(yoga, .right)))
            let pb = CGFloat(self.nanToZero(YGNodeLayoutGetPadding(yoga, .bottom)))
            let pl = CGFloat(self.nanToZero(YGNodeLayoutGetPadding(yoga, .left)))

            // Compute absolute position in screen (window) coordinates.
            // This must match the screenshot coordinate system — converting to
            // nil (window) includes the status bar offset, which the scroll
            // view's content coordinates (used by the highlight overlay) do not.
            var absX = frame.origin.x
            var absY = frame.origin.y
            if let view = self.viewRegistry.view(for: node.family) {
                let absFrame = view.convert(view.bounds, to: nil)
                absX = absFrame.origin.x
                absY = absFrame.origin.y
            }

            let w = frame.width
            let h = frame.height

            // Margin quad (outermost)
            let mx0 = absX - ml, my0 = absY - mt
            let mx1 = absX + w + mr, my1 = absY + h + mb
            let marginQuad = self.makeQuad([mx0, my0, mx1, my0, mx1, my1, mx0, my1], engine: engine)

            // Border quad
            let bx0 = absX, by0 = absY
            let bx1 = absX + w, by1 = absY + h
            let borderQuad = self.makeQuad([bx0, by0, bx1, by0, bx1, by1, bx0, by1], engine: engine)

            // Padding quad
            let px0 = absX + bl, py0 = absY + bt
            let px1 = absX + w - br, py1 = absY + h - bb
            let paddingQuad = self.makeQuad([px0, py0, px1, py0, px1, py1, px0, py1], engine: engine)

            // Content quad (innermost)
            let cx0 = px0 + pl, cy0 = py0 + pt
            let cx1 = px1 - pr, cy1 = py1 - pb
            let contentQuad = self.makeQuad([cx0, cy0, cx1, cy0, cx1, cy1, cx0, cy1], engine: engine)

            let model = engine.makeObject()
            engine.setProperty(model, "content", contentQuad)
            engine.setProperty(model, "padding", paddingQuad)
            engine.setProperty(model, "border", borderQuad)
            engine.setProperty(model, "margin", marginQuad)
            engine.setProperty(model, "width", engine.makeNumber(Double(w)))
            engine.setProperty(model, "height", engine.makeNumber(Double(h)))

            let result = engine.makeObject()
            engine.setProperty(result, "model", model)
            return result
        }

        // $$highlightNode(nodeId) -> void
        // Draws a box model overlay on the UIView for the given node.
        engine.setGlobalFunction("$$highlightNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else {
                print("[Elements] $$highlightNode: self or engine nil")
                return nil
            }
            guard let nodeId = engine.toInt(args[0]) else {
                print("[Elements] $$highlightNode: no nodeId in args")
                return nil
            }
            guard let node = self.nodeRegistry[nodeId] else {
                print("[Elements] $$highlightNode: nodeId \(nodeId) not in registry (registry has \(self.nodeRegistry.count) nodes)")
                return nil
            }

            let view = self.viewRegistry.view(for: node.family)
            guard let targetView = view else {
                print("[Elements] $$highlightNode: no view for node \(nodeId) (\(node.family.elementType))")
                return nil
            }

            // Find the root view for this node's surface
            let surfaceId = node.family.surfaceId
            guard let rootView = self.rootViews[surfaceId] else {
                print("[Elements] $$highlightNode: no rootView for surfaceId \(surfaceId)")
                return nil
            }

            print("[Elements] $$highlightNode: highlighting node \(nodeId) (\(node.family.elementType)) in surface \(surfaceId)")

            if self.highlightOverlay == nil {
                self.highlightOverlay = ElementHighlightOverlay(rootView: rootView)
            }
            self.highlightOverlay?.highlight(node: node, view: targetView)

            return nil
        }

        // $$hideHighlight() -> void
        engine.setGlobalFunction("$$hideHighlight") { [weak self] _ in
            self?.highlightOverlay?.hide()
            return nil
        }
    }

    /// Counter for inspector-specific node IDs (document, body wrapper nodes).
    /// Shadow tree nodes use their nodeRegistry IDs directly.
    private var inspectorNodeIdCounter = 900000

    private func nextInspectorNodeId() -> Int {
        inspectorNodeIdCounter += 1
        return inspectorNodeIdCounter
    }

    private func makeEmptyDocument(engine: JSEngine) -> JSValueRef {
        let bodyId = nextInspectorNodeId()
        let bodyNode = engine.makeObject()
        engine.setProperty(bodyNode, "nodeId", engine.makeNumber(Double(bodyId)))
        engine.setProperty(bodyNode, "backendNodeId", engine.makeNumber(Double(bodyId)))
        engine.setProperty(bodyNode, "nodeType", engine.makeNumber(1))
        engine.setProperty(bodyNode, "nodeName", engine.makeString("BODY"))
        engine.setProperty(bodyNode, "localName", engine.makeString("body"))
        engine.setProperty(bodyNode, "nodeValue", engine.makeString(""))
        engine.setProperty(bodyNode, "childNodeCount", engine.makeNumber(0))
        engine.setProperty(bodyNode, "children", engine.makeArray([]))
        engine.setProperty(bodyNode, "attributes", engine.makeArray([]))

        let headId = nextInspectorNodeId()
        let headNode = engine.makeObject()
        engine.setProperty(headNode, "nodeId", engine.makeNumber(Double(headId)))
        engine.setProperty(headNode, "backendNodeId", engine.makeNumber(Double(headId)))
        engine.setProperty(headNode, "nodeType", engine.makeNumber(1))
        engine.setProperty(headNode, "nodeName", engine.makeString("HEAD"))
        engine.setProperty(headNode, "localName", engine.makeString("head"))
        engine.setProperty(headNode, "nodeValue", engine.makeString(""))
        engine.setProperty(headNode, "childNodeCount", engine.makeNumber(0))
        engine.setProperty(headNode, "children", engine.makeArray([]))
        engine.setProperty(headNode, "attributes", engine.makeArray([]))

        let htmlId = nextInspectorNodeId()
        let htmlNode = engine.makeObject()
        engine.setProperty(htmlNode, "nodeId", engine.makeNumber(Double(htmlId)))
        engine.setProperty(htmlNode, "backendNodeId", engine.makeNumber(Double(htmlId)))
        engine.setProperty(htmlNode, "nodeType", engine.makeNumber(1))
        engine.setProperty(htmlNode, "nodeName", engine.makeString("HTML"))
        engine.setProperty(htmlNode, "localName", engine.makeString("html"))
        engine.setProperty(htmlNode, "nodeValue", engine.makeString(""))
        engine.setProperty(htmlNode, "childNodeCount", engine.makeNumber(2))
        engine.setProperty(htmlNode, "children", engine.makeArray([headNode, bodyNode]))
        engine.setProperty(htmlNode, "attributes", engine.makeArray([]))

        let docId = nextInspectorNodeId()
        let doc = engine.makeObject()
        engine.setProperty(doc, "nodeId", engine.makeNumber(Double(docId)))
        engine.setProperty(doc, "backendNodeId", engine.makeNumber(Double(docId)))
        engine.setProperty(doc, "nodeType", engine.makeNumber(9))
        engine.setProperty(doc, "nodeName", engine.makeString("#document"))
        engine.setProperty(doc, "localName", engine.makeString(""))
        engine.setProperty(doc, "nodeValue", engine.makeString(""))
        engine.setProperty(doc, "childNodeCount", engine.makeNumber(1))
        engine.setProperty(doc, "children", engine.makeArray([htmlNode]))
        engine.setProperty(doc, "documentURL", engine.makeString("falcon://app"))
        engine.setProperty(doc, "baseURL", engine.makeString("falcon://app"))
        engine.setProperty(doc, "xmlVersion", engine.makeString(""))
        let result = engine.makeObject()
        engine.setProperty(result, "root", doc)
        return result
    }

    /// Recursively serializes a ShadowNodeWrapper into CDP DOM.Node format.
    /// Returns an array — normally one element, but #suspense nodes are
    /// flattened so their children are inlined into the parent.
    private func serializeNodes(_ node: ShadowNodeWrapper, engine: JSEngine) -> [JSValueRef] {
        let elementType = node.family.elementType

        // Skip #suspense wrapper nodes — inline their children instead
        if elementType == "#suspense" {
            var results: [JSValueRef] = []
            for child in node.children {
                results.append(contentsOf: serializeNodes(child, engine: engine))
            }
            return results
        }

        // Find this node's registry ID (reverse lookup)
        var nodeId = 0
        for (id, registeredNode) in nodeRegistry where registeredNode === node {
            nodeId = id
            break
        }
        if nodeId == 0 {
            nodeId = registerNode(node)
        }

        let jsNode = engine.makeObject()
        engine.setProperty(jsNode, "nodeId", engine.makeNumber(Double(nodeId)))
        engine.setProperty(jsNode, "backendNodeId", engine.makeNumber(Double(nodeId)))

        if elementType == "#text" {
            // Text node
            engine.setProperty(jsNode, "nodeType", engine.makeNumber(3))
            engine.setProperty(jsNode, "nodeName", engine.makeString("#text"))
            engine.setProperty(jsNode, "localName", engine.makeString(""))
            engine.setProperty(jsNode, "nodeValue", engine.makeString(node.text ?? ""))
            engine.setProperty(jsNode, "childNodeCount", engine.makeNumber(0))
            engine.setProperty(jsNode, "children", engine.makeArray([]))
        } else {
            // Element node
            engine.setProperty(jsNode, "nodeType", engine.makeNumber(1))
            engine.setProperty(jsNode, "nodeName", engine.makeString(elementType.uppercased()))
            engine.setProperty(jsNode, "localName", engine.makeString(elementType))
            engine.setProperty(jsNode, "nodeValue", engine.makeString(""))

            // Serialize attributes as flat [key, value, key, value, ...] array
            var attrs: [JSValueRef] = []
            for (key, value) in node.props {
                if key == "style" {
                    if let styleDict = value as? [String: Any] {
                        let cssString = self.styleDictToCSS(styleDict)
                        if !cssString.isEmpty {
                            attrs.append(engine.makeString("style"))
                            attrs.append(engine.makeString(cssString))
                        }
                    }
                } else if key == "children" || key == "instanceHandle" {
                    continue
                } else if value is NSNull {
                    continue
                } else if let fn = value as? AnyObject, "\(type(of: fn))".contains("Function") {
                    // Event handler — show as boolean marker
                    attrs.append(engine.makeString(key))
                    attrs.append(engine.makeString("true"))
                } else {
                    attrs.append(engine.makeString(key))
                    attrs.append(engine.makeString("\(value)"))
                }
            }
            engine.setProperty(jsNode, "attributes", engine.makeArray(attrs))

            // Serialize children recursively (flattening #suspense)
            var childNodes: [JSValueRef] = []
            for child in node.children {
                childNodes.append(contentsOf: self.serializeNodes(child, engine: engine))
            }
            engine.setProperty(jsNode, "childNodeCount", engine.makeNumber(Double(childNodes.count)))
            engine.setProperty(jsNode, "children", engine.makeArray(childNodes))
        }

        return [jsNode]
    }

    /// Converts a style dictionary to a CSS-like string.
    private func styleDictToCSS(_ style: [String: Any]) -> String {
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
    private func camelToKebab(_ str: String) -> String {
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

    private func nodeToHTML(_ node: ShadowNodeWrapper, depth: Int = 0) -> String {
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

    private func nanToZero(_ value: Float) -> Float {
        return value.isNaN ? 0 : value
    }

    private func makeQuad(_ values: [CGFloat], engine: JSEngine) -> JSValueRef {
        return engine.makeArray(values.map { engine.makeNumber(Double($0)) })
    }

    private func formatPx(_ value: Float) -> String {
        if value.isNaN { return "0px" }
        if value == Float(Int(value)) { return "\(Int(value))px" }
        return String(format: "%.1fpx", value)
    }

    private func formatYGValue(_ value: YGValue) -> String {
        switch value.unit {
        case .point: return formatPx(value.value)
        case .percent: return "\(value.value)%"
        case .auto: return "auto"
        default: return "auto"
        }
    }

    private func displayToString(_ display: YGDisplay) -> String {
        switch display {
        case .flex: return "flex"
        case .block: return "block"
        case .none: return "none"
        case .inlineBlock: return "inline-block"
        default: return "flex"
        }
    }

    private func positionToString(_ position: YGPositionType) -> String {
        switch position {
        case .relative: return "relative"
        case .absolute: return "absolute"
        case .static: return "static"
        default: return "relative"
        }
    }

    private func flexDirectionToString(_ dir: YGFlexDirection) -> String {
        switch dir {
        case .row: return "row"
        case .column: return "column"
        case .rowReverse: return "row-reverse"
        case .columnReverse: return "column-reverse"
        default: return "column"
        }
    }

    private func justifyToString(_ justify: YGJustify) -> String {
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

    private func alignToString(_ align: YGAlign) -> String {
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

    private func flexWrapToString(_ wrap: YGWrap) -> String {
        switch wrap {
        case .noWrap: return "nowrap"
        case .wrap: return "wrap"
        case .wrapReverse: return "wrap-reverse"
        default: return "nowrap"
        }
    }

    private func overflowToString(_ overflow: YGOverflow) -> String {
        switch overflow {
        case .visible: return "visible"
        case .hidden: return "hidden"
        case .scroll: return "scroll"
        default: return "visible"
        }
    }
}
