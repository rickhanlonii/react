import SwiftUI

struct ComparisonView: View {
    let fixtureName: String
    @State private var diffs: [LayoutDiff] = []
    @State private var elementCount: Int = 0
    @State private var isComparing = true
    @State private var error: String?
    @State private var webRenderer = WebRendererModel()
    @State private var nativeRenderer = NativeRendererModel()

    var body: some View {
        VStack(spacing: 0) {
            // Web rendering (top third)
            VStack(spacing: 4) {
                Text("Web (react-dom)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                WebRendererView(model: webRenderer)
                    .frame(maxHeight: .infinity)
            }

            Divider()

            // Native rendering (middle third)
            VStack(spacing: 4) {
                Text("Native (react-dom-native)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                NativeRendererView(model: nativeRenderer)
                    .frame(maxHeight: .infinity)
            }

            Divider()

            // Diff results (bottom section)
            VStack(spacing: 0) {
                // Summary bar
                HStack {
                    if isComparing {
                        ProgressView()
                            .scaleEffect(0.7)
                        Text("Comparing...")
                            .font(.caption)
                    } else if let error = error {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.red)
                        Text(error)
                            .font(.caption)
                    } else if diffs.isEmpty {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.green)
                        Text("\(elementCount) elements, 0 diffs")
                            .font(.caption)
                    } else {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        Text("\(diffs.count) mismatches")
                            .font(.caption)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(Color(.systemGroupedBackground))

                // Diff detail list
                if !diffs.isEmpty {
                    List(Array(diffs.enumerated()), id: \.offset) { _, diff in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(diff.path).\(diff.property)")
                                .font(.caption)
                                .fontWeight(.medium)
                            if diff.isStringDiff {
                                HStack {
                                    Text("web: \"\(diff.webString ?? "")\"")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                    Text("native: \"\(diff.nativeString ?? "")\"")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                            } else {
                                HStack {
                                    Text("web: \(diff.web, specifier: "%.1f")")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                    Text("native: \(diff.native, specifier: "%.1f")")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                    Text("delta: \(diff.delta, specifier: "%+.1f")")
                                        .font(.caption2)
                                        .foregroundColor(abs(diff.delta) > 5 ? .red : .orange)
                                }
                            }
                        }
                        .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 4, trailing: 12))
                    }
                    .listStyle(.plain)
                    .frame(maxHeight: 200)
                }
            }
        }
        .navigationTitle(fixtureName)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            renderAndCompare()
        }
    }

    private func renderAndCompare() {
        webRenderer.renderFixture(fixtureName) {
            webRenderer.extractLayout { webLayout in
                guard let webLayout = webLayout else {
                    error = "Failed to extract web layout"
                    isComparing = false
                    return
                }

                nativeRenderer.renderFixture(fixtureName) {
                    guard let nativeLayout = nativeRenderer.extractLayout() else {
                        error = "Failed to extract native layout"
                        isComparing = false
                        return
                    }

                    let result = LayoutComparer.compare(web: webLayout, native: nativeLayout)
                    diffs = result
                    elementCount = LayoutComparer.countElements(webLayout)
                    isComparing = false

                    // Print structured results to stdout for log capture
                    printResults(diffs: result, elementCount: elementCount)
                }
            }
        }
    }

    private func printResults(diffs: [LayoutDiff], elementCount: Int) {
        if let data = try? JSONEncoder().encode(diffs),
           let json = String(data: data, encoding: .utf8) {
            print("[LayoutCompare] fixture=\(fixtureName) elements=\(elementCount) diffs=\(diffs.count)")
            print("[LayoutCompare] \(json)")
        }
    }
}
