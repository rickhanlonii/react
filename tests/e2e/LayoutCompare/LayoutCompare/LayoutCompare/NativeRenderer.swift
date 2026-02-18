import UIKit
import SwiftUI
import ReactDomNativeKit
import ShadowTree
import JSEngine
import Yoga

@Observable
class NativeRendererModel {
    private var runtime: JSRuntime?
    let containerView = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    private let surfaceId = 100

    init() {
        containerView.backgroundColor = .white
    }

    func renderFixture(_ name: String, completion: @escaping () -> Void) {
        cleanup()

        runtime = JSRuntime()
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

                runtime.engine.evaluate(source, sourceURL: bundleURL)
                runtime.engine.evaluate("__LAYOUT_COMPARE__.renderFixture('\(name)', \(self.surfaceId))")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    completion()
                }
            }
        }.resume()
    }

    func extractLayout() -> LayoutNode? {
        guard let runtime = runtime else { return nil }
        guard let trees = runtime.bindings.currentTree(forSurface: surfaceId) else {
            print("[NativeRenderer] No tree for surface \(surfaceId)")
            return nil
        }

        if trees.count == 1 {
            return LayoutExtractor.extract(from: trees[0])
        } else {
            var children: [LayoutNode] = []
            for node in trees {
                children.append(LayoutExtractor.extract(from: node))
            }
            return LayoutNode(
                type: "root",
                x: 0, y: 0, width: 390, height: 844,
                styles: [:],
                children: children
            )
        }
    }

    func cleanup() {
        if let runtime = runtime {
            runtime.bindings.unregisterSurface(surfaceId: surfaceId)
        }
        containerView.subviews.forEach { $0.removeFromSuperview() }
        runtime = nil
    }
}

struct NativeRendererView: UIViewRepresentable {
    var model: NativeRendererModel

    func makeUIView(context: Context) -> UIView {
        return model.containerView
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}
