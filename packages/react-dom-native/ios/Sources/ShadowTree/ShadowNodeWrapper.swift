import Foundation
import CoreGraphics
import Yoga

// ---------------------------------------------------------------------------
// ShadowNodeWrapper
//
// Shadow node passed between JS and Swift as an opaque JS handle via
// wrapNativeObject/unwrapNativeObject. The ShadowTree module has zero
// framework dependencies beyond Foundation, CoreGraphics, and Yoga.
//
// Each ShadowNodeWrapper owns a YGNodeRef for Yoga layout. The yogaNode
// is created in init and freed in deinit. Clone methods create fresh
// yogaNodes with style copied from the source.
//
// Inherits from NSObject so JSValue(object:in:) can wrap it as an opaque
// JS handle. JSC requires Objective-C-compatible objects for this API.
// ---------------------------------------------------------------------------

public class ShadowNodeWrapper: NSObject {
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

    /// Cached layout margins (top, right, bottom, left), saved before Yoga
    /// node reparenting clears them. Yoga's YGNodeRemoveAllChildren resets
    /// layout data (setLayout({})), so margins computed during scroll content
    /// re-layout would be lost. Set by computeScrollContentSizes; read by
    /// LayoutExtractor.
    public var layoutMargins: (top: CGFloat, right: CGFloat, bottom: CGFloat, left: CGFloat)? = nil

    /// Original child family ordering from the node this was cloned from.
    /// Used by $$appendChild to interleave reconciler children with
    /// preserved #suspense children at correct positions. Nil for non-clones.
    public var oldChildFamilies: [ShadowNodeFamily]? = nil

    /// Yoga child node pointers from the clone source, used by $$appendChild
    /// to detect unchanged children and skip yoga operations. Set by
    /// cloneWithNewChildren when preserving the cloned yoga children.
    /// Nil for non-clones or clones where children are fully rebuilt.
    public var previousYogaChildren: [YGNodeRef]? = nil

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

    /// Internal init for cloning — uses a pre-created yoga node (from YGNodeClone)
    /// instead of creating a new one. This preserves the source node's layout
    /// cache and dirty flag, enabling Yoga's incremental layout.
    private init(
        props: [String: Any],
        children: [ShadowNodeWrapper],
        family: ShadowNodeFamily,
        text: String?,
        yogaNode: YGNodeRef
    ) {
        self.props = props
        self.children = children
        self.family = family
        self.text = text
        self.yogaNode = yogaNode
    }

