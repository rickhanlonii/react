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

        guard let bundleURL = Bundle.main.url(forResource: "native-fixtures", withExtension: "js") else {
            print("[NativeRenderer] native-fixtures.js not found in bundle")
            completion()
            return
        }

        do {
            let source = try String(contentsOf: bundleURL, encoding: .utf8)
            runtime!.engine.evaluate(source, sourceURL: bundleURL)
        } catch {
            print("[NativeRenderer] Failed to load bundle: \(error)")
            completion()
            return
        }

        runtime!.engine.evaluate("__LAYOUT_COMPARE__.renderFixture('\(name)', \(surfaceId))")

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            completion()
        }
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
