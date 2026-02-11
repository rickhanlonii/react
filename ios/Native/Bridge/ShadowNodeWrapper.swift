import Foundation
import JavaScriptCore

// ---------------------------------------------------------------------------
// ShadowNodeFamily
//
// Provides stable identity across immutable shadow node clones. When a node
// is cloned via $$cloneNodeWithNewProps, the clone gets a NEW ShadowNode
// but keeps the SAME ShadowNodeFamily. This lets the ViewRegistry maintain
// a stable mapping from identity → UIView even though the node handle
// changes on every reconciler commit.
// ---------------------------------------------------------------------------

class ShadowNodeFamily {
    /// HTML element type (e.g. "div", "span", "p")
    let elementType: String

    /// Surface this node belongs to
    let surfaceId: Int

    /// React fiber reference used for event dispatch.
    /// Stored as JSManagedValue to prevent GC from collecting the JS object
    /// while we still need it, without creating a strong reference cycle.
    let instanceHandle: JSManagedValue?

    init(elementType: String, surfaceId: Int, instanceHandle: JSValue?) {
        self.elementType = elementType
        self.surfaceId = surfaceId
        if let handle = instanceHandle {
            self.instanceHandle = JSManagedValue(value: handle)
        } else {
            self.instanceHandle = nil
        }
    }
}

// ---------------------------------------------------------------------------
// ShadowNodeWrapper
//
// Wraps an immutable shadow node for passage between JS and Swift via JSC.
// When registered as a JSValue on the JSContext, JSC retains the wrapper
// and prevents it from being deallocated as long as JS holds a reference.
// When the JS GC collects the value, the wrapper is released.
//
// This is the opaque ShadowNodeHandle type referenced in the bridge protocol.
// ---------------------------------------------------------------------------

@objc class ShadowNodeWrapper: NSObject {
    /// The immutable props dictionary for this node revision.
    let props: [String: Any]

    /// Ordered children of this node (other ShadowNodeWrappers).
    var children: [ShadowNodeWrapper]

    /// Stable identity shared across clones.
    let family: ShadowNodeFamily

    /// Text content (non-nil only for text nodes created via $$createTextNode).
    let text: String?

    // TODO: In a full implementation this would hold a pointer to the C++
    // ShadowNode which embeds the YGNode for Yoga layout. For the initial
    // Swift-only skeleton we store layout results directly.

    /// Computed layout frame (set during $$completeRoot after Yoga calculation).
    var layoutFrame: CGRect = .zero

    // MARK: - Initializers

    init(
        props: [String: Any],
        children: [ShadowNodeWrapper] = [],
        family: ShadowNodeFamily,
        text: String? = nil
    ) {
        self.props = props
        self.children = children
        self.family = family
        self.text = text
        super.init()
    }

    // MARK: - Cloning helpers

    /// Clone with new props, keeping existing children.
    func cloneWithNewProps(_ newProps: [String: Any]) -> ShadowNodeWrapper {
        return ShadowNodeWrapper(
            props: newProps,
            children: self.children,
            family: self.family,
            text: self.text
        )
    }

    /// Clone with new children, keeping existing props.
    func cloneWithNewChildren(_ newChildren: [ShadowNodeWrapper]) -> ShadowNodeWrapper {
        return ShadowNodeWrapper(
            props: self.props,
            children: newChildren,
            family: self.family,
            text: self.text
        )
    }

    /// Clone with both new children and new props.
    func cloneWithNewChildrenAndProps(
        _ newChildren: [ShadowNodeWrapper],
        _ newProps: [String: Any]
    ) -> ShadowNodeWrapper {
        return ShadowNodeWrapper(
            props: newProps,
            children: newChildren,
            family: self.family,
            text: self.text
        )
    }

    /// Clone preserving everything (shallow copy with same family).
    func clone() -> ShadowNodeWrapper {
        return ShadowNodeWrapper(
            props: self.props,
            children: self.children,
            family: self.family,
            text: self.text
        )
    }
}
