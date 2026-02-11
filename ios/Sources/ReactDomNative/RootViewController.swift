import UIKit

class RootViewController: UIViewController {
    private var jsRuntime: JSRuntime?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        jsRuntime = JSRuntime()
        jsRuntime?.start(rootView: view)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        jsRuntime?.updateViewportSize(
            width: view.bounds.width,
            height: view.bounds.height
        )
    }
}
