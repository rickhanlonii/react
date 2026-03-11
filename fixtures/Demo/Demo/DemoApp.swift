import SwiftUI
import UIKit
import ReactDomNativeKit

// MARK: - Rendering Mode

enum RenderingMode: String, CaseIterable {
    case server = "server"
    case hydrated = "hydrated"
    case ppr = "ppr"

    var label: String {
        switch self {
        case .server: return "Server Only"
        case .hydrated: return "Hydrated"
        case .ppr: return "Partial Prerender"
        }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, UIApplicationDelegate {
    var jsRuntime: JSRuntime?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        return true
    }
}

// MARK: - App Entry Point

@main
struct DemoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @AppStorage("renderingMode") private var renderingMode: String = RenderingMode.hydrated.rawValue
    @State private var showDebugMenu = false

    private let fixtureName = "37-demo-todo"

    var body: some Scene {
        WindowGroup {
            DemoRootView(fixtureName: fixtureName, renderingMode: renderingMode)
                .id(renderingMode)
                .ignoresSafeArea()
                .sheet(isPresented: $showDebugMenu) {
                    DebugMenuView(renderingMode: $renderingMode, showDebugMenu: $showDebugMenu)
                        .presentationDetents([.medium])
                }
                .overlay(alignment: .topTrailing) {
                    Color.clear
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                        .onTapGesture(count: 3) {
                            showDebugMenu.toggle()
                        }
                }
                .background {
                    Button("") { showDebugMenu.toggle() }
                        .keyboardShortcut("f", modifiers: [.command, .shift])
                        .hidden()
                }
        }
    }
}

// MARK: - Debug Menu

struct DebugMenuView: View {
    @Binding var renderingMode: String
    @Binding var showDebugMenu: Bool

    var body: some View {
        NavigationStack {
            List {
                Section("Rendering Mode") {
                    ForEach(RenderingMode.allCases, id: \.rawValue) { mode in
                        Button {
                            renderingMode = mode.rawValue
                            showDebugMenu = false
                        } label: {
                            HStack {
                                Text(mode.label)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if renderingMode == mode.rawValue {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.blue)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Debug")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        showDebugMenu = false
                    }
                }
            }
        }
    }
}

// MARK: - UIViewControllerRepresentable Bridge

struct DemoRootView: UIViewControllerRepresentable {
    let fixtureName: String
    let renderingMode: String

    func makeUIViewController(context: Context) -> UIViewController {
        switch renderingMode {
        case RenderingMode.server.rawValue:
            return ServerOnlyViewController(fixtureName: fixtureName)
        case RenderingMode.ppr.rawValue:
            return PrerenderViewController(fixtureName: fixtureName)
        default:
            return HydrationViewController(fixtureName: fixtureName)
        }
    }

    func updateUIViewController(_ vc: UIViewController, context: Context) {}
}
