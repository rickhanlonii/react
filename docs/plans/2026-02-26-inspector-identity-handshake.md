# Inspector Identity Handshake Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make each connected app identify itself so `chrome://inspect` shows distinct, stable entries per device/simulator with meaningful display names.

**Architecture:** App sends a `connect` message with identity info on WebSocket open. The proxy becomes multi-target — each connected app gets its own domain handlers, CDP clients, and `/json` entry. Target IDs are derived from simulator UDID (stable across restarts).

**Tech Stack:** Swift (UIKit, Foundation), Node.js (ws, http)

---

### Task 1: Swift — Add identity info to HotReloadClient

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/HotReload.swift`

**Step 1: Add identity properties to HotReloadClient**

Add stored properties and update `init` to accept identity info:

```swift
public class HotReloadClient {
    private var webSocketTask: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)
    private var webSocketURL: URL
    private var isConnected = false
    private var reconnectTimer: Timer?

    // Identity info sent on connect
    private let appName: String
    private let deviceName: String
    private let deviceModel: String
    private let simulatorUDID: String?
    private let platform: String

    /// Callback invoked on the main thread when an inspector message arrives
    /// from the dev server (e.g. start-tracing, stop-tracing).
    public var onInspectorMessage: ((String) -> Void)?

    /// Callback invoked on the main thread when a reload message arrives.
    public var onReload: (() -> Void)?

    /// Callback invoked on the main thread when a refresh message arrives
    /// with changed chunk info for Fast Refresh.
    public var onRefresh: (([[String: Any]]) -> Void)?

    /// Creates a hot reload client.
    ///
    /// - Parameters:
    ///   - host: WebSocket server host (default: "localhost")
    ///   - port: WebSocket server port (default: 8082)
    ///   - appName: App display name (e.g. "Falcon")
    ///   - deviceName: Simulator/device name (e.g. "Falcon Demo")
    ///   - deviceModel: Device model (e.g. "iPhone 16 Pro")
    ///   - simulatorUDID: Simulator UDID if running in simulator
    ///   - platform: "iOS Simulator" or "iOS"
    public init(
        host: String = "localhost",
        port: Int = 8082,
        appName: String = "Falcon",
        deviceName: String = "iOS Device",
        deviceModel: String = "iPhone",
        simulatorUDID: String? = nil,
        platform: String = "iOS"
    ) {
        self.webSocketURL = URL(string: "ws://\(host):\(port)")!
        self.appName = appName
        self.deviceName = deviceName
        self.deviceModel = deviceModel
        self.simulatorUDID = simulatorUDID
        self.platform = platform
    }
```

**Step 2: Send connect message after WebSocket opens**

Update `connect()` to send the identity message immediately after the WebSocket task resumes:

```swift
    public func connect() {
        guard !isConnected else { return }

        let task = session.webSocketTask(with: webSocketURL)
        self.webSocketTask = task
        task.resume()
        isConnected = true

        // Send identity info immediately
        var connectInfo: [String: Any] = [
            "type": "connect",
            "appName": appName,
            "deviceName": deviceName,
            "deviceModel": deviceModel,
            "platform": platform,
        ]
        if let udid = simulatorUDID {
            connectInfo["simulatorUDID"] = udid
        }
        if let jsonData = try? JSONSerialization.data(withJSONObject: connectInfo),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            send(jsonString)
        }

        print("[HotReload] Connected to \(webSocketURL)")
        receiveMessage()
    }
```

**Step 3: Commit**

```
feat: add identity info to HotReloadClient connect message
```

---

### Task 2: Swift — Pass device info from ReactRuntime

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift:629-638`

**Step 1: Update setupDevToolsConnection to pass identity info**

Replace the `HotReloadClient()` construction in `setupDevToolsConnection()`:

