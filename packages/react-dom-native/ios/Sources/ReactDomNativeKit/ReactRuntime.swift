import UIKit
import ShadowTree
import JSEngine

// ---------------------------------------------------------------------------
// ReactRuntime
//
// Singleton that owns the single JSContext and all shared infrastructure.
// Each Root is a lightweight surface handle that delegates to this runtime.
//
// Usage:
//   ReactRuntime.shared.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
//   let root = createRoot(view)
//   root.render(url: "http://localhost:6000") { ... }
// ---------------------------------------------------------------------------

/// Shared React runtime singleton. Owns the single JSContext, bundle loading,
/// hot reload, and devtools infrastructure.
public class ReactRuntime {

    // MARK: - Singleton

    /// Shared singleton instance.
    public static let shared = ReactRuntime()

    // MARK: - Public Configuration

    /// Optional URL for loading the bundle from a dev server instead of
    /// the package resource. Set this before the first render in DEBUG builds.
    public var devBundleURL: URL?

    /// Optional URL for the dev server (SSR server origin). Used to derive
    /// the WebSocket URL for dev tools connections.
    public var devServerURL: URL?

    /// Whether the bundle has been loaded and evaluated.
    public private(set) var isBundleLoaded: Bool = false

    // MARK: - Internal State

    /// The underlying JS runtime (engine + bindings).
    private var runtime: JSRuntime?

    /// Hot reload client (one WebSocket to dev server).
    #if DEBUG
    private var hotReloadClient: HotReloadClient?
    #endif

    /// Active surfaces: surfaceId -> SurfaceInfo.
    private var activeSurfaces: [Int: SurfaceInfo] = [:]

    /// Active Flight HTTP sessions for CSR rendering. Tracked so we can
    /// cancel them on unmount/reset.
    private var activeFlightSessions: [URLSession] = []

    /// Next surface ID to assign (auto-incrementing).
    private var nextSurfaceId: Int = 1

    /// Whether boot() has been called and completed.
    private var hasBooted: Bool = false

    /// Whether boot is currently in progress.
    private var isBooting: Bool = false

    /// Whether performance tracing was active (survives reload).
    private var tracingActive: Bool = false

    /// Whether performance tracing is currently active (read-only accessor).
    internal var isTracingActive: Bool { tracingActive }

    /// Queued callbacks waiting for boot to complete.
    private var bootCompletionQueue: [((Error?) -> Void)] = []

    /// Whether the last Fast Refresh failed. When true, the next refresh
    /// skips the fast path and does a full reload to get a clean state.
    /// This handles recovery: after a failed refresh causes a full reload,
    /// the reloaded app still has the bad code and the root may be unmounted.
    /// The next refresh (when the user fixes the code) needs a full reload
    /// because there's no mounted root to update in-place.
    private var lastRefreshFailed: Bool = false

    /// Tracks per-surface info for reload recovery.
    struct SurfaceInfo {
        weak var root: Root?
        let container: UIView
        var serverURL: String
    }

    // MARK: - Boot

