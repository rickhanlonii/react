import SwiftUI
import UIKit
import Combine
import ReactDomNativeKit

struct FixtureConfig: Codable {
    var hideNavBar: Bool?
    var backgroundColor: String?
    var ssrEndpoint: String?
}

struct Fixture: Identifiable, Codable {
    var id: String { name }
    let name: String
    let title: String
    let description: String
    let config: FixtureConfig?
}

struct FixtureCategory: Identifiable, Codable {
    var id: String { category }
    let category: String
    let fixtures: [Fixture]
}

enum NavDestination: Hashable {
    case category(String)
    case fixture(String)
}

@MainActor
class FixtureStore: ObservableObject {
    @Published var categories: [FixtureCategory] = []
    @Published var isLoading = false

    private static let cacheKey = "cachedFixtureCategories"
    private static let lastFixtureKey = "lastViewedFixture"

    var lastViewedFixture: String? {
        get { UserDefaults.standard.string(forKey: Self.lastFixtureKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.lastFixtureKey) }
    }

    func fixtures(for category: String) -> [Fixture] {
        categories.first(where: { $0.category == category })?.fixtures ?? []
    }

    init() {
        loadCached()
    }

    private func loadCached() {
        guard let data = UserDefaults.standard.data(forKey: Self.cacheKey),
              let cached = try? JSONDecoder().decode([FixtureCategory].self, from: data) else { return }
        categories = cached
    }

    private func saveCache() {
        guard let data = try? JSONEncoder().encode(categories) else { return }
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
                guard let decoded = try? JSONDecoder().decode([FixtureCategory].self, from: data) else { return }
                self.categories = decoded
                self.saveCache()
            }
        }.resume()
    }
}

@main
struct FalconApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var store = FixtureStore()
    @State private var path = NavigationPath()

    var body: some Scene {
        WindowGroup {
            NavigationStack(path: $path) {
                CategoryListView(path: $path)
                    .environmentObject(store)
                    .navigationDestination(for: NavDestination.self) { dest in
                        switch dest {
                        case .category(let category):
                            FixtureListView(category: category, path: $path)
                                .environmentObject(store)
                        case .fixture(let name):
                            FixtureDetailView(fixtureName: name)
                                .environmentObject(store)
                        }
                    }
            }
        }
    }
}

struct CategoryListView: View {
    @EnvironmentObject var store: FixtureStore
    @Binding var path: NavigationPath
    @State private var hasAutoNavigated = false

    var body: some View {
        List(store.categories) { category in
            NavigationLink(value: NavDestination.category(category.category)) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(category.category)
                            .font(.headline)
                        Text("\(category.fixtures.count) fixture\(category.fixtures.count == 1 ? "" : "s")")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Fixtures")
        .onAppear {
            store.fetchFixtures()
            if !hasAutoNavigated, path.isEmpty, let last = store.lastViewedFixture {
                hasAutoNavigated = true
                let parts = last.split(separator: "/", maxSplits: 1)
                if parts.count == 2 {
                    let category = String(parts[0])
                    let fixture = String(parts[1])
                    path.append(NavDestination.category(category))
                    path.append(NavDestination.fixture(fixture))
                }
            }
        }
        .onChange(of: path) { newPath in
            if newPath.isEmpty {
                store.lastViewedFixture = nil
            }
        }
    }
}

struct FixtureListView: View {
    let category: String
    @EnvironmentObject var store: FixtureStore
    @Binding var path: NavigationPath

    var body: some View {
        List(store.fixtures(for: category)) { fixture in
            NavigationLink(value: NavDestination.fixture(fixture.name)) {
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
        .navigationTitle(category)
    }
}

struct FixtureDetailView: View {
    let fixtureName: String
    @EnvironmentObject var store: FixtureStore
    @Environment(\.dismiss) private var dismiss

    private var fixtureConfig: FixtureConfig? {
        store.categories
            .flatMap { $0.fixtures }
            .first(where: { $0.name == fixtureName })?.config
    }

    private var backgroundColor: Color {
        if let hex = fixtureConfig?.backgroundColor {
            return Color(hex: hex)
        }
        return Color(red: 0xF2/255.0, green: 0xF2/255.0, blue: 0xF7/255.0)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            FixtureRootView(fixtureName: fixtureName, ssrEndpoint: fixtureConfig?.ssrEndpoint ?? "ssr")
            if fixtureConfig?.hideNavBar == true {
                Button(action: { dismiss() }) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.primary)
                        .frame(width: 36, height: 36)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
                .padding(.top, 8)
                .padding(.leading, 12)
            }
        }
            .background(backgroundColor.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(fixtureConfig?.hideNavBar == true ? .hidden : .automatic, for: .navigationBar)
            .onAppear {
                // Find category for this fixture and store as "category/fixtureName"
                for cat in store.categories {
                    if cat.fixtures.contains(where: { $0.name == fixtureName }) {
                        store.lastViewedFixture = "\(cat.category)/\(fixtureName)"
                        break
                    }
                }
            }
    }
}

struct FixtureRootView: UIViewControllerRepresentable {
    let fixtureName: String
    let ssrEndpoint: String

