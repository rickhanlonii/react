import Foundation
import CoreGraphics
import Yoga

// ---------------------------------------------------------------------------
// ShadowNodeWrapper
//
// Immutable shadow node. Passed between JS and Swift as an integer ID
// (managed by the Bindings layer's node registry). The ShadowTree module
// has zero framework dependencies beyond Foundation, CoreGraphics, and Yoga.
//
// Each ShadowNodeWrapper owns a YGNodeRef for Yoga layout. The yogaNode
// is created in init and freed in deinit. Clone methods create fresh
// yogaNodes with style copied from the source.
// ---------------------------------------------------------------------------

public class ShadowNodeWrapper {
    /// The props dictionary for this node revision.
    public var props: [String: Any]

    /// Ordered children of this node (other ShadowNodeWrappers).
    public var children: [ShadowNodeWrapper]

    /// Stable identity shared across clones.
    public let family: ShadowNodeFamily

    /// Text content (non-nil only for text nodes created via $$createTextNode).
    public let text: String?

    /// Yoga layout node. Owned by this wrapper — freed in deinit.
    public let yogaNode: YGNodeRef

    /// Computed layout frame (set during $$completeRoot after Yoga calculation).
    public var layoutFrame: CGRect = .zero

    /// Natural content size for scroll containers (overflow: scroll/auto).
    /// Computed during layout by re-laying-out children with unbounded height.
    public var scrollContentSize: CGSize? = nil

    /// Original child family ordering from the node this was cloned from.
    /// Used by $$appendChild to interleave reconciler children with
    /// preserved #suspense children at correct positions. Nil for non-clones.
    public var oldChildFamilies: [ShadowNodeFamily]? = nil

    // MARK: - Initializers

    public init(
        props: [String: Any],
        children: [ShadowNodeWrapper] = [],
        family: ShadowNodeFamily,
        text: String? = nil
    ) {
        self.props = props
        self.children = children
        self.family = family
        self.text = text
        self.yogaNode = YGNodeNewWithConfig(YogaConfig.shared)
    }

    deinit {
        // Clean up text measure context if set
        YogaTextMeasure.cleanupMeasureContext(for: yogaNode)
        // Remove from parent before freeing to avoid dangling pointers
        if let owner = YGNodeGetOwner(yogaNode) {
            YGNodeRemoveChild(owner, yogaNode)
        }
        YGNodeFree(yogaNode)
    }

    // MARK: - Factory

    /// Creates an element node with defaults merged and Yoga styles applied.
    ///
    /// Encapsulates the 4-step creation sequence shared by the reconciler
    /// ($$createNode) and SSR (openElement) paths:
    /// 1. Merge element defaults with user style
    /// 2. Create ShadowNodeFamily
    /// 3. Create ShadowNodeWrapper
    /// 4. Apply Yoga styles
    ///
    /// Text node creation is NOT unified here — font inheritance timing
    /// differs between paths.
    public static func createElementNode(
        type: String,
        props: [String: Any],
        surfaceId: Int,
        instanceHandle: AnyObject? = nil
    ) -> ShadowNodeWrapper {
        // 1. Merge element-type defaults with user-supplied style
        let userStyle = props["style"] as? [String: Any]
        var mergedStyle = ElementDefaults.mergedStyle(for: type, userStyle: userStyle)

        // HTML <dialog> is hidden by default (display:none). The `open`
        // attribute makes it visible. Check the prop and override display.
        if type == "dialog", props["open"] != nil {
            mergedStyle["display"] = "block"
        }

        var nodeProps = props
        if !mergedStyle.isEmpty {
            nodeProps["style"] = mergedStyle
        }

        // 2. Create family
        let family = ShadowNodeFamily(
            elementType: type,
            surfaceId: surfaceId,
            instanceHandle: instanceHandle
        )

        // 3. Create node
        let node = ShadowNodeWrapper(
            props: nodeProps,
            children: [],
            family: family,
            text: nil
        )

        // 4. Apply Yoga styles
        if !mergedStyle.isEmpty {
            YogaStyleApplier.apply(mergedStyle, to: node.yogaNode)
        }

        // 5. Apply Yoga-only overrides (not stored in style dict)
        if let minH = ElementDefaults.yogaMinHeight(for: type) {
            YGNodeStyleSetMinHeight(node.yogaNode, Float(minH))
        }
        // Legend needs inline-block display for shrink-to-fit width inside
        // fieldset's block layout, but we don't put "display" in the style
        // dict to avoid comparison diffs (web reports display: block).
        if type == "legend" || ElementDefaults.needsInlineBlockDisplay(for: type) {
            YGNodeStyleSetDisplay(node.yogaNode, .inlineBlock)
        }

        return node
    }

