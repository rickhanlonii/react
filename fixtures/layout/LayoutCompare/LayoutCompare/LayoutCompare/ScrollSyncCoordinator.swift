import UIKit

/// Keeps two UIScrollViews in sync — when one scrolls, the other follows.
class ScrollSyncCoordinator: NSObject {
    private weak var scrollViewA: UIScrollView?
    private weak var scrollViewB: UIScrollView?
    private var observationA: NSKeyValueObservation?
    private var observationB: NSKeyValueObservation?
    private var isSyncing = false

    func configure(webScrollView: UIScrollView, nativeScrollView: UIScrollView) {
        self.scrollViewA = webScrollView
        self.scrollViewB = nativeScrollView

        observationA = webScrollView.observe(\.contentOffset, options: .new) { [weak self] scrollView, _ in
            guard let self = self, !self.isSyncing else { return }
            self.isSyncing = true
            self.scrollViewB?.contentOffset = scrollView.contentOffset
            self.isSyncing = false
        }

        observationB = nativeScrollView.observe(\.contentOffset, options: .new) { [weak self] scrollView, _ in
            guard let self = self, !self.isSyncing else { return }
            self.isSyncing = true
            self.scrollViewA?.contentOffset = scrollView.contentOffset
            self.isSyncing = false
        }
    }
}
