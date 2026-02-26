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
//   root.render(serverURL: "http://localhost:6000") { ... }
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

    /// Whether the bundle has been loaded and evaluated.
    public private(set) var isBundleLoaded: Bool = false

    // MARK: - Internal State

    /// The underlying JS runtime (engine + bindings).
    private var runtime: JSRuntime?

    /// Hot reload client (one WebSocket to dev server).
    private var hotReloadClient: HotReloadClient?

    /// Active surfaces: surfaceId -> SurfaceInfo.
    private var activeSurfaces: [Int: SurfaceInfo] = [:]

    /// Active Flight stream clients: responseId -> (client, delegate, session).
    /// Tracked so we can cancel active streams on unmount/reset.
    private var activeFlightClients: [Int: (client: FlightStreamClient, delegate: FlightStreamDelegate, session: URLSession)] = [:]

    /// Next surface ID to assign (auto-incrementing).
    private var nextSurfaceId: Int = 1

    /// Whether boot() has been called and completed.
    private var hasBooted: Bool = false

    /// Whether boot is currently in progress.
    private var isBooting: Bool = false

    /// Whether performance tracing was active (survives reload).
    private var tracingActive: Bool = false

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

    /// Triggers CSR rendering for a surface using a Swift-managed Flight stream.
    /// Creates a Flight response in JS, sets up the React render pipeline,
    /// then starts a URLSession stream to parse Flight rows natively.
    internal func renderSurface(surfaceId: Int, serverURL: String) {
        guard let engine = runtime?.engine else { return }
        activeSurfaces[surfaceId]?.serverURL = serverURL

        // 1. Create a Flight response in JS
        guard let createFn = engine.getGlobalProperty("$$createFlightResponse") else { return }
        guard let responseIdRef = engine.callFunction(createFn, args: [
            engine.makeString(serverURL)
        ]) else { return }
        let responseId = engine.toInt(responseIdRef) ?? 0

        // 2. Set up the React render pipeline (subscribes to root chunk)
        let js = "globalThis.__REACT_DOM_NATIVE__.renderFromStream(\(surfaceId), \(responseId))"
        engine.evaluate(js)

        // 3. Start the Flight stream via URLSession
        startFlightStream(responseId: responseId, serverURL: serverURL, engine: engine)
    }

    /// Triggers hydration for a surface with buffered SSR Flight data.
    /// Creates a Flight response in JS, sets up hydration, then replays
    /// the buffered Flight rows through the Swift parser.
    ///
    /// - Parameter keepOpen: When true, the Flight response stays open for
    ///   real-time streaming of additional rows. When false (default), the
    ///   response is closed after replaying buffered rows.
    /// - Returns: The responseId for the Flight response (used for streaming).
    @discardableResult
    internal func hydrateSurface(surfaceId: Int, serverURL: String, ssrData: [String], keepOpen: Bool = false) throws -> Int {
        guard let engine = runtime?.engine else {
            throw RootError.runtimeNotInitialized
        }
        activeSurfaces[surfaceId]?.serverURL = serverURL

        guard !ssrData.isEmpty else {
            throw RootError.hydrationDataMissing
        }

        // 1. Create a Flight response in JS
        guard let createFn = engine.getGlobalProperty("$$createFlightResponse") else {
            throw RootError.runtimeNotInitialized
        }
        guard let responseIdRef = engine.callFunction(createFn, args: [
            engine.makeString(serverURL)
        ]) else {
            throw RootError.runtimeNotInitialized
        }
        let responseId = engine.toInt(responseIdRef) ?? 0

        // 2. Set up the React hydration pipeline
        let js = "globalThis.__REACT_DOM_NATIVE__.hydrateFromStream(\(surfaceId), \(responseId))"
        engine.evaluate(js)

        // 3. Replay buffered SSR rows through the Swift parser.
        // Store the client so it stays alive until async module fetches complete.
        let client = FlightStreamClient(responseId: responseId, engine: engine, serverURL: serverURL)
        activeFlightClients[responseId] = (client: client, delegate: FlightStreamDelegate(client: client), session: URLSession.shared)
        for row in ssrData {
            client.processString(row + "\n")
        }
        if !keepOpen {
            client.close()
        }
        return responseId
    }

    /// Forwards a raw Flight row to an active FlightStreamClient for real-time processing.
    internal func processFlightRow(responseId: Int, row: String) {
        guard let entry = activeFlightClients[responseId] else { return }
        entry.client.processString(row + "\n")
    }

    /// Closes an active Flight response (signals end of data to JS).
    internal func closeFlightResponse(responseId: Int) {
        guard let entry = activeFlightClients[responseId] else { return }
        entry.client.close()
    }

    /// Starts a Flight HTTP stream for a given response.
    private func startFlightStream(responseId: Int, serverURL: String, engine: JSEngine) {
        guard let url = URL(string: serverURL) else {
            print("[ReactRuntime] Invalid server URL: \(serverURL)")
            return
        }

        let client = FlightStreamClient(responseId: responseId, engine: engine, serverURL: serverURL)
        let delegate = FlightStreamDelegate(client: client)
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: .main)

        // Track for cleanup
        activeFlightClients[responseId] = (client: client, delegate: delegate, session: session)

        var request = URLRequest(url: url)
        request.setValue("text/x-component", forHTTPHeaderField: "Accept")
        session.dataTask(with: request).resume()
    }

    /// Cancels all active Flight streams (used during reset/unmount).
    private func cancelAllFlightStreams() {
        for (_, entry) in activeFlightClients {
            entry.session.invalidateAndCancel()
        }
        activeFlightClients.removeAll()
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

    // MARK: - Viewport

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
        // Cancel all active streams
        cancelAllFlightStreams()

        // Disconnect hot reload
        hotReloadClient?.disconnect()
        hotReloadClient = nil

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
    }

    // MARK: - Reload

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
        ReloadBanner.shared.show()
        let bundleURL = resolveBundleURL()
        loadBundle(from: bundleURL) { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let source):
                self.executeBundle(source: source, sourceURL: bundleURL)
                ReloadBanner.shared.dismiss()
                print("[ReactRuntime] Fast refresh complete")
            case .failure(let error):
                ReloadBanner.shared.dismiss()
                print("[ReactRuntime] Fast refresh failed: \(error)")
            }
        }
    }

    /// Fast Refresh: re-fetch changed chunks, re-require modules, call performReactRefresh().
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

        ReloadBanner.shared.show(mode: .fastRefresh)

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
                self.lastRefreshFailed = true
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
                    self.lastRefreshFailed = false
                    ReloadBanner.shared.dismiss()
                } else {
                    print("[ReactRuntime] Fast Refresh returned false, falling back to full reload")
                    self.lastRefreshFailed = true
                    self.reload(fullReset: true)
                }
            }
        }
    }

    /// Full reset: destroy JSContext, create new one, re-render all surfaces.
    private func performFullReset() {
        // Check if any surface uses SSR before snapshotting
        let isServerRefresh = activeSurfaces.values.contains { $0.root?.isSSR == true }
        ReloadBanner.shared.show(serverRefresh: isServerRefresh)

        // 1. Snapshot active surfaces
        let snapshot = activeSurfaces

        // 2. Disconnect HotReloadClient
        hotReloadClient?.disconnect()
        hotReloadClient = nil

        // 3. Destroy old runtime
        FlightStreamClient.clearModuleCache(engine: runtime?.engine)
        cancelAllFlightStreams()
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
                print("[ReactRuntime] tracingActive = \(self.tracingActive)")
                if self.tracingActive {
                    print("[ReactRuntime] Starting tracer before rerender")
                    let result = self.runtime?.engine.evaluate(
                        "typeof __PERFORMANCE_TRACER__ !== 'undefined' ? (__PERFORMANCE_TRACER__.startTracing(), 'started:' + __PERFORMANCE_TRACER__.isTracing()) : 'no-tracer'"
                    )
                    print("[ReactRuntime] startTracing result: \(String(describing: result))")
                }

                // 8. Let each Root re-render using its original mode (CSR or SSR+hydration)
                for (_, info) in snapshot {
                    guard let root = info.root else { continue }
                    root.rerender()
                }

                print("[ReactRuntime] Full reset complete, re-rendered \(snapshot.count) surface(s)")
                ReloadBanner.shared.dismiss()

            case .failure(let error):
                print("[ReactRuntime] Full reset failed to load bundle: \(error)")
                ReloadBanner.shared.dismiss()
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
    }

    // MARK: - DevTools (Private)

    /// Sets up the devtools WebSocket connection for tracing/inspector support.
    private func setupDevToolsConnection() {
        #if DEBUG
        guard let bindings = runtime?.bindings else { return }

        // Disconnect previous client if any
        hotReloadClient?.disconnect()

        print("[ReactRuntime] Setting up devtools WebSocket connection")
        let client = HotReloadClient()
        hotReloadClient = client

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

        // JS -> dev server: $$sendInspectorMessage calls this
        bindings.sendInspectorMessage = { [weak client] data in
            client?.send(data)
        }

        // Dev server -> JS: tracing commands forwarded to $$onInspectorMessage
        client.onInspectorMessage = { [weak self, weak bindings] json in
            // Track tracing state so it survives reload
            if let data = json.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let type = obj["type"] as? String {
                if type == "start-tracing" { self?.tracingActive = true }
                if type == "stop-tracing" { self?.tracingActive = false }
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
