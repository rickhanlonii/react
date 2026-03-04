import UIKit
import JSEngine
import ShadowTree
import Yoga
import QuartzCore

// ---------------------------------------------------------------------------
// Root
//
// A "root" is the top-level container for a React tree. This API mirrors
// react-dom/client's createRoot/hydrateRoot pattern:
//
//   // react-dom (JavaScript)
//   import { createRoot, hydrateRoot } from 'react-dom/client';
//   const root = createRoot(container);
//   root.render(<App />);
//   root.unmount();
//
//   // ReactDomNativeKit (Swift) — SSR + Hydration (recommended)
//   import ReactDomNativeKit
//   let root = hydrateRoot(container, url: "http://localhost:6001/ssr/page")
//   root.unmount()
//
//   // ReactDomNativeKit (Swift) — Client-side rendering
//   import ReactDomNativeKit
//   let root = createRoot(container)
//   root.render(url: "http://localhost:6000/fixtures/page")
//   root.unmount()
//
// Root is a lightweight surface handle. The single JSContext and shared
// infrastructure (bundle, devtools, hot reload) are owned by ReactRuntime.
// ---------------------------------------------------------------------------

/// Result of a prerender operation.
public struct PrerenderResult {
    /// Serialized SSR instruction stream — replayable without JS.
    public let prelude: Data

    /// Opaque deferred state — send to server for resume.
    public let postponed: Data

    public init(prelude: Data, postponed: Data) {
        self.prelude = prelude
        self.postponed = postponed
    }
}

/// Options for configuring a Root.
public struct RootOptions {
    /// Called when a recoverable error occurs during rendering.
    public var onRecoverableError: ((Error) -> Void)?

    /// Called when an uncaught error occurs.
    public var onUncaughtError: ((Error) -> Void)?

    public init(
        onRecoverableError: ((Error) -> Void)? = nil,
        onUncaughtError: ((Error) -> Void)? = nil
    ) {
        self.onRecoverableError = onRecoverableError
        self.onUncaughtError = onUncaughtError
    }
}

/// A root container for a React tree rendered to native views.
///
/// Create a root with `ReactDomNativeKit.createRoot(_:)` or
/// `ReactDomNativeKit.createRoot(_:options:)`.
public class Root {

    // MARK: - Properties

    /// The container view this root renders into.
    public let container: UIView

    /// The options this root was created with.
    public let options: RootOptions

    /// Whether this root has been unmounted.
    public private(set) var isUnmounted: Bool = false

    /// Surface ID assigned by ReactRuntime (nil until registered).
    var surfaceId: Int?

    /// Layout observer for viewport size changes.
    var layoutObserver: NSKeyValueObservation?

    /// Tracks the original render mode for reload recovery.
    enum RenderMode {
        case csr(serverURL: String)
        case ssr(url: String)
        case prerender(resumeURL: String)
        case serverOnly(url: String)
    }
    var renderMode: RenderMode?

    /// Whether this root was rendered using SSR + hydration.
    internal var isSSR: Bool {
        if case .ssr = renderMode { return true }
        if case .prerender = renderMode { return true }
        if case .serverOnly = renderMode { return true }
        return false
    }

    // MARK: - SSR State

    /// SSR coordinator (non-nil while SSR is active)
    var ssrParser: InstructionStreamParser?
    var ssrTreeBuilder: ShadowTreeBuilder?
    var ssrBoundaryManager: BoundaryManager?
    var ssrCoordinator: SSRCoordinator?
    var ssrDataTask: URLSessionDataTask?
    var ssrFlightDataBuffer: [String] = []
    /// Buffer for JavaScript code received from JS instructions before the JS engine boots.
    /// Replayed during hydration after the engine is ready.
    var ssrJavaScriptBuffer: [String] = []
    /// Keeps the SSR mutation applier alive after hydration. SSR-created buttons
    /// hold a weak reference to it as their tap target — if deallocated, taps
    /// silently stop working. Stays alive until the root is unmounted.
    var ssrMutationApplierRef: UIKitMutationApplier?
    var ssrRevealHasOccurred: Bool = false
    var ssrStreamComplete: Bool = false
    /// Whether the SSR shell (initial content) has been painted.
    var ssrShellComplete: Bool = false
    /// Whether hydration has started (JS instructions should be evaluated, not buffered).
    var hydrationStarted: Bool = false
    /// Whether React has committed the initial hydration render ($$completeRoot fired).
    var hydrationCommitted: Bool = false
    /// Queued hydration call waiting for SSR shell to complete.
    var pendingHydration: (() -> Void)?

    /// Accumulated commit-style timing dicts from SSR operations (first paint,
    /// boundary reveals). Pushed to Bindings when hydrateRoot is called, then
    /// forwarded to JS when tracing starts.
    var ssrCommitTimings: [[String: Any]] = []

    /// SSR URL used for the initial render (stored for reload recovery).
    var ssrURL: String?

    // MARK: - Prerender State

    /// Resume URL for prerender mode.
    var prerenderResumeURL: String?
    /// Bootstrap URL received from prerender stream (for hydration URL derivation).
    var prerenderBootstrapURL: String?
    /// Cached prerender data for reload recovery.
    var prerenderData: PrerenderResult?
    /// Called when the root re-renders (hot reload, perf tracing). App can use
    /// this to trigger background revalidation of cached prerender data.
    public var onReload: (() -> Void)?
    /// URLSession data task for the resume request.
    var resumeDataTask: URLSessionDataTask?

    // MARK: - Throttled Boundary Reveal State

    /// Minimum time between reveal flushes (prevents fallback flashes).
    static let FALLBACK_THROTTLE_MS: Double = 300.0

    /// Target time for largest contentful paint (reveals batch within this window).
    static let TARGET_LCP_MS: Double = 2300.0

