# In-App Screencast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the slow external screenshot approach (`xcrun simctl` + `sips`) with in-app window rendering via `UIGraphicsImageRenderer` for ~10x faster screencast frames.

**Architecture:** The proxy sends `capture-screenshot` to the app via WebSocket. Swift renders the window to JPEG on the main thread using `UIGraphicsImageRenderer`, then sends back `screenshot-data` with base64 image data + device dimensions. The proxy wraps it as a `Page.screencastFrame` CDP event. This eliminates two process spawns, two disk writes, and one disk read per frame.

**Tech Stack:** Swift (UIGraphicsImageRenderer, UIWindow), Node.js (inspector-proxy WebSocket)

---

### Current flow (per frame, ~200-400ms):
```
Proxy: exec('xcrun simctl io booted screenshot')  →  disk write PNG
Proxy: exec('sips --resampleWidth ...')            →  disk write JPEG
Proxy: fs.readFile(...)                            →  disk read
Proxy: base64 encode → send CDP
```

### New flow (per frame, ~10-20ms):
```
Proxy: sendToApp({type: 'capture-screenshot', ...})
Swift: UIGraphicsImageRenderer → JPEG Data → base64
Swift: sendInspectorMessage({type: 'screenshot-data', data: ..., width: ..., height: ..., scale: ...})
Proxy: handleAppMessage → wrap as Page.screencastFrame → send CDP
```

---

### Task 1: Add screenshot capture to Bindings.swift

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Add `captureScreenshot` method**

Add this method to the `Bindings` class near the `dispatchTouchAtWindowPoint` method (around line 1645):

```swift
// MARK: - DevTools Screenshot Capture

/// Captures the key window as a JPEG and sends it back via sendInspectorMessage.
/// Called when the proxy requests a screencast frame.
public func captureScreenshot(maxWidth: Int, quality: CGFloat) {
    guard let window = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first?.windows.first else {
        print("[DevTools Screenshot] No window found")
        return
    }

    let screenScale = window.screen.scale
    let windowSize = window.bounds.size
    let pixelWidth = windowSize.width * screenScale
    let pixelHeight = windowSize.height * screenScale

    // Determine render size — scale down if maxWidth is specified
    var renderSize = windowSize
    var renderScale = screenScale
    if maxWidth > 0 && Int(pixelWidth) > maxWidth {
        let ratio = CGFloat(maxWidth) / pixelWidth
        renderSize = CGSize(width: windowSize.width * ratio, height: windowSize.height * ratio)
        renderScale = screenScale
    }

    let renderer = UIGraphicsImageRenderer(size: renderSize)
    let jpegData = renderer.jpegData(withCompressionQuality: quality) { ctx in
        window.drawHierarchy(in: CGRect(origin: .zero, size: renderSize), afterScreenUpdates: false)
    }

    let base64 = jpegData.base64EncodedString()
    let message = """
    {"type":"screenshot-data","data":"\(base64)","width":\(Int(pixelWidth)),"height":\(Int(pixelHeight)),"scale":\(Int(screenScale))}
    """
    sendInspectorMessage?(message)
}
```

**Step 2: Verify it compiles**

Run: `cd packages/react-dom-native/ios && xcodebuild build -scheme ReactDomNativeKit-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -skipPackagePluginValidation 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "Add captureScreenshot method to Bindings for in-app screencast"
```

---

### Task 2: Route `capture-screenshot` messages in HotReload + ReactRuntime

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`

**Step 1: Add `capture-screenshot` to HotReload message forwarding**

In `HotReload.swift`, update the message type list (line 122):

```swift
// Before:
case "start-tracing", "stop-tracing", "cdp-request", "dispatch-touch":
    self.onInspectorMessage?(text)

// After:
case "start-tracing", "stop-tracing", "cdp-request", "dispatch-touch", "capture-screenshot":
    self.onInspectorMessage?(text)
```

**Step 2: Handle `capture-screenshot` in ReactRuntime**

In `ReactRuntime.swift`, add handling in the `onInspectorMessage` callback, right after the `dispatch-touch` block (around line 677):

```swift
// Handle capture-screenshot from DevTools screencast
if type == "capture-screenshot" {
    let maxWidth = (obj["maxWidth"] as? NSNumber)?.intValue ?? 0
    let quality = (obj["quality"] as? NSNumber)?.doubleValue ?? 0.8
    DispatchQueue.main.async {
        bindings?.captureScreenshot(maxWidth: maxWidth, quality: CGFloat(quality))
    }
    return
}
```

**Step 3: Verify it compiles**

Run: `cd packages/react-dom-native/ios && xcodebuild build -scheme ReactDomNativeKit-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -skipPackagePluginValidation 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift \
        packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git commit -m "Route capture-screenshot messages from proxy to Bindings"