```swift
        print("[ReactRuntime] Setting up devtools WebSocket connection")
        let env = ProcessInfo.processInfo.environment
        let simulatorUDID = env["SIMULATOR_UDID"]
        let client = HotReloadClient(
            appName: Bundle.main.infoDictionary?["CFBundleName"] as? String ?? "Falcon",
            deviceName: UIDevice.current.name,
            deviceModel: env["SIMULATOR_DEVICE_NAME"] ?? UIDevice.current.model,
            simulatorUDID: simulatorUDID,
            platform: simulatorUDID != nil ? "iOS Simulator" : "iOS"
        )
        hotReloadClient = client
```

**Step 2: Commit**

```
feat: pass device identity info to HotReloadClient
```

---

### Task 3: JS — Handle connect message in start-inspector.js

**Files:**
- Modify: `example/scripts/start-inspector.js`

**Step 1: Rewrite to support per-client identity and multi-target proxy**

Replace the current implementation. The key change: instead of forwarding all app messages to a single proxy, each app WebSocket waits for a `connect` message, registers as a target, and routes messages to its own target.

```js
'use strict';

// ---------------------------------------------------------------------------
// Standalone inspector proxy launcher
//
// Starts the CDP inspector proxy (port 8976) with its own WebSocket server
// (port 8082) for receiving messages from native apps.
//
// Each app sends a "connect" message with identity info on WebSocket open.
// The proxy creates a separate CDP target per connected app.
// ---------------------------------------------------------------------------

const {createInspectorProxy} = require('./inspector-proxy');
const {WebSocketServer} = require('ws');

const WS_PORT = 8082;
const CDP_PORT = 8976;

// 1. Start the CDP inspector proxy (multi-target)
const proxy = createInspectorProxy({port: CDP_PORT});

// 2. Start a WebSocket server for app communication
const wss = new WebSocketServer({port: WS_PORT});

// Track which app WebSocket belongs to which target
// Map<ws, { targetId: string, identified: boolean }>
const clientInfo = new Map();

// Track tracing state per target so it survives reconnects
const tracingState = new Map(); // targetId -> boolean

wss.on('connection', function onConnection(ws) {
  clientInfo.set(ws, {targetId: null, identified: false});
  console.log('[Inspector] App connected via WebSocket (awaiting identity)');

  ws.on('message', function onMessage(data) {
    var text = data.toString();
    var message;
    try {
      message = JSON.parse(text);
    } catch (e) {
      return;
    }

    var info = clientInfo.get(ws);

    // Handle identity handshake
    if (message.type === 'connect') {
      var targetId = proxy.addTarget(message, function sendToApp(msg) {
        if (ws.readyState === 1) {
          ws.send(msg);
        }
      });
      info.targetId = targetId;
      info.identified = true;
      console.log('[Inspector] App identified: ' + targetId +
        ' (' + message.appName + ' — ' + message.deviceName + ')');

      // If tracing was active for this target, re-send start-tracing
      if (tracingState.get(targetId) && ws.readyState === 1) {
        console.log('[Inspector] Re-sending start-tracing to ' + targetId);
        ws.send(JSON.stringify({type: 'start-tracing'}));
      }
      return;
    }

    // Broadcast reload/refresh to all OTHER app clients (from esbuild watcher)
    if (message.type === 'notify-reload') {
      console.log('[Inspector] Broadcasting reload');
      var reloadMsg = JSON.stringify({type: 'reload'});
      for (var [client] of clientInfo) {
        if (client !== ws && client.readyState === 1) {
          client.send(reloadMsg);
        }
      }
      return;
    }

    if (message.type === 'notify-refresh') {
      console.log('[Inspector] Broadcasting refresh (' + message.chunks.length + ' chunk(s))');
      var refreshMsg = JSON.stringify({type: 'refresh', chunks: message.chunks});
      for (var [client] of clientInfo) {
        if (client !== ws && client.readyState === 1) {
          client.send(refreshMsg);
        }
      }
      return;
    }

    // Forward app messages to the correct target
    if (info.identified && info.targetId) {
      proxy.handleAppMessage(info.targetId, text);
    }
  });

  ws.on('close', function onClose() {
    var info = clientInfo.get(ws);
    if (info && info.targetId) {
      console.log('[Inspector] App disconnected: ' + info.targetId);
      proxy.removeTarget(info.targetId);
    }
    clientInfo.delete(ws);
  });
  ws.on('error', function onError() {
    var info = clientInfo.get(ws);
    if (info && info.targetId) {
      proxy.removeTarget(info.targetId);
    }
    clientInfo.delete(ws);
  });
});

// Track tracing state changes from proxy
proxy.onTracingStateChange = function (targetId, active) {
  tracingState.set(targetId, active);
};

console.log('[Inspector] WebSocket server on ws://localhost:' + WS_PORT);

// Cleanup
process.on('SIGTERM', function () {
  wss.close();
  proxy.close();
  process.exit(0);
});
```

