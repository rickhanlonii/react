import UIKit
import SwiftUI
import ReactDomNativeKit
import ShadowTree
import JSEngine
import Yoga

@Observable
class NativeRendererModel {
    private var runtime: JSRuntime?
    private var renderer: Renderer?
    let scrollView = UIScrollView()
    let containerView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    private let surfaceId = 100

    init() {
        containerView.backgroundColor = .white
        scrollView.addSubview(containerView)
        scrollView.contentSize = CGSize(width: 390, height: 844)
    }

    func renderFixture(_ name: String, completion: @escaping () -> Void) {
        cleanup()

        let newRenderer = Renderer()
        newRenderer.registerRootView(containerView)
        self.renderer = newRenderer

        runtime = JSRuntime()
        runtime!.bindings.rendererForSurface = { [weak self] id in
            guard let self = self, id == self.surfaceId else { return nil }
            return self.renderer
        }
        runtime!.bindings.registerSurface(surfaceId: surfaceId, rootView: containerView)

        let bundleURL = URL(string: "http://localhost:6100/native-fixtures.js")!
        URLSession.shared.dataTask(with: bundleURL) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self = self, let runtime = self.runtime else {
                    completion()
                    return
                }
                guard let data = data, let source = String(data: data, encoding: .utf8) else {
                    print("[NativeRenderer] Failed to load bundle: \(error?.localizedDescription ?? "unknown")")
                    completion()
                    return
                }

                // Register a callback that JS will invoke after React commits
                runtime.engine.setGlobalFunction("__onFixtureReady__") { _ in
                    DispatchQueue.main.async { completion() }
                    return nil
                }

                runtime.engine.evaluate(source, sourceURL: bundleURL)
                runtime.engine.evaluate("__LAYOUT_COMPARE__.renderFixture('\(name)', \(self.surfaceId))")
            }
        }.resume()
    }

    func extractLayout() -> LayoutNode? {
        guard let runtime = runtime else { return nil }
        guard let trees = runtime.bindings.currentTree(forSurface: surfaceId) else {
            print("[NativeRenderer] No tree for surface \(surfaceId)")
            return nil
        }

        let registry = runtime.bindings.viewRegistry

        let raw: LayoutNode
        if trees.count == 1 {
            raw = LayoutExtractor.extract(from: trees[0], viewRegistry: registry)
        } else {
            var children: [LayoutNode] = []
            for node in trees {
                children.append(LayoutExtractor.extract(from: node, viewRegistry: registry))
            }
            raw = LayoutNode(
                type: "root",
                x: 0, y: 0, width: 390, height: 844,
                styles: [:],
                children: children
            )
        }

        // Post-extraction: adjust for CSS margin collapse-through
        return LayoutExtractor.adjustForMarginCollapseThrough(raw)
    }

    func cleanup() {
        if let runtime = runtime {
            runtime.bindings.unregisterSurface(surfaceId: surfaceId)
        }
        containerView.subviews.forEach { $0.removeFromSuperview() }
        runtime = nil
        renderer = nil
    }
}

struct NativeRendererView: UIViewRepresentable {
    var model: NativeRendererModel

    func makeUIView(context: Context) -> UIScrollView {
        return model.scrollView
    }

    func updateUIView(_ uiView: UIScrollView, context: Context) {}
}