    func makeUIViewController(context: Context) -> FixtureViewController {
        return FixtureViewController(fixtureName: fixtureName, ssrEndpoint: ssrEndpoint)
    }

    func updateUIViewController(_ vc: FixtureViewController, context: Context) {}
}

class FixtureViewController: UIViewController {
    private let fixtureName: String
    private let ssrEndpoint: String
    private var root: Root?

    private static let prerenderCacheKey = "prerenderCache"

    init(fixtureName: String, ssrEndpoint: String) {
        self.fixtureName = fixtureName
        self.ssrEndpoint = ssrEndpoint
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        if ssrEndpoint == "prerender" {
            startPrerender()
        } else {
            let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
            root = hydrateRoot(view, url: ssrURL)
        }
    }

    private func startPrerender() {
        let prerenderURL = "http://localhost:6001/prerender/\(fixtureName)"
        let resumeURL = "http://localhost:6001/resume/\(fixtureName)"

        // Check device cache
        if let data = Self.loadCachedPrerender(for: fixtureName) {
            // Cache hit — replay instantly, then resume for dynamic content
            root = resumeRoot(view, data: data, url: resumeURL)

            // Revalidate in the background for next load
            Self.revalidatePrerender(for: fixtureName, url: prerenderURL)

            // Also revalidate on reload (Cmd+Shift+R, perf tracing)
            let fixture = fixtureName
            root?.onReload = {
                Self.revalidatePrerender(for: fixture, url: prerenderURL)
            }
            return
        }

        // Cache miss — fetch from server
        guard let url = URL(string: prerenderURL) else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] responseData, _, error in
            guard let self = self, let responseData = responseData, error == nil else { return }
            DispatchQueue.main.async {
                let result = Self.parsePrerenderResponse(responseData)
                Self.saveCachedPrerender(for: self.fixtureName, data: result)
                self.root = resumeRoot(self.view, data: result, url: resumeURL)
            }
        }.resume()
    }

    /// Stale-while-revalidate: re-fetch /prerender in the background and
    /// update the cache if the shell has changed. Next load picks up the new version.
    private static func revalidatePrerender(for fixture: String, url: String) {
        guard let urlObj = URL(string: url) else { return }
        var request = URLRequest(url: urlObj)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { responseData, _, error in
            guard let responseData = responseData, error == nil else { return }
            let fresh = parsePrerenderResponse(responseData)

            DispatchQueue.main.async {
                let cached = loadCachedPrerender(for: fixture)
                if cached == nil || fresh.prelude != cached!.prelude || fresh.postponed != cached!.postponed {
                    saveCachedPrerender(for: fixture, data: fresh)
                }
            }
        }.resume()
    }

    // MARK: - Prerender Response Parsing

    /// Splits the raw prerender response into prelude bytes and postponed state.
    /// The POSTPONED instruction is the last line — everything before it is the prelude.
    private static func parsePrerenderResponse(_ data: Data) -> PrerenderResult {
        let newline = UInt8(ascii: "\n")
        let postponedPrefix = Data("[\"POSTPONED\",".utf8)

        // Scan backwards for the POSTPONED line
        for i in stride(from: data.count - 2, through: 0, by: -1) {
            if data[i] == newline {
                let lineStart = i + 1
                let remaining = data[lineStart...]
                if remaining.starts(with: postponedPrefix) {
                    let prelude = Data(data[0...i])
                    // Extract the postponed JSON: strip ["POSTPONED", prefix and ]\n suffix
                    let jsonStart = lineStart + postponedPrefix.count
                    let jsonEnd = data.count - 2  // strip ]\n
                    if jsonEnd > jsonStart {
                        let postponed = Data(data[jsonStart..<jsonEnd])
                        return PrerenderResult(prelude: prelude, postponed: postponed)
                    }
                }
                break
            }
        }

        // Fallback: treat entire response as prelude with empty postponed
        return PrerenderResult(prelude: data, postponed: Data())
    }

    // MARK: - Device Cache (UserDefaults)

    private static func loadCachedPrerender(for fixture: String) -> PrerenderResult? {
        guard let dict = UserDefaults.standard.dictionary(forKey: "\(prerenderCacheKey)_\(fixture)"),
              let preludeBase64 = dict["prelude"] as? String,
              let postponedBase64 = dict["postponed"] as? String,
              let prelude = Data(base64Encoded: preludeBase64),
              let postponed = Data(base64Encoded: postponedBase64) else { return nil }
        return PrerenderResult(prelude: prelude, postponed: postponed)
    }

    private static func saveCachedPrerender(for fixture: String, data: PrerenderResult) {
        let dict: [String: String] = [
            "prelude": data.prelude.base64EncodedString(),
            "postponed": data.postponed.base64EncodedString(),
        ]
        UserDefaults.standard.set(dict, forKey: "\(prerenderCacheKey)_\(fixture)")
    }

    deinit {
        root?.unmount()
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let scanner = Scanner(string: hex)
        var rgbValue: UInt64 = 0
        scanner.scanHexInt64(&rgbValue)
        let r = Double((rgbValue & 0xFF0000) >> 16) / 255.0
        let g = Double((rgbValue & 0x00FF00) >> 8) / 255.0
        let b = Double(rgbValue & 0x0000FF) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}
