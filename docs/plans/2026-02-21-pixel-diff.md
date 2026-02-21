# Pixel Diff Comparison Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated pixel-level comparison between web and native renderers in LayoutCompare, reporting mismatched pixel count and percentage alongside existing layout tree diffs.

**Architecture:** A `PixelComparer` static utility snapshots WKWebView (async) and UIView (sync) into identically-sized RGBA bitmaps, walks the pixel buffers counting exact mismatches, and returns a result struct. Integrated into `FixtureRunner` (Run All), `ComparisonView` (single fixture), and `HTTPResultsServer` (curl results).

**Tech Stack:** UIKit (UIGraphicsImageRenderer, CGImage, CGContext), WebKit (WKWebView.takeSnapshot)

---

### Task 1: Add PixelComparer utility

**Files:**
- Create: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/PixelComparer.swift`

**Step 1: Create PixelComparer.swift**

```swift
import UIKit
import WebKit

struct PixelDiffResult: Codable {
    let mismatchedPixels: Int
    let totalPixels: Int
    let percentage: Double
}

enum PixelComparer {
    /// Compare a WKWebView snapshot against a UIView snapshot, pixel-for-pixel.
    /// Both are rendered at 1x scale into a 390×844 bitmap for consistent comparison.
    static func compare(
        webView: WKWebView,
        nativeView: UIView,
        size: CGSize = CGSize(width: 390, height: 844),
        completion: @escaping (PixelDiffResult?) -> Void
    ) {
        // Snapshot the WKWebView (async)
        let config = WKSnapshotConfiguration()
        config.rect = CGRect(origin: .zero, size: size)
        config.snapshotWidth = NSNumber(value: Int(size.width))

        webView.takeSnapshot(with: config) { webImage, error in
            guard let webImage = webImage else {
                print("[PixelComparer] Web snapshot failed: \(error?.localizedDescription ?? "unknown")")
                completion(nil)
                return
            }

            // Snapshot the native view (sync)
            let renderer = UIGraphicsImageRenderer(size: size)
            let nativeImage = renderer.image { ctx in
                nativeView.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
            }

            // Compare pixel buffers
            let result = compareImages(webImage, nativeImage, size: size)
            completion(result)
        }
    }