```

---

### Task 3: Replace `captureFrame` in inspector-proxy.js

**Files:**
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Replace the `captureFrame` function and add `handleAppMessage`**

In `createPageDomain`, replace the entire `captureFrame()` function and associated state. The new implementation:

1. Sends `{type: 'capture-screenshot', maxWidth, quality}` to the app via `sendToApp`
2. Handles `screenshot-data` responses in a new `handleAppMessage` method
3. Uses `width`/`height`/`scale` from the response instead of `detectDeviceDimensions`/`sips`
4. Removes `exec`, `fs`, `os`, `tmpScreenshot`, `tmpResized`, `detectDeviceDimensions`

Replace `captureFrame()` with:

```javascript
function captureFrame() {
    if (!screencastActive || !screencastWs || captureInFlight) return;
    captureInFlight = true;
    if (sendToAppRef) {
      sendToAppRef(JSON.stringify({
        type: 'capture-screenshot',
        maxWidth: screencastMaxWidth || 0,
        quality: (screencastQuality || 80) / 100,
      }));
    } else {
      captureInFlight = false;
    }
  }
```

Add `sendToAppRef` capture in the `handle` function (alongside `sendCDPRef = ctx.sendCDP`):

```javascript
sendToAppRef = ctx.sendToApp;
```

Add a `handleAppMessage` method to the returned object:

```javascript
handleAppMessage: function (message) {
    if (message.type !== 'screenshot-data') return;
    captureInFlight = false;
    if (!screencastActive || !screencastWs) return;

    // Cache device dimensions from the app
    if (message.width && message.height && message.scale) {
        devicePixelWidth = message.width;
        devicePixelHeight = message.height;
        deviceScale = message.scale;
    }

    var sessionId = screencastSessionId++;
    if (sendCDPRef && screencastWs.readyState === 1) {
        sendCDPRef(screencastWs, {
            method: 'Page.screencastFrame',
            params: {
                data: message.data,
                metadata: {
                    offsetTop: 0,
                    pageScaleFactor: deviceScale,
                    deviceWidth: devicePixelWidth,
                    deviceHeight: devicePixelHeight,
                    scrollOffsetX: 0,
                    scrollOffsetY: 0,
                    timestamp: Date.now() / 1000,
                },
                sessionId: sessionId,
            },
        });
    }
},
```

Remove these now-unused items from `createPageDomain`:
- `var tmpScreenshot = ...`
- `var tmpResized = ...`
- `function detectDeviceDimensions(...)`
- All references to `exec`, `fs`, `os` (check if other code still uses them — if not, remove the imports too)

**Step 2: Wire `pageDomain.handleAppMessage` into the app message dispatch**

In the `handleAppMessage` function (around line 1812), add:

```javascript
if (pageDomain.handleAppMessage) {
    pageDomain.handleAppMessage(message);
}
```

**Step 3: Remove unused imports if nothing else uses them**

Check if `exec`, `fs`, `os` are used elsewhere in the file. If not, remove:
```javascript
const {exec} = require('child_process');
const fs = require('fs');
const os = require('os');
```

Note: `fs` is likely still used by the preview HTML page endpoint. `path` is used. Check each import before removing.

**Step 4: Restart dev server and test**

Run: `cd example && npm run dev`
Open Chrome DevTools, verify the screencast loads and updates smoothly.

**Step 5: Commit**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "Replace external screenshot with in-app capture for faster screencast"
```

---

### Task 4: Clean up debug logging

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`

**Step 1: Remove debug print statements and red dot overlay**

In `Bindings.swift` `dispatchTouchAtWindowPoint`:
- Remove the red dot debug overlay (the `let dot = UIView(...)` block)
- Remove `print("[DevTools Touch] ..."` statements
- Keep the functional code (window hit test, UIControl handling, React event dispatch)

In `UIKitMutationApplier.swift` `dispatchTapAtPoint`:
- Remove `print("[DevTools Touch] ..."` statements

In `ReactRuntime.swift`:
- Remove `print("[ReactRuntime] dispatch-touch received: ..."` line

**Step 2: Verify it compiles**

Run: `cd packages/react-dom-native/ios && xcodebuild build -scheme ReactDomNativeKit-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -skipPackagePluginValidation 2>&1 | tail -5`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift \
        packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift \
        packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git commit -m "Remove debug logging and red dot overlay from DevTools touch dispatch"
```

---

### Task 5: Rebuild and end-to-end test

**Step 1: Rebuild the iOS app**

Use `/build-demo` to rebuild the app with the new Swift changes.

**Step 2: Restart dev server**

Run: `cd example && npm run dev`

**Step 3: Verify screencast**

1. Open Chrome DevTools via the inspector proxy URL
2. Verify the screencast loads in the DevTools panel
3. Verify frames update when the UI changes (navigate, tap buttons)
4. Verify element highlighting overlays still align correctly
5. Verify touch dispatch still works (click counter buttons, back button in screencast)

**Step 4: Verify performance improvement**

Check the dev server logs for `Page.screencastFrame` timing. Frames should arrive much faster (< 50ms vs previous 200-400ms).
