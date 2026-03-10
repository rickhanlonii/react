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
    /// The Renderer has already created the scroll view and committed SSR views.
    /// This method finds the existing scroll view, merges view registries,
    /// and pre-populates `currentTrees` for DevTools.
    public func registerSurfaceForHydration(
        surfaceId: Int,
        rootView: UIView,
        ssrTree: [ShadowNodeWrapper],
        ssrViewRegistry: ViewRegistry
    ) {
        // Find the existing scroll view created by Renderer.registerRootView
        if let scrollView = rootView.subviews.first(where: { $0 is UIScrollView }) as? UIScrollView {
            rootViews[surfaceId] = scrollView
        }

        currentTrees[surfaceId] = ssrTree
        viewRegistry.merge(from: ssrViewRegistry)
    }

    // MARK: - SSR Tree Management

    /// Registers an SSR tree for hydration traversal.
    /// Called by Root.hydrateRoot() after SSR first paint completes.
    public func registerSSRTree(surfaceId: Int, rootChildren: [ShadowNodeWrapper]) {
        ssrTrees[surfaceId] = rootChildren
        // Build parent map for resilient sibling lookups
        for child in rootChildren {
            buildParentMap(child)
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
        guard let tree = ssrTrees[surfaceId] else {
            print("[ReactDomNativeKit] Warning: revealBoundaryInSSRTree called but no SSR tree for surfaceId \(surfaceId)")
            return
        }
        guard let suspenseNode = findSuspenseNodeByBoundaryId(boundaryId, in: tree) else { return }

        #if DEBUG
        let nodeIdBefore = ObjectIdentifier(suspenseNode)
        #endif

        suspenseNode.children = contentNodes
        suspenseNode.props["pending"] = false
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

    /// Stores SSR commit timing data so it can be reported when tracing starts.
    /// Called by Root after SSR first paint and boundary reveals complete.
    ///
    /// If tracing is already active (e.g. "Reload and Profile" triggered SSR
    /// after tracing started), reports immediately to the tracer.
    public func addSSRCommitTimings(_ timings: [[String: Any]]) {
        pendingSSRCommitTimings.append(contentsOf: timings)

        if nativeTracingEnabled {
            flushPendingCommitTimings()
        }
    }

    /// Applies a boundary reveal to the current committed tree via the Renderer.
    /// Used post-hydration when React owns the view hierarchy.
    public func revealBoundaryInCurrentTree(
        surfaceId: Int,
        boundaryId: Int,
        contentNodes: [ShadowNodeWrapper]
    ) {
        let renderer: Renderer
        if let customRenderer = rendererForSurface?(surfaceId) {
            renderer = customRenderer
        } else if let root = ReactRuntime.shared.rootForSurface(surfaceId) {
            renderer = root.renderer
        } else {
            return
        }
        let oldTree = renderer.currentTree
        guard let suspenseNode = findSuspenseNodeByBoundaryId(boundaryId, in: oldTree) else { return }

        let newTree = ShadowTreeBuilder.revealBoundaryImmutable(
            rootChildren: oldTree,
            suspenseNode: suspenseNode,
            contentNodes: contentNodes
        )

        renderer.tracingEnabled = nativeTracingEnabled
        renderer.commitTree(newChildren: newTree, label: "SSR Reveal")

        // Sync for DevTools
        currentTrees[surfaceId] = renderer.currentTree
    }

    /// Updates the SSR tree for hydration traversal after a boundary reveal.
    /// Called when a boundary reveals after hydration has started so that
    /// $$getSSRChildOf / $$getNextSSRSibling see the content nodes.
    ///
    /// If hydration is in progress, the update is queued and applied after
    /// the first $$completeRoot to prevent mid-hydration tree mutations.
    public func updateSSRTree(surfaceId: Int, newTree: [ShadowNodeWrapper]) {
        ssrTrees[surfaceId] = newTree
        for child in newTree { buildParentMap(child) }
    }

    // MARK: - SSR Traversal Helpers

    /// Creates a JS object representing an SSR node for hydration traversal.
    func makeSSRNodeRef(_ node: ShadowNodeWrapper, engine: JSEngine) -> JSValueRef? {
        let opaqueNode = engine.wrapNativeObject(node)
        let obj = engine.makeObject()
        engine.setProperty(obj, "_ssrNodeRef", opaqueNode)
        engine.setProperty(obj, "_ssrFamily", opaqueNode)
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