**Step 2: Commit**

```
feat: handle per-app identity in start-inspector
```

---

### Task 4: JS — Refactor inspector-proxy.js to multi-target

This is the largest task. The proxy currently creates domain handlers at startup for a single target. It needs to create them per connected app.

**Files:**
- Modify: `example/scripts/inspector-proxy.js`

**Step 1: Extract a `createTarget` function**

Move the domain handler creation (lines 1583–1634) and per-target state (cdpClients, sendToApp, router) into a `createTarget(targetId, sourceMapResolver)` function that returns a target object:

```js
function createTarget(targetId, sourceMapResolver) {
  var cdpClients = new Set();
  var sendToApp = null;

  function sendCDP(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcastCDP(msg) {
    for (var client of cdpClients) {
      sendCDP(client, msg);
    }
  }

  var tracingDomain = createTracingDomain(targetId);
  var nodeTracingDomain = createNodeTracingDomain(targetId);
  var runtimeDomain = createRuntimeDomain(sourceMapResolver);
  var profilerDomain = createProfilerDomain();
  var pageDomain = createPageDomain(targetId);
  var domDomain = createDOMDomain(function(msg) { broadcastCDP(msg); });
  var logDomain = createLogDomain();
  var networkDomain = createNetworkDomain();
  var debuggerDomain = createDebuggerDomain(sourceMapResolver);
  var cssDomain = createCSSDomain();
  var overlayDomain = createOverlayDomain();

  var router = createDomainRouter([
    tracingDomain, nodeTracingDomain, runtimeDomain, profilerDomain,
    pageDomain, domDomain, logDomain, networkDomain, debuggerDomain,
    createTargetDomain(), createInspectorDomain(), cssDomain, overlayDomain,
    createInputDomain(pageDomain), createEmulationDomain(),
    createHeapProfilerDomain(), createServiceWorkerDomain(),
    createStorageDomain(), createDatabaseDomain(), createIndexedDBDomain(),
    createCacheStorageDomain(), createDOMStorageDomain(),
    createSecurityDomain(), createAuditsDomain(), createPerformanceDomain(),
  ]);

  return {
    cdpClients: cdpClients,
    router: router,
    pageDomain: pageDomain,
    domDomain: domDomain,
    tracingDomain: tracingDomain,
    nodeTracingDomain: nodeTracingDomain,
    runtimeDomain: runtimeDomain,
    profilerDomain: profilerDomain,
    overlayDomain: overlayDomain,
    sendCDP: sendCDP,
    broadcastCDP: broadcastCDP,

    setSendToApp: function (fn) { sendToApp = fn; },
    getSendToApp: function () { return sendToApp; },

    handleAppMessage: function (data) {
      var message;
      try { message = JSON.parse(data); } catch (e) { return; }

      tracingDomain.handleAppMessage(message);
      nodeTracingDomain.handleAppMessage(message);
      if (runtimeDomain.handleAppMessage) runtimeDomain.handleAppMessage(message);
      if (profilerDomain.handleAppMessage) profilerDomain.handleAppMessage(message);
      if (domDomain.handleAppMessage) domDomain.handleAppMessage(message);
      if (overlayDomain.handleAppMessage) overlayDomain.handleAppMessage(message);

      if (message.type === 'cdp-event') {
        var params = message.params;
        if (message.method === 'Runtime.exceptionThrown' && params && params.exceptionDetails) {
          params = Object.assign({}, params, {
            exceptionDetails: sourceMapResolver.resolveExceptionDetails(params.exceptionDetails),
          });
        }
        broadcastCDP({ method: message.method, params: params });
      }

      if (message.type === 'console-message') {
        broadcastCDP({
          method: 'Runtime.consoleAPICalled',
          params: {
            type: message.cdpType || 'log',
            args: message.args || [],
            executionContextId: 1,
            timestamp: message.timestamp || Date.now(),
            stackTrace: sourceMapResolver.resolveStackTrace(message.stackTrace || {callFrames: []}),
          },
        });
        if (message.cdpType === 'error' && logDomain.isEnabled()) {
          broadcastCDP({
            method: 'Log.entryAdded',
            params: {
              entry: {
                source: 'javascript',
                level: 'error',
                text: (message.args || []).map(function (a) { return a.value || a.description || ''; }).join(' '),
                timestamp: message.timestamp || Date.now(),
                stackTrace: sourceMapResolver.resolveStackTrace(message.stackTrace || {callFrames: []}),
              },
            },
          });
        }
      }
    },

    handleCDPMessage: function (ws, message) {
      var ctx = {
        sendToApp: sendToApp,
        sendCDP: sendCDP,
        broadcastCDP: broadcastCDP,
        targetId: targetId,
        cdpClients: cdpClients,
        _currentId: message.id,
      };
      router.route(ws, message, ctx);
    },

    close: function () {
      for (var client of cdpClients) { client.close(); }
      cdpClients.clear();
    },
  };
}
```

