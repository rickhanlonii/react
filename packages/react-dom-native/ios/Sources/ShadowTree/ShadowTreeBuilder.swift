import Foundation
import CoreGraphics
import QuartzCore
import Yoga

#if canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// ShadowTreeBuilder
//
// Stack-based tree construction from SSR instructions. Builds a shadow tree
// using the same ShadowNodeWrapper / ElementDefaults / YogaStyleApplier
// infrastructure as the reconciler path.
//
// Instructions processed:
//   openElement(type, props) → push element node to stack
//   textNode(text)           → create text node, append to current parent
//   closeElement()           → pop stack, append to new parent
//   rootComplete()           → calculate Yoga layout, create UIKit views
// ---------------------------------------------------------------------------

public class ShadowTreeBuilder {

    /// Stack of nodes being built — top is the currently open element
    private var nodeStack: [ShadowNodeWrapper] = []

    /// Completed root-level nodes
    private(set) public var rootChildren: [ShadowNodeWrapper] = []

    /// Root Yoga node that acts as the container
    private let rootYogaNode: YGNodeRef

    /// Viewport size for layout calculation
    public private(set) var viewportWidth: Float
    public private(set) var viewportHeight: Float

    /// Surface ID for ShadowNodeFamily
    public let surfaceId: Int

    /// Counter for generating unique node families
    private var nextFamilyId: Int = 0

    /// Callback invoked when the root shell is complete and views are ready
    public var onRootComplete: (([ShadowNodeWrapper]) -> Void)?

    /// Returns the current element being built (top of stack), or nil if at root level.
    public var currentParent: ShadowNodeWrapper? {
        return nodeStack.last
    }

    // MARK: - Initialization

    public init(
        surfaceId: Int = 1,
        viewportWidth: Float = 390,
        viewportHeight: Float = 844
    ) {
        self.surfaceId = surfaceId
        self.viewportWidth = viewportWidth
        self.viewportHeight = viewportHeight

        self.rootYogaNode = YGNodeNewWithConfig(YogaConfig.shared)
        YGNodeStyleSetFlexDirection(rootYogaNode, .column)
        YGNodeStyleSetWidth(rootYogaNode, viewportWidth)
        // Don't set height — let content determine its own height.
        // On the web, the viewport scrolls when content overflows rather
        // than shrinking children via flexShrink. This matches the
        // reconciler path (Bindings.calculateYogaLayout) which also uses
        // unbounded height.
    }

    deinit {
        YGNodeFree(rootYogaNode)
    }

    // MARK: - Public API

    /// Update viewport dimensions (e.g. after device rotation).
    public func updateViewport(width: Float, height: Float) {
        self.viewportWidth = width
        self.viewportHeight = height
        YGNodeStyleSetWidth(rootYogaNode, width)
    }

    /// Open an element — creates a ShadowNodeWrapper and pushes to stack.
    public func openElement(type: String, props: [String: Any]) {
        let node = ShadowNodeWrapper.createElementNode(
            type: type,
            props: props,
            surfaceId: surfaceId
        )
        nodeStack.append(node)
    }

    /// Add a text node as child of the current stack top.
    public func textNode(text: String) {
        let family = ShadowNodeFamily(
            elementType: "#text",
            surfaceId: surfaceId,
            instanceHandle: nil
        )
        let node = ShadowNodeWrapper(
            props: [:],
            children: [],
            family: family,
            text: text
        )

        // Set up text measurement
        // Determine font properties from parent element
        var fontSize: CGFloat = 16
        var fontWeight: String? = nil
        var fontFamily: String? = nil
        var fontStyle: String? = nil
        var lineHeight: CGFloat? = nil

        if let parent = nodeStack.last {
            let parentStyle = parent.props["style"] as? [String: Any] ?? [:]
            if let fs = parentStyle["fontSize"] {
                if let d = fs as? Double { fontSize = CGFloat(d) }
                else if let i = fs as? Int { fontSize = CGFloat(i) }
            }
            fontWeight = parentStyle["fontWeight"] as? String
            fontFamily = parentStyle["fontFamily"] as? String
            fontStyle = parentStyle["fontStyle"] as? String
            if let lh = parentStyle["lineHeight"] {
                if let d = lh as? Double { lineHeight = CGFloat(d) }
                else if let i = lh as? Int { lineHeight = CGFloat(i) }
            }
            // Monospace elements store lineHeight as an internal-only
            // measurement hint, not in the style dict.
            if lineHeight == nil {
                lineHeight = ElementDefaults.textLineHeight(for: parent.family.elementType)
            }
        }

        YogaTextMeasure.setupMeasureFunc(
            on: node,
            fontSize: fontSize,
            fontWeight: fontWeight,
            fontFamily: fontFamily,
            fontStyle: fontStyle,
            lineHeight: lineHeight
        )

        // Append to current parent or root
        appendChild(node)
    }

