# React Fast Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve client component state across edits by using React Fast Refresh instead of full-resetting the JSContext.

**Architecture:** When a client component file changes, webpack rebuilds its chunk. build.js detects which chunks changed and sends a `refresh` message (with chunk filenames and module IDs) over WebSocket. Swift re-fetches and re-evaluates only those chunks in the existing JSContext. JS busts the webpack module cache, re-requires the modules (triggering `$RefreshReg$` calls), and calls `performReactRefresh()`. If anything fails, falls back to the same full reload that Cmd+Shift+R uses.

**Tech Stack:** react-refresh (from `../react/packages/react-refresh`), webpack babel-loader, custom webpack loader, URLSession, JSEngine bridge globals.

**Design doc:** `docs/plans/2026-02-24-fast-refresh-design.md`

---

### Task 1: Install react-refresh dependency

**Files:**
- Modify: `packages/react-dom-native/package.json`

**Step 1: Add react-refresh to dependencies**

Add `react-refresh` pointing to the local React repo's package:

```json
{
  "dependencies": {
    "react": "19.2.4",
    "react-reconciler": "^0.33.0",
    "react-refresh": "file:../../react/packages/react-refresh",
    "react-server": "file:./vendor/react-server"
  }
}
```

**Step 2: Install**

Run: `cd /Users/rickhanlonii/oss/falcon && npm install`
Expected: `react-refresh` resolves and is symlinked into `node_modules/react-refresh`

**Step 3: Verify**

Run: `ls node_modules/react-refresh/runtime.js`
Expected: file exists

**Step 4: Commit**

```bash
git add packages/react-dom-native/package.json package-lock.json
git commit -m "Add react-refresh dependency"
```

---

### Task 2: Create the refresh wrapper loader

**Files:**
- Create: `example/scripts/react-refresh-loader.js`

**Step 1: Write the loader**

This webpack loader wraps each module with per-module `$RefreshReg$` scoping so that family IDs are unique across modules. Applied only in development mode.

```javascript
'use strict';

// Webpack loader that wraps each module with per-module $RefreshReg$/$RefreshSig$
// scoping. This ensures react-refresh family IDs are unique across modules —
// without this, two modules both exporting "Button" would share a family.

var RefreshRuntimePath = require.resolve('react-refresh/runtime');

module.exports = function reactRefreshLoader(source) {
  // Use resourcePath as the unique module identifier for family registration
  var moduleId = this.resourcePath;

  return [
    // Save previous globals (the entry.js no-ops or a parent module's wrapper)
    'var prevRefreshReg = globalThis.$RefreshReg$;',
    'var prevRefreshSig = globalThis.$RefreshSig$;',
    'var RefreshRuntime = require(' + JSON.stringify(RefreshRuntimePath) + ');',
    'globalThis.$RefreshReg$ = function(type, id) {',
    '  RefreshRuntime.register(type, ' + JSON.stringify(moduleId) + ' + " " + id);',
    '};',
    'globalThis.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;',
    '',
    source,
    '',
    '// Restore previous globals',
    'globalThis.$RefreshReg$ = prevRefreshReg;',
    'globalThis.$RefreshSig$ = prevRefreshSig;',
  ].join('\n');
};
```

**Step 2: Commit**

```bash
git add example/scripts/react-refresh-loader.js
git commit -m "Add react-refresh wrapper loader for per-module family scoping"
```

---

### Task 3: Update webpack config

**Files:**
- Modify: `example/webpack.config.js`

**Step 1: Add react-refresh/babel to babel-loader and the refresh wrapper loader**

In the `module.rules` array, update the JS rule to include `react-refresh/babel` in the Babel plugins (dev only), and add the refresh wrapper loader in a chain. The wrapper loader runs AFTER babel (webpack loaders run bottom-to-top, so wrapper goes first in the `use` array):

