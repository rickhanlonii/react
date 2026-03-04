import Foundation

// ---------------------------------------------------------------------------
// ShadowNodeFamily
//
// Provides stable identity across immutable shadow node clones. When a node
// is cloned via $$cloneNodeWithNewProps, the clone gets a NEW ShadowNode
// but keeps the SAME ShadowNodeFamily. This lets the ViewRegistry maintain
// a stable mapping from identity -> view even though the node handle
// changes on every reconciler commit.
// ---------------------------------------------------------------------------

public class ShadowNodeFamily {
    /// HTML element type (e.g. "div", "span", "p")
    public let elementType: String

    /// Surface this node belongs to
    public let surfaceId: Int

    /// React fiber reference used for event dispatch.
    /// Stored as an opaque ref. The engine's protect/unprotect mechanism
    /// prevents GC while we need it. ARC keeps the ref alive as long as
    /// this family is alive.
    public var instanceHandle: AnyObject?

    /// Whether the element has a click event handler (onClick prop).
    /// Updated during CREATE/UPDATE mutations from the canary value in props.
    public var hasClickHandler: Bool = false

    /// The string `action` URL for <form> elements. Set during CREATE/UPDATE.
    public var formActionURL: String? = nil
    /// The `name` attribute for <input> elements. Set during CREATE/UPDATE.
    public var inputName: String? = nil

    public init(elementType: String, surfaceId: Int, instanceHandle: AnyObject?) {
        self.elementType = elementType
        self.surfaceId = surfaceId
        self.instanceHandle = instanceHandle
    }
}
