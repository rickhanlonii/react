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

    // MARK: - Node Unwrap Helper

    /// Unwraps an opaque JS handle back to a ShadowNodeWrapper.
    func unwrapNode(_ ref: JSValueRef) -> ShadowNodeWrapper? {
        return engine.unwrapNativeObject(ref, as: ShadowNodeWrapper.self)
    }

    // MARK: - SSR Timing Helper

    /// Flushes pending SSR commit timings directly to the native PerformanceTracer.
    func flushPendingCommitTimings() {
        guard !pendingSSRCommitTimings.isEmpty else { return }
        let timings = pendingSSRCommitTimings
        pendingSSRCommitTimings.removeAll()

        guard let tracer = tracer else { return }
        for timing in timings {
            tracer.reportCommitTimings(timing)
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

            return engine.wrapNativeObject(node)
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

            return engine.wrapNativeObject(node)
        }

        // $$createTextNodeReuse(text, surfaceId, instanceHandle, prevNode) -> nodeId
        // Reuses the family from a previous text node so the Differentiator
        // generates UPDATE instead of DELETE+CREATE+INSERT+REMOVE.
        engine.setGlobalFunction("$$createTextNodeReuse") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let text = engine.toString(args[0]) ?? ""
            let prevNode = self.unwrapNode(args[3])

            let node = ShadowNodeWrapper(
                props: ["text": text],
                children: [],
                family: prevNode!.family,
                text: text
            )

            // Set up text measurement on the yogaNode
            YogaTextMeasure.setupMeasureFunc(on: node)

            return engine.wrapNativeObject(node)
        }
    }

    // MARK: - Clone Operations

    func registerCloneOperations() {
        // $$cloneNode(opaqueNode) -> opaqueNode
        engine.setGlobalFunction("$$cloneNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }
            let cloned = node.clone()
            return engine.wrapNativeObject(cloned)
        }

        // $$cloneNodeWithNewProps(opaqueNode, newProps) -> opaqueNode
        engine.setGlobalFunction("$$cloneNodeWithNewProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }
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
            // Cache scroll container flag
            let overflow = mergedStyle["overflow"] as? String
            cloned.isScrollContainer = (overflow == "scroll" || overflow == "auto")
            return engine.wrapNativeObject(cloned)
        }

        // $$cloneNodeWithNewChildren(opaqueNode, children?) -> opaqueNode
        engine.setGlobalFunction("$$cloneNodeWithNewChildren") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }

            // Preserve #suspense children from old node — they stay until hydrated
            let preserved = node.children.filter { $0.family.elementType == "#suspense" }

            let cloned = node.cloneWithNewChildren(preserved)

            // Save old ordering for $$appendChild interleaving
            if !preserved.isEmpty {
                cloned.oldChildFamilies = node.children.map { $0.family }
            }

            return engine.wrapNativeObject(cloned)
        }

        // $$cloneNodeWithNewChildrenAndProps(opaqueNode, children?, newProps) -> opaqueNode
        engine.setGlobalFunction("$$cloneNodeWithNewChildrenAndProps") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }
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
            // Cache scroll container flag
            let overflow = mergedStyle["overflow"] as? String
            cloned.isScrollContainer = (overflow == "scroll" || overflow == "auto")

            // Save old ordering for $$appendChild interleaving
            if !preserved.isEmpty {
                cloned.oldChildFamilies = node.children.map { $0.family }
            }

            return engine.wrapNativeObject(cloned)
        }
    }

    // MARK: - Tree Construction

    func registerTreeConstruction() {
        // $$appendChild(opaqueParent, opaqueChild) -> void
        engine.setGlobalFunction("$$appendChild") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let parent = self.unwrapNode(args[0]),
                  let child = self.unwrapNode(args[1]) else {
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

            // Wire up Yoga parent-child relationship.
            // When the parent has previousYogaChildren (from cloneWithNewChildren),
            // compare against the old child at this position. Unchanged children
            // skip yoga operations entirely — their subtrees won't be traversed
            // during speculative layout.
            if let prevChildren = parent.previousYogaChildren,
               insertionIndex < prevChildren.count,
               child.yogaNode == prevChildren[insertionIndex] {
                // UNCHANGED child — already in yoga tree at correct position.
                // Just update ownership from original parent to clone.
                YGNodeSwapChild(parent.yogaNode, child.yogaNode, insertionIndex)
            } else {
                // CHANGED child (or no previousYogaChildren) — full yoga insert.
                if let prevChildren = parent.previousYogaChildren,
                   insertionIndex < prevChildren.count {
                    // Swap out the old yoga child at this position.
                    if let owner = YGNodeGetOwner(child.yogaNode), owner != parent.yogaNode {
                        YGNodeRemoveChild(owner, child.yogaNode)
                    }
                    YGNodeSwapChild(parent.yogaNode, child.yogaNode, insertionIndex)
                    // SwapChild doesn't dirty — manually propagate dirty since
                    // the child changed.
                    YGNodeMarkDirtyNonLeaf(parent.yogaNode)
                } else {
                    // No previous children or appending beyond old count — regular insert.
                    if let owner = YGNodeGetOwner(child.yogaNode) {
                        YGNodeRemoveChild(owner, child.yogaNode)
                    }
                    YGNodeInsertChild(parent.yogaNode, child.yogaNode, insertionIndex)
                }
            }

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

            // --- Speculative background layout ---
            // The child subtree is fully built (persistent mode guarantee).
            // Speculatively compute its layout on a concurrent background queue
            // using both width and height constraints from the parent's cached
            // layout. Small subtrees (< 2 children) are skipped to avoid GCD
            // overhead. Two-pass text re-measurement runs in the background to
            // match root layout results. Parent-child ordering uses per-node
            // DispatchGroups instead of global barriers, allowing unrelated
            // siblings to compute in parallel.

            // Skip small subtrees — leaf nodes and single-child wrappers
            // have too little work to justify dispatch overhead. Their layout
            // is handled by an ancestor or root layout pass.
            guard child.children.count >= 2 else { return nil }

            let parentWidth = Float(parent.layoutFrame.size.width)
            let parentHeight = Float(parent.layoutFrame.size.height)
            if self.speculativeLayoutEnabled, parentWidth > 0, YGNodeIsDirty(child.yogaNode) {
                // Compute parent inner dimensions (content box): size minus padding and border.
                let parentYoga = parent.yogaNode
                let padL = YGNodeStyleGetPadding(parentYoga, .left)
                let padR = YGNodeStyleGetPadding(parentYoga, .right)
                let padT = YGNodeStyleGetPadding(parentYoga, .top)
                let padB = YGNodeStyleGetPadding(parentYoga, .bottom)
                let padAll = YGNodeStyleGetPadding(parentYoga, .all)
                let borL = YGNodeStyleGetBorder(parentYoga, .left)
                let borR = YGNodeStyleGetBorder(parentYoga, .right)
                let borT = YGNodeStyleGetBorder(parentYoga, .top)
                let borB = YGNodeStyleGetBorder(parentYoga, .bottom)
                let borAll = YGNodeStyleGetBorder(parentYoga, .all)
                let totalHorizPad = (padL.unit == .point ? padL.value : (padAll.unit == .point ? padAll.value : 0))
                                  + (padR.unit == .point ? padR.value : (padAll.unit == .point ? padAll.value : 0))
                let totalHorizBor = (!borL.isNaN ? borL : (!borAll.isNaN ? borAll : 0))
                                  + (!borR.isNaN ? borR : (!borAll.isNaN ? borAll : 0))
                let parentInnerWidth = parentWidth - totalHorizPad - totalHorizBor

                // Height constraint from cached parent layout. Improves cache
                // hit rate for row-direction + alignItems:stretch and percentage
                // heights. NaN when unavailable (first render) — Yoga handles
                // mismatches by re-computing, so this is never incorrect.
                let totalVertPad = (padT.unit == .point ? padT.value : (padAll.unit == .point ? padAll.value : 0))
                                 + (padB.unit == .point ? padB.value : (padAll.unit == .point ? padAll.value : 0))
                let totalVertBor = (!borT.isNaN ? borT : (!borAll.isNaN ? borAll : 0))
                                 + (!borB.isNaN ? borB : (!borAll.isNaN ? borAll : 0))
                let parentInnerHeight = parentHeight > 0
                    ? parentHeight - totalVertPad - totalVertBor
                    : Float.nan

                // Subtract child's margins — Yoga deducts margins from
                // available space before laying out each child.
                let childYoga = child.yogaNode
                let cMarL = YGNodeStyleGetMargin(childYoga, .left)
                let cMarR = YGNodeStyleGetMargin(childYoga, .right)
                let cMarT = YGNodeStyleGetMargin(childYoga, .top)
                let cMarB = YGNodeStyleGetMargin(childYoga, .bottom)
                let cMarAll = YGNodeStyleGetMargin(childYoga, .all)
                let childMarginRow = (cMarL.unit == .point ? cMarL.value : (cMarAll.unit == .point ? cMarAll.value : 0))
                                   + (cMarR.unit == .point ? cMarR.value : (cMarAll.unit == .point ? cMarAll.value : 0))
                let childMarginCol = (cMarT.unit == .point ? cMarT.value : (cMarAll.unit == .point ? cMarAll.value : 0))
                                   + (cMarB.unit == .point ? cMarB.value : (cMarAll.unit == .point ? cMarAll.value : 0))
                let availableWidth = parentInnerWidth - childMarginRow
                let availableHeight = parentInnerHeight.isNaN ? Float.nan : parentInnerHeight - childMarginCol

                let childYogaNode = child.yogaNode
                let childYogaKey = UnsafeRawPointer(childYogaNode)
                let tracing = self.nativeTracingEnabled
                let childType = child.family.elementType
                let childNode = child  // Captured for text re-measurement

                // Check direct Yoga children for speculative layout state.
                // - If any child already completed: skip this parent entirely.
                //   The root layout at $$completeRoot uses their cached results.
                // - If any child is pending/inflight: collect their per-node
                //   groups so this parent waits only on its own children.
                os_unfair_lock_lock(&self.speculativeLock)
                var needsChildWait = false
                var hasCompletedChild = false
                var childGroupsToWait: [DispatchGroup] = []
                let yogaChildCount = YGNodeGetChildCount(childYogaNode)
                for i in 0..<yogaChildCount {
                    if let yogaChild = YGNodeGetChild(childYogaNode, i) {
                        let key = UnsafeRawPointer(yogaChild)
                        if self.completedSpeculativeNodes.contains(key) {
                            hasCompletedChild = true
                            break
                        }
                        if self.pendingSpeculativeNodes.contains(key) || self.inflightSpeculativeNodes.contains(key) {
                            needsChildWait = true
                            if let group = self.speculativeNodeGroups[key] {
                                childGroupsToWait.append(group)
                            }
                        }
                    }
                }
                if hasCompletedChild {
                    os_unfair_lock_unlock(&self.speculativeLock)
                    return nil
                }

                // Add to pending set, removing any descendants already pending
                // (this node's layout encompasses them).
                self.pendingSpeculativeNodes.insert(childYogaKey)
                self.removeDescendantsFromPending(childYogaNode)

                // Create a per-node group so parents can wait on just this
                // node instead of draining the entire queue with a barrier.
                let nodeGroup = DispatchGroup()
                nodeGroup.enter()
                self.speculativeNodeGroups[childYogaKey] = nodeGroup
                os_unfair_lock_unlock(&self.speculativeLock)

                let workItem: @Sendable () -> Void = {
                    // Check if this node was superseded by an ancestor
                    os_unfair_lock_lock(&self.speculativeLock)
                    let stillPending = self.pendingSpeculativeNodes.contains(childYogaKey)
                    if stillPending {
                        self.pendingSpeculativeNodes.remove(childYogaKey)
                        self.inflightSpeculativeNodes.insert(childYogaKey)
                    }
                    os_unfair_lock_unlock(&self.speculativeLock)

                    guard stillPending else {
                        nodeGroup.leave()
                        self.speculativeLayoutGroup.leave()
                        return
                    }

                    // Check if any ancestor is currently computing (inflight).
                    // If so, skip — the ancestor's layout covers this subtree.
                    var ancestor = YGNodeGetOwner(childYogaNode)
                    var ancestorInflight = false
                    os_unfair_lock_lock(&self.speculativeLock)
                    while let a = ancestor {
                        if self.inflightSpeculativeNodes.contains(UnsafeRawPointer(a)) {
                            ancestorInflight = true
                            break
                        }
                        ancestor = YGNodeGetOwner(a)
                    }
                    if ancestorInflight {
                        self.inflightSpeculativeNodes.remove(childYogaKey)
                    }
                    os_unfair_lock_unlock(&self.speculativeLock)

                    guard !ancestorInflight else {
                        nodeGroup.leave()
                        self.speculativeLayoutGroup.leave()
                        return
                    }

                    // Compute layout with width + height constraints.
                    let start = tracing ? performanceNow() : 0
                    YGNodeCalculateLayout(childYogaNode, availableWidth, availableHeight, .LTR)

                    // Two-pass text re-measurement: if any text nodes were
                    // flex-shrunk below their measured width, mark dirty and
                    // re-layout so the cached result matches root layout.
                    if ShadowTreeLayout.markTextNodesNeedingRemeasure(childNode) {
                        YGNodeCalculateLayout(childYogaNode, availableWidth, availableHeight, .LTR)
                    }
                    let end = tracing ? performanceNow() : 0

                    // Move from inflight to completed
                    os_unfair_lock_lock(&self.speculativeLock)
                    self.inflightSpeculativeNodes.remove(childYogaKey)
                    self.completedSpeculativeNodes.insert(childYogaKey)
                    os_unfair_lock_unlock(&self.speculativeLock)

                    if tracing {
                        DispatchQueue.main.async {
                            self.tracer?.reportTimeStamp(
                                label: "Speculative Layout (\(childType))",
                                start: start, end: end,
                                track: "Speculative Layout", trackGroup: "Native ⚛",
                                color: "tertiary-light"
                            )
                        }
                    }
                    nodeGroup.leave()
                    self.speculativeLayoutGroup.leave()
                }

                // Per-subtree dispatch: when this node has in-flight children,
                // wait on their per-node groups instead of using a global barrier.
                // This allows unrelated sibling subtrees to compute in parallel.
                self.speculativeLayoutGroup.enter()
                if needsChildWait && !childGroupsToWait.isEmpty {
                    let waitGroup = DispatchGroup()
                    for childGroup in childGroupsToWait {
                        waitGroup.enter()
                        childGroup.notify(queue: self.speculativeLayoutQueue) {
                            waitGroup.leave()
                        }
                    }
                    waitGroup.notify(queue: self.speculativeLayoutQueue, execute: workItem)
                } else {
                    self.speculativeLayoutQueue.async(execute: workItem)
                }
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

        // $$appendChildToChildSet(childSetId, opaqueChild) -> void
        engine.setGlobalFunction("$$appendChildToChildSet") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let childSetId = engine.toInt(args[0]) ?? 0
            guard let child = self.unwrapNode(args[1]) else { return nil }
            self.childSetRegistry[childSetId]?.append(child)
            return nil
        }

        // $$completeRoot(surfaceId, childNodeIds) -> void
        // This is the core commit function. Routes to the Renderer for the
        // unified layout → diff → mutations → sync pipeline.
        // Timing goes through renderer.onTimingCollected → tracer.reportCommitTimings.
        engine.setGlobalFunction("$$completeRoot") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let tracing = self.nativeTracingEnabled
            let resolveStart = tracing ? performanceNow() : 0

            let surfaceId = engine.toInt(args[0]) ?? 0

            // 0. Unwrap opaque node handles from JS
            let childRefs = engine.toArray(args[1]) ?? []
            let newChildren: [ShadowNodeWrapper] = childRefs.compactMap { ref in
                engine.unwrapNativeObject(ref, as: ShadowNodeWrapper.self)
            }

            // 1. Look up renderer — try custom closure first, fall back to ReactRuntime.shared
            let renderer: Renderer
            if let customRenderer = self.rendererForSurface?(surfaceId) {
                renderer = customRenderer
            } else if let root = ReactRuntime.shared.rootForSurface(surfaceId) {
                renderer = root.renderer
            } else {
                print("[react-dom-native] Warning: No root for surfaceId \(surfaceId)")
                return nil
            }

            // 2. Get old tree and prepare for diff
            let oldChildren = renderer.currentTree

            // Uncomment to debug tree structures with family identity:
            // print("[completeRoot] surfaceId=\(surfaceId) oldChildren=\(oldChildren.count) newChildren=\(newChildren.count)")
            // self.debugDumpTree("  OLD", oldChildren, depth: 0)
            // self.debugDumpTree("  NEW", newChildren, depth: 0)

            // 2b. Unwrap revealed #suspense nodes from old tree before diffing.
            self.unwrapRevealedSuspenseNodesInTree(oldChildren)

            #if DEBUG
            self.assertNoRevealedSuspenseWrappers(oldChildren)
            #endif

            // Clean up trailing old yoga children from swap optimization.
            // Nodes that had more old children than new children still have
            // stale yoga children that need removal before layout.
            self.cleanupTrailingYogaChildren(newChildren)

            let resolveEnd = tracing ? performanceNow() : 0

            // Wait for any in-flight speculative layouts to complete
            let waitStart = tracing ? performanceNow() : 0
            self.speculativeLayoutGroup.wait()
            let waitEnd = tracing ? performanceNow() : 0

            // Clear tracking sets (should already be empty, but defensive)
            os_unfair_lock_lock(&self.speculativeLock)
            self.pendingSpeculativeNodes.removeAll()
            self.inflightSpeculativeNodes.removeAll()
            self.completedSpeculativeNodes.removeAll()
            self.speculativeNodeGroups.removeAll()
            os_unfair_lock_unlock(&self.speculativeLock)

            if tracing, waitEnd > waitStart + 0.001 {
                self.tracer?.reportTimeStamp(
                    label: "Wait Speculative Layout",
                    start: waitStart, end: waitEnd,
                    track: "Shadow Tree", trackGroup: "Native ⚛",
                    color: "warning"
                )
            }

            // 3. Sync tracing state and route to Renderer
            renderer.tracingEnabled = tracing
            renderer.commitTree(newChildren: newChildren, label: "Commit")

            // Emit "Resolve Tree" event for the pre-commitTree overhead
            if tracing, resolveEnd > resolveStart {
                self.tracer?.reportTimeStamp(
                    label: "Resolve Tree", start: resolveStart, end: resolveEnd,
                    track: "Shadow Tree", trackGroup: "Native ⚛", color: "secondary-light"
                )
            }

            // 3b. Sync currentTrees for DevTools and other Bindings consumers
            self.currentTrees[surfaceId] = renderer.currentTree

            // 4. Post-commit cleanup (Bindings-specific concerns)

            // 4a. Hydration completion
            if self.hydrationInProgress.contains(surfaceId) {
                self.hydrationInProgress.remove(surfaceId)
                print("[ReactDomNativeKit] Hydration initial commit for surfaceId \(surfaceId)")
                self.onHydrationComplete?(surfaceId)
                self.ssrTrees.removeValue(forKey: surfaceId)
            }

            // 4b. Notify DevTools that the DOM tree changed
            if self.sendInspectorMessage != nil {
                self.sendInspectorMessage?("{\"type\":\"dom-updated\",\"surfaceId\":\(surfaceId)}")
            }

            return nil
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
        // $$measureNode(opaqueNode, callback) -> void
        engine.setGlobalFunction("$$measureNode") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }
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
        // $$fetch(url, options, callback) -> void
        // options: { headers?: {}, method?: string, body?: string }
        // Backward compat: options can also be a flat headers dict (old API)
        // Asynchronous - URLSession runs on background thread, callbacks
        // dispatched to main thread.
        engine.setGlobalFunction("$$fetch") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }

            let urlString = engine.toString(args[0]) ?? ""
            let optionsDict = engine.toDictionary(args[1]) ?? [:]
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

            // Method (default GET)
            if let method = optionsDict["method"] as? String {
                request.httpMethod = method.uppercased()
            }

            // Headers — check for nested headers dict first, fall back to flat dict
            if let headersDict = optionsDict["headers"] as? [String: Any] {
                for (key, value) in headersDict {
                    if let stringValue = value as? String {
                        request.setValue(stringValue, forHTTPHeaderField: key)
                    }
                }
            } else {
                // Backward compat: if options IS the headers dict (old API)
                // Treat any key that isn't a known option key as a header
                for (key, value) in optionsDict {
                    if key != "method" && key != "body" && key != "headers",
                       let stringValue = value as? String {
                        request.setValue(stringValue, forHTTPHeaderField: key)
                    }
                }
            }

            // Body (string or Data)
            if let body = optionsDict["body"] as? String {
                request.httpBody = body.data(using: .utf8)
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
        // $$registerSSRTree(surfaceId, opaqueNodes) -> void
        // Called from JS to register an SSR tree for hydration.
        // opaqueNodes is an array of opaque node handles.
        engine.setGlobalFunction("$$registerSSRTree") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            let surfaceId = engine.toInt(args[0]) ?? 0
            let nodeRefs = engine.toArray(args[1]) ?? []
            let nodes: [ShadowNodeWrapper] = nodeRefs.compactMap { ref in
                engine.unwrapNativeObject(ref, as: ShadowNodeWrapper.self)
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

        // $$getSSRChildOf(opaqueNode) -> {_ssrNodeRef, type} | null
        // Returns the first child of an SSR node.
        engine.setGlobalFunction("$$getSSRChildOf") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }
            guard let first = node.children.first else { return nil }
            return self.makeSSRNodeRef(first, engine: engine)
        }

        // $$getNextSSRSibling(opaqueNode) -> {_ssrNodeRef, type} | null
        // Returns the next sibling of an SSR node.
        engine.setGlobalFunction("$$getNextSSRSibling") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }

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

        // $$markBoundaryRevealed(opaqueNode) -> void
        // Called from JS when a boundary is revealed to sync pending=false
        // to the Swift-side ShadowNodeWrapper props.
        engine.setGlobalFunction("$$markBoundaryRevealed") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }
            node.props["pending"] = false
            return nil
        }

        // $$setInstanceHandle(opaqueNode, instanceHandle, hasClickHandler) -> void
        // Called during hydration to attach the React fiber reference to an
        // SSR-created node's family so that event dispatch works.
        engine.setGlobalFunction("$$setInstanceHandle") { [weak self, weak engine] args in
            guard let self = self, let engine = engine else { return nil }
            guard let node = self.unwrapNode(args[0]) else { return nil }
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
