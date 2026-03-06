import UIKit
import ShadowTree

// ---------------------------------------------------------------------------
// ViewRegistry
//
// Maps ShadowNodeFamily (stable identity) to UIView and back. This two-way
// mapping is essential because:
//
//   Forward (family -> view): The Differentiator needs to find the UIView for
//   a given shadow node identity to apply mutations (insert, remove, update).
//
//   Reverse (view -> family): The event system needs to find the
//   ShadowNodeFamily for a touched UIView so it can look up the
//   InstanceHandle and dispatch events back to JS.
//
// The registry is keyed by ShadowNodeFamily (not ShadowNode) because in
// persistent mode the ShadowNode pointer changes on every clone, but the
// family pointer remains stable across revisions.
// ---------------------------------------------------------------------------

public class ViewRegistry {

    // MARK: - Storage

    /// Forward map: family identity -> UIView (for applying mutations)
    private var familyToView: [ObjectIdentifier: UIView] = [:]

    /// Reverse map: view identity -> ShadowNodeFamily (for event hit testing)
    private var viewToFamily: [ObjectIdentifier: ShadowNodeFamily] = [:]

    // MARK: - Initialization

    public init() {}

    // MARK: - Registration

    /// Associates a UIView with a ShadowNodeFamily. Overwrites any existing
    /// mapping for the same family or view.
    public func register(view: UIView, family: ShadowNodeFamily) {
        let familyId = ObjectIdentifier(family)
        let viewId = ObjectIdentifier(view)

        familyToView[familyId] = view
        viewToFamily[viewId] = family
        family.view = view
    }

    /// Removes the mapping for the given family. Called when a node is deleted
    /// and its view is returned to the pool (or deallocated).
    public func unregister(family: ShadowNodeFamily) {
        let familyId = ObjectIdentifier(family)
        if let view = familyToView.removeValue(forKey: familyId) {
            let viewId = ObjectIdentifier(view)
            viewToFamily.removeValue(forKey: viewId)
        }
        family.view = nil
    }

    /// Removes the mapping for the given view.
    public func unregister(view: UIView) {
        let viewId = ObjectIdentifier(view)
        if let family = viewToFamily.removeValue(forKey: viewId) {
            let familyId = ObjectIdentifier(family)
            familyToView.removeValue(forKey: familyId)
        }
    }

    // MARK: - Lookup

    /// Returns the UIView associated with the given family, or nil if not found.
    public func view(for family: ShadowNodeFamily) -> UIView? {
        let familyId = ObjectIdentifier(family)
        return familyToView[familyId]
    }

    /// Returns the ShadowNodeFamily associated with the given view, or nil.
    public func family(for view: UIView) -> ShadowNodeFamily? {
        let viewId = ObjectIdentifier(view)
        return viewToFamily[viewId]
    }

    // MARK: - Utilities

    /// Number of registered view-family pairs.
    public var count: Int {
        return familyToView.count
    }

    /// Copies all mappings from another registry into this one.
    /// Used during hydration to transfer SSR view mappings to the runtime registry.
    public func merge(from other: ViewRegistry) {
        for (familyId, view) in other.familyToView {
            familyToView[familyId] = view
            viewToFamily[ObjectIdentifier(view)] = other.viewToFamily[ObjectIdentifier(view)]
        }
    }

    /// Removes all mappings. Called on surface teardown.
    public func clear() {
        familyToView.removeAll()
        viewToFamily.removeAll()
    }
}
