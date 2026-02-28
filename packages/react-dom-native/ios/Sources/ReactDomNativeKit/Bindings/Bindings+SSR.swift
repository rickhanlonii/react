import Foundation
import UIKit
import ShadowTree
import JSEngine
import Yoga

// ---------------------------------------------------------------------------
// Bindings+SSR
//
// Extension containing SSR tree management, hydration traversal, and
// boundary reveal methods.
// ---------------------------------------------------------------------------

extension Bindings {

    // MARK: - SSR Surface Registration

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
    func registerSSRSubtree(_ node: ShadowNodeWrapper) {
        _ = registerNode(node)
        for child in node.children {
            registerSSRSubtree(child)
        }
    }

    /// Recursively builds the parent map for an SSR subtree.
    func buildParentMap(_ node: ShadowNodeWrapper) {
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

    func findSuspenseNodeByBoundaryId(_ boundaryId: Int, in nodes: [ShadowNodeWrapper]) -> ShadowNodeWrapper? {
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
    func registerNewNodesInSubtree(_ node: ShadowNodeWrapper) {
        // Check if already registered (any entry pointing to this exact object)
        let alreadyRegistered = nodeRegistry.values.contains(where: { $0 === node })
        if !alreadyRegistered {
            _ = registerNode(node)
        }
        for child in node.children {
            registerNewNodesInSubtree(child)
        }
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
}
