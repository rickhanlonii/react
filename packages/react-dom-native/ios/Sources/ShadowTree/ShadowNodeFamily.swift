import Foundation
import JavaScriptCore

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
    /// Stored as JSManagedValue to prevent GC from collecting the JS object
    /// while we still need it, without creating a strong reference cycle.
    public let instanceHandle: JSManagedValue?

    public init(elementType: String, surfaceId: Int, instanceHandle: JSValue?) {
        self.elementType = elementType
        self.surfaceId = surfaceId
        if let handle = instanceHandle {
            self.instanceHandle = JSManagedValue(value: handle)
        } else {
            self.instanceHandle = nil
        }
    }
}
