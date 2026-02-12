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

        #if DEBUG
        startDevReloadPolling()
        #endif
    }

    #if DEBUG
    private var reloadTimer: Timer?
    private var lastBundleVersion: Double = 0

    override var keyCommands: [UIKeyCommand]? {
        return [
            UIKeyCommand(input: "r", modifierFlags: .command, action: #selector(reloadBundle))
        ]
    }

    @objc private func reloadBundle() {
        print("[Falcon] Manual reload (Cmd+R)...")
        root?.reload(bundle: bundleURL()) { error in
            if let error = error {
                print("[Falcon] Reload failed: \(error)")
            } else {
                print("[Falcon] Reload complete")
            }
        }
    }

    private func startDevReloadPolling() {
        let versionURL = URL(string: "http://localhost:3001/bundle-version")!
        // Fetch initial version
        fetchBundleVersion(from: versionURL) { [weak self] version in
            self?.lastBundleVersion = version
        }
        // Poll every 2 seconds
        reloadTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.checkForBundleUpdate(versionURL: versionURL)
        }
    }

    private func checkForBundleUpdate(versionURL: URL) {
        fetchBundleVersion(from: versionURL) { [weak self] version in
            guard let self = self, version > 0, version != self.lastBundleVersion else { return }
            self.lastBundleVersion = version
            print("[Falcon] Bundle updated, reloading...")
            self.root?.reload(bundle: self.bundleURL()) { error in
                if let error = error {
                    print("[Falcon] Reload failed: \(error)")
                } else {
                    print("[Falcon] Reload complete")
                }
            }
        }
    }

    private func fetchBundleVersion(from url: URL, completion: @escaping (Double) -> Void) {
        URLSession.shared.dataTask(with: url) { data, _, _ in
            DispatchQueue.main.async {
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let version = json["version"] as? Double else {
                    completion(0)
                    return
                }
                completion(version)
            }
        }.resume()
    }
    #endif

    private func bundleURL() -> URL {
        #if DEBUG
        let url = URL(string: "http://localhost:3001/bundle.js")!
        print("[Falcon] DEBUG build — loading bundle from \(url)")
        return url
        #else
        guard let url = Bundle.main.url(forResource: "bundle", withExtension: "js") else {
            fatalError("[Falcon] bundle.js not found in app bundle")
        }
        print("[Falcon] RELEASE build — loading bundle from \(url)")
        return url
        #endif
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
