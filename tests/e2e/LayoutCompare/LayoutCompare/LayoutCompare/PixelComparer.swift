import UIKit
import WebKit

struct PixelDiffResult: Codable {
    let mismatchedPixels: Int
    let totalPixels: Int
    let percentage: Double
}

enum PixelComparer {
    /// Compare a WKWebView snapshot against a UIView snapshot, pixel-for-pixel.
    /// Both are rendered into a 390×844 bitmap at 1x scale for consistent comparison.
    ///
    /// When the webView is embedded in a parent layout (e.g. OverlayContainerView),
    /// its frame may differ from the comparison size. We temporarily detach and
    /// resize it to get an accurate full-size snapshot.
    static func compare(
        webView: WKWebView,
        nativeView: UIView,
        size: CGSize = CGSize(width: 390, height: 844),
        completion: @escaping (PixelDiffResult?) -> Void
    ) {
        // If the webView's frame doesn't match the comparison size, temporarily
        // detach it from its superview and resize to prevent the parent layout
        // from interfering with the snapshot.
        let needsDetach = abs(webView.frame.width - size.width) > 1 ||
                          abs(webView.frame.height - size.height) > 1
        let originalSuperview = webView.superview
        let originalFrame = webView.frame
        var originalIndex = 0

        if needsDetach {
            originalIndex = originalSuperview?.subviews.firstIndex(of: webView) ?? 0
            webView.removeFromSuperview()
            webView.frame = CGRect(origin: .zero, size: size)
        }

        // Brief delay for WebKit to adjust visual viewport to new frame size
        let delay: TimeInterval = needsDetach ? 0.15 : 0

        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            let config = WKSnapshotConfiguration()
            config.rect = CGRect(origin: .zero, size: size)
            config.snapshotWidth = NSNumber(value: Int(size.width))

            webView.takeSnapshot(with: config) { webImage, error in
                // Restore webView to its original parent
                if needsDetach, let superview = originalSuperview {
                    superview.insertSubview(webView, at: min(originalIndex, superview.subviews.count))
                    // layoutSubviews will restore the correct frame
                    superview.setNeedsLayout()
                }

                guard let webImage = webImage else {
                    print("[PixelComparer] Web snapshot failed: \(error?.localizedDescription ?? "unknown")")
                    completion(nil)
                    return
                }

                // Snapshot native view at 1x scale using layer.render to capture
                // full content regardless of clipping.
                let format = UIGraphicsImageRendererFormat()
                format.scale = 1.0
                let renderer = UIGraphicsImageRenderer(size: size, format: format)
                let nativeImage = renderer.image { ctx in
                    nativeView.layer.render(in: ctx.cgContext)
                }

                let result = compareImages(webImage, nativeImage, size: size)
                completion(result)
            }
        }
    }

    private static func compareImages(_ imageA: UIImage, _ imageB: UIImage, size: CGSize) -> PixelDiffResult? {
        guard let cgA = imageA.cgImage, let cgB = imageB.cgImage else {
            print("[PixelComparer] Failed to get CGImages")
            return nil
        }

        // Normalize both images to the same pixel dimensions (1x scale)
        let width = Int(size.width)
        let height = Int(size.height)
        let bytesPerPixel = 4
        let bytesPerRow = width * bytesPerPixel
        let totalPixels = width * height
        let totalBytes = height * bytesPerRow

        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

        var bufferA = [UInt8](repeating: 0, count: totalBytes)
        var bufferB = [UInt8](repeating: 0, count: totalBytes)

        guard let ctxA = CGContext(data: &bufferA, width: width, height: height,
                                   bitsPerComponent: 8, bytesPerRow: bytesPerRow,
                                   space: colorSpace, bitmapInfo: bitmapInfo),
              let ctxB = CGContext(data: &bufferB, width: width, height: height,
                                   bitsPerComponent: 8, bytesPerRow: bytesPerRow,
                                   space: colorSpace, bitmapInfo: bitmapInfo)
        else {
            print("[PixelComparer] Failed to create bitmap contexts")
            return nil
        }

        // Draw both images into identically-sized contexts — CGContext.draw
        // scales the source image to fit, normalizing any resolution differences.
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