```javascript
module: {
  rules: [
    {
      test: /\.jsx?$/,
      exclude: /node_modules/,
      use: [
        // Runs second: wraps module with per-module $RefreshReg$ scoping
        isDev && {
          loader: require.resolve('./scripts/react-refresh-loader'),
        },
        // Runs first: transpiles JSX + injects $RefreshReg$/$RefreshSig$ calls
        {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react'],
            plugins: isDev ? [require.resolve('react-refresh/babel')] : [],
          },
        },
      ].filter(Boolean),
    },
  ],
},
```

**Step 2: Verify webpack builds successfully**

Run: `cd /Users/rickhanlonii/oss/falcon/example && node scripts/build.js`
Expected: Build completes without errors. The output chunks should now contain `$RefreshReg$` calls.

**Step 3: Verify $RefreshReg$ is in the output**

Run: `grep -l 'RefreshReg' /Users/rickhanlonii/oss/falcon/example/build/*.js`
Expected: Client component chunk files appear in the output (NOT bundle.js — the wrapper loader excludes node_modules, and the entry module itself should only have the no-op globals).

**Step 4: Commit**

```bash
git add example/webpack.config.js
git commit -m "Add react-refresh babel plugin and wrapper loader to webpack config"
```

---

### Task 4: Initialize react-refresh runtime in entry.js

**Files:**
- Modify: `packages/react-dom-native/src/entry.js`

**Step 1: Add react-refresh runtime initialization and default globals**

Insert BEFORE the `require('react')` line (line 31). The react-refresh runtime must be injected into the global hook before React initializes, so React registers its renderer with react-refresh.

```javascript
// ---------------------------------------------------------------------------
// React Fast Refresh runtime — must initialize before React loads
// ---------------------------------------------------------------------------
if (__DEV__) {
  var RefreshRuntime = require('react-refresh/runtime');
  RefreshRuntime.injectIntoGlobalHook(globalThis);

  // Default no-op globals. The refresh wrapper loader overrides these
  // per-module with scoped versions that include the module path.
  globalThis.$RefreshReg$ = function() {};
  globalThis.$RefreshSig$ = function() { return function(type) { return type; }; };
}
```

**Step 2: Add $$performFastRefresh bridge global**

Insert after the existing bridge globals section (after `$$reportFlightError`, around line 129). This is called by Swift after re-fetching and evaluating changed chunks.

```javascript
// Performs React Fast Refresh after changed chunks have been re-evaluated.
// Busts webpack module cache for the given module IDs, re-requires them
// (triggering $RefreshReg$ calls), and calls performReactRefresh().
// Returns true on success, false to signal that a full reload is needed.
if (__DEV__) {
  globalThis.$$performFastRefresh = function $$performFastRefresh(moduleIds) {
    var RefreshRuntime = require('react-refresh/runtime');
    var cache = __webpack_require__.c;

    // 1. Bust webpack module cache for changed modules
    for (var i = 0; i < moduleIds.length; i++) {
      delete cache[moduleIds[i]];
    }

    // 2. Re-require each module — triggers $RefreshReg$ calls
    for (var i = 0; i < moduleIds.length; i++) {
      try {
        __webpack_require__(moduleIds[i]);
      } catch (e) {
        console.error('[FastRefresh] Module re-require failed:', e);
        return false;
      }
    }

    // 3. Perform the refresh — React updates components in-place
    try {
      RefreshRuntime.performReactRefresh();
      return true;
    } catch (e) {
      console.error('[FastRefresh] performReactRefresh failed:', e);
      return false;
    }
  };
}
```

**Step 3: Verify the bundle builds**

