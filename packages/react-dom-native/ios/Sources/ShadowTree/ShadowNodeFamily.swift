import Foundation
#if canImport(UIKit)
import UIKit
#endif

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

    #if canImport(UIKit)
    /// Direct view reference — avoids ViewRegistry hash lookups during
    /// syncAllFrames and mutation application. Set/cleared by ViewRegistry.
    public weak var view: UIView? = nil

    /// Direct layer reference for CALayer-backed nodes (no UIView).
    /// Set/cleared by ViewRegistry.
    public weak var layer: CALayer? = nil
    #endif

    /// Whether the element has a click event handler (onClick prop).
    /// Updated during CREATE/UPDATE mutations from the canary value in props.
    public var hasClickHandler: Bool = false

    /// Whether this button is a submit button (type="submit" or no type on <button>).
    /// Updated during CREATE/UPDATE mutations.
    public var isSubmitButton: Bool = false

    /// The string `action` URL for <form> elements. Set during CREATE/UPDATE.
    public var formActionURL: String? = nil
    /// Serialized action data for MPA form submission (from Fizz $$FORM_ACTION).
    /// Contains the action reference ID and bound arguments.
    public var formActionData: [String: String]? = nil
    /// The `name` attribute for <input> elements. Set during CREATE/UPDATE.
    public var inputName: String? = nil
    /// The `value` attribute for <input> elements. Used by collectFormData for
    /// hidden inputs whose UITextField.text is not user-editable.
    public var inputValue: String? = nil

    public init(elementType: String, surfaceId: Int, instanceHandle: AnyObject?) {
        self.elementType = elementType
        self.surfaceId = surfaceId
        self.instanceHandle = instanceHandle
    }
}