    private static func compareImages(_ imageA: UIImage, _ imageB: UIImage, size: CGSize) -> PixelDiffResult? {
        let width = Int(size.width)
        let height = Int(size.height)
        let totalPixels = width * height
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        let totalBytes = height * bytesPerRow

        // Create RGBA bitmap contexts and draw both images
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

        var bufferA = [UInt8](repeating: 0, count: totalBytes)
        var bufferB = [UInt8](repeating: 0, count: totalBytes)

        guard let cgA = imageA.cgImage,
              let cgB = imageB.cgImage,
              let ctxA = CGContext(data: &bufferA, width: width, height: height,
                                   bitsPerComponent: 8, bytesPerRow: bytesPerRow,
                                   space: colorSpace, bitmapInfo: bitmapInfo),
              let ctxB = CGContext(data: &bufferB, width: width, height: height,
                                   bitsPerComponent: 8, bytesPerRow: bytesPerRow,
                                   space: colorSpace, bitmapInfo: bitmapInfo)
        else {
            print("[PixelComparer] Failed to create bitmap contexts")
            return nil
        }

        let rect = CGRect(x: 0, y: 0, width: width, height: height)
        ctxA.draw(cgA, in: rect)
        ctxB.draw(cgB, in: rect)

        // Walk pixel buffers, count mismatches (exact match, no tolerance)
        var mismatched = 0
        for i in stride(from: 0, to: totalBytes, by: bytesPerPixel) {
            if bufferA[i] != bufferB[i] ||       // R
               bufferA[i+1] != bufferB[i+1] ||   // G
               bufferA[i+2] != bufferB[i+2] ||   // B
               bufferA[i+3] != bufferB[i+3] {    // A
                mismatched += 1
            }
        }

        let percentage = totalPixels > 0 ? (Double(mismatched) / Double(totalPixels)) * 100.0 : 0
        return PixelDiffResult(
            mismatchedPixels: mismatched,
            totalPixels: totalPixels,
            percentage: percentage
        )
    }
}
```

**Step 2: Build to verify it compiles**

Run: `/build-e2e` (build only, don't need to verify behavior yet)
Expected: Build succeeds

**Step 3: Commit**

```
feat(e2e): add PixelComparer utility for pixel-level visual comparison
```

---

### Task 2: Integrate into FixtureRunner and HTTPResultsServer

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/FixtureListView.swift` (FixtureRunner)
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/HTTPResultsServer.swift`

**Step 1: Add pixelDiff to FixtureResult and ResultsPayload**

In `HTTPResultsServer.swift`, add `pixelDiff` to `FixtureResult`:

```swift
struct FixtureResult: Codable {
    let passed: Bool
    let elements: Int
    let diffs: [LayoutDiff]
    var pixelDiff: PixelDiffResult? = nil
    var error: String? = nil
}
```

**Step 2: Add pixel result to FixtureRunner.Result**

In `FixtureListView.swift`, update the `Result` enum:

```swift
enum Result {
    case running
    case passed(elementCount: Int, pixelDiff: PixelDiffResult?)
    case failed(diffs: [LayoutDiff], elementCount: Int, pixelDiff: PixelDiffResult?)
    case error(String)
}
```

**Step 3: Call PixelComparer in runNext after layout comparison**

In `FixtureListView.swift` `runNext()`, after computing `diffs` and `elementCount` (around line 78), wrap the result-publishing in a `PixelComparer.compare` call:

Replace the block from `let diffs = ...` through `self.runNext(... index + 1 ...)` with:

```swift
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
    self.runNext(fixtures: fixtures, index: index + 1, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
}
```

**Step 4: Do the same in runSingle**

Same pattern — wrap result publishing in `PixelComparer.compare` call after computing diffs.

**Step 5: Update printResults to include pixel diff**

```swift
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
```

**Step 6: Update summaryBar and fixtureRow to handle new Result cases**

Update pattern matches in `summaryBar` (lines 273-291) and `fixtureRow` (lines 319-356) to use the new enum cases with `pixelDiff` parameter. The display stays the same — just update the destructuring:

- `.passed(let elementCount)` → `.passed(let elementCount, _)`
- `.failed(let diffs, let elementCount)` → `.failed(let diffs, let elementCount, _)`

**Step 7: Build and run**

Run: `/build-e2e`
Expected: Build succeeds, Run All works, console output includes pixel counts.

**Step 8: Commit**

```
feat(e2e): integrate pixel diff into FixtureRunner and HTTP results
```

---

### Task 3: Integrate into ComparisonView

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/ComparisonView.swift`

**Step 1: Add pixel diff state**

Add state variable:

```swift
@State private var pixelDiff: PixelDiffResult?
```

**Step 2: Call PixelComparer after layout comparison completes**

In `renderAndCompare()`, after `isComparing = false`, add:

```swift
PixelComparer.compare(webView: webRenderer.webView, nativeView: nativeRenderer.containerView) { result in
    pixelDiff = result
}
```

**Step 3: Display pixel diff in summary bar**

Update the summary bar section (around lines 44-56). After the layout diff count text, add pixel info when available. In the `diffs.isEmpty` case and the `else` (has diffs) case:

When `diffs.isEmpty`:
```swift
Image(systemName: "checkmark.circle.fill")
    .foregroundColor(.green)
if let px = pixelDiff {
    Text("0 diffs, \(px.mismatchedPixels) px (\(String(format: "%.1f", px.percentage))%)")
        .font(.caption)
} else {
    Text("0 diffs")
        .font(.caption)
}
```

When has diffs:
```swift
Image(systemName: "exclamationmark.triangle.fill")
    .foregroundColor(.orange)
if let px = pixelDiff {
    Text("\(diffs.count)/\(elementCount) diffs, \(px.mismatchedPixels) px (\(String(format: "%.1f", px.percentage))%)")
        .font(.caption)
} else {
    Text("\(diffs.count)/\(elementCount) diffs")
        .font(.caption)
}
```

**Step 4: Build and verify**

Run: `/build-e2e`
Expected: Build succeeds, navigating to a fixture shows pixel diff count in summary bar.

**Step 5: Commit**

```
feat(e2e): show pixel diff count in ComparisonView summary bar
```
