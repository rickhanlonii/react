import SwiftUI
import UIKit
import ReactDomNativeKit

@main
struct FalconApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> FalconRootViewController {
        return FalconRootViewController()
    }

    func updateUIViewController(_ uiViewController: FalconRootViewController, context: Context) {}
}

/// Root view controller for the Falcon app.
/// Uses createRoot/render API directly, mirroring react-dom/client.
class FalconRootViewController: UIViewController {
    private var root: Root?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        // Create root (like react-dom's createRoot)
        root = createRoot(view)

        // Render with bundle URL (like react-dom's root.render(<App />))
        root?.render(bundle: bundleURL()) { [weak self] error in
            if let error = error {
                print("[Falcon] Render failed: \(error)")
                self?.showError(error)
            }
        }
    }

    private func bundleURL() -> URL {
        // The JS bundle contains the renderer + flight client.
        // It fetches the RSC stream from the server internally.
        guard let url = Bundle.main.url(forResource: "bundle", withExtension: "js") else {
            fatalError("[Falcon] bundle.js not found in app bundle")
        }
        return url
    }

    private func showError(_ error: Error) {
        let alert = UIAlertController(
            title: "Failed to Load",
            message: error.localizedDescription,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    deinit {
        root?.unmount()
    }
}