    /// Queued boundary reveals waiting to be flushed.
    var pendingReveals: [(id: Int, contentNodes: [ShadowNodeWrapper])] = []

    /// Timer for the next scheduled reveal flush.
    var revealTimer: DispatchWorkItem?

    /// Timestamp (ms) when the SSR shell was first painted.
    var shellPaintTime: Double?

    // MARK: - Renderer

    /// The renderer that owns the commit pipeline for this root.
    let renderer = Renderer()

    // MARK: - Initialization

    /// Creates a new root. Use `ReactDomNativeKit.createRoot()` instead.
    internal init(container: UIView, options: RootOptions = RootOptions()) {
        self.container = container
        self.options = options

        // Wire timing collection from Renderer
        renderer.onTimingCollected = { [weak self] timing in
            if let bindings = ReactRuntime.shared.bindings, bindings.nativeTracingEnabled {
                bindings.addSSRCommitTimings([timing])
            } else {
                self?.ssrCommitTimings.append(timing)
            }
        }
    }

    // MARK: - Public API

    /// Renders React content by loading the framework bundle from the package.
    ///
    /// This boots the shared ReactRuntime (if needed), registers this root
    /// as a surface, then calls `renderFromURL` on the JS side to fetch
    /// and render the RSC stream from the server.
    ///
    /// - Parameters:
    ///   - url: URL of the RSC server (e.g. "http://localhost:6000").
    ///   - completion: Called when rendering starts or fails.
    public func render(url: String, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            completion?(RootError.alreadyUnmounted)
            return
        }

        let rt = ReactRuntime.shared

        // Boot the shared runtime (no-op if already booted)
        rt.boot { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                print("[ReactDomNativeKit] Failed to boot runtime: \(error)")
                self.options.onRecoverableError?(error)
                completion?(error)
                return
            }

            // Register surface if not yet registered
            if self.surfaceId == nil {
                // Wire renderer to Bindings' shared infrastructure
                if let bindings = rt.bindings {
                    self.renderer.viewRegistry = bindings.viewRegistry
                    self.renderer.mutationApplier = UIKitMutationApplier(viewRegistry: bindings.viewRegistry, logPrefix: "MutationApplier CSR")
                    self.renderer.mutationApplier.dispatchEvent = { view, eventType, payload in
                        bindings.eventDispatcher.dispatchEvent(from: view, eventType: eventType, payload: payload)
                    }
                }
                // Create the scroll view (must happen before registerSurface)
                self.renderer.registerRootView(self.container)

                self.surfaceId = rt.registerSurface(root: self, container: self.container)
                self.setupLayoutObserver()
            }

            // Trigger renderFromURL on JS side
            rt.renderSurface(surfaceId: self.surfaceId!, serverURL: url)
            self.renderMode = .csr(serverURL: url)
            completion?(nil)
        }
    }

    /// Unmounts the React tree and cleans up resources.
    ///
    /// After calling unmount(), the root cannot be used again.
    /// Create a new root if you need to render again.
    public func unmount() {
        guard !isUnmounted else { return }

        isUnmounted = true

        // Clean up layout observer
        layoutObserver?.invalidate()
        layoutObserver = nil

        // Unregister surface from shared runtime
        if let surfaceId = surfaceId {
            ReactRuntime.shared.unregisterSurface(surfaceId: surfaceId)
        }

        // Clear container
        container.subviews.forEach { $0.removeFromSuperview() }

        // Clean up SSR state
        ssrDataTask?.cancel()
        ssrDataTask = nil
        resumeDataTask?.cancel()
        resumeDataTask = nil
        prerenderResumeURL = nil
        prerenderBootstrapURL = nil
        prerenderData = nil
        ssrParser = nil
        ssrTreeBuilder = nil
        ssrBoundaryManager = nil
        ssrCoordinator = nil
        ssrFlightDataBuffer.removeAll()
        ssrJavaScriptBuffer.removeAll()
        ssrRevealHasOccurred = false
        ssrStreamComplete = false
        ssrShellComplete = false
        hydrationStarted = false
        hydrationCommitted = false
        pendingHydration = nil

        // Cancel any pending throttled reveals
        revealTimer?.cancel()
        revealTimer = nil
        pendingReveals.removeAll()

        surfaceId = nil

        // Clear LogBox errors
        #if DEBUG
        LogBox.shared.clearAll()
        #endif

        print("[ReactDomNativeKit] Root unmounted")
    }
}

// MARK: - Errors

/// Errors that can occur during root operations.
public enum RootError: Error, CustomStringConvertible {
    case bundleLoadFailed(Error)
    case downloadFailed(Error)
    case invalidBundleData
    case jsException(String)
    case alreadyUnmounted
    case runtimeNotInitialized
    case hydrationFailed(Error)
    case prerenderFailed(Error)
    case resumeFailed(Error)

    public var description: String {
        switch self {
        case .bundleLoadFailed(let error):
            return "Failed to load bundle: \(error.localizedDescription)"
        case .downloadFailed(let error):
            return "Failed to download bundle: \(error.localizedDescription)"
        case .invalidBundleData:
            return "Bundle data could not be decoded as UTF-8"
        case .jsException(let message):
            return "JavaScript exception: \(message)"
        case .alreadyUnmounted:
            return "Cannot render to an unmounted root"
        case .runtimeNotInitialized:
            return "Runtime not initialized — call render() first"
        case .hydrationFailed(let error):
            return "Hydration failed: \(error.localizedDescription)"
        case .prerenderFailed(let error):
            return "Prerender failed: \(error.localizedDescription)"
        case .resumeFailed(let error):
            return "Resume failed: \(error.localizedDescription)"
        }
    }
}
