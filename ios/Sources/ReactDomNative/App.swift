import SwiftUI

@main
struct ReactDomNativeApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> RootViewController {
        return RootViewController()
    }

    func updateUIViewController(_ uiViewController: RootViewController, context: Context) {}
}