Run: `cd /Users/rickhanlonii/oss/falcon/example && node scripts/build.js`
Expected: Build completes. `bundle.js` contains `$$performFastRefresh` and `RefreshRuntime.injectIntoGlobalHook`.

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/entry.js
git commit -m "Initialize react-refresh runtime and add $$performFastRefresh bridge global"
```

---

### Task 5: Update build.js to send refresh vs reload

**Files:**
- Modify: `example/scripts/build.js`

**Step 1: Replace the webpack watch callback to detect changed chunks**

After a rebuild, inspect `stats.compilation.emittedAssets` to determine what changed. If only client component chunks changed (not `bundle.js`), send a `refresh` message with chunk info. Otherwise send `reload`.

Replace the `compiler.watch` callback:

```javascript
let isFirstBuild = true;
compiler.watch({}, (err, stats) => {
  if (err) { console.error(err); return; }
  if (stats.hasErrors()) { console.error(stats.toString({ errors: true })); return; }

  console.log('Rebuild complete');
  if (isFirstBuild) {
    isFirstBuild = false;
    return;
  }

  // Determine what changed
  var emitted = stats.compilation.emittedAssets;
  if (!emitted || emitted.size === 0) {
    return;
  }

  // If bundle.js was re-emitted, framework code changed — full reload
  if (emitted.has('bundle.js')) {
    notifyMessage({type: 'notify-reload'});
    return;
  }

  // Collect changed chunks with their module IDs
  var changedChunks = [];
  for (var chunk of stats.compilation.chunks) {
    // Check if any of this chunk's files were emitted
    var chunkEmitted = false;
    for (var file of chunk.files) {
      if (emitted.has(file)) {
        chunkEmitted = true;
        break;
      }
    }
    if (!chunkEmitted) continue;

    var modules = [];
    for (var module of stats.compilation.chunkGraph.getChunkModulesIterable(chunk)) {
      if (module.resource) {
        // Use the same identifier webpack uses for __webpack_require__
        modules.push(module.id != null ? String(module.id) : module.identifier());
      }
    }
    if (modules.length > 0) {
      changedChunks.push({file: Array.from(chunk.files)[0], modules: modules});
    }
  }

  if (changedChunks.length > 0) {
    notifyMessage({type: 'notify-refresh', chunks: changedChunks});
  } else {
    notifyMessage({type: 'notify-reload'});
  }
});
```

Also rename `notifyReload()` to `notifyMessage(msg)` so it can send either type:

```javascript
function notifyMessage(msg) {
  if (wsConnected) {
    ws.send(JSON.stringify(msg));
  }
}
```

And update the chokidar watcher to use `notifyMessage`:

```javascript
}).on('all', (event, filePath) => {
  console.log('[watch] Server file ' + event + ': ' + path.relative(path.resolve(__dirname, '..'), filePath));
  notifyMessage({type: 'notify-reload'});
});
```

**Step 2: Verify the watcher runs**

Run: `cd /Users/rickhanlonii/oss/falcon/example && node scripts/build.js --watch`
Expected: "Watching for changes..." prints. Edit a client component file and verify the console logs "Rebuild complete".

**Step 3: Commit**

```bash
git add example/scripts/build.js
git commit -m "Detect changed chunks and send refresh vs reload from build watcher"
```

---

### Task 6: Update start-inspector.js to forward refresh messages

**Files:**
- Modify: `example/scripts/start-inspector.js`

**Step 1: Handle both notify-refresh and notify-reload**

Replace the existing `notify-reload` handler block (lines 47-57) with a handler that forwards both message types:

```javascript
// Webpack watcher sends notify-reload or notify-refresh after a successful rebuild.
// Broadcast the appropriate message to all OTHER connected clients (the app).
if (message.type === 'notify-reload') {
  console.log('[Inspector] Broadcasting reload to ' + (clients.size - 1) + ' app client(s)');
  var reloadMsg = JSON.stringify({type: 'reload'});
  for (var client of clients) {
    if (client !== ws && client.readyState === 1) {
      client.send(reloadMsg);
    }
  }
  return;
}

if (message.type === 'notify-refresh') {
  console.log('[Inspector] Broadcasting refresh (' + message.chunks.length + ' chunk(s)) to ' + (clients.size - 1) + ' app client(s)');
  var refreshMsg = JSON.stringify({type: 'refresh', chunks: message.chunks});
  for (var client of clients) {
    if (client !== ws && client.readyState === 1) {
      client.send(refreshMsg);
    }
  }
  return;
}
```

**Step 2: Commit**

```bash
git add example/scripts/start-inspector.js
git commit -m "Forward refresh messages from build watcher to app clients"
```

---

### Task 7: Add onRefresh callback to HotReloadClient

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift`

