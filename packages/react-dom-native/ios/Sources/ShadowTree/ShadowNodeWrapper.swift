import Foundation
import JavaScriptCore

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

@objc public class ShadowNodeWrapper: NSObject {
    /// The immutable props dictionary for this node revision.
    public let props: [String: Any]

    /// Ordered children of this node (other ShadowNodeWrappers).
    public var children: [ShadowNodeWrapper]

    /// Stable identity shared across clones.
    public let family: ShadowNodeFamily

    /// Text content (non-nil only for text nodes created via $$createTextNode).
    public let text: String?

    // TODO: In a full implementation this would hold a pointer to the C++
    // ShadowNode which embeds the YGNode for Yoga layout. For the initial
    // Swift-only skeleton we store layout results directly.

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
        super.init()
    }

    // MARK: - Cloning helpers

    /// Clone with new props, keeping existing children.
    public func cloneWithNewProps(_ newProps: [String: Any]) -> ShadowNodeWrapper {
        return ShadowNodeWrapper(
            props: newProps,
            children: self.children,
            family: self.family,
            text: self.text
        )
    }

    /// Clone with new children, keeping existing props.
    public func cloneWithNewChildren(_ newChildren: [ShadowNodeWrapper]) -> ShadowNodeWrapper {
        return ShadowNodeWrapper(
            props: self.props,
            children: newChildren,
            family: self.family,
            text: self.text
        )
    }

    /// Clone with both new children and new props.
    public func cloneWithNewChildrenAndProps(
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
    public func clone() -> ShadowNodeWrapper {
        return ShadowNodeWrapper(
            props: self.props,
            children: self.children,
            family: self.family,
            text: self.text
        )
    }
}