    /// Boots the runtime: creates JSContext, loads bundle, sets up devtools.
    /// Safe to call multiple times (no-op if already booted).
    ///
    /// - Parameter completion: Called when boot completes or fails.
    public func boot(completion: ((Error?) -> Void)? = nil) {
        // Already booted — immediate callback
        if hasBooted {
            completion?(nil)
            return
        }

        // Boot in progress — queue callback
        if isBooting {
            if let completion = completion {
                bootCompletionQueue.append(completion)
            }
            return
        }

        isBooting = true
        if let completion = completion {
            bootCompletionQueue.append(completion)
        }

        // Create the single JSRuntime
        print("[ReactRuntime] Booting — creating JSContext and loading bundle")
        runtime = JSRuntime()

        // Load and evaluate the framework bundle
        let bundleURL = resolveBundleURL()
        loadBundle(from: bundleURL) { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let source):
                self.executeBundle(source: source, sourceURL: bundleURL)
                self.isBundleLoaded = true
                self.hasBooted = true
                self.isBooting = false
                print("[ReactRuntime] Boot complete — bundle loaded")

                // Set up devtools after bundle is loaded
                self.setupDevToolsConnection()

                // Drain completion queue
                let queue = self.bootCompletionQueue
                self.bootCompletionQueue.removeAll()
                for callback in queue {
                    callback(nil)
                }

            case .failure(let error):
                self.isBooting = false
                print("[ReactRuntime] Failed to load bundle: \(error)")

                let queue = self.bootCompletionQueue
                self.bootCompletionQueue.removeAll()
                for callback in queue {
                    callback(error)
                }
            }
        }
    }

    // MARK: - Surface Management

    /// Returns the Root for a given surfaceId, or nil if not found.
    internal func rootForSurface(_ surfaceId: Int) -> Root? {
        return activeSurfaces[surfaceId]?.root
    }

    /// Assigns a surface ID and stores surface info without registering with
    /// bindings. Used by SSR path where bindings registration happens later
    /// via registerSurfaceForHydration.
    internal func reserveSurface(root: Root, container: UIView) -> Int {
        let surfaceId = nextSurfaceId
        nextSurfaceId += 1
        activeSurfaces[surfaceId] = SurfaceInfo(root: root, container: container, serverURL: "")
        print("[ReactRuntime] Reserved surface \(surfaceId) (total active: \(activeSurfaces.count))")
        return surfaceId
    }

    /// Registers a surface for CSR rendering. Assigns a surfaceId and
    /// registers with bindings (creates scroll view, etc.).
    /// Only call this after boot() has completed.
    internal func registerSurface(root: Root, container: UIView) -> Int {
        let surfaceId = reserveSurface(root: root, container: container)
        runtime?.bindings.registerSurface(surfaceId: surfaceId, rootView: container)
        print("[ReactRuntime] Registered surface \(surfaceId) with bindings (CSR)")
        return surfaceId
    }

    /// Registers a surface for hydration, reusing SSR views.
    internal func registerSurfaceForHydration(
        surfaceId: Int,
        rootView: UIView,
        ssrTree: [ShadowNodeWrapper],
        ssrViewRegistry: ViewRegistry
    ) {
        runtime?.bindings.registerSurfaceForHydration(
            surfaceId: surfaceId,
            rootView: rootView,
            ssrTree: ssrTree,
            ssrViewRegistry: ssrViewRegistry
        )
    }

    /// Unregisters a surface when a Root is unmounted.
    internal func unregisterSurface(surfaceId: Int) {
        activeSurfaces.removeValue(forKey: surfaceId)
        runtime?.bindings.unregisterSurface(surfaceId: surfaceId)
        print("[ReactRuntime] Unregistered surface \(surfaceId) (total active: \(activeSurfaces.count))")
    }

    // MARK: - Rendering

    /// Triggers CSR rendering for a surface. Bootstraps the Flight data receiver,
    /// starts the React render pipeline, then streams Flight data from the server
    /// through self.__next_f into a ReadableStream consumed by the standard
    /// react-server-dom-webpack/client.
    internal func renderSurface(surfaceId: Int, serverURL: String) {
        guard let engine = runtime?.engine else { return }
        activeSurfaces[surfaceId]?.serverURL = serverURL

        // 1. Bootstrap the Flight data receiver
        engine.evaluate("self.__next_f.push([0])")

        // 2. Set up the React render pipeline
        engine.evaluate("globalThis.__REACT_DOM_NATIVE__.renderFromStream(\(surfaceId))")

        // 3. Start the Flight HTTP stream — push data into self.__next_f
        startFlightHTTPStream(serverURL: serverURL, engine: engine)
    }

    /// Triggers hydration for a surface. The Flight data has already been pushed
    /// into self.__next_f via JS instructions from the SSR stream (replayed
    /// from ssrJavaScriptBuffer during boot). This just creates the ReadableStream
    /// and starts hydration.
    internal func hydrateSurface(surfaceId: Int) {
        guard let engine = runtime?.engine else { return }

        // The Flight data is already in the __next_f buffer (from replayed JS
        // instructions). Just start hydration — it creates the ReadableStream
        // and consumes the buffered data.
        engine.evaluate("globalThis.__REACT_DOM_NATIVE__.hydrateFromStream(\(surfaceId))")
    }

    /// Starts a Flight HTTP stream for CSR. Fetches the Flight stream from the
    /// server and pushes each chunk into self.__next_f.
    private func startFlightHTTPStream(serverURL: String, engine: JSEngine) {
        guard let url = URL(string: serverURL) else {
            print("[ReactRuntime] Invalid server URL: \(serverURL)")
            return
        }

        let delegate = FlightHTTPStreamDelegate(engine: engine)
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: .main)
        activeFlightSessions.append(session)

        var request = URLRequest(url: url)
        request.setValue("text/x-component", forHTTPHeaderField: "Accept")
        session.dataTask(with: request).resume()
    }

    /// Cancels all active Flight HTTP sessions (used during reset/unmount).
    private func cancelAllFlightSessions() {
        for session in activeFlightSessions {
            session.invalidateAndCancel()
        }
        activeFlightSessions.removeAll()
    }

    // MARK: - Bindings Access

    /// Access to the bindings for SSR wiring (hydration callbacks, SSR tree registration, etc.)
    internal var bindings: Bindings? {
        runtime?.bindings
    }

    /// Access to the JS engine for direct evaluation.
    internal var engine: JSEngine? {
        runtime?.engine
    }

    /// Evaluate arbitrary JavaScript code in the JS engine.
    /// Used by the SSR client to execute inline scripts (["JS", code] instructions).
    internal func evaluateScript(_ code: String) {
        runtime?.engine.evaluate(code)
    }

    // MARK: - Viewport

    /// Syncs tracing enabled state to all active Renderers.
    internal func syncTracingToRenderers(enabled: Bool) {
        for (_, info) in activeSurfaces {
            info.root?.renderer.tracingEnabled = enabled
        }
    }

    /// Updates the viewport size for the JS runtime.
    internal func updateViewportSize(width: CGFloat, height: CGFloat) {
        runtime?.updateViewportSize(width: width, height: height)
    }

    // MARK: - Testing

    /// Test-only: Boots the runtime with a pre-loaded bundle string.
    /// Skips URL resolution and DevTools setup.
    internal func bootWithBundle(_ source: String) {
        guard !hasBooted else { return }

        runtime = JSRuntime()
        runtime?.engine.evaluate(source)
        isBundleLoaded = true
        hasBooted = true
        isBooting = false
    }

    /// Test-only: Resets all state between tests.
    internal func resetForTesting() {
        // Cancel all active Flight HTTP sessions
        cancelAllFlightSessions()

        // Disconnect hot reload
        #if DEBUG
        hotReloadClient?.disconnect()
        hotReloadClient = nil
        #endif

        // Unregister all surfaces
        for (surfaceId, _) in activeSurfaces {
            runtime?.bindings.unregisterSurface(surfaceId: surfaceId)
        }
        activeSurfaces.removeAll()

        // Destroy runtime
        runtime = nil
        isBundleLoaded = false
        hasBooted = false
        isBooting = false
        nextSurfaceId = 1
        bootCompletionQueue.removeAll()
        tracingActive = false
        lastRefreshFailed = false
        devServerURL = nil
    }

    // MARK: - DevTools Actions

    /// Sends an "open-devtools" message to the inspector proxy, which opens
    /// Chrome DevTools connected to this app's JSC runtime.
    public func openDevTools() {
        #if DEBUG
        let message: [String: Any] = ["type": "open-devtools"]
        if let data = try? JSONSerialization.data(withJSONObject: message),
           let json = String(data: data, encoding: .utf8) {
            hotReloadClient?.send(json)
        }
        #endif
    }

    // MARK: - Reload

    /// Clears all active surfaces (removes views) without destroying the runtime.
    /// Used by DevTools for Page.navigate(about:blank) to visually clear the screen
    /// before a subsequent Page.reload triggers the actual full reset.
    public func clearAllSurfaces() {
        for (_, info) in activeSurfaces {
            info.container.subviews.forEach { $0.removeFromSuperview() }
        }
    }

    /// Reloads the JS bundle. Called by HotReloadClient on "reload" message.
    ///
    /// - Parameter fullReset: If true, destroys and recreates the JSContext.
    ///   If false (default), re-evaluates the bundle in the existing context
    ///   for fast refresh.
    public func reload(fullReset: Bool = false) {
        guard hasBooted else { return }

        if fullReset {
            print("[ReactRuntime] Reload (full reset) — \(activeSurfaces.count) active surface(s)")
            performFullReset()
        } else {
            print("[ReactRuntime] Reload (fast refresh)")
            performFastRefresh()
        }
    }

    /// Fast refresh: re-evaluate the bundle in the existing JSContext.
    /// React's fast refresh mechanism handles component updates.
    /// All active surfaces stay mounted.
    private func performFastRefresh() {
        #if DEBUG
        ReloadBanner.shared.show()
        #endif
        let bundleURL = resolveBundleURL()
        loadBundle(from: bundleURL) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let source):
                self.executeBundle(source: source, sourceURL: bundleURL)
                #if DEBUG
                ReloadBanner.shared.dismiss()
                #endif
                print("[ReactRuntime] Fast refresh complete")
            case .failure(let error):
                #if DEBUG
                ReloadBanner.shared.dismiss()
                #endif
                print("[ReactRuntime] Fast refresh failed: \(error)")
            }
        }
    }

    /// Fast Refresh: re-fetch changed chunks via JS, re-require modules, call performReactRefresh().
    /// Uses $$refreshChunks (which loads chunks via the document polyfill) then $$performFastRefresh.
    /// Falls back to full reload if react-refresh can't handle the update.
    private func performChunkRefresh(chunks: [[String: Any]]) {
        // If the previous refresh failed (render error, etc.), the app may be
        // in a broken state (unmounted root). Skip fast refresh and do a full
        // reload so the fixed code gets a clean start.
        if lastRefreshFailed {
            print("[ReactRuntime] Previous refresh failed — forcing full reload for recovery")
            lastRefreshFailed = false
            reload(fullReset: true)
            return
        }

        guard let engine = runtime?.engine else {
            reload(fullReset: true)
            return
        }

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

        #if DEBUG
        ReloadBanner.shared.show(mode: .fastRefresh)
        #endif

        // Check if $$refreshChunks is available
        guard let refreshFn = engine.getGlobalProperty("$$refreshChunks"),
              !engine.isNull(refreshFn), !engine.isUndefined(refreshFn) else {
            print("[ReactRuntime] $$refreshChunks not available, falling back to full reload")
            self.reload(fullReset: true)
            return
        }

        // Build JS call: $$refreshChunks(filenames).then(() => $$performFastRefresh(moduleIds))
        let filenamesJSON = filenames.map { "\"\($0)\"" }.joined(separator: ",")
        let moduleIdsJSON = moduleIds.map { "\"\($0)\"" }.joined(separator: ",")
        let js = """
        (function() {
            globalThis.$$refreshChunks([\(filenamesJSON)]).then(function() {
                var ok = globalThis.$$performFastRefresh([\(moduleIdsJSON)]);
                if (!ok) globalThis.$$fastRefreshFailed = true;
            }, function(err) {
                console.error('[FastRefresh] Chunk load failed:', err);
                globalThis.$$fastRefreshFailed = true;
            });
        })()
        """
        engine.evaluate(js)

        // The refresh is async (Promise-based). Schedule a check after a short delay
        // to see if it succeeded or we need a full reload.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self = self, let engine = self.runtime?.engine else { return }

            // Check if the async refresh reported failure
            if let failedRef = engine.getGlobalProperty("$$fastRefreshFailed"),
               engine.toBool(failedRef) == true {
                engine.evaluate("delete globalThis.$$fastRefreshFailed")
                print("[ReactRuntime] Fast Refresh failed, falling back to full reload")
                self.lastRefreshFailed = true
                self.reload(fullReset: true)
            } else {
                print("[ReactRuntime] Fast Refresh complete")
                self.lastRefreshFailed = false
                #if DEBUG
                ReloadBanner.shared.dismiss()
                #endif
            }
        }
    }

    /// Full reset: destroy JSContext, create new one, re-render all surfaces.
    private func performFullReset() {
        // Check if any surface uses SSR before snapshotting
        let isServerRefresh = activeSurfaces.values.contains { $0.root?.isSSR == true }
        #if DEBUG
        ReloadBanner.shared.show(serverRefresh: isServerRefresh)
        #endif

        // 1. Snapshot active surfaces
        let snapshot = activeSurfaces

        // 2. Disconnect HotReloadClient
        #if DEBUG
        hotReloadClient?.disconnect()
        hotReloadClient = nil
        #endif

        // 3. Destroy old runtime
        cancelAllFlightSessions()
        runtime = nil
        isBundleLoaded = false
        hasBooted = false
        activeSurfaces.removeAll()

        // 4. Clear LogBox errors from previous session
        #if DEBUG
        LogBox.shared.clearAll()
        #endif

        // 4. Create new runtime
        runtime = JSRuntime()

        // 5. Load + evaluate bundle
        let bundleURL = resolveBundleURL()
        loadBundle(from: bundleURL) { [weak self] result in
            guard let self = self else { return }

            switch result {
            case .success(let source):
                self.executeBundle(source: source, sourceURL: bundleURL)
                self.isBundleLoaded = true
                self.hasBooted = true

                // 6. Reconnect HotReloadClient
                self.setupDevToolsConnection()

                // 7. If tracing was active before reload, start the tracer
                // immediately so the initial render is captured. The WebSocket
                // reconnect would re-send start-tracing, but that arrives too
                // late (after rendering completes).
                if self.tracingActive {
                    if let jsRuntime = self.runtime {
                        jsRuntime.tracer.startTracing()
                        jsRuntime.bindings.nativeTracingEnabled = true
                        jsRuntime.bindings.pushPendingSSRCommitTimingsToJS()
                    }
                }

                // 8. Let each Root re-render using its original mode (CSR or SSR+hydration)
                for (_, info) in snapshot {
                    guard let root = info.root else { continue }
                    root.rerender()
                }

                print("[ReactRuntime] Full reset complete, re-rendered \(snapshot.count) surface(s)")
                #if DEBUG
                ReloadBanner.shared.dismiss()
                #endif

            case .failure(let error):
                print("[ReactRuntime] Full reset failed to load bundle: \(error)")
                #if DEBUG
                ReloadBanner.shared.dismiss()
                #endif
            }
        }
    }

    // MARK: - Bundle Loading (Private)

    /// Resolves the bundle URL: dev server override (DEBUG) or package resource.
    private func resolveBundleURL() -> URL {
        #if DEBUG
        if let devURL = devBundleURL {
            print("[ReactRuntime] DEBUG — loading bundle from \(devURL)")
            return devURL
        }
        #endif

        guard let resourceURL = Bundle.module.url(
            forResource: "bundle",
            withExtension: "js"
        ) else {
            fatalError("[ReactRuntime] bundle.js not found in package resources. Run `npm run build` from the example directory.")
        }
        return resourceURL
    }

    private func loadBundle(from url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        if url.isFileURL {
            loadLocalBundle(from: url, completion: completion)
        } else {
            downloadRemoteBundle(from: url, completion: completion)
        }
    }

    private func loadLocalBundle(from url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        do {
            let source = try String(contentsOf: url, encoding: .utf8)
            completion(.success(source))
        } catch {
            completion(.failure(RootError.bundleLoadFailed(error)))
        }
    }

    private func downloadRemoteBundle(from url: URL, completion: @escaping (Result<String, Error>) -> Void) {
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    completion(.failure(RootError.downloadFailed(error)))
                    return
                }

                guard let data = data,
                      let source = String(data: data, encoding: .utf8) else {
                    completion(.failure(RootError.invalidBundleData))
                    return
                }

                completion(.success(source))
            }
        }.resume()
    }

    private func executeBundle(source: String, sourceURL: URL) {
        runtime?.engine.evaluate(source, sourceURL: sourceURL)

        // Set document.baseURI to the bundle origin so that relative script
        // URLs (e.g., "/client5.js" from webpack chunk loading) are resolved
        // correctly by the document polyfill.
        if let scheme = sourceURL.scheme, let host = sourceURL.host {
            let port = sourceURL.port.map { ":\($0)" } ?? ""
            let origin = "\(scheme)://\(host)\(port)"
            runtime?.engine.evaluate("document.baseURI = '\(origin)';")
        }
    }

    // MARK: - DevTools (Private)

    /// Returns the device marketing name (e.g. "iPhone 16 Pro") from the
    /// simulator model identifier, falling back to UIDevice.current.model.
    private static func deviceModelName(env: [String: String]) -> String {
        guard let modelId = env["SIMULATOR_MODEL_IDENTIFIER"] else {
            return UIDevice.current.model
        }
        let models: [String: String] = [
            // iPhone 17 series
            "iPhone18,1": "iPhone 17 Pro",
            // iPhone 16 series
            "iPhone17,1": "iPhone 16 Pro",
            "iPhone17,2": "iPhone 16 Pro Max",
            "iPhone17,3": "iPhone 16",
            "iPhone17,4": "iPhone 16 Plus",
            "iPhone17,5": "iPhone 16e",
            // iPhone 15 series
            "iPhone16,1": "iPhone 15 Pro",
            "iPhone16,2": "iPhone 15 Pro Max",
            "iPhone15,4": "iPhone 15",
            "iPhone15,5": "iPhone 15 Plus",
            // iPad Pro (M4)
            "iPad16,3": "iPad Pro 11-inch (M4)",
            "iPad16,4": "iPad Pro 11-inch (M4)",
            "iPad16,5": "iPad Pro 13-inch (M4)",
            "iPad16,6": "iPad Pro 13-inch (M4)",
        ]
        return models[modelId] ?? modelId
    }

    /// Sets up the devtools WebSocket connection for tracing/inspector support.
    private func setupDevToolsConnection() {
        #if DEBUG
        guard let bindings = runtime?.bindings else { return }
        guard let devURL = devServerURL else { return }

        // Disconnect previous client if any
        hotReloadClient?.disconnect()

        print("[ReactRuntime] Setting up devtools WebSocket connection")
        let env = ProcessInfo.processInfo.environment
        let simulatorUDID = env["SIMULATOR_UDID"]

        // Derive WS URL from devServerURL
        let wsScheme = devURL.scheme == "https" ? "wss" : "ws"
        let host = devURL.host ?? "localhost"
        let port = devURL.port.map { ":\($0)" } ?? ""
        let wsURL = URL(string: "\(wsScheme)://\(host)\(port)/__dev")!

        let client = HotReloadClient(
            url: wsURL,
            appName: Bundle.main.infoDictionary?["CFBundleName"] as? String ?? "Falcon",
            deviceName: UIDevice.current.name,
            deviceModel: Self.deviceModelName(env: env),
            simulatorUDID: simulatorUDID,
            platform: simulatorUDID != nil ? "iOS Simulator" : "iOS"
        )
        hotReloadClient = client

        // On clear message, clear all surface views (DevTools about:blank)
        client.onClear = { [weak self] in
            self?.clearAllSurfaces()
        }

        // On reload message, do a full reset (since we can't do
        // in-place fast refresh without knowing individual surface URLs)
        client.onReload = { [weak self] in
            print("[ReactRuntime] onReload triggered — performing full reset")
            self?.reload(fullReset: true)
        }

        // On refresh message, try Fast Refresh (re-evaluate chunks, preserve state).
        // Falls back to full reload if react-refresh can't handle it.
        client.onRefresh = { [weak self] chunks in
            print("[ReactRuntime] onRefresh triggered — \(chunks.count) chunk(s)")
            self?.performChunkRefresh(chunks: chunks)
        }

        // JS -> dev server: Swift CDP dispatch and tracing use this callback
        bindings.sendInspectorMessage = { [weak client] data in
            client?.send(data)
        }

        // Dev server -> JS: tracing commands forwarded to $$onInspectorMessage
        client.onInspectorMessage = { [weak self, weak bindings] json in
            // Track tracing state so it survives reload
            if let data = json.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let type = obj["type"] as? String {
                if type == "start-tracing" {
                    self?.tracingActive = true
                    self?.syncTracingToRenderers(enabled: true)
                }
                if type == "stop-tracing" {
                    self?.tracingActive = false
                    self?.syncTracingToRenderers(enabled: false)
                }

                // Handle dispatch-touch from DevTools screencast
                if type == "dispatch-touch" {
                    let x = (obj["x"] as? NSNumber)?.doubleValue ?? 0
                    let y = (obj["y"] as? NSNumber)?.doubleValue ?? 0
                    DispatchQueue.main.async {
                        bindings?.eventDispatcher.dispatchTouchAtWindowPoint(x: x, y: y)
                    }
                    return
                }

                // Handle capture-screenshot from DevTools screencast
                if type == "capture-screenshot" {
                    let maxWidth = (obj["maxWidth"] as? NSNumber)?.intValue ?? 0
                    let quality = (obj["quality"] as? NSNumber)?.doubleValue ?? 0.8
                    DispatchQueue.main.async {
                        bindings?.captureScreenshot(maxWidth: maxWidth, quality: CGFloat(quality))
                    }
                    return
                }

                // Handle enable/disable commit-level screenshots for tracing.
                // When enabled, a screenshot is captured synchronously at the end
                // of each $$completeRoot commit, ensuring intermediate visual states
                // are captured before the next commit overwrites them.
                if type == "enable-commit-screenshots" {
                    let maxWidth = (obj["maxWidth"] as? NSNumber)?.intValue ?? 300
                    let quality = (obj["quality"] as? NSNumber)?.doubleValue ?? 0.4
                    DispatchQueue.main.async {
                        bindings?.commitScreenshotsEnabled = true
                        bindings?.commitScreenshotMaxWidth = maxWidth
                        bindings?.commitScreenshotQuality = CGFloat(quality)
                    }
                    return
                }
                if type == "disable-commit-screenshots" {
                    DispatchQueue.main.async {
                        bindings?.commitScreenshotsEnabled = false
                    }
                    return
                }
            }
            bindings?.deliverInspectorMessage(json)
        }

        client.connect()

        // Connect LogBox CDP forwarding to the WebSocket
        LogBox.shared.sendCDP = { [weak client] json in
            client?.send(json)
        }

        // Register React error callback bridge globals
        guard let engine = runtime?.engine else { return }

        engine.setGlobalFunction("$$nativeOnUncaughtError") { [weak engine] args in
            let message = args.first.flatMap { engine?.toString($0) } ?? "Unknown error"
            let stack = args.count > 1 ? engine?.toString(args[1]) : nil
            print("[JS ERROR] Uncaught: \(message)")
            if let stack = stack { print("[JS ERROR] Stack: \(stack)") }
            LogBox.shared.addEntry(
                level: .fatalError,
                source: .rendererUncaught,
                message: message,
                stack: stack
            )
            LogBox.shared.forwardExceptionToCDP(message: message, stack: stack)
            return nil
        }

        engine.setGlobalFunction("$$nativeOnCaughtError") { [weak engine] args in
            let message = args.first.flatMap { engine?.toString($0) } ?? "Unknown error"
            let stack = args.count > 1 ? engine?.toString(args[1]) : nil
            print("[JS ERROR] Caught: \(message)")
            if let stack = stack { print("[JS ERROR] Stack: \(stack)") }
            LogBox.shared.addEntry(
                level: .error,
                source: .rendererCaught,
                message: message,
                stack: stack
            )
            return nil
        }

        engine.setGlobalFunction("$$nativeOnRecoverableError") { [weak engine] args in
            let message = args.first.flatMap { engine?.toString($0) } ?? "Unknown error"
            let stack = args.count > 1 ? engine?.toString(args[1]) : nil
            print("[JS WARN] Recoverable: \(message)")
            if let stack = stack { print("[JS WARN] Stack: \(stack)") }
            LogBox.shared.addEntry(
                level: .warning,
                source: .rendererRecoverable,
                message: message,
                stack: stack
            )
            return nil
        }

        // Install Cmd+Shift+R keyboard shortcut for manual reload
        DevKeyCommands.install()
        #endif
    }

}

