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
    /// The immutable props dictionary for this node revision.
    public let props: [String: Any]

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
