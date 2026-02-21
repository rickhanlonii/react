# Pixel Diff Comparison for LayoutCompare

## Problem

The LayoutCompare app compares web and native rendering using layout tree extraction (element positions/sizes), but has no way to detect visual pixel-level differences. The Diff tab uses `differenceBlendMode` for visual inspection, but there's no automated pixel count.

## Design

Add a `PixelComparer` utility that snapshots both renderers independently, compares raw pixel buffers, and reports mismatched pixel count/percentage.

### `PixelComparer`

Static utility (mirrors `LayoutComparer` pattern):

1. Snapshot WKWebView via `WKWebView.takeSnapshot(with:)` (async)
2. Snapshot native containerView via `UIGraphicsImageRenderer` (sync)
3. Render both into identically-sized RGBA bitmaps (390x844 @ 1x scale to normalize)
4. Walk pixel buffers, count pixels where any channel differs (no tolerance — exact match)
5. Return `PixelDiffResult { mismatchedPixels: Int, totalPixels: Int, percentage: Double }`

### Integration

- **`FixtureRunner`**: Call `PixelComparer.compare()` after both renderers finish, alongside `LayoutComparer.compare()`. Include pixel result in `FixtureRunner.Result` and `HTTPResultsServer.FixtureResult`.
- **`ComparisonView`**: Run pixel comparison after layout comparison. Display in summary bar alongside layout diffs.
- **Console output**: Add pixel diff info to `[LayoutCompare]` log lines.

### Why independent snapshots (not blend mode)

The `differenceBlendMode` overlay requires both views to be composited in the `OverlayContainerView` in diff mode. During Run All, the overlay isn't in diff mode and manipulating UI state mid-run is fragile. Independent snapshots work regardless of UI state.

### No tolerance

Start with exact pixel matching (zero tolerance). We can add anti-aliasing tolerance later if needed based on how noisy the results are.