// ---------------------------------------------------------------------------
// FlightHTTPStreamDelegate
//
// URLSession data delegate that feeds streaming Flight HTTP response data
// into the JS Flight data receiver (self.__next_f). Each data chunk is
// pushed via self.__next_f.push([1, data]) and the stream is closed when
// the HTTP response completes.
// ---------------------------------------------------------------------------

private class FlightHTTPStreamDelegate: NSObject, URLSessionDataDelegate {
    private weak var engine: JSEngine?

    init(engine: JSEngine) {
        self.engine = engine
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let engine = engine, let text = String(data: data, encoding: .utf8) else { return }
        // JSON-escape the text by wrapping in an array, serializing, and stripping the outer [].
        // JSONSerialization requires NSArray/NSDictionary as top-level objects — bare strings throw
        // an NSInvalidArgumentException that Swift's try? can't catch.
        if let jsonData = try? JSONSerialization.data(withJSONObject: [text]),
           let jsonArray = String(data: jsonData, encoding: .utf8) {
            // jsonArray is like ["escaped text"] — strip the leading [ and trailing ]
            let jsonString = String(jsonArray.dropFirst().dropLast())
            engine.evaluate("self.__next_f.push([1,\(jsonString)])")
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let engine = engine else { return }
        if let error = error {
            print("[Flight] Stream error: \(error)")
        }
        engine.evaluate("globalThis.__REACT_DOM_NATIVE__.__closeFlightDataStream__()")
    }
}