    /// Close the current element — pop from stack and append to parent.
    public func closeElement() {
        guard let node = nodeStack.popLast() else {
            print("[ShadowTreeBuilder] Warning: closeElement called with empty stack")
            return
        }

        if nodeStack.isEmpty {
            // This is a root-level node
            rootChildren.append(node)
            let index = YGNodeGetChildCount(rootYogaNode)
            YGNodeInsertChild(rootYogaNode, node.yogaNode, index)
        } else {
            // Append to parent on stack
            appendChild(node)
        }
    }

    /// Layout timing from the most recent rootComplete() call (ms since boot).
    /// Always collected so SSR first paint timing can be reported retroactively.
    public private(set) var layoutStartTime: Double = 0
    public private(set) var layoutEndTime: Double = 0

    /// Root shell is complete — calculate layout and notify.
    public func rootComplete() {
        layoutStartTime = CACurrentMediaTime() * 1000.0
        ShadowTreeLayout.performLayout(
            rootYogaNode: rootYogaNode,
            children: rootChildren,
            width: viewportWidth,
            height: .nan
        )
        layoutEndTime = CACurrentMediaTime() * 1000.0
        onRootComplete?(rootChildren)
    }

    /// Reset builder state for reuse.
    public func reset() {
        nodeStack.removeAll()
        rootChildren.removeAll()
        // Remove all children from root yoga node
        while YGNodeGetChildCount(rootYogaNode) > 0 {
            YGNodeRemoveChild(rootYogaNode, YGNodeGetChild(rootYogaNode, 0)!)
        }
    }

    /// Clone-based boundary reveal for persistent mode immutability.
    ///
    /// Returns a NEW root children array with the #suspense boundary revealed
    /// (content replacing fallback). The old tree remains completely unchanged.
    ///
    /// The approach:
    /// 1. Clone the #suspense wrapper with content children and pending=false
    /// 2. Clone all ancestors up to root, replacing the old child at each level
    /// 3. Return new root children (caller diffs old vs new and applies mutations)
    ///
    /// - Parameters:
    ///   - rootChildren: The current root children array (not modified).
    ///   - suspenseNode: The #suspense wrapper node to reveal.
    ///   - contentNodes: The content nodes built by the segment builder.
    /// - Returns: New root children array with the boundary revealed.
    public static func revealBoundaryImmutable(
        rootChildren: [ShadowNodeWrapper],
        suspenseNode: ShadowNodeWrapper,
        contentNodes: [ShadowNodeWrapper]
    ) -> [ShadowNodeWrapper] {
        // Detach content nodes from their segment builder's yoga tree
        for node in contentNodes {
            if let owner = YGNodeGetOwner(node.yogaNode) {
                YGNodeRemoveChild(owner, node.yogaNode)
            }
        }

        // Clone #suspense with content children and pending=false
        var newProps = suspenseNode.props
        newProps["pending"] = false
        let clonedSuspense = suspenseNode.cloneWithNewChildrenAndProps(contentNodes, newProps)

        // Clone the ancestor path from root to #suspense, replacing the
        // suspense node with the clone at each level
        return clonePathReplacingNode(
            target: suspenseNode,
            replacement: clonedSuspense,
            in: rootChildren
        )
    }

    /// Recursively clones the path from root to target, replacing target with
    /// replacement. Nodes not on the path are reused by reference (shared).
    private static func clonePathReplacingNode(
        target: ShadowNodeWrapper,
        replacement: ShadowNodeWrapper,
        in children: [ShadowNodeWrapper]
    ) -> [ShadowNodeWrapper] {
        return children.map { child in
            if child === target {
                return replacement
            }
            // Check if target is a descendant of this child
            if containsNode(target, in: child.children) {
                let newGrandchildren = clonePathReplacingNode(
                    target: target,
                    replacement: replacement,
                    in: child.children
                )
                return child.cloneWithNewChildren(newGrandchildren)
            }
            return child // not on the path — reuse by reference
        }
    }

