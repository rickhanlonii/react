import UIKit
import ReactDomNativeKit

class ServerOnlyViewController: UIViewController {
    private let fixtureName: String
    private var root: Root?

    init(fixtureName: String) {
        self.fixtureName = fixtureName
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.949, green: 0.949, blue: 0.969, alpha: 1) // #f2f2f7

        let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
        root = createRootFromFetch(view, url: ssrURL)
    }

    deinit {
        root?.unmount()
    }
}