    deinit {
        // Clean up text measure context if set
        YogaTextMeasure.cleanupMeasureContext(for: yogaNode)
        // Remove from parent before freeing to avoid dangling pointers
        if let owner = YGNodeGetOwner(yogaNode) {
            YGNodeRemoveChild(owner, yogaNode)
        }
        // Remove yoga children before freeing to prevent dangling owner
        // pointers when children are deallocated after this node.
        if YGNodeGetChildCount(yogaNode) > 0 {
            YGNodeRemoveAllChildren(yogaNode)
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
        // Text container line-height: CSS block text containers have a
        // minimum height from line-height: normal (~1.2 × fontSize).
        // Yoga flex layout has no line-height, so we set minHeight.
        let fontSize: CGFloat
        if let fs = mergedStyle["fontSize"] as? Double {
            fontSize = CGFloat(fs)
        } else if let fs = mergedStyle["fontSize"] as? Int {
            fontSize = CGFloat(fs)
        } else if let fs = mergedStyle["fontSize"] as? NSNumber {
            fontSize = CGFloat(fs.doubleValue)
        } else {
            fontSize = 16
        }
        if let lineMinH = ElementDefaults.yogaTextContainerMinHeight(for: type, fontSize: fontSize) {
            YGNodeStyleSetMinHeight(node.yogaNode, Float(lineMinH))
        }
        // Legend needs inline-block display for shrink-to-fit width inside
        // fieldset's block layout, but we don't put "display" in the style
        // dict to avoid comparison diffs (web reports display: block).
        if type == "legend" || ElementDefaults.needsInlineBlockDisplay(for: type) {
            YGNodeStyleSetDisplay(node.yogaNode, .inlineBlock)
        }
        // Pre/legend have flexWrap: "nowrap" in their style dict (matching
        // CSS getComputedStyle) but need Yoga flexWrap: wrap to prevent
        // calculateBlockLayout from stacking text children vertically.
        if ElementDefaults.needsYogaFlexWrapOverride(for: type) {
            YGNodeStyleSetFlexWrap(node.yogaNode, .wrap)
        }
        // CSS table layout: border-spacing: 2px (default) creates space
        // between cells and between rows. We emulate this with Yoga gap
        // and padding on table sections. The style dict keeps display:block
        // (matching web after normalization), but we override Yoga to flex
        // layout so gap works (block layout ignores gap).
        switch type {
        case "table":
            // Override to flex column so gap works between sections
            YGNodeStyleSetDisplay(node.yogaNode, .flex)
            YGNodeStyleSetFlexDirection(node.yogaNode, .column)
        case "thead":
            // Override to flex column so rowGap works between rows
            YGNodeStyleSetDisplay(node.yogaNode, .flex)
            YGNodeStyleSetFlexDirection(node.yogaNode, .column)
            // Edge spacing: border-spacing on top and bottom of first section
            YGNodeStyleSetPadding(node.yogaNode, .top, 2)
            YGNodeStyleSetPadding(node.yogaNode, .bottom, 2)
            YGNodeStyleSetGap(node.yogaNode, .row, 2)
        case "tbody", "tfoot":
            // Override to flex column so rowGap works between rows
            YGNodeStyleSetDisplay(node.yogaNode, .flex)
            YGNodeStyleSetFlexDirection(node.yogaNode, .column)
            // Bottom edge spacing only (top row abuts the previous section)
            YGNodeStyleSetPadding(node.yogaNode, .bottom, 2)
            YGNodeStyleSetGap(node.yogaNode, .row, 2)
        case "tr":
            // Horizontal cell spacing: border-spacing 2px between columns
            // and at left/right edges of the row.
            YGNodeStyleSetPadding(node.yogaNode, .left, 2)
            YGNodeStyleSetPadding(node.yogaNode, .right, 2)
            YGNodeStyleSetGap(node.yogaNode, .column, 2)
        default:
            break
        }

        return node
    }

    // MARK: - Cloning helpers

    /// Clone with new props, keeping existing children.
    ///
    /// Uses YGNodeClone to preserve the yoga node's layout cache and dirty
    /// flag. Children's ownership is transferred via YGNodeSwapChild which
    /// does NOT dirty the parent — so if the new style is identical, the
    /// clone stays clean and Yoga can skip its entire subtree.
    public func cloneWithNewProps(_ newProps: [String: Any]) -> ShadowNodeWrapper {
        let clonedYoga = YGNodeClone(self.yogaNode)!
        let cloned = ShadowNodeWrapper(
            props: newProps,
            children: self.children,
            family: self.family,
            text: self.text,
            yogaNode: clonedYoga
        )
        cloned.layoutFrame = self.layoutFrame
        // Transfer children's ownership to the clone without dirtying.
        // YGNodeClone copied the children vector, so the clone already
        // has references to the same child yoga nodes. YGNodeSwapChild
        // just updates each child's owner pointer.
        for (index, child) in cloned.children.enumerated() {
            YGNodeSwapChild(clonedYoga, child.yogaNode, index)
        }
        return cloned
    }

    /// Clone with new children, keeping existing props.
    /// Uses YGNodeClone to preserve the source node's layout cache.
    /// Old yoga children are kept in the cloned yoga node for $$appendChild
    /// to compare against — unchanged children skip yoga operations entirely.
    public func cloneWithNewChildren(_ newChildren: [ShadowNodeWrapper]) -> ShadowNodeWrapper {
        let clonedYoga = YGNodeClone(self.yogaNode)!
        // Capture old yoga children BEFORE any modifications.
        // These are the same pointers as in the original node's yoga tree.
        let oldYogaChildCount = YGNodeGetChildCount(clonedYoga)
        var oldYogaChildren: [YGNodeRef] = []
        oldYogaChildren.reserveCapacity(Int(oldYogaChildCount))
        for i in 0..<oldYogaChildCount {
            if let child = YGNodeGetChild(clonedYoga, i) {
                oldYogaChildren.append(child)
            }
        }

        let cloned = ShadowNodeWrapper(
            props: self.props,
            children: newChildren,
            family: self.family,
            text: self.text,
            yogaNode: clonedYoga
        )
        cloned.layoutFrame = self.layoutFrame

        // Store old yoga children for $$appendChild comparison.
        // If there are no old children (first render), skip — nothing to compare.
        if !oldYogaChildren.isEmpty {
            cloned.previousYogaChildren = oldYogaChildren
        }

        // Insert preserved children (e.g. #suspense) into the yoga tree.
        // These replace old children at their positions.
        for (index, child) in newChildren.enumerated() {
            if index < oldYogaChildren.count {
                // Position occupied by old child — swap it
                if let owner = YGNodeGetOwner(child.yogaNode), owner != clonedYoga {
                    YGNodeRemoveChild(owner, child.yogaNode)
                }
                YGNodeSwapChild(clonedYoga, child.yogaNode, index)
            } else {
                // Beyond old children — append
                if let owner = YGNodeGetOwner(child.yogaNode) {
                    YGNodeRemoveChild(owner, child.yogaNode)
                }
                YGNodeInsertChild(clonedYoga, child.yogaNode, index)
            }
        }

        return cloned
    }

    /// Clone with both new children and new props.
    /// Uses YGNodeClone to preserve layout cache (see cloneWithNewChildren).
    public func cloneWithNewChildrenAndProps(
        _ newChildren: [ShadowNodeWrapper],
        _ newProps: [String: Any]
    ) -> ShadowNodeWrapper {
        let clonedYoga = YGNodeClone(self.yogaNode)!
        // Capture old yoga children BEFORE any modifications.
        let oldYogaChildCount = YGNodeGetChildCount(clonedYoga)
        var oldYogaChildren: [YGNodeRef] = []
        oldYogaChildren.reserveCapacity(Int(oldYogaChildCount))
        for i in 0..<oldYogaChildCount {
            if let child = YGNodeGetChild(clonedYoga, i) {
                oldYogaChildren.append(child)
            }
        }

        let cloned = ShadowNodeWrapper(
            props: newProps,
            children: newChildren,
            family: self.family,
            text: self.text,
            yogaNode: clonedYoga
        )
        cloned.layoutFrame = self.layoutFrame

        // Store old yoga children for $$appendChild comparison.
        if !oldYogaChildren.isEmpty {
            cloned.previousYogaChildren = oldYogaChildren
        }

        // Insert preserved children (e.g. #suspense) into the yoga tree.
        for (index, child) in newChildren.enumerated() {
            if index < oldYogaChildren.count {
                if let owner = YGNodeGetOwner(child.yogaNode), owner != clonedYoga {
                    YGNodeRemoveChild(owner, child.yogaNode)
                }
                YGNodeSwapChild(clonedYoga, child.yogaNode, index)
            } else {
                if let owner = YGNodeGetOwner(child.yogaNode) {
                    YGNodeRemoveChild(owner, child.yogaNode)
                }
                YGNodeInsertChild(clonedYoga, child.yogaNode, index)
            }
        }

        return cloned
    }

    /// Clone preserving everything (shallow copy with same family).
    ///
    /// Uses YGNodeClone to preserve layout cache. The clone stays clean
    /// (same props, same children) so Yoga can skip it entirely.
    public func clone() -> ShadowNodeWrapper {
        let clonedYoga = YGNodeClone(self.yogaNode)!
        let cloned = ShadowNodeWrapper(
            props: self.props,
            children: self.children,
            family: self.family,
            text: self.text,
            yogaNode: clonedYoga
        )
        cloned.layoutFrame = self.layoutFrame
        // Transfer children's ownership to the clone without dirtying.
        for (index, child) in cloned.children.enumerated() {
            YGNodeSwapChild(clonedYoga, child.yogaNode, index)
        }
        return cloned
    }
}
