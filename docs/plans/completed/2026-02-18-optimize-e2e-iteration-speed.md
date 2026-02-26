# Optimize E2E Iteration Speed

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce Claude's e2e layout comparison iteration cycle from ~65s to ~2s (JS changes) and ~12s (Swift changes).

**Architecture:** Dev server for JS bundles (no Xcode rebuild for JS changes), HTTP results endpoint in the iOS app, auto-rerun on bundle version changes, zero render delays. The dev server (Node.js/Express on :6100) serves JS bundles via esbuild watch mode. The iOS app (HTTP server on :6101) exposes test results as JSON. The app polls the dev server's `/bundle-version` endpoint and auto-reruns fixtures when bundles change.

**Tech Stack:** Node.js (Express, esbuild), Swift (GCDWebServer or raw sockets for HTTP), iOS (UIKit, WKWebKit, JavaScriptCore)

---

## Current State

| Step | Duration | Cause |
|------|----------|-------|
| `node build.js` | 3s | Rebuild JS bundles |
| `build_sim` | 30-60s | Xcode build (even for JS-only changes) |
| Launch + sleep 8s | 8s | Wait for fixture list to load |
| Tap "Run All" | 1s | MCP tool call |
| Sleep 15-20s | 20s | Wait for tests to complete |
| Screenshot + logs | 2s | MCP tool calls to extract results |
| **Total** | **~65s** | 7+ MCP round-trips, hardcoded sleeps |

**After this plan: ~2s for JS changes, ~12s for Swift changes.**

---

### Task 1: Create the e2e dev server

The dev server serves JS bundles and an HTML shell via Express, with esbuild in watch mode for auto-rebuild. Modeled on the existing `example/scripts/dev.js` pattern.

**Files:**
- Create: `tests/e2e/scripts/dev.js`

**Step 1: Create the dev server**

