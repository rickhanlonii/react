import SwiftUI
import WebKit

@Observable
class FixtureRunner {
    enum Result {
        case running
        case passed(elementCount: Int)
        case failed(diffs: [LayoutDiff], elementCount: Int)
        case error(String)
    }

    var results: [String: Result] = [:]
    var isRunning = false
    var currentFixture: String?

    func runAll(fixtures: [String], webRenderer: WebRendererModel, nativeRenderer: NativeRendererModel) {
        guard !isRunning else { return }
        isRunning = true
        results = [:]

        webRenderer.onReady { [weak self] in
            self?.runNext(
                fixtures: fixtures,
                index: 0,
                webRenderer: webRenderer,
                nativeRenderer: nativeRenderer
            )
        }
    }

    private func runNext(
        fixtures: [String],
        index: Int,
        webRenderer: WebRendererModel,
        nativeRenderer: NativeRendererModel
    ) {
        guard index < fixtures.count else {
            isRunning = false
            currentFixture = nil
            return
        }

        let name = fixtures[index]
        currentFixture = name
        results[name] = .running

        webRenderer.renderFixture(name) { [weak self] in
            webRenderer.extractLayout { webLayout in
                guard let self = self else { return }
                guard let webLayout = webLayout else {
                    self.results[name] = .error("Failed to extract web layout")
                    self.printResults(fixture: name, diffs: [], elementCount: 0, error: "web extract failed")
                    self.runNext(fixtures: fixtures, index: index + 1, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                    return
                }

                nativeRenderer.renderFixture(name) { [weak self] in
                    guard let self = self else { return }
                    guard let nativeLayout = nativeRenderer.extractLayout() else {
                        self.results[name] = .error("Failed to extract native layout")
                        self.printResults(fixture: name, diffs: [], elementCount: 0, error: "native extract failed")
                        self.runNext(fixtures: fixtures, index: index + 1, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                        return
                    }

                    let diffs = LayoutComparer.compare(web: webLayout, native: nativeLayout)
                    let elementCount = LayoutComparer.countElements(webLayout)

                    if diffs.isEmpty {
                        self.results[name] = .passed(elementCount: elementCount)
                    } else {
                        self.results[name] = .failed(diffs: diffs, elementCount: elementCount)
                    }

                    self.printResults(fixture: name, diffs: diffs, elementCount: elementCount, error: nil)
                    self.runNext(fixtures: fixtures, index: index + 1, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                }
            }
        }
    }

    private func printResults(fixture: String, diffs: [LayoutDiff], elementCount: Int, error: String?) {
        if let error = error {
            print("[LayoutCompare] fixture=\(fixture) error=\(error)")
            return
        }
        if let data = try? JSONEncoder().encode(diffs),
           let json = String(data: data, encoding: .utf8) {
            print("[LayoutCompare] fixture=\(fixture) elements=\(elementCount) diffs=\(diffs.count)")
            print("[LayoutCompare] \(json)")
        }
    }
}

struct FixtureListView: View {
    @State private var fixtureNames: [String] = []
    @State private var isLoading = true
    @State private var loader = FixtureNameLoader()
    @State private var runner = FixtureRunner()
    @State private var webRenderer = WebRendererModel()
    @State private var nativeRenderer = NativeRendererModel()

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading fixtures...")
            } else if fixtureNames.isEmpty {
                Text("No fixtures found")
                    .foregroundColor(.secondary)
            } else {
                VStack(spacing: 0) {
                    if !runner.results.isEmpty {
                        summaryBar
                    }
                    List(fixtureNames, id: \.self) { name in
                        NavigationLink(destination: ComparisonView(fixtureName: name, webRenderer: webRenderer, nativeRenderer: nativeRenderer)) {
                            fixtureRow(name: name)
                        }
                    }
                }
            }
        }
        .navigationTitle("Layout Compare")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    runner.runAll(fixtures: fixtureNames, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                } label: {
                    if runner.isRunning {
                        ProgressView()
                    } else {
                        Text("Run All")
                    }
                }
                .disabled(runner.isRunning || isLoading || fixtureNames.isEmpty)
            }
        }
        .onAppear {
            loader.load { names in
                self.fixtureNames = names
                self.isLoading = false
            }
        }
    }

    private var summaryBar: some View {
        let total = fixtureNames.count
        let passed = runner.results.values.filter {
            if case .passed = $0 { return true }
            return false
        }.count
        let completed = runner.results.values.filter {
            if case .running = $0 { return false }
            return true
        }.count

        return HStack {
            if runner.isRunning {
                ProgressView()
                    .scaleEffect(0.7)
                Text("Running \(completed)/\(total)...")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                if passed == total {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                } else {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                }
                Text("\(passed)/\(total) passed")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(Color(.systemGroupedBackground))
    }

    private func fixtureRow(name: String) -> some View {
        HStack {
            Text(name)
            Spacer()
            if let result = runner.results[name] {
                switch result {
                case .running:
                    ProgressView()
                        .scaleEffect(0.7)
                case .passed(let elementCount):
                    HStack(spacing: 4) {
                        Text("\(elementCount) elements")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                    }
                case .failed(let diffs, _):
                    HStack(spacing: 4) {
                        Text("\(diffs.count) diffs")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.red)
                    }
                case .error(let message):
                    HStack(spacing: 4) {
                        Text(message)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                    }
                }
            }
        }
    }
}

/// Loads fixture names by creating a WKWebView, loading the web bundle,
/// and extracting the fixture name list via JS evaluation.
/// Kept as a class so the WKWebView stays alive during async loading.
@Observable
class FixtureNameLoader {
    private var webView: WKWebView?

    func load(completion: @escaping ([String]) -> Void) {
        guard let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html") else {
            print("[LayoutCompare] index.html not found in bundle")
            completion([])
            return
        }

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        self.webView = wv

        print("[LayoutCompare] Loading index.html from: \(htmlURL)")
        wv.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())

        pollForFixtureNames(webView: wv, completion: completion)
    }

    private func pollForFixtureNames(webView: WKWebView, attempt: Int = 0, completion: @escaping ([String]) -> Void) {
        guard attempt < 20 else {
            print("[LayoutCompare] Gave up waiting for __LAYOUT_COMPARE__ after \(attempt) attempts")
            completion([])
            return
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            webView.evaluateJavaScript("typeof __LAYOUT_COMPARE__") { result, error in
                if let type = result as? String, type == "object" {
                    // JS is loaded, extract fixture names
                    webView.evaluateJavaScript("JSON.stringify(__LAYOUT_COMPARE__.fixtureNames)") { result, error in
                        if let error = error {
                            print("[LayoutCompare] fixtureNames eval error: \(error)")
                            completion([])
                            return
                        }
                        guard let json = result as? String,
                              let data = json.data(using: .utf8),
                              let names = try? JSONSerialization.jsonObject(with: data) as? [String] else {
                            print("[LayoutCompare] fixtureNames parse failed, result: \(String(describing: result))")
                            completion([])
                            return
                        }
                        print("[LayoutCompare] Found \(names.count) fixtures: \(names)")
                        completion(names)
                    }
                } else {
                    print("[LayoutCompare] Poll attempt \(attempt + 1): __LAYOUT_COMPARE__ not ready (type: \(String(describing: result)), error: \(String(describing: error)))")
                    self.pollForFixtureNames(webView: webView, attempt: attempt + 1, completion: completion)
                }
            }
        }
    }
}