**Step 1: Add onRefresh property**

Add after the existing `onReload` property (line 15):

```swift
/// Callback invoked on the main thread when a refresh message arrives
/// with changed chunk info for Fast Refresh.
public var onRefresh: (([[String: Any]]) -> Void)?
```

**Step 2: Handle refresh message type**

Add a new case in the `handleMessage` switch (after the `"reload"` case, around line 94):

```swift
case "refresh":
    let chunks = json["chunks"] as? [[String: Any]] ?? []
    print("[HotReload] Fast refresh with \(chunks.count) chunk(s)")
    self.onRefresh?(chunks)
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift
git commit -m "Add onRefresh callback for Fast Refresh messages"
```

---

### Task 8: Add performChunkRefresh to ReactRuntime and expose chunk re-fetch

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamClient.swift`

**Step 1: Add a static method on FlightStreamClient to re-fetch specific chunks**

Add after the existing `clearModuleCache` static method (around line 64 in FlightStreamClient.swift):

```swift
/// Re-fetches and evaluates specific chunk files. Clears them from the
/// loaded cache first so they're fetched fresh. Called during Fast Refresh.
static func refreshChunks(
    filenames: [String],
    serverOrigin: String,
    engine: JSEngine,
    completion: @escaping (Result<Void, Error>) -> Void
) {
    guard !filenames.isEmpty else {
        completion(.success(()))
        return
    }

    let group = DispatchGroup()
    var firstError: Error?

    for filename in filenames {
        let chunkURL = "\(serverOrigin)/\(filename)"

        // Clear from cache so it's fetched fresh
        loadedChunks.remove(chunkURL)

        group.enter()
        guard let url = URL(string: chunkURL) else {
            group.leave()
            continue
        }

        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, _, error in
            DispatchQueue.main.async {
                defer { group.leave() }

                if let error = error {
                    if firstError == nil { firstError = error }
                    return
                }

                guard let data = data, let code = String(data: data, encoding: .utf8) else {
                    return
                }

                engine.evaluate(code, sourceURL: url)
                loadedChunks.insert(chunkURL)
            }
        }.resume()
    }

    group.notify(queue: .main) {
        if let error = firstError {
            completion(.failure(error))
        } else {
            completion(.success(()))
        }
    }
}
```

**Step 2: Wire onRefresh in ReactRuntime.setupDevToolsConnection()**

Add after the `client.onReload` assignment (around line 477 in ReactRuntime.swift):

```swift
// On refresh message, try Fast Refresh (re-evaluate chunks, preserve state).
// Falls back to full reload if react-refresh can't handle it.
client.onRefresh = { [weak self] chunks in
    self?.performChunkRefresh(chunks: chunks)
}
```

**Step 3: Add performChunkRefresh method to ReactRuntime**

Add after the `performFullReset()` method (before the `resolveBundleURL` section):

```swift
/// Fast Refresh: re-fetch changed chunks, re-require modules, call performReactRefresh().
/// Falls back to full reload if react-refresh can't handle the update.
private func performChunkRefresh(chunks: [[String: Any]]) {
    guard let engine = runtime?.engine,
          let devURL = devBundleURL,
          let scheme = devURL.scheme,
          let host = devURL.host,
          let port = devURL.port else {
        reload(fullReset: true)
        return
    }

    let serverOrigin = "\(scheme)://\(host):\(port)"

    // Collect chunk filenames and module IDs
    var filenames: [String] = []
    var moduleIds: [String] = []
    for chunk in chunks {
        if let file = chunk["file"] as? String {
            filenames.append(file)
        }
        if let modules = chunk["modules"] as? [String] {
            moduleIds.append(contentsOf: modules)
        }
    }

    guard !filenames.isEmpty else {
        reload(fullReset: true)
        return
    }

    print("[ReactRuntime] Fast Refresh: \(filenames.count) chunk(s), \(moduleIds.count) module(s)")

    // 1. Re-fetch and evaluate changed chunks
    FlightStreamClient.refreshChunks(
        filenames: filenames,
        serverOrigin: serverOrigin,
        engine: engine
    ) { [weak self] result in
        guard let self = self else { return }

        switch result {
        case .failure(let error):
            print("[ReactRuntime] Chunk fetch failed: \(error), falling back to full reload")
            self.reload(fullReset: true)

        case .success:
            // 2. Call $$performFastRefresh(moduleIds) — returns true/false
            guard let fn = engine.getGlobalProperty("$$performFastRefresh") else {
                print("[ReactRuntime] $$performFastRefresh not available, falling back to full reload")
                self.reload(fullReset: true)
                return
            }

            let jsModuleIds = moduleIds.map { engine.makeString($0) }
            let jsArray = engine.makeArray(jsModuleIds)
            let result = engine.callFunction(fn, args: [jsArray])

            let success = result.flatMap { engine.toBool($0) } ?? false
            if success {
                print("[ReactRuntime] Fast Refresh complete")
            } else {
                print("[ReactRuntime] Fast Refresh returned false, falling back to full reload")
                self.reload(fullReset: true)
            }
        }
    }
}
```

**Step 4: Update $$performFastRefresh in entry.js to accept an array**

The Swift side passes a JS array of module ID strings. Update the bridge global to iterate the array:

```javascript
globalThis.$$performFastRefresh = function $$performFastRefresh(moduleIds) {
  var RefreshRuntime = require('react-refresh/runtime');
  var cache = __webpack_require__.c;
  var len = moduleIds.length;

  // 1. Bust webpack module cache for changed modules
  for (var i = 0; i < len; i++) {
    delete cache[moduleIds[i]];
  }

  // 2. Re-require each module — triggers $RefreshReg$ calls
  for (var i = 0; i < len; i++) {
    try {
      __webpack_require__(moduleIds[i]);
    } catch (e) {
      console.error('[FastRefresh] Module re-require failed:', e);
      return false;
    }
  }

  // 3. Perform the refresh — React updates components in-place
  try {
    RefreshRuntime.performReactRefresh();
    return true;
  } catch (e) {
    console.error('[FastRefresh] performReactRefresh failed:', e);
    return false;
  }
};
```

Note: This is the same code as written in Task 4, just confirming the array iteration works with the JSArray passed from Swift via `engine.makeArray`.

**Step 5: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Flight/FlightStreamClient.swift \
       packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git commit -m "Add performChunkRefresh for Fast Refresh with full-reload fallback"
```

