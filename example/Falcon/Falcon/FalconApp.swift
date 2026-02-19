import SwiftUI
import UIKit
import ReactDomNativeKit

struct Fixture: Identifiable, Codable {
    var id: String { name }
    let name: String
    let title: String
    let description: String
}

@MainActor
class FixtureStore: ObservableObject {
    @Published var fixtures: [Fixture] = []
    @Published var isLoading = false

    private static let cacheKey = "cachedFixtures"
    private static let lastFixtureKey = "lastViewedFixture"

    var lastViewedFixture: String? {
        get { UserDefaults.standard.string(forKey: Self.lastFixtureKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.lastFixtureKey) }
    }

    init() {
        loadCached()
    }

    private func loadCached() {
        guard let data = UserDefaults.standard.data(forKey: Self.cacheKey),
              let cached = try? JSONDecoder().decode([Fixture].self, from: data) else { return }
        fixtures = cached
    }

    private func saveCache() {
        guard let data = try? JSONEncoder().encode(fixtures) else { return }
        UserDefaults.standard.set(data, forKey: Self.cacheKey)
    }

    func fetchFixtures() {
        isLoading = true
        let url = URL(string: "http://localhost:6000/fixtures")!
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isLoading = false
                guard let data = data, error == nil else { return }
                guard let decoded = try? JSONDecoder().decode([Fixture].self, from: data) else { return }
                self.fixtures = decoded
                self.saveCache()
            }
        }.resume()
    }
}

@main
struct FalconApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var store = FixtureStore()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                FixtureListView()
                    .environmentObject(store)
            }
        }
    }
}

struct FixtureListView: View {
    @EnvironmentObject var store: FixtureStore
    @State private var navigateToFixture: String?

    var body: some View {
        List(store.fixtures) { fixture in
            NavigationLink(value: fixture.name) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(fixture.title)
                        .font(.headline)
                    Text(fixture.description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Fixtures")
        .navigationDestination(for: String.self) { name in
            FixtureDetailView(fixtureName: name)
                .environmentObject(store)
        }
        .onAppear {
            store.fetchFixtures()
            if let last = store.lastViewedFixture {
                navigateToFixture = last
            }
        }
        .navigationDestination(isPresented: Binding(
            get: { navigateToFixture != nil },
            set: { if !$0 { navigateToFixture = nil; store.lastViewedFixture = nil } }
        )) {
            if let name = navigateToFixture {
                FixtureDetailView(fixtureName: name)
                    .environmentObject(store)
            }
        }
    }
}

struct FixtureDetailView: View {
    let fixtureName: String
    @EnvironmentObject var store: FixtureStore

    var body: some View {
        FixtureRootView(fixtureName: fixtureName)
            .ignoresSafeArea()
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                store.lastViewedFixture = fixtureName
            }
    }
}

struct FixtureRootView: UIViewControllerRepresentable {
    let fixtureName: String

    func makeUIViewController(context: Context) -> FixtureViewController {
        return FixtureViewController(fixtureName: fixtureName)
    }

    func updateUIViewController(_ vc: FixtureViewController, context: Context) {}
}

class FixtureViewController: UIViewController {
    private let fixtureName: String
    private var root: Root?

    init(fixtureName: String) {
        self.fixtureName = fixtureName
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0xF2/255.0, green: 0xF2/255.0, blue: 0xF7/255.0, alpha: 1.0)

        #if DEBUG
        Root.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
        #endif

        root = createRoot(view)
        renderAndHydrate()

        #if DEBUG
        startDevReloadPolling()
        #endif
    }

    private func renderAndHydrate() {
        let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
        let flightURL = "http://localhost:6000/fixtures/\(fixtureName)"

        root?.renderWithSSR(serverURL: ssrURL) { [weak self] error in
            if let error = error {
                print("[Falcon] Render failed for \(self?.fixtureName ?? ""): \(error)")
            } else {
                self?.root?.hydrateRoot(serverURL: flightURL) { error in
                    if let error = error {
                        print("[Falcon] Hydration failed: \(error)")
                    } else {
                        print("[Falcon] Hydration complete for \(self?.fixtureName ?? "")")
                    }
                }
            }
        }
    }

    #if DEBUG
    private var reloadTimer: Timer?
    private var lastBundleVersion: Double = 0

    private func startDevReloadPolling() {
        let versionURL = URL(string: "http://localhost:6000/bundle-version")!
        fetchBundleVersion(from: versionURL) { [weak self] version in
            self?.lastBundleVersion = version
        }
        reloadTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.checkForBundleUpdate(versionURL: versionURL)
        }
    }

    private func checkForBundleUpdate(versionURL: URL) {
        fetchBundleVersion(from: versionURL) { [weak self] version in
            guard let self = self, version > 0, version != self.lastBundleVersion else { return }
            self.lastBundleVersion = version
            print("[Falcon] Bundle updated, reloading fixture \(self.fixtureName)...")
            self.root?.unmount()
            self.root = createRoot(self.view)
            self.renderAndHydrate()
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

    deinit {
        #if DEBUG
        reloadTimer?.invalidate()
        #endif
        root?.unmount()
    }
}
