import SwiftUI
import WebKit

@Observable
class FixtureRunner {
    enum Result {
        case running
        case passed(elementCount: Int, pixelDiff: PixelDiffResult?)
        case failed(diffs: [LayoutDiff], elementCount: Int, pixelDiff: PixelDiffResult?)
        case error(String)
    }

    var results: [String: Result] = [:]
    var isRunning = false
    var currentFixture: String?

    func runAll(fixtures: [String], webRenderer: WebRendererModel, nativeRenderer: NativeRendererModel) {
        guard !isRunning else { return }
        isRunning = true
        results = [:]

        HTTPResultsServer.shared.latestResults = HTTPResultsServer.ResultsPayload(
            status: "running", passed: 0, total: fixtures.count, fixtures: [:]
        )

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
            let passedCount = HTTPResultsServer.shared.latestResults.fixtures.values.filter { $0.passed }.count
            HTTPResultsServer.shared.latestResults.status = "complete"
            HTTPResultsServer.shared.latestResults.passed = passedCount
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
                    let fixtureResult = HTTPResultsServer.FixtureResult(passed: false, elements: 0, diffs: [], error: "Failed to extract web layout")
                    HTTPResultsServer.shared.latestResults.fixtures[name] = fixtureResult
                    self.printResults(fixture: name, diffs: [], elementCount: 0, pixelResult: nil, error: "web extract failed")
                    self.runNext(fixtures: fixtures, index: index + 1, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                    return
                }

                nativeRenderer.renderFixture(name) { [weak self] in
                    guard let self = self else { return }
                    guard let nativeLayout = nativeRenderer.extractLayout() else {
                        self.results[name] = .error("Failed to extract native layout")
                        let fixtureResult = HTTPResultsServer.FixtureResult(passed: false, elements: 0, diffs: [], error: "Failed to extract native layout")
                        HTTPResultsServer.shared.latestResults.fixtures[name] = fixtureResult
                        self.printResults(fixture: name, diffs: [], elementCount: 0, pixelResult: nil, error: "native extract failed")
                        self.runNext(fixtures: fixtures, index: index + 1, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                        return
                    }

                    let diffs = LayoutComparer.compare(web: webLayout, native: nativeLayout)
                    let elementCount = LayoutComparer.countElements(webLayout)

                    PixelComparer.compare(webView: webRenderer.webView, nativeView: nativeRenderer.containerView) { pixelResult in
                        if diffs.isEmpty {
                            self.results[name] = .passed(elementCount: elementCount, pixelDiff: pixelResult)
                        } else {
                            self.results[name] = .failed(diffs: diffs, elementCount: elementCount, pixelDiff: pixelResult)
                        }

                        // Update HTTP results server
                        var fixtureResult = HTTPResultsServer.FixtureResult(passed: diffs.isEmpty, elements: elementCount, diffs: diffs)
                        fixtureResult.pixelDiff = pixelResult
                        HTTPResultsServer.shared.latestResults.fixtures[name] = fixtureResult

                        self.printResults(fixture: name, diffs: diffs, elementCount: elementCount, pixelResult: pixelResult, error: nil)
                        self.runNext(fixtures: fixtures, index: index + 1, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                    }
                }
            }
        }
    }

    private func printResults(fixture: String, diffs: [LayoutDiff], elementCount: Int, pixelResult: PixelDiffResult?, error: String?) {
        if let error = error {
            print("[LayoutCompare] fixture=\(fixture) error=\(error)")
            return
        }
        var pixelStr = ""
        if let px = pixelResult {
            pixelStr = " pixels=\(px.mismatchedPixels)/\(px.totalPixels) (\(String(format: "%.1f", px.percentage))%)"
        }
        if let data = try? JSONEncoder().encode(diffs),
           let json = String(data: data, encoding: .utf8) {
            print("[LayoutCompare] fixture=\(fixture) elements=\(elementCount) diffs=\(diffs.count)\(pixelStr)")
            print("[LayoutCompare] \(json)")
        }
    }

    func runSingle(fixture name: String, fixtures: [String], webRenderer: WebRendererModel, nativeRenderer: NativeRendererModel) {
        guard !isRunning else { return }
        guard fixtures.contains(name) else { return }
        isRunning = true
        currentFixture = name

        HTTPResultsServer.shared.latestResults.status = "running"

        webRenderer.onReady { [weak self] in
            guard let self = self else { return }

            webRenderer.renderFixture(name) { [weak self] in
                webRenderer.extractLayout { webLayout in
                    guard let self = self else { return }
                    guard let webLayout = webLayout else {
                        self.results[name] = .error("Failed to extract web layout")
                        let fixtureResult = HTTPResultsServer.FixtureResult(passed: false, elements: 0, diffs: [], error: "Failed to extract web layout")
                        HTTPResultsServer.shared.latestResults.fixtures[name] = fixtureResult
                        self.finishSingle()
                        return
                    }

                    nativeRenderer.renderFixture(name) { [weak self] in
                        guard let self = self else { return }
                        guard let nativeLayout = nativeRenderer.extractLayout() else {
                            self.results[name] = .error("Failed to extract native layout")
                            let fixtureResult = HTTPResultsServer.FixtureResult(passed: false, elements: 0, diffs: [], error: "Failed to extract native layout")
                            HTTPResultsServer.shared.latestResults.fixtures[name] = fixtureResult
                            self.finishSingle()
                            return
                        }

                        let diffs = LayoutComparer.compare(web: webLayout, native: nativeLayout)
                        let elementCount = LayoutComparer.countElements(webLayout)

                        PixelComparer.compare(webView: webRenderer.webView, nativeView: nativeRenderer.containerView) { pixelResult in
                            if diffs.isEmpty {
                                self.results[name] = .passed(elementCount: elementCount, pixelDiff: pixelResult)
                            } else {
                                self.results[name] = .failed(diffs: diffs, elementCount: elementCount, pixelDiff: pixelResult)
                            }

                            var fixtureResult = HTTPResultsServer.FixtureResult(passed: diffs.isEmpty, elements: elementCount, diffs: diffs)
                            fixtureResult.pixelDiff = pixelResult
                            HTTPResultsServer.shared.latestResults.fixtures[name] = fixtureResult

                            self.printResults(fixture: name, diffs: diffs, elementCount: elementCount, pixelResult: pixelResult, error: nil)
                            self.finishSingle()
                        }
                    }
                }
            }
        }
    }

