import SwiftUI
import UIKit
import Combine

struct FixtureConfig: Codable {
    var hideNavBar: Bool?
    var backgroundColor: String?
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
    @State private var currentFixture: String? = nil
    @AppStorage("renderingMode") private var renderingMode: String = RenderingMode.hydrated.rawValue

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
                                .onAppear { currentFixture = name }
                                .onDisappear { if currentFixture == name { currentFixture = nil } }
                        }
                    }
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("com.react.Falcon.navigateFixture"))) { notification in
                guard let fixture = notification.userInfo?["fixture"] as? String,
                      let variant = notification.userInfo?["variant"] as? String else { return }

                // Set the rendering mode
                renderingMode = variant

                // If already on this fixture, just changing renderingMode is enough —
                // FixtureRootView uses .id(renderingMode) so SwiftUI recreates it.
                if currentFixture == fixture {
                    return
                }

                // Find the category for this fixture
                let category = store.categories.first(where: {
                    $0.fixtures.contains(where: { $0.name == fixture })
                })?.category

                // Navigate: reset to root, then push category + fixture
                path = NavigationPath()
                if let category = category {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        path.append(NavDestination.category(category))
                        path.append(NavDestination.fixture(fixture))
                        currentFixture = fixture
                    }
                }
            }
        }
    }
}

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
            .accessibilityIdentifier("category-\(category.category)")
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
            .accessibilityIdentifier("fixture-\(fixture.name)")
        }
        .navigationTitle(category)
    }
}

struct FixtureDetailView: View {
    let fixtureName: String
    @EnvironmentObject var store: FixtureStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("renderingMode") private var renderingMode: String = RenderingMode.hydrated.rawValue

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
            FixtureRootView(fixtureName: fixtureName, renderingMode: renderingMode)
                .id(renderingMode)
            if fixtureConfig?.hideNavBar == true {
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.primary)
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                    }
                    Spacer()
                    Menu {
                        ForEach(RenderingMode.allCases, id: \.rawValue) { mode in
                            Button {
                                renderingMode = mode.rawValue
                            } label: {
                                if renderingMode == mode.rawValue {
                                    Label(mode.label, systemImage: "checkmark")
                                } else {
                                    Text(mode.label)
                                }
                            }
                        }
                    } label: {
                        Text(RenderingMode(rawValue: renderingMode)?.label ?? "Hydrated")
                            .font(.subheadline.weight(.medium))
                            .padding(.horizontal, 12)
                            .frame(height: 36)
                            .background(.ultraThinMaterial)
                            .clipShape(Capsule())
                    }
                }
                .padding(.top, 8)
                .padding(.horizontal, 12)
            }
        }
            .background(backgroundColor.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        ForEach(RenderingMode.allCases, id: \.rawValue) { mode in
                            Button {
                                renderingMode = mode.rawValue
                            } label: {
                                if renderingMode == mode.rawValue {
                                    Label(mode.label, systemImage: "checkmark")
                                } else {
                                    Text(mode.label)
                                }
                            }
                        }
                    } label: {
                        Text(RenderingMode(rawValue: renderingMode)?.label ?? "Hydrated")
                            .font(.subheadline.weight(.medium))
                    }
                }
            }
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