    // MARK: - Cloning helpers

    /// Clone with new props, keeping existing children.
    public func cloneWithNewProps(_ newProps: [String: Any]) -> ShadowNodeWrapper {
        let cloned = ShadowNodeWrapper(
            props: newProps,
            children: self.children,
            family: self.family,
            text: self.text
        )
        YGNodeCopyStyle(cloned.yogaNode, self.yogaNode)
        // Re-insert children's yogaNodes
        for (index, child) in cloned.children.enumerated() {
            if YGNodeGetOwner(child.yogaNode) != nil {
                YGNodeRemoveChild(YGNodeGetOwner(child.yogaNode)!, child.yogaNode)
            }
            YGNodeInsertChild(cloned.yogaNode, child.yogaNode, index)
        }
        return cloned
    }

    /// Clone with new children, keeping existing props.
    public func cloneWithNewChildren(_ newChildren: [ShadowNodeWrapper]) -> ShadowNodeWrapper {
        let cloned = ShadowNodeWrapper(
            props: self.props,
            children: newChildren,
            family: self.family,
            text: self.text
        )
        YGNodeCopyStyle(cloned.yogaNode, self.yogaNode)
        // Insert new children's yogaNodes
        for (index, child) in newChildren.enumerated() {
            if YGNodeGetOwner(child.yogaNode) != nil {
                YGNodeRemoveChild(YGNodeGetOwner(child.yogaNode)!, child.yogaNode)
            }
            YGNodeInsertChild(cloned.yogaNode, child.yogaNode, index)
        }
        return cloned
    }

    /// Clone with both new children and new props.
    public func cloneWithNewChildrenAndProps(
        _ newChildren: [ShadowNodeWrapper],
        _ newProps: [String: Any]
    ) -> ShadowNodeWrapper {
        let cloned = ShadowNodeWrapper(
            props: newProps,
            children: newChildren,
            family: self.family,
            text: self.text
        )
        YGNodeCopyStyle(cloned.yogaNode, self.yogaNode)
        // Insert new children's yogaNodes
        for (index, child) in newChildren.enumerated() {
            if YGNodeGetOwner(child.yogaNode) != nil {
                YGNodeRemoveChild(YGNodeGetOwner(child.yogaNode)!, child.yogaNode)
            }
            YGNodeInsertChild(cloned.yogaNode, child.yogaNode, index)
        }
        return cloned
    }

    /// Clone preserving everything (shallow copy with same family).
    public func clone() -> ShadowNodeWrapper {
        let cloned = ShadowNodeWrapper(
            props: self.props,
            children: self.children,
            family: self.family,
            text: self.text
        )
        YGNodeCopyStyle(cloned.yogaNode, self.yogaNode)
        // Re-insert children's yogaNodes
        for (index, child) in cloned.children.enumerated() {
            if YGNodeGetOwner(child.yogaNode) != nil {
                YGNodeRemoveChild(YGNodeGetOwner(child.yogaNode)!, child.yogaNode)
            }
            YGNodeInsertChild(cloned.yogaNode, child.yogaNode, index)
        }
        return cloned
    }
}
