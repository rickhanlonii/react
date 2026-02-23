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

    /// Polling timer for bundle version changes (one timer, not per-surface).
    private var reloadTimer: Timer?

    /// Last known bundle version for polling-based reload.
    private var lastBundleVersion: Double = 0

    /// Active surfaces: surfaceId -> SurfaceInfo.
    private var activeSurfaces: [Int: SurfaceInfo] = [:]

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

    /// Triggers CSR rendering for a surface via JS-side renderFromURL.
    internal func renderSurface(surfaceId: Int, serverURL: String) {
        activeSurfaces[surfaceId]?.serverURL = serverURL
        let js = "globalThis.__REACT_DOM_NATIVE__.renderFromURL('\(serverURL)', {surfaceId: \(surfaceId)})"
        runtime?.engine.evaluate(js)
    }

    /// Triggers hydration for a surface with buffered SSR Flight data.
    internal func hydrateSurface(surfaceId: Int, serverURL: String, ssrData: [String]) throws {
        activeSurfaces[surfaceId]?.serverURL = serverURL
        guard !ssrData.isEmpty else {
            throw RootError.hydrationDataMissing
        }
        guard let jsonData = try? JSONSerialization.data(withJSONObject: ssrData),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            throw RootError.hydrationDataSerializationFailed
        }
        let js = "globalThis.__REACT_DOM_NATIVE__.hydrateFromSSRData('\(serverURL)', \(jsonString), {surfaceId: \(surfaceId)})"
        runtime?.engine.evaluate(js)
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

    /// Full reset: destroy JSContext, create new one, re-render all surfaces.
    private func performFullReset() {
        // Check if any surface uses SSR before snapshotting
        let isServerRefresh = activeSurfaces.values.contains { $0.root?.isSSR == true }
        ReloadBanner.shared.show(serverRefresh: isServerRefresh)

        // 1. Snapshot active surfaces
        let snapshot = activeSurfaces

        // 2. Disconnect HotReloadClient and stop polling
        hotReloadClient?.disconnect()
        hotReloadClient = nil
        reloadTimer?.invalidate()
        reloadTimer = nil

        // 3. Destroy old runtime
        runtime = nil
        isBundleLoaded = false
        hasBooted = false
        activeSurfaces.removeAll()

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
        URLSession.shared.dataTask(with: url) { data, response, error in
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
            self?.reload(fullReset: true)
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

        // Start polling for bundle version changes
        startBundleVersionPolling()

        // Install Cmd+Shift+R keyboard shortcut for manual reload
        DevKeyCommands.install()
        #endif
    }

    // MARK: - Bundle Version Polling (Private)

    /// Polls the dev server's /bundle-version endpoint every 2 seconds.
    /// When the version changes (esbuild rebuilt), triggers a full reset reload.
    private func startBundleVersionPolling() {
        guard let devURL = devBundleURL,
              let host = devURL.host,
              let port = devURL.port else { return }

        let versionURL = URL(string: "http://\(host):\(port)/bundle-version")!

        // Fetch initial version
        fetchBundleVersion(from: versionURL) { [weak self] version in
            self?.lastBundleVersion = version
            print("[ReactRuntime] Initial bundle version: \(version)")
        }

        // Poll every 2 seconds
        reloadTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.checkForBundleUpdate(versionURL: versionURL)
        }
    }

    private func checkForBundleUpdate(versionURL: URL) {
        fetchBundleVersion(from: versionURL) { [weak self] version in
            guard let self = self, version > 0, version != self.lastBundleVersion else { return }
            self.lastBundleVersion = version
            print("[ReactRuntime] Bundle updated (version \(version)), reloading...")
            self.reload(fullReset: true)
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
}