    private func finishSingle() {
        isRunning = false
        currentFixture = nil
        let passedCount = HTTPResultsServer.shared.latestResults.fixtures.values.filter { $0.passed }.count
        HTTPResultsServer.shared.latestResults.status = "complete"
        HTTPResultsServer.shared.latestResults.passed = passedCount
        HTTPResultsServer.shared.latestResults.total = HTTPResultsServer.shared.latestResults.fixtures.count
    }
}

struct FixtureListView: View {
    @State private var fixtureNames: [String] = []
    @State private var isLoading = true
    @State private var loader = FixtureNameLoader()
    @State private var runner = FixtureRunner()
    @State private var webRenderer = WebRendererModel()
    @State private var nativeRenderer = NativeRendererModel()
    @State private var lastBundleVersion: Double = 0
    @State private var versionTimer: Timer?

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
                startBundleVersionPolling()

                // Wire up HTTP run-all callback
                HTTPResultsServer.shared.onRunAllRequested = {
                    runner.runAll(fixtures: fixtureNames, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                }

                // Wire up HTTP run-single callback
                HTTPResultsServer.shared.onRunFixtureRequested = { fixtureName in
                    runner.runSingle(fixture: fixtureName, fixtures: fixtureNames, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                }

                // Auto-run if launched with --run-all
                if CommandLine.arguments.contains("--run-all") {
                    runner.runAll(fixtures: fixtureNames, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
                }
            }
        }
    }

    private func startBundleVersionPolling() {
        let versionURL = URL(string: "http://localhost:6100/bundle-version")!
        // Fetch initial version
        fetchBundleVersion(from: versionURL) { version in
            lastBundleVersion = version
        }
        // Poll every 2 seconds
        versionTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            fetchBundleVersion(from: versionURL) { version in
                guard version > 0, version != lastBundleVersion else { return }
                lastBundleVersion = version
                print("[LayoutCompare] Bundle updated (version \(version)), reloading...")
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

    private var summaryBar: some View {
        let total = fixtureNames.count
        let passed = runner.results.values.filter {
            if case .passed(_, _) = $0 { return true }
            return false
        }.count
        let completed = runner.results.values.filter {
            if case .running = $0 { return false }
            return true
        }.count
        let totalDiffs = runner.results.values.reduce(0) { sum, result in
            if case .failed(let diffs, _, _) = result { return sum + diffs.count }
            return sum
        }
        let totalElements = runner.results.values.reduce(0) { sum, result in
            switch result {
            case .passed(let elementCount, _): return sum + elementCount
            case .failed(_, let elementCount, _): return sum + elementCount
            default: return sum
            }
        }
        let pixelMismatchCount = runner.results.values.filter { result in
            switch result {
            case .passed(_, let px): return (px?.mismatchedPixels ?? 0) > 0
            case .failed(_, _, let px): return (px?.mismatchedPixels ?? 0) > 0
            default: return false
            }
        }.count

        return HStack {
            if runner.isRunning {
                ProgressView()
                    .scaleEffect(0.7)
                Text("Running \(completed)/\(total)...")
                    .font(.caption)
                    .foregroundColor(.secondary)
            } else {
                if passed == total && pixelMismatchCount == 0 {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                } else {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                }
                Text("\(passed)/\(total) passed, \(totalDiffs)/\(totalElements) diffs, \(pixelMismatchCount) px")
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
                case .passed(let elementCount, let pixelDiff):
                    HStack(spacing: 4) {
                        if let px = pixelDiff, px.mismatchedPixels > 0 {
                            Text("\(String(format: "%.1f", px.percentage))% px")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                        } else {
                            Text("\(elementCount) elements")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                        }
                    }
                case .failed(let diffs, let elementCount, let pixelDiff):
                    HStack(spacing: 4) {
                        if let px = pixelDiff, px.mismatchedPixels > 0 {
                            Text("\(diffs.count)/\(elementCount) diffs, \(String(format: "%.1f", px.percentage))% px")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        } else {
                            Text("\(diffs.count)/\(elementCount) diffs")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
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
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        self.webView = wv

        let devURL = URL(string: "http://localhost:6100/index.html")!
        print("[LayoutCompare] Loading index.html from: \(devURL)")
        wv.load(URLRequest(url: devURL))

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
