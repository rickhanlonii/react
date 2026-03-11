import UIKit
import ReactDomNativeKit

class HydrationViewController: UIViewController {
    private let fixtureName: String
    private var root: Root?

    init(fixtureName: String) {
        self.fixtureName = fixtureName
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
        root = hydrateRoot(view, url: ssrURL)
    }

    deinit {
        root?.unmount()
    }
}
