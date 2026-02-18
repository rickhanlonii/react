import SwiftUI
import WebKit

@Observable
class WebRendererModel: NSObject, WKScriptMessageHandler {
    let webView: WKWebView
    private var isLoaded = false
    private var pendingRender: (() -> Void)?
    private var renderCompletion: (() -> Void)?

    override init() {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        webView.scrollView.isScrollEnabled = false

        super.init()

        // Register message handler for render-ready events from JS
        webView.configuration.userContentController.add(self, name: "layoutReady")

        loadHTML()
    }

    private func loadHTML() {
        let devURL = URL(string: "http://localhost:6100/index.html")!
        webView.load(URLRequest(url: devURL))
        pollForLoad()
    }

    private func pollForLoad() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self else { return }
            self.webView.evaluateJavaScript("typeof __LAYOUT_COMPARE__") { result, error in
                if let type = result as? String, type == "object" {
                    self.isLoaded = true
                    if let pending = self.pendingRender {
                        self.pendingRender = nil
                        pending()
                    }
                } else {
                    self.pollForLoad()
                }
            }
        }
    }

    func onReady(_ callback: @escaping () -> Void) {
        if isLoaded { callback() }
        else { pendingRender = callback }
    }

    func renderFixture(_ name: String, completion: @escaping () -> Void) {
        let doRender: () -> Void = { [weak self] in
            guard let self = self else { return }
            // Store completion — will be called when JS posts layoutReady message
            self.renderCompletion = completion
            self.webView.evaluateJavaScript("__LAYOUT_COMPARE__.renderFixture('\(name)')") { _, error in
                if let error = error {
                    print("[WebRenderer] Render error: \(error)")
                    // If JS eval itself failed, fire completion (layoutReady won't arrive)
                    if let pending = self.renderCompletion {
                        self.renderCompletion = nil
                        pending()
                    }
                }
            }
        }

        if isLoaded {
            doRender()
        } else {
            pendingRender = doRender
        }
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "layoutReady" {
            if let completion = renderCompletion {
                renderCompletion = nil
                completion()
            }
        }
    }

    func extractLayout(completion: @escaping (LayoutNode?) -> Void) {
        webView.evaluateJavaScript("__LAYOUT_COMPARE__.extractLayout()") { result, error in
            guard let json = result as? String,
                  let data = json.data(using: .utf8) else {
                print("[WebRenderer] Extract failed: \(String(describing: error))")
                completion(nil)
                return
            }

            do {
                let node = try JSONDecoder().decode(LayoutNode.self, from: data)
                completion(node)
            } catch {
                print("[WebRenderer] Decode failed: \(error)")
                completion(nil)
            }
        }
    }
}

struct WebRendererView: UIViewRepresentable {
    var model: WebRendererModel

    func makeUIView(context: Context) -> WKWebView {
        return model.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