    /// Returns true if target exists anywhere in the children subtree.
    private static func containsNode(
        _ target: ShadowNodeWrapper,
        in children: [ShadowNodeWrapper]
    ) -> Bool {
        for child in children {
            if child === target { return true }
            if containsNode(target, in: child.children) { return true }
        }
        return false
    }

    /// Recalculate Yoga layout and update all node frames.
    public func recalculateLayout() {
        ShadowTreeLayout.performLayout(
            rootYogaNode: rootYogaNode,
            children: rootChildren,
            width: viewportWidth,
            height: .nan
        )
    }

    // MARK: - Private Helpers

    /// Append a child node to the current stack top's children and Yoga tree.
    private func appendChild(_ child: ShadowNodeWrapper) {
        guard let parent = nodeStack.last else {
            // No parent on stack — this is a root-level node
            rootChildren.append(child)
            let index = YGNodeGetChildCount(rootYogaNode)
            YGNodeInsertChild(rootYogaNode, child.yogaNode, index)
            return
        }

        parent.children.append(child)
        let index = YGNodeGetChildCount(parent.yogaNode)

        // Ensure yoga node isn't owned by another parent
        if let owner = YGNodeGetOwner(child.yogaNode) {
            YGNodeRemoveChild(owner, child.yogaNode)
        }
        YGNodeInsertChild(parent.yogaNode, child.yogaNode, index)

        // CSS: block children of flex parents participate in flex layout
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
        if let parentFS = (parentStyle["fontSize"] as? NSNumber)?.doubleValue
            ?? (parentStyle["fontSize"] as? Double) {
            if let updated = ElementDefaults.recomputeEmMargins(
                childType: child.family.elementType,
                childStyle: childStyle,
                parentFontSize: parentFS
            ) {
                child.props["style"] = updated
                YogaStyleApplier.apply(updated, to: child.yogaNode)
                if let newFS = (updated["fontSize"] as? NSNumber)?.doubleValue
                    ?? (updated["fontSize"] as? Double) {
                    if let minH = ElementDefaults.yogaTextContainerMinHeight(
                        for: child.family.elementType, fontSize: CGFloat(newFS)) {
                        YGNodeStyleSetMinHeight(child.yogaNode, Float(minH))
                    }
                    // Re-measure text children with inherited fontSize.
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
        if parent.family.elementType == "details",
           parent.props["open"] == nil,
           child.family.elementType != "summary" {
            YGNodeStyleSetDisplay(child.yogaNode, .none)
        }

        // CSS <legend> inside <fieldset>: pull legend up to sit on border.
        // Also add paddingTop as legend's marginBottom to restore the gap
        // between legend and subsequent content (CSS positions content at
        // legendBottom + paddingTop).
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
    }

}

// MARK: - InstructionStreamDelegate Conformance

extension ShadowTreeBuilder: InstructionStreamDelegate {

    public func didReceiveOpenElement(type: String, props: [String: Any]) {
        openElement(type: type, props: props)
    }

    public func didReceiveTextNode(text: String) {
        textNode(text: text)
    }

    public func didReceiveCloseElement() {
        closeElement()
    }

    public func didReceiveBeginBoundary(id: Int) {
        // Handled by BoundaryManager
    }

    public func didReceiveEndBoundary() {
        // Handled by BoundaryManager
    }

    public func didReceiveBeginSegment(id: Int) {
        // Handled by BoundaryManager
    }

    public func didReceiveEndSegment() {
        // Handled by BoundaryManager
    }

    public func didReceiveRevealBoundary(id: Int) {
        // Handled by BoundaryManager
    }

    public func didReceiveRootComplete() {
        rootComplete()
    }

    public func didReceivePlaceholder(id: Int) {
        // Placeholder for pending segment — handled by BoundaryManager
    }

    public func didReceiveFlightData(row: String) {
        // Buffered for hydration — handled by the SSR coordinator
    }

    public func didReceiveClientRenderBoundary(id: Int, errorDigest: String?) {
        // Handled by BoundaryManager
    }

    public func didReceiveError(_ error: Error) {
        print("[ShadowTreeBuilder] Parse error: \(error)")
    }
}
