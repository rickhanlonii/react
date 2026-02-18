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

    /// Current tree per surface. Keyed by surfaceId.
    private var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Root UIViews per surface. Keyed by surfaceId.
    private var rootViews: [Int: UIView] = [:]

    /// SSR trees registered for hydration traversal. Keyed by surfaceId.
    private var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Surfaces that need #suspense nodes flattened from currentTrees after
    /// the first $$completeRoot. The SSR tree has #suspense host elements but
    /// the React reconciler doesn't produce host elements for Suspense fibers,
    /// so the diff tree must not contain #suspense wrappers.
    private var surfacesNeedingSuspenseFlatten: Set<Int> = []

    /// Surfaces where hydration is in progress. Set when hydration starts,
    /// cleared on first $$completeRoot. While active, SSR tree updates are
    /// queued to prevent mid-hydration tree mutations.
    private var hydrationInProgress: Set<Int> = []

    /// Surfaces that need SSR cleanup after Suspense retries complete.
    /// Set after the initial hydration commit. Cleared on the NEXT
    /// $$completeRoot (the Suspense retry commit), at which point it's
    /// safe to discard the SSR tree.
    private var surfacesNeedingSSRCleanup: Set<Int> = []

    /// Queued SSR tree updates that arrived during hydration.
    /// Applied after hydration completes (first $$completeRoot).
    private var pendingSSRTreeUpdates: [Int: [ShadowNodeWrapper]] = [:]

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

        // Mark this surface for #suspense flattening after the first commit.
        // The SSR tree has #suspense host elements wrapping Suspense content,
        // but the React reconciler doesn't produce host elements for Suspense
        // fibers. After the first $$completeRoot (which is a no-op since old
        // and new reference the same SSR nodes), we flatten #suspense from
        // currentTrees so the second commit can diff correctly.
        surfacesNeedingSuspenseFlatten.insert(surfaceId)
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

    /// Marks hydration as in progress for a surface.
    /// While active, SSR tree updates are queued instead of applied immediately.
    public func markHydrationStarted(surfaceId: Int) {
        hydrationInProgress.insert(surfaceId)
    }

    /// Updates the current tree for a surface after an SSR boundary reveal
    /// during hydration. Calculates layout, diffs old vs new, applies mutations,
    /// and updates the stored current tree.
    ///
    /// This mirrors what $$completeRoot does but for SSR boundary reveals that
    /// happen after hydration has started (React owns the view hierarchy).
    public func updateCurrentTree(
        surfaceId: Int,
        oldTree: [ShadowNodeWrapper],
        newTree: [ShadowNodeWrapper]
    ) {
        // 1. Calculate layout on new tree
        var contentSize: CGSize = .zero
        if let rootView = rootViews[surfaceId] {
            contentSize = calculateYogaLayout(for: newTree, in: rootView.bounds)
        }

        // 2. Diff old vs new
        let mutations = differentiator.diff(
            oldChildren: oldTree,
            newChildren: newTree,
            parent: nil
        )

        // 3. Apply mutations
        if let rootView = rootViews[surfaceId] {
            mutationApplier.applyMutations(mutations, rootView: rootView)
            syncAllFrames(newTree)

            // Attach new root-level children
            for child in newTree {
                if let childView = viewRegistry.view(for: child.family) {
                    if childView.superview == nil {
                        rootView.addSubview(childView)
                    }
                }
            }
        }

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
    }

    /// Updates the SSR tree for hydration traversal after a boundary reveal.
    /// Called when a boundary reveals after hydration has started so that
    /// $$getSSRChildOf / $$getNextSSRSibling see the content nodes.
    ///
    /// If hydration is in progress, the update is queued and applied after
    /// the first $$completeRoot to prevent mid-hydration tree mutations.
    public func updateSSRTree(surfaceId: Int, newTree: [ShadowNodeWrapper]) {
        if hydrationInProgress.contains(surfaceId) {
            print("[ReactDomNativeKit] SSR tree update queued (hydration in progress, surfaceId: \(surfaceId))")
            pendingSSRTreeUpdates[surfaceId] = newTree
            return
        }
        let isUpdate = ssrTrees[surfaceId] != nil
        if isUpdate {
            print("[ReactDomNativeKit] SSR tree updated (reveal during hydration, surfaceId: \(surfaceId))")
        }
        ssrTrees[surfaceId] = newTree
        // Register any new nodes (content + cloned path nodes)
        for child in newTree {
            registerNewNodesInSubtree(child)
        }
        // Rebuild parent map for the new tree
        for child in newTree {
            buildParentMap(child)
        }
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
            // children parameter may be undefined; the reconciler typically
            // passes undefined and then appends children individually
            let cloned = node.cloneWithNewChildren([])
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
            let cloned = node.cloneWithNewChildrenAndProps([], newProps)
            // Apply merged style to the cloned yogaNode
            if let style = newProps["style"] as? [String: Any] {
                YogaStyleApplier.apply(style, to: cloned.yogaNode)
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
            let index = parent.children.count
            parent.children.append(child)
            // Wire up Yoga parent-child relationship
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(parent.yogaNode, child.yogaNode, index)

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

                YogaTextMeasure.cleanupMeasureContext(for: child.yogaNode)
                YogaTextMeasure.setupMeasureFunc(
                    on: child,
                    fontSize: fontSize,
                    fontWeight: fontWeight,
                    fontFamily: fontFamily,
                    fontStyle: fontStyle
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

        // $$completeRoot(surfaceId, childNodeIds) -> void
        // This is the core commit function. Triggers layout, diff, and UIKit mutations.
        // The JS host config passes an array of native node IDs (integers).
        engine.setGlobalFunction("$$completeRoot") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let surfaceId = engine.toInt(args[0]) ?? 0

            // args[1] is an array of native node IDs from the JS host config
            let childRefs = engine.toArray(args[1]) ?? []
            let newChildren: [ShadowNodeWrapper] = childRefs.compactMap { ref in
                guard let id = engine.toInt(ref) else { return nil }
                return self.nodeRegistry[id]
            }

            // 1. Get old tree (empty on first commit)
            let oldChildren = self.currentTrees[surfaceId] ?? []

            // 2. Calculate layout using Yoga
            var contentSize: CGSize = .zero
            if let rootView = self.rootViews[surfaceId] {
                let bounds = rootView.bounds
                contentSize = self.calculateYogaLayout(for: newChildren, in: bounds)
            }

            // 3. Diff old tree vs new tree
            let mutations = self.differentiator.diff(
                oldChildren: oldChildren,
                newChildren: newChildren,
                parent: nil
            )

            // 4. Apply mutations to UIViews atomically
            if let rootView = self.rootViews[surfaceId] {
                self.mutationApplier.applyMutations(mutations, rootView: rootView)

                // 4b. Sync frames for ALL nodes in the tree.
                // The Differentiator only emits UPDATE mutations for cloned
                // nodes (oldChild !== newChild). But Yoga layout recalculates
                // positions for the entire tree — reused sibling nodes may
                // have new Y positions when a preceding sibling changed size.
                // This pass ensures every UIView's frame matches Yoga layout.
                self.syncAllFrames(newChildren)

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

            // 5. Set scroll view content size for document-level scrolling
            if let scrollView = self.rootViews[surfaceId] as? UIScrollView {
                scrollView.contentSize = CGSize(
                    width: scrollView.bounds.width,
                    height: contentSize.height
                )
            }

            // 6. Promote new tree to current tree
            self.currentTrees[surfaceId] = newChildren

            // 6a. If SSR cleanup was deferred from the previous commit
            // (waiting for Suspense retries to complete), do it now.
            // The retry render phase has already traversed the SSR tree,
            // so it's safe to discard.
            if self.surfacesNeedingSSRCleanup.contains(surfaceId) {
                self.surfacesNeedingSSRCleanup.remove(surfaceId)
                print("[ReactDomNativeKit] SSR cleanup after Suspense retries for surfaceId \(surfaceId)")
                self.clearSSRTree(surfaceId: surfaceId)
                self.onHydrationComplete?(surfaceId)
            }

            // 6b. After the first hydration commit, flatten #suspense wrappers
            // from currentTrees. The SSR tree has #suspense host elements but
            // the reconciler produces no host elements for Suspense fibers.
            // The first commit is a no-op (old === new), so this runs after it,
            // ensuring the second commit diffs correctly.
            if self.surfacesNeedingSuspenseFlatten.contains(surfaceId) {
                self.surfacesNeedingSuspenseFlatten.remove(surfaceId)
                self.flattenSuspenseFromCurrentTree(surfaceId: surfaceId)
            }

            // 6c. Initial hydration commit — apply any queued SSR tree updates
            // but DON'T clean up SSR state yet. Suspense retries (scheduled
            // during this render) will run as a separate commit and need the
            // SSR tree for traversal (getFirstHydratableChildWithinSuspenseInstance,
            // getNextHydratableSibling). Cleanup is deferred to the next
            // $$completeRoot via surfacesNeedingSSRCleanup.
            if self.hydrationInProgress.contains(surfaceId) {
                self.hydrationInProgress.remove(surfaceId)
                print("[ReactDomNativeKit] Hydration initial commit for surfaceId \(surfaceId)")

                if let pendingTree = self.pendingSSRTreeUpdates.removeValue(forKey: surfaceId) {
                    print("[ReactDomNativeKit] Applying queued SSR tree update for surfaceId \(surfaceId)")
                    self.ssrTrees[surfaceId] = pendingTree
                    for child in pendingTree {
                        self.registerNewNodesInSubtree(child)
                    }
                    for child in pendingTree {
                        self.buildParentMap(child)
                    }
                }

                // Defer SSR cleanup to the next $$completeRoot
                self.surfacesNeedingSSRCleanup.insert(surfaceId)
            }

            // 7. Clean up stale nodes from registry
            // Collect all node IDs still reachable from any current tree
            var liveNodes = Set<Int>()
            for (_, tree) in self.currentTrees {
                self.collectNodeIds(from: tree, into: &liveNodes)
            }
            // Also keep SSR tree nodes alive — Suspense hydration retries
            // need to look up #suspense nodes and their content children
            // after the initial hydration commit.
            for (_, tree) in self.ssrTrees {
                self.collectNodeIds(from: tree, into: &liveNodes)
            }
            // Remove nodes not in any current tree or SSR tree
            let staleIds = self.nodeRegistry.keys.filter { !liveNodes.contains($0) }
            for id in staleIds {
                self.nodeRegistry.removeValue(forKey: id)
            }

            return nil
        }
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

    // MARK: - Suspense Flattening for Hydration

    /// Flattens #suspense host elements from `currentTrees[surfaceId]`.
    ///
    /// The SSR tree has `#suspense` nodes wrapping Suspense boundary content,
    /// but the React reconciler doesn't produce host elements for Suspense
    /// fibers — it walks through them and collects content directly. This
    /// creates a structural mismatch between the SSR tree (old) and the
    /// reconciler's output (new) that causes the differ to DELETE all SSR
    /// nodes and CREATE new ones.
    ///
    /// This method:
    /// 1. Creates structural clones of parent nodes with #suspense children
    ///    promoted up (e.g. `div > [#suspense > content]` → `div > [content]`)
    /// 2. Re-parents UIKit views: moves content views from #suspense views
    ///    to the parent view, adjusting frames for the new parent coordinate space
    /// 3. Removes orphaned #suspense UIKit views
    /// 4. Updates `currentTrees` with the flattened tree
    private func flattenSuspenseFromCurrentTree(surfaceId: Int) {
        guard let tree = currentTrees[surfaceId] else { return }

        let flattened = flattenSuspenseNodes(tree)
        currentTrees[surfaceId] = flattened
    }

    /// Recursively creates structural clones with #suspense nodes removed.
    /// Children of #suspense nodes are promoted to the parent level.
    private func flattenSuspenseNodes(_ nodes: [ShadowNodeWrapper]) -> [ShadowNodeWrapper] {
        var result: [ShadowNodeWrapper] = []

        for node in nodes {
            if node.family.elementType == "#suspense" {
                // Re-parent UIKit views: move content from #suspense to parent
                reparentSuspenseContentViews(suspenseNode: node)

                // Promote children up, recursively flattening them too
                result.append(contentsOf: flattenSuspenseNodes(node.children))
            } else {
                // Recursively flatten children
                let flattenedChildren = flattenSuspenseNodes(node.children)

                // Only create a structural clone if children actually changed
                let childrenChanged = flattenedChildren.count != node.children.count ||
                    !zip(flattenedChildren, node.children).allSatisfy({ $0 === $1 })

                if childrenChanged {
                    // Structural clone: same family/props for differ matching,
                    // fresh Yoga node (not used — layout is on the new tree).
                    let clone = ShadowNodeWrapper(
                        props: node.props,
                        children: flattenedChildren,
                        family: node.family,
                        text: node.text
                    )
                    clone.layoutFrame = node.layoutFrame
                    clone.scrollContentSize = node.scrollContentSize
                    result.append(clone)
                } else {
                    result.append(node)
                }
            }
        }

        return result
    }

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

    // MARK: - Yoga Layout

    /// Calculate layout using Yoga for the given top-level children within bounds.
    ///
    /// Creates a temporary root YGNode sized to the container, inserts
    /// top-level children, calculates layout, reads results into layoutFrame,
    /// then cleans up the temporary root.
    ///
    /// Returns the natural content size (width × height) from Yoga layout.
    @discardableResult
    private func calculateYogaLayout(for children: [ShadowNodeWrapper], in bounds: CGRect) -> CGSize {
        guard !children.isEmpty else { return .zero }

        // 1. Create temporary root node sized to container
        let rootNode = YGNodeNewWithConfig(YogaConfig.shared)!
        YGNodeStyleSetFlexDirection(rootNode, .column)    // Override web default (row → column)
        YGNodeStyleSetWidth(rootNode, Float(bounds.width))
        // Don't set height — let content determine its own height.
        // On the web, the viewport scrolls when content overflows rather
        // than shrinking children via flexShrink.

        // 2. Insert top-level children into temporary root
        for (index, child) in children.enumerated() {
            if let owner = YGNodeGetOwner(child.yogaNode) {
                YGNodeRemoveChild(owner, child.yogaNode)
            }
            YGNodeInsertChild(rootNode, child.yogaNode, index)
        }

        // 3. Calculate layout (first pass)
        YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)

        // 3b. Post-layout text re-measurement
        var needsSecondPass = false
        for child in children {
            if ShadowTreeLayout.markTextNodesNeedingRemeasure(child) {
                needsSecondPass = true
            }
        }
        if needsSecondPass {
            YGNodeCalculateLayout(rootNode, Float(bounds.width), .nan, .LTR)
        }

        // Read content size from temp root (which has unbounded height)
        let yogaHeight = CGFloat(YGNodeLayoutGetHeight(rootNode))

        // 4. Walk tree reading layout results into layoutFrame
        for child in children {
            ShadowTreeLayout.readLayoutFrames(node: child)
        }

        let actualHeight = ShadowTreeLayout.computeActualContentHeight(for: children)
        let contentSize = CGSize(
            width: CGFloat(YGNodeLayoutGetWidth(rootNode)),
            height: max(yogaHeight, actualHeight)
        )

        // 4b. Compute scroll content sizes for overflow:scroll/auto nodes
        for child in children {
            ShadowTreeLayout.computeScrollContentSizes(for: child)
        }

        // 5. Remove children from temporary root (ownership stays with ShadowNodeWrappers)
        YGNodeRemoveAllChildren(rootNode)

        // 6. Free temporary root
        YGNodeFree(rootNode)

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

        // $$setInstanceHandle(nodeId, instanceHandle) -> void
        // Called during hydration to attach the React fiber reference to an
        // SSR-created node's family so that event dispatch works.
        engine.setGlobalFunction("$$setInstanceHandle") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let nodeId = engine.toInt(args[0]) else { return nil }
            guard let node = self.nodeRegistry[nodeId] else { return nil }
            let instanceHandle = args[1]
            engine.protect(instanceHandle)
            node.family.instanceHandle = instanceHandle
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
}