```js
'use strict';

var esbuild = require('esbuild');
var express = require('express');
var path = require('path');
var fs = require('fs');

var E2E_ROOT = path.resolve(__dirname, '..');
var PORT = 6100;

// Track latest bundle version (mtime-based, like example/server/server.js)
var bundleVersion = Date.now();

// Source directories to watch for version changes
var WATCH_DIRS = [
  path.join(E2E_ROOT, 'fixtures'),
  path.join(E2E_ROOT, 'web'),
  path.join(E2E_ROOT, 'native'),
  path.resolve(E2E_ROOT, '../../packages/react-dom-native/src'),
];

function getLatestMtime() {
  var latest = 0;
  for (var dir of WATCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    var files = fs.readdirSync(dir, {recursive: true});
    for (var file of files) {
      var fullPath = path.join(dir, file);
      try {
        var stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.mtimeMs > latest) {
          latest = stat.mtimeMs;
        }
      } catch (e) {}
    }
  }
  return latest;
}

// Shared esbuild options (same as build.js)
var webBuildOptions = {
  entryPoints: [path.resolve(E2E_ROOT, 'web/entry.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  },
  write: false, // keep in memory
};

var nativeBuildOptions = {
  entryPoints: [path.resolve(E2E_ROOT, 'native/entry.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'neutral',
  mainFields: ['module', 'main'],
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  },
  write: false,
};

// In-memory bundle cache
var webBundle = null;
var nativeBundle = null;

async function buildBundles() {
  var webResult = await esbuild.build(webBuildOptions);
  webBundle = webResult.outputFiles[0].text;

  var nativeResult = await esbuild.build(nativeBuildOptions);
  nativeBundle = nativeResult.outputFiles[0].text;

  bundleVersion = Date.now();
  console.log('[dev] Bundles rebuilt (version ' + bundleVersion + ')');
}

async function startServer() {
  // Initial build
  await buildBundles();

  // Start Express server
  var app = express();

  app.get('/web-fixtures.js', function(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(webBundle);
  });

  app.get('/native-fixtures.js', function(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(nativeBundle);
  });

  app.get('/index.html', function(req, res) {
    var html = fs.readFileSync(path.resolve(E2E_ROOT, 'web/index.html'), 'utf8');
    // Rewrite the script src to point to dev server
    html = html.replace('web-fixtures.js', 'http://localhost:' + PORT + '/web-fixtures.js');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html);
  });

  app.get('/bundle-version', function(req, res) {
    res.json({version: bundleVersion});
  });

  app.listen(PORT, function() {
    console.log('[dev] E2E dev server listening on http://localhost:' + PORT);
  });

  // Watch for changes and rebuild
  var chokidar;
  try {
    chokidar = require('chokidar');
  } catch (e) {
    // Fallback: poll for mtime changes
    console.log('[dev] chokidar not available, using mtime polling');
    var lastMtime = getLatestMtime();
    setInterval(async function() {
      var currentMtime = getLatestMtime();
      if (currentMtime > lastMtime) {
        lastMtime = currentMtime;
        try {
          await buildBundles();
        } catch (err) {
          console.error('[dev] Rebuild failed:', err.message);
        }
      }
    }, 1000);
    return;
  }

  var watcher = chokidar.watch(WATCH_DIRS, {
    ignoreInitial: true,
    ignored: /node_modules/,
  });
  watcher.on('change', async function(filePath) {
    console.log('[dev] Changed: ' + path.relative(E2E_ROOT, filePath));
    try {
      await buildBundles();
    } catch (err) {
      console.error('[dev] Rebuild failed:', err.message);
    }
  });
}

startServer().catch(function(err) {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Add npm script**

In `package.json` (root), add to `"scripts"`:
```json
"dev:e2e": "node tests/e2e/scripts/dev.js"
```

**Step 3: Verify**

```bash
npm run dev:e2e
```
Expected: Server starts on port 6100, bundles build, endpoints respond.

```bash
curl http://localhost:6100/bundle-version
curl -s http://localhost:6100/web-fixtures.js | head -1
curl -s http://localhost:6100/native-fixtures.js | head -1
curl -s http://localhost:6100/index.html | head -5
```

**Step 4: Commit**

```bash
git add tests/e2e/scripts/dev.js package.json
git commit -m "feat(e2e): add dev server with esbuild watch for JS bundles"
```

---

### Task 2: Load bundles from dev server in the app

Modify `WebRenderer` and `NativeRenderer` to load bundles from `localhost:6100` instead of `Bundle.main`.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/WebRenderer.swift`
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/NativeRenderer.swift`

**Step 1: Update WebRenderer to load from dev server**

Replace `loadHTML()` in `WebRendererModel`:

```swift
private func loadHTML() {
    let devURL = URL(string: "http://localhost:6100/index.html")!
    webView.load(URLRequest(url: devURL))
    pollForLoad()
}
```

This replaces the current `loadFileURL` call that loads from Bundle.main.

**Step 2: Update NativeRenderer to load from dev server**

In `NativeRendererModel.renderFixture()`, replace the bundle loading from `Bundle.main.url(forResource:)` with an HTTP fetch:

```swift
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
            completion()
        }
    }.resume()
}
```

Note: the 0.3s delay is also removed here (design section 5). The completion is called immediately after rendering since `$$completeRoot` is synchronous.

**Step 3: Also update FixtureNameLoader to load from dev server**

In `FixtureNameLoader.load()`, replace `Bundle.main.url(forResource: "index", withExtension: "html")` with the dev server URL:

```swift
func load(completion: @escaping ([String]) -> Void) {
    let config = WKWebViewConfiguration()
    config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
    let wv = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
    self.webView = wv

    let devURL = URL(string: "http://localhost:6100/index.html")!
    print("[LayoutCompare] Loading index.html from: \(devURL)")
    wv.load(URLRequest(url: devURL))

    pollForFixtureNames(webView: wv, completion: completion)
}
```

**Step 4: Add App Transport Security exception for localhost**

The app needs to allow HTTP (not HTTPS) connections to localhost. In the Xcode project's `Info.plist`, add:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

Check if this already exists; if so, skip. The LayoutCompare Xcode project is at `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj`. The Info.plist may be embedded in the project settings or a separate file.

**Step 5: Build and verify**

Start the dev server first, then build:
```bash
npm run dev:e2e &
```
Then `build_run_sim`. The app should load fixtures from the dev server. Verify by checking logs for `Loading index.html from: http://localhost:6100/index.html`.

**Step 6: Commit**

