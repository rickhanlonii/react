# Plan: Event-driven trace screenshots (only capture on visual changes)

## Context

Performance traces show hundreds of screenshots in the filmstrip, most of which are identical frames. This happens because the current implementation uses a continuous ack-based capture loop — every time a screenshot comes back, it immediately requests the next one. Chrome only captures screenshots on compositor commits (when pixels change), so traces show only distinct frames.

The fix: stop the continuous capture loop during tracing and instead only capture screenshots when the app signals a visual change via `dom-updated`.

## Key Insight

Most of the infrastructure already exists:
- Swift already sends `dom-updated` after every `$$completeRoot` commit (line 651 of `Bindings+Registration.swift`)
- The proxy already handles `dom-updated` in the DOM domain (line 1123 of `inspector-proxy.js`)
- The proxy already calls `target.captureTraceScreenshot()` on `dom-updated` (line 1894)
- `captureTraceScreenshot()` already calls `captureOneScreenshot()` (line 1738)

The only problem is the **continuous ack-based loop** in `handleScreenshotData` (line 1642) — it calls `captureOneScreenshot()` after every received frame, creating an endless capture cycle that drowns the event-driven captures. The fix is to remove that loop so screenshots are only triggered by `dom-updated`.

## Changes

### File: `example/scripts/inspector-proxy.js`

**1. Remove the continuous capture loop from `handleScreenshotData`** (line 1642)

Delete the `captureOneScreenshot()` call at the end of `handleScreenshotData`. This is the line that creates the tight loop. Screenshots will now only be captured when triggered by `dom-updated` (via `captureTraceScreenshot`).

```js
// Before:
handleScreenshotData: function (message) {
  if (isCapturingScreenshots && message.type === 'screenshot-data') {
    screenshotBuffer.push({
      data: message.data,
      wallTime: lastCaptureRequestTime || Date.now(),
    });
    log('Screenshots', 'Buffered frame #' + screenshotBuffer.length);
    // Immediately request the next frame (ack-based throttling)
    captureOneScreenshot();           // ← DELETE THIS LINE
  }
},

// After:
handleScreenshotData: function (message) {
  if (isCapturingScreenshots && message.type === 'screenshot-data') {
    screenshotBuffer.push({
      data: message.data,
      wallTime: lastCaptureRequestTime || Date.now(),
    });
    log('Screenshots', 'Buffered frame #' + screenshotBuffer.length);
  }
},
```

**2. Add deduplication as a safety net** (same function)

Even with event-driven capture, rapid successive commits could produce identical frames. Add a simple base64 string comparison to skip duplicates:

```js
handleScreenshotData: function (message) {
  if (isCapturingScreenshots && message.type === 'screenshot-data') {
    var lastFrame = screenshotBuffer.length > 0
      ? screenshotBuffer[screenshotBuffer.length - 1]
      : null;
    if (!lastFrame || lastFrame.data !== message.data) {
      screenshotBuffer.push({
        data: message.data,
        wallTime: lastCaptureRequestTime || Date.now(),
      });
      log('Screenshots', 'Buffered frame #' + screenshotBuffer.length);
    } else {
      log('Screenshots', 'Skipped duplicate frame');
    }
  }
},
```

**3. Keep `screenshotCapture.start()` capturing one initial frame** (line 1601)

The initial `captureOneScreenshot()` call in `start()` should remain — it captures the baseline frame at the start of the trace, before any commits happen.

**4. Keep `captureTraceScreenshot()` as-is** (line 1736)

Already correctly triggers a screenshot on `dom-updated`. No changes needed.

**5. Remove the reconnect auto-restart loop** (lines 1728-1731)

In `setSendToApp`, the reconnect logic also calls `captureOneScreenshot()` which would only capture one frame (fine, no loop), but the `screenshotBuffer = []` discard is still useful. Keep the buffer clear but the single capture is fine.

## What this achieves

- **Before**: Hundreds of screenshots captured in a tight loop, mostly identical
- **After**: Screenshots captured only on: (1) trace start (baseline), and (2) each React commit that changes the UI
- **Deduplication**: Even if two consecutive commits produce the same visual output, only one frame is stored

## Verification

1. Start the demo app and open Chrome DevTools
2. Record a performance trace (click record, interact with the app, stop)
3. Check the filmstrip — should show only distinct frames at commit boundaries, not hundreds of identical ones
4. Check proxy logs for `Buffered frame` / `Skipped duplicate frame` messages
5. Verify the initial frame is captured (baseline at trace start)
6. Verify frames appear after interactions that trigger React commits
