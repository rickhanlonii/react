import SwiftUI
import WebKit

struct FixtureListView: View {
    @State private var fixtureNames: [String] = []
    @State private var isLoading = true
    @State private var loader = FixtureNameLoader()

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading fixtures...")
            } else if fixtureNames.isEmpty {
                Text("No fixtures found")
                    .foregroundColor(.secondary)
            } else {
                List(fixtureNames, id: \.self) { name in
                    NavigationLink(destination: ComparisonView(fixtureName: name)) {
                        Text(name)
                    }
                }
            }
        }
        .navigationTitle("Layout Compare")
        .onAppear {
            loader.load { names in
                self.fixtureNames = names
                self.isLoading = false
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