```bash
git add tests/e2e/LayoutCompare/
git commit -m "feat(e2e): load bundles from dev server instead of app bundle"
```

---

### Task 3: Reduce render delays to zero

Remove the 0.3s artificial delays in both renderers.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/WebRenderer.swift`
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/NativeRenderer.swift` (already done in Task 2)

**Step 1: Remove web render delay**

In `WebRendererModel.renderFixture()`, replace:
```swift
DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
    completion()
}
```
With:
```swift
completion()
```

The native delay was already removed in Task 2.

**Step 2: Build and verify**

`build_run_sim`, tap "Run All", verify all 10 fixtures still pass. The run should complete noticeably faster (~6s saved).

**Step 3: Commit**

```bash
git add tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/WebRenderer.swift
git commit -m "perf(e2e): remove 0.3s render delays — renders are synchronous"
```

---

### Task 4: Add HTTP results server to the app

Create a lightweight HTTP server inside the iOS app that exposes test results as JSON on `localhost:6101`.

**Files:**
- Create: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/HTTPResultsServer.swift`
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/LayoutCompareApp.swift`
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/FixtureListView.swift`

**Step 1: Create HTTPResultsServer**

Use raw `NWListener` (Network framework) — no third-party dependencies needed:

```swift
import Foundation
import Network

/// Lightweight HTTP server that exposes e2e test results on localhost:6101.
/// Claude calls WebFetch on /results to get structured JSON results.
class HTTPResultsServer {
    static let shared = HTTPResultsServer()

    private var listener: NWListener?
    private let port: UInt16 = 6101
    private let queue = DispatchQueue(label: "HTTPResultsServer")

    /// Latest results, updated by FixtureRunner
    var latestResults: ResultsPayload = ResultsPayload(status: "idle", passed: 0, total: 0, fixtures: [:])

    /// Callback triggered when a POST /run-all request is received
    var onRunAllRequested: (() -> Void)?

    /// Callback triggered when a POST /reload-bundles request is received
    var onReloadBundlesRequested: (() -> Void)?

    struct FixtureResult: Codable {
        let passed: Bool
        let elements: Int
        let diffs: [LayoutDiff]
    }

    struct ResultsPayload: Codable {
        var status: String // "idle", "running", "complete"
        var passed: Int
        var total: Int
        var fixtures: [String: FixtureResult]
    }

    func start() {
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
        } catch {
            print("[HTTPResultsServer] Failed to create listener: \(error)")
            return
        }

        listener?.newConnectionHandler = { [weak self] connection in
            self?.handleConnection(connection)
        }

        listener?.stateUpdateHandler = { state in
            switch state {
            case .ready:
                print("[HTTPResultsServer] Listening on http://localhost:\(self.port)")
            case .failed(let error):
                print("[HTTPResultsServer] Failed: \(error)")
            default:
                break
            }
        }

        listener?.start(queue: queue)
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, _, error in
            guard let self = self, let data = data else {
                connection.cancel()
                return
            }

            let request = String(data: data, encoding: .utf8) ?? ""
            let response: String

            if request.hasPrefix("GET /results") {
                let json = (try? JSONEncoder().encode(self.latestResults)) ?? Data()
                response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n" + String(data: json, encoding: .utf8)!
            } else if request.hasPrefix("POST /run-all") {
                DispatchQueue.main.async { self.onRunAllRequested?() }
                response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true}"
            } else if request.hasPrefix("POST /reload-bundles") {
                DispatchQueue.main.async { self.onReloadBundlesRequested?() }
                response = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{\"ok\":true}"
            } else {
                response = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\nNot Found"
            }

            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }

    func stop() {
        listener?.cancel()
    }
}
```

**Step 2: Start the HTTP server in LayoutCompareApp**

Replace `LayoutCompareApp.swift`:

```swift
import SwiftUI