**Step 2: Rewrite createInspectorProxy to manage a target map**

```js
function createInspectorProxy(options) {
  var cdpPort = (options && options.port) || DEFAULT_CDP_PORT;

  // Source map resolver (shared across targets)
  var BUILD_DIR = path.resolve(__dirname, '../build');
  var sourceMapResolver = new SourceMapResolver(BUILD_DIR);
  sourceMapResolver.loadAll().then(function () {
    sourceMapResolver.watchForChanges();
  });

  // Connected targets: targetId -> { target, info }
  var targets = new Map();

  // SSE preview clients (shared — preview shows first target's DOM)
  var previewClients = new Set();

  // Callback for tracing state changes
  var onTracingStateChange = null;

  function deriveTargetId(connectInfo) {
    if (connectInfo.simulatorUDID) {
      return 'falcon-' + connectInfo.simulatorUDID;
    }
    // Sanitize device name for URL path
    return 'falcon-' + (connectInfo.deviceName || 'unknown')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  function addTarget(connectInfo, sendToAppFn) {
    var targetId = deriveTargetId(connectInfo);

    // If target already exists (reconnect), clean up old one
    if (targets.has(targetId)) {
      targets.get(targetId).target.close();
    }

    var target = createTarget(targetId, sourceMapResolver);
    target.setSendToApp(sendToAppFn);

    // Wire up preview SSE for this target's DOM updates
    target.domDomain.setOnDomUpdated(function () {
      for (var client of previewClients) {
        client.write('data: refresh\n\n');
      }
      target.pageDomain.onTreeUpdated();
    });

    targets.set(targetId, {
      target: target,
      info: connectInfo,
    });

    log('Proxy', 'Target added: ' + targetId + ' (' +
      connectInfo.appName + ' — ' + connectInfo.deviceName + ')');

    return targetId;
  }

  function removeTarget(targetId) {
    var entry = targets.get(targetId);
    if (entry) {
      entry.target.close();
      targets.delete(targetId);
      log('Proxy', 'Target removed: ' + targetId);
    }
  }

  // ... HTTP server, WebSocket server (see Step 3) ...
```

**Step 3: Update `/json` to return all connected targets**

