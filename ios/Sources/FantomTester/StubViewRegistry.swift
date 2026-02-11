import Foundation
import ShadowTree

// ---------------------------------------------------------------------------
// StubViewRegistry
//
// Maps ShadowNodeFamily (stable identity) to StubView. This is the test
// harness equivalent of ViewRegistry, but maps to StubView instead of UIView.
// ---------------------------------------------------------------------------

class StubViewRegistry {

    // MARK: - Storage

    /// Forward map: family identity -> StubView
    private var familyToView: [ObjectIdentifier: StubView] = [:]

    // MARK: - Registration

    /// Associates a StubView with a ShadowNodeFamily.
    func register(view: StubView, family: ShadowNodeFamily) {
        let familyId = ObjectIdentifier(family)
        familyToView[familyId] = view
    }

    /// Removes the mapping for the given family.
    func unregister(family: ShadowNodeFamily) {
        let familyId = ObjectIdentifier(family)
        familyToView.removeValue(forKey: familyId)
    }

    // MARK: - Lookup

    /// Returns the StubView associated with the given family, or nil.
    func view(for family: ShadowNodeFamily) -> StubView? {
        let familyId = ObjectIdentifier(family)
        return familyToView[familyId]
    }

    // MARK: - Utilities

    /// Number of registered view-family pairs.
    var count: Int {
        return familyToView.count
    }

    /// Removes all mappings.
    func clear() {
        familyToView.removeAll()
    }
}