---

### Task 9: Manual end-to-end test

**Step 1: Start the dev server**

Run: `cd /Users/rickhanlonii/oss/falcon/example && npm run dev`

**Step 2: Build and run the app**

Use `/build-demo` to build and run the Falcon app on the simulator.

**Step 3: Interact to create state**

Navigate to a fixture with a Counter component. Tap the counter a few times to set state (e.g. count = 5).

**Step 4: Edit the client component**

Change something visible in the Counter component file (e.g. change button text from "Count: " to "Value: ").

**Step 5: Verify Fast Refresh**

Expected behavior:
- Terminal shows: `[Inspector] Broadcasting refresh (1 chunk(s)) to 1 app client(s)`
- Xcode console shows: `[HotReload] Fast refresh with 1 chunk(s)`
- Xcode console shows: `[ReactRuntime] Fast Refresh complete`
- The button text updates to "Value: 5" — state (count = 5) is PRESERVED
- NO full reset banner appears

**Step 6: Verify full-reload fallback**

Edit a library file (e.g. `packages/react-dom-native/src/renderer/HostConfig.js`).
Expected: Terminal shows `Broadcasting reload`, app does a full reset (reload banner appears).

Edit a server component file.
Expected: Same full reset behavior.

**Step 7: Commit all remaining changes**

```bash
git add -A
git commit -m "React Fast Refresh for client components"
```