```js
    if (url === '/json' || url === '/json/list') {
      var pages = [];
      for (var [id, entry] of targets) {
        var info = entry.info;
        var devtoolsUrl = 'chrome-devtools://devtools/bundled/devtools_app.html?experiments=true&ws=127.0.0.1:' +
          cdpPort + '/' + id;
        pages.push({
          description: info.appName || 'Falcon',
          devtoolsFrontendUrl: devtoolsUrl,
          devtoolsFrontendUrlCompat: devtoolsUrl,
          faviconUrl: 'https://reactnative.dev/img/favicon.ico',
          id: id,
          title: (info.appName || 'Falcon') + ' — ' + (info.deviceName || 'Unknown'),
          type: 'page',
          url: (info.deviceModel || 'iOS') + (info.platform === 'iOS Simulator' ? ' (Simulator)' : ''),
          webSocketDebuggerUrl: 'ws://127.0.0.1:' + cdpPort + '/' + id,
        });
      }
      sendJSON(res, pages);
      return;
    }
```

**Step 4: Update CDP WebSocket routing to match target by URL path**

The WebSocket `connection` event needs to extract the target ID from the request URL and route to the correct target:

```js
  var wss = new WebSocketServer({server: httpServer});

  wss.on('connection', function onConnection(ws, req) {
    // Extract target ID from URL path (e.g. /falcon-61F83D8B-...)
    var urlPath = req.url || '/';
    var requestedTargetId = urlPath.slice(1); // remove leading /

    var entry = targets.get(requestedTargetId);
    if (!entry) {
      log('WS', 'No target found for: ' + requestedTargetId);
      ws.close(1008, 'Target not found');
      return;
    }

    var target = entry.target;
    target.cdpClients.add(ws);
    log('WS', 'Chrome DevTools connected to ' + requestedTargetId +
      ' (total clients: ' + target.cdpClients.size + ')');

    ws.on('message', function onMessage(data) {
      var message;
      try { message = JSON.parse(data.toString()); } catch (e) { return; }
      target.handleCDPMessage(ws, message);
    });

    ws.on('close', function onClose() {
      target.cdpClients.delete(ws);
      log('WS', 'Chrome DevTools disconnected from ' + requestedTargetId);
    });

    ws.on('error', function onError(err) {
      log('WS', 'WebSocket error: ' + err.message);
      target.cdpClients.delete(ws);
    });
  });
```

**Step 5: Update the return value**

```js
  return {
    port: cdpPort,
    addTarget: addTarget,
    removeTarget: removeTarget,
    handleAppMessage: function (targetId, data) {
      var entry = targets.get(targetId);
      if (entry) {
        entry.target.handleAppMessage(data);
      }
    },
    set onTracingStateChange(fn) { onTracingStateChange = fn; },
    close: function () {
      for (var [, entry] of targets) { entry.target.close(); }
      targets.clear();
      httpServer.close();
    },
  };
```

**Step 6: Commit**

```
feat: refactor inspector proxy to multi-target architecture
```

---

### Task 5: Update the `/devtools` skill

**Files:**
- Modify: `.claude/skills/devtools/SKILL.md`

**Step 1: Update the skill to use stable target IDs**

Update the Connect section to fetch the target list from `/json` and use the stable target ID in the DevTools URL. The target ID is now deterministic based on simulator UDID.

**Step 2: Commit**

```
docs: update devtools skill for multi-target proxy
```

---

### Task 6: Test end-to-end

**Step 1: Restart the dev server**

Kill the existing dev server and restart it:
```bash
cd /Users/rickhanlonii/oss/falcon/example && npm run dev
```

**Step 2: Verify `/json` shows the connected app**

```bash
curl -s http://localhost:8976/json | python3 -m json.tool
```

Expected: An array with one entry showing the app name, device name, device model, and a stable target ID based on the simulator UDID.

**Step 3: Open DevTools via MCP**

Navigate to the DevTools URL using the target ID from the `/json` response. Take a screenshot to verify it's connected and showing "Falcon — Falcon Demo" with "iPhone 16 Pro (Simulator)".

**Step 4: Verify `chrome://inspect` display**

Navigate to `chrome://inspect/#devices`, take a snapshot, verify the entry shows the correct title and device model.

**Step 5: Commit all work**

```
feat: inspector proxy identity handshake with multi-target support
```
