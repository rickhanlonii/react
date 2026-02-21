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

    /// Callback invoked when JS calls $$sendInspectorMessage.
    /// Wired by Root to send messages to the dev server via HotReloadClient.
    public var sendInspectorMessage: ((String) -> Void)?

    /// Current tree per surface. Keyed by surfaceId.
    private var currentTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Root UIViews per surface. Keyed by surfaceId.
    private var rootViews: [Int: UIView] = [:]

    /// SSR trees registered for hydration traversal. Keyed by surfaceId.
    private var ssrTrees: [Int: [ShadowNodeWrapper]] = [:]

    /// Surfaces where hydration is in progress. Set when hydration starts,
    /// cleared on first $$completeRoot. While active, SSR tree updates are
    /// queued to prevent mid-hydration tree mutations.
    private var hydrationInProgress: Set<Int> = []

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
        registerDevTools()
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

            // 1b. Unwrap revealed #suspense nodes from old tree before diffing.
            // The hydration commit preserves #suspense wrapper nodes from SSR,
            // but React's retry render produces trees WITHOUT these wrappers
            // (Suspense children are placed directly). Unwrapping here aligns
            // the old tree structure with the new tree, so the diff sees matching
            // families and produces 0 content mutations instead of redundant
            // CREATE+DELETE pairs for the entire subtree.
            //
            // Only run on post-hydration commits (retry render). During the
            // hydration commit itself, #suspense must stay in the old tree to
            // match the new hydrated tree (which also has #suspense wrappers).
            if !self.hydrationInProgress.contains(surfaceId) {
                self.unwrapRevealedSuspenseNodesInTree(oldChildren)
            }

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

            // 6b. Initial hydration commit — apply any queued SSR tree updates
            // and fire onHydrationComplete. After completion, SSR trees are
            // cleaned up since #suspense nodes are preserved in currentTrees.
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

                self.onHydrationComplete?(surfaceId)

                // SSR trees no longer needed — #suspense nodes live in currentTrees
                self.ssrTrees.removeValue(forKey: surfaceId)
            }

            // 7. Clean up stale nodes from registry
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

    // MARK: - Suspense Interleaving

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
}
