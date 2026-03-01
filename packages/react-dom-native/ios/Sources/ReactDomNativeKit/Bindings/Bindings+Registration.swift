import Foundation
import UIKit
import ShadowTree
import JSEngine
import Yoga

// ---------------------------------------------------------------------------
// Bindings+Registration
//
// Extension containing all $$-prefixed binding function registrations and
// their helper methods. These are the methods called by
// registerBindingFunctions() in Bindings.swift.
// ---------------------------------------------------------------------------

extension Bindings {

    // MARK: - Node Registry Helpers

    /// Registers a node and returns its integer ID.
    func registerNode(_ node: ShadowNodeWrapper) -> Int {
        let id = nextNodeId
        nextNodeId += 1
        nodeRegistry[id] = node
        return id
    }

    /// Looks up a node by its integer ID.
    func lookupNode(_ ref: JSValueRef) -> ShadowNodeWrapper? {
        guard let id = engine.toInt(ref) else { return nil }
        return nodeRegistry[id]
    }

    // MARK: - SSR Timing Helper

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

    // MARK: - Event Priority Constants

    func registerEventPriorityConstants() {
        engine.setGlobalProperty("$$DefaultEventPriority", engine.makeNumber(32))
        engine.setGlobalProperty("$$DiscreteEventPriority", engine.makeNumber(2))
        engine.setGlobalProperty("$$ContinuousEventPriority", engine.makeNumber(8))
    }

    // MARK: - Node Creation

    func registerNodeCreation() {
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

    func registerCloneOperations() {
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

    func registerTreeConstruction() {
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

    func registerContainerOperations() {
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
            let commitStart = tracing ? performanceNow() : 0

            let surfaceId = engine.toInt(args[0]) ?? 0

            // 0. Resolve node IDs and prepare trees
            let prepareStart = tracing ? performanceNow() : 0

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

            let prepareEnd = tracing ? performanceNow() : 0

            // 2. Calculate layout using Yoga
            let layoutStart = tracing ? performanceNow() : 0
            var contentSize: CGSize = .zero
            if let rootView = self.rootViews[surfaceId] {
                let bounds = rootView.bounds
                contentSize = self.calculateYogaLayout(for: newChildren, in: bounds, surfaceId: surfaceId, tracing: tracing)
            }
            let layoutEnd = tracing ? performanceNow() : 0

            // 3. Diff old tree vs new tree
            let diffStart = tracing ? performanceNow() : 0
            var diffNodeTimings: [(type: String, start: Double, end: Double)] = []
            let mutations = self.differentiator.diff(
                oldChildren: oldChildren,
                newChildren: newChildren,
                parent: nil,
                tracing: tracing,
                nodeTimings: &diffNodeTimings
            )
            let diffEnd = tracing ? performanceNow() : 0

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
            let mutationsStart = tracing ? performanceNow() : 0
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
                let syncStart = tracing ? performanceNow() : 0
                if tracing {
                    self.syncAllFrames(newChildren, tracing: true, nodeTimings: &syncNodeTimings)
                } else {
                    self.syncAllFrames(newChildren)
                }
                let syncEnd = tracing ? performanceNow() : 0
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
            let mutationsEnd = tracing ? performanceNow() : 0

            // 5-8. Post-mutation cleanup
            let cleanupStart = tracing ? performanceNow() : 0

            // 5-6. Promote new tree
            let treePromoteStart = tracing ? performanceNow() : 0

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
            let treePromoteEnd = tracing ? performanceNow() : 0

            // 7. Clean up stale nodes from registry
            let nodeGCStart = tracing ? performanceNow() : 0
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
            let nodeGCEnd = tracing ? performanceNow() : 0

            // 8. Capture trace screenshot if enabled (synchronous, before dom-updated)
            // This captures the visual state of THIS commit before the next commit
            // overwrites it, avoiding the round-trip delay through the inspector proxy.
            self.captureCommitScreenshot()

            // 9. Notify DevTools that the DOM tree changed
            let devtoolsNotifyStart = tracing ? performanceNow() : 0
            if self.sendInspectorMessage != nil {
                self.sendInspectorMessage?("{\"type\":\"dom-updated\",\"surfaceId\":\(surfaceId)}")
            }
            let devtoolsNotifyEnd = tracing ? performanceNow() : 0

            let cleanupEnd = tracing ? performanceNow() : 0

            let commitEnd = tracing ? performanceNow() : 0

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

    // MARK: - Node GC Helper

    /// Recursively collects all node IDs reachable from the given tree.
    func collectNodeIds(from nodes: [ShadowNodeWrapper], into ids: inout Set<Int>) {
        for node in nodes {
            // Find this node's ID in the registry (reverse lookup)
            for (id, registeredNode) in nodeRegistry where registeredNode === node {
                ids.insert(id)
            }
            collectNodeIds(from: node.children, into: &ids)
        }
    }

    // MARK: - Debug Tree Dump

    /// Recursively dumps the tree structure with family identity (ObjectIdentifier)
    /// and key props for debugging diff/mutation issues.
    func debugDumpTree(_ label: String, _ nodes: [ShadowNodeWrapper], depth: Int) {
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

    // MARK: - Suspense Interleaving

    /// Finds the correct insertion index for a new child among preserved
    /// #suspense siblings, using the old child ordering as reference.
    ///
    /// Example: old children were [A, #suspense, B, C].
    /// Preserved #suspense sits at index 0 in the clone.
    /// When appendChild(A') is called, A was at oldIndex 0 → insert at 0 (before #suspense at old index 1).
    /// When appendChild(B') is called, B was at oldIndex 2 → insert at 2 (after #suspense).
    func findInsertionIndex(
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
    func reparentSuspenseContentViews(suspenseNode: ShadowNodeWrapper) {
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
    func unwrapRevealedSuspenseNodes(in parent: ShadowNodeWrapper) {
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
    func unwrapRevealedSuspenseNodesInTree(_ roots: [ShadowNodeWrapper]) {
        for root in roots {
            unwrapRevealedSuspenseNodes(in: root)
        }
    }

    #if DEBUG
    /// Asserts no revealed (pending=false) #suspense wrapper nodes remain in the tree.
    func assertNoRevealedSuspenseWrappers(_ roots: [ShadowNodeWrapper]) {
        for root in roots {
            assertNoRevealedSuspenseWrappersRecursive(root)
        }
    }

    func assertNoRevealedSuspenseWrappersRecursive(_ node: ShadowNodeWrapper) {
        for child in node.children {
            if child.family.elementType == "#suspense" {
                let pending = (child.props["pending"] as? Bool) ?? false
                assert(pending, "Revealed #suspense wrapper (pending=false) still present after unwrap")
            }
            assertNoRevealedSuspenseWrappersRecursive(child)
        }
    }
    #endif

    // MARK: - Measurement

    func registerMeasurement() {
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

    // MARK: - Event Handling Registration

    func registerEventHandling() {
        // $$registerEventHandler(handler) -> void
        engine.setGlobalFunction("$$registerEventHandler") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let handler = args[0]
            self.eventDispatcher.registerEventHandler(handler)
            return nil
        }
    }

    // MARK: - Networking

    func registerNetworking() {
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

    func registerHydrationTraversal() {
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
}
