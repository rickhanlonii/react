import UIKit
import ShadowTree
import Yoga

// ---------------------------------------------------------------------------
// Root+Lifecycle
//
// Layout observer and viewport update methods.
// ---------------------------------------------------------------------------

extension Root {

    /// Updates the viewport size. Called automatically on layout changes.
    internal func updateViewportSize() {
        ReactRuntime.shared.updateViewportSize(
            width: container.bounds.width,
            height: container.bounds.height
        )
    }

    func setupLayoutObserver() {
        // Observe bounds changes to update viewport size
        layoutObserver = container.observe(\.bounds, options: [.new]) { [weak self] _, _ in
            self?.updateViewportSize()
        }

        // Initial size update
        updateViewportSize()
    }
}
