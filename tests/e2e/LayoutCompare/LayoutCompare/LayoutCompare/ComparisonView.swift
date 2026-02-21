import SwiftUI
import WebKit

struct ComparisonView: View {
    let fixtureName: String
    var webRenderer: WebRendererModel
    var nativeRenderer: NativeRendererModel
    @State private var diffs: [LayoutDiff] = []
    @State private var elementCount: Int = 0
    @State private var isComparing = true
    @State private var error: String?
    @State private var comparisonMode: ComparisonMode = .split
    @State private var overlayOpacity: Double = 0.5
    @State private var showDiffSheet = false
    @State private var pixelDiff: PixelDiffResult?
    private let scrollSync = ScrollSyncCoordinator()

    var body: some View {
        VStack(spacing: 0) {
            // Mode picker
            Picker("Mode", selection: $comparisonMode) {
                ForEach(ComparisonMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 6)

            // Compact summary bar (tappable to show diff sheet)
            Button {
                if !diffs.isEmpty {
                    showDiffSheet = true
                }
            } label: {
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
                        if let px = pixelDiff {
                            Text("0 diffs, \(px.mismatchedPixels) px (\(String(format: "%.1f", px.percentage))%)")
                                .font(.caption)
                        } else {
                            Text("0 diffs")
                                .font(.caption)
                        }
                    } else {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        if let px = pixelDiff {
                            Text("\(diffs.count)/\(elementCount) diffs, \(px.mismatchedPixels) px (\(String(format: "%.1f", px.percentage))%)")
                                .font(.caption)
                        } else {
                            Text("\(diffs.count)/\(elementCount) diffs")
                                .font(.caption)
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption2)
                            .foregroundColor(Color(uiColor: .tertiaryLabel))
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(Color(.systemGroupedBackground))
            }
            .buttonStyle(.plain)
            .disabled(diffs.isEmpty)

            // Unified content area
            OverlayComparisonView(
                webView: webRenderer.webView,
                nativeScrollView: nativeRenderer.scrollView,
                mode: comparisonMode,
                overlayOpacity: overlayOpacity
            )
            .frame(maxHeight: .infinity)

            // Opacity slider (overlay mode only)
            if comparisonMode == .overlay {
                VStack(spacing: 2) {
                    HStack {
                        Text("Web")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Slider(value: $overlayOpacity, in: 0...1)
                        Text("Native")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 6)
                }
                .background(Color(.systemGroupedBackground))
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: comparisonMode)
        .navigationTitle(fixtureName)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showDiffSheet) {
            NavigationView {
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
                .navigationTitle("\(diffs.count) Diffs")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            showDiffSheet = false
                        }
                    }
                }
            }
        }
        .onAppear {
            scrollSync.configure(
                webScrollView: webRenderer.webView.scrollView,
                nativeScrollView: nativeRenderer.scrollView
            )
            renderAndCompare()
        }
    }

    private func renderAndCompare() {
        var webLayout: LayoutNode?
        var nativeLayout: LayoutNode?
        var pending = 2

        func tryCompare() {
            pending -= 1
            guard pending == 0 else { return }

            guard let web = webLayout else {
                error = "Failed to extract web layout"
                isComparing = false
                return
            }
            guard let native = nativeLayout else {
                error = "Failed to extract native layout"
                isComparing = false
                return
            }

            let result = LayoutComparer.compare(web: web, native: native)
            diffs = result
            elementCount = LayoutComparer.countElements(web)
            isComparing = false

            printResults(diffs: result, elementCount: elementCount)

            PixelComparer.compare(webView: webRenderer.webView, nativeView: nativeRenderer.containerView) { pixelResult in
                pixelDiff = pixelResult
            }
        }

        webRenderer.renderFixture(fixtureName) {
            webRenderer.extractLayout { layout in
                webLayout = layout
                tryCompare()
            }
        }

        nativeRenderer.renderFixture(fixtureName) {
            nativeLayout = nativeRenderer.extractLayout()
            tryCompare()
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
