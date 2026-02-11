import UIKit
import ShadowTree

// ---------------------------------------------------------------------------
// ViewRegistry
//
// Maps ShadowNodeFamily (stable identity) to UIView and back. This two-way
// mapping is essential because:
//
//   Forward (family → view): The Differentiator needs to find the UIView for
//   a given shadow node identity to apply mutations (insert, remove, update).
//
//   Reverse (view → family): The event system needs to find the
//   ShadowNodeFamily for a touched UIView so it can look up the
//   InstanceHandle and dispatch events back to JS.
//
// The registry is keyed by ShadowNodeFamily (not ShadowNode) because in
// persistent mode the ShadowNode pointer changes on every clone, but the
// family pointer remains stable across revisions.
// ---------------------------------------------------------------------------

class ViewRegistry {

    // MARK: - Storage

    /// Forward map: family identity → UIView (for applying mutations)
    private var familyToView: [ObjectIdentifier: UIView] = [:]

    /// Reverse map: view identity → ShadowNodeFamily (for event hit testing)
    private var viewToFamily: [ObjectIdentifier: ShadowNodeFamily] = [:]

    // MARK: - Registration

    /// Associates a UIView with a ShadowNodeFamily. Overwrites any existing
    /// mapping for the same family or view.
    func register(view: UIView, family: ShadowNodeFamily) {
        let familyId = ObjectIdentifier(family)
        let viewId = ObjectIdentifier(view)

        familyToView[familyId] = view
        viewToFamily[viewId] = family
    }

    /// Removes the mapping for the given family. Called when a node is deleted
    /// and its view is returned to the pool (or deallocated).
    func unregister(family: ShadowNodeFamily) {
        let familyId = ObjectIdentifier(family)
        if let view = familyToView.removeValue(forKey: familyId) {
            let viewId = ObjectIdentifier(view)
            viewToFamily.removeValue(forKey: viewId)
        }
    }

    /// Removes the mapping for the given view.
    func unregister(view: UIView) {
        let viewId = ObjectIdentifier(view)
        if let family = viewToFamily.removeValue(forKey: viewId) {
            let familyId = ObjectIdentifier(family)
            familyToView.removeValue(forKey: familyId)
        }
    }

    // MARK: - Lookup

    /// Returns the UIView associated with the given family, or nil if not found.
    func view(for family: ShadowNodeFamily) -> UIView? {
        let familyId = ObjectIdentifier(family)
        return familyToView[familyId]
    }

    /// Returns the ShadowNodeFamily associated with the given view, or nil.
    func family(for view: UIView) -> ShadowNodeFamily? {
        let viewId = ObjectIdentifier(view)
        return viewToFamily[viewId]
    }

    // MARK: - Utilities

    /// Number of registered view-family pairs.
    var count: Int {
        return familyToView.count
    }

    /// Removes all mappings. Called on surface teardown.
    func clear() {
        familyToView.removeAll()
        viewToFamily.removeAll()
    }
}