@main
struct LayoutCompareApp: App {
    init() {
        HTTPResultsServer.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            NavigationView {
                FixtureListView()
            }
            .navigationViewStyle(.stack)
        }
    }
}
```

**Step 3: Update FixtureRunner to publish results to HTTPResultsServer**

In `FixtureListView.swift`, modify `FixtureRunner` to update the HTTP server's results:

At the start of `runAll()`, add:
```swift
HTTPResultsServer.shared.latestResults = HTTPResultsServer.ResultsPayload(
    status: "running", passed: 0, total: fixtures.count, fixtures: [:]
)
```

In `runNext()`, after `self.results[name] = .passed(...)` or `.failed(...)`, add:
```swift
// Update HTTP results server
let fixtureResult = HTTPResultsServer.FixtureResult(passed: diffs.isEmpty, elements: elementCount, diffs: diffs)
HTTPResultsServer.shared.latestResults.fixtures[name] = fixtureResult
```

At the end of `runAll()` (when `index >= fixtures.count`), add:
```swift
let passedCount = HTTPResultsServer.shared.latestResults.fixtures.values.filter { $0.passed }.count
HTTPResultsServer.shared.latestResults.status = "complete"
HTTPResultsServer.shared.latestResults.passed = passedCount
```

Wire up the `onRunAllRequested` callback in `FixtureListView.onAppear`:
```swift
HTTPResultsServer.shared.onRunAllRequested = { [self] in
    runner.runAll(fixtures: fixtureNames, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
}
```

**Step 4: Build and verify**

`build_run_sim`, then:
```bash
curl http://localhost:6101/results
```
Expected: `{"status":"idle","passed":0,"total":0,"fixtures":{}}`

Tap "Run All" in the app, then:
```bash
curl http://localhost:6101/results
```
Expected: Full JSON with all fixture results, `status: "complete"`.

**Step 5: Commit**

```bash
git add tests/e2e/LayoutCompare/
git commit -m "feat(e2e): add HTTP results server on :6101 for programmatic access"
```

---

### Task 5: Auto-rerun on bundle version change

The app polls the dev server's `/bundle-version` endpoint and auto-reruns all fixtures when the version changes. Same pattern as `example/Falcon/FalconApp.swift`.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/FixtureListView.swift`

**Step 1: Add version polling to FixtureListView**

Add these properties and methods to `FixtureListView`:

```swift
@State private var lastBundleVersion: Double = 0
@State private var versionTimer: Timer?
```

Add a method:
```swift
private func startBundleVersionPolling() {
    let versionURL = URL(string: "http://localhost:6100/bundle-version")!
    // Fetch initial version
    fetchBundleVersion(from: versionURL) { version in
        lastBundleVersion = version
    }
    // Poll every 2 seconds
    versionTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
        fetchBundleVersion(from: versionURL) { version in
            guard version > 0, version != lastBundleVersion else { return }
            lastBundleVersion = version
            print("[LayoutCompare] Bundle updated (version \(version)), reloading...")
            // Reload native renderer bundle and re-run
            runner.runAll(fixtures: fixtureNames, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
        }
    }
}

private func fetchBundleVersion(from url: URL, completion: @escaping (Double) -> Void) {
    URLSession.shared.dataTask(with: url) { data, _, _ in
        DispatchQueue.main.async {
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let version = json["version"] as? Double else {
                completion(0)
                return
            }
            completion(version)
        }
    }.resume()
}
```

Call `startBundleVersionPolling()` in `.onAppear` after fixtures are loaded:
```swift
.onAppear {
    loader.load { names in
        self.fixtureNames = names
        self.isLoading = false
        startBundleVersionPolling()
    }
}
```

Note: The WKWebView (web renderer) will automatically pick up the new `web-fixtures.js` from the dev server since it re-renders each fixture by calling `renderFixture()` which re-evaluates JS. The native renderer creates a fresh `JSRuntime` per `renderFixture()` call, so it also picks up the new bundle via HTTP fetch.

**Step 2: Build and verify**

1. Start dev server: `npm run dev:e2e`
2. `build_run_sim`
3. Wait for fixtures to load, then tap "Run All" → all pass
4. Edit a fixture file (e.g., change a dimension in `div-basic.jsx`)
5. Wait ~2-3 seconds
6. Check `curl http://localhost:6101/results` — should show updated results from auto-rerun

**Step 3: Commit**

```bash
git add tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/FixtureListView.swift
git commit -m "feat(e2e): auto-rerun fixtures when bundle version changes"
```

---

### Task 6: Add --run-all launch argument support

When launched with `--run-all`, skip the UI and immediately run all fixtures.

**Files:**
- Modify: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/FixtureListView.swift`

**Step 1: Check for --run-all in onAppear**

In `FixtureListView`, modify the `.onAppear` block:

```swift
.onAppear {
    loader.load { names in
        self.fixtureNames = names
        self.isLoading = false
        startBundleVersionPolling()

        // Auto-run if launched with --run-all
        if CommandLine.arguments.contains("--run-all") {
            runner.runAll(fixtures: fixtureNames, webRenderer: webRenderer, nativeRenderer: nativeRenderer)
        }
    }
}
```

The HTTP results server (Task 4) already publishes results as they complete, so Claude can poll `/results` to know when the run finishes.

**Step 2: Build and verify**

Build the app, then launch with args:
```
launch_app_sim with args: ["--run-all"]
```

Check `curl http://localhost:6101/results` after a few seconds — should show complete results without any tapping.

**Step 3: Commit**

```bash
git add tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare/FixtureListView.swift
git commit -m "feat(e2e): support --run-all launch argument for headless test runs"
```

---

### Task 7: Update the /e2e skill

Update the skill documentation to reflect the new optimized workflow.

**Files:**
- Modify: `.claude/skills/e2e/SKILL.md`

**Step 1: Rewrite the skill**

Update the workflows section. The key changes:

**One-time setup:**
```bash
npm run dev:e2e   # start dev server (keep running)
build_run_sim     # build and launch the app
```

**Run all tests (JS-only change):**
1. Edit JS file — esbuild auto-rebuilds, app auto-reruns
2. `WebFetch http://localhost:6101/results` — get JSON results
3. If status is "running", wait 2s and poll again

**Run all tests (Swift change):**
1. `build_run_sim` — rebuild and relaunch
2. Wait 3s for app to start + auto-run
3. `WebFetch http://localhost:6101/results` — get JSON results

**Run all tests (force rerun):**
1. `curl -X POST http://localhost:6101/run-all` via Bash
2. `WebFetch http://localhost:6101/results` — poll for completion

**Step 2: Commit**

```bash
git add .claude/skills/e2e/SKILL.md
git commit -m "docs(e2e): update skill for optimized dev server workflow"
```

---

### Task 8: Final verification

**Step 1: Full clean run**

```bash
npm run dev:e2e &   # start dev server in background
```
Then `build_run_sim` to build and launch the app.

Wait 5s, then:
```bash
curl http://localhost:6101/results
```
Expected: `status: "complete"`, all fixtures passing.

**Step 2: Test JS-only iteration**

Edit `tests/e2e/fixtures/div-basic.jsx` — change a dimension (e.g., `width: 200` → `width: 201`).

Wait 3s, then:
```bash
curl http://localhost:6101/results
```
Expected: Results show the new dimension, div-basic should now fail (width mismatch).

Revert the change. Wait 3s, check again — should pass.

**Step 3: Test Swift iteration**

Make a trivial Swift change, then `build_run_sim`.

Wait 5s, then check results via HTTP — should show all passing.

**Step 4: Commit any remaining changes**

```bash
git add -A tests/e2e/
git commit -m "e2e: optimized iteration speed — dev server + HTTP results + auto-rerun"
```

---

## Risk: WKWebView bundle caching

WKWebView may cache the `web-fixtures.js` bundle loaded from the dev server. If the bundle changes but WKWebView serves a stale cached version, web layout results will be wrong.

**Mitigation:** The dev server already sets `Cache-Control: no-cache`. If this isn't sufficient, add a cache-busting query parameter: `http://localhost:6100/web-fixtures.js?v={bundleVersion}`. The web renderer would need to reload the page (not just re-call renderFixture) when bundles change.

**Fallback:** If caching persists, recreate the WKWebView on bundle change (destroy and recreate `WebRendererModel`).

## Risk: Network.framework HTTP server reliability

`NWListener` is low-level — we're manually parsing HTTP request lines and building response strings. Edge cases (chunked requests, large bodies, concurrent connections) could cause issues.

**Mitigation:** The server only handles 4 simple endpoints with tiny payloads. Claude is the only client. If issues arise, consider using `GCDWebServer` (CocoaPod) or `Swifter` (SPM package) for a more robust HTTP server.
