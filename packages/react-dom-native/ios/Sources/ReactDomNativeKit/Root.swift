import UIKit
import JSEngine

// ---------------------------------------------------------------------------
// Root
//
// A "root" is the top-level container for a React tree. This API mirrors
// react-dom/client's createRoot/root.render pattern:
//
//   // react-dom (JavaScript)
//   import { createRoot } from 'react-dom/client';
//   const root = createRoot(container);
//   root.render(<App />);
//   root.unmount();
//
//   // ReactDomNativeKit (Swift)
//   import ReactDomNativeKit
//   let root = ReactDomNativeKit.createRoot(container)
//   root.render(bundle: bundleURL) { error in
//       if let error = error { print("Failed: \(error)") }
//   }
//   root.unmount()
//
// The main difference is that in react-dom, you pass a React element to
// render(). In ReactDomNativeKit, the React element comes from the JS bundle
// which is loaded and executed by render(). The bundle URL is required and
// supports both local (file://) and remote (http://, https://) URLs.
// ---------------------------------------------------------------------------

/// Options for configuring a Root.
public struct RootOptions {
    /// Called when a recoverable error occurs during rendering.
    public var onRecoverableError: ((Error) -> Void)?

    /// Called when an uncaught error occurs.
    public var onUncaughtError: ((Error) -> Void)?

    /// Surface ID for this root (default: 1). Use different IDs for multiple roots.
    public var surfaceId: Int

    public init(
        surfaceId: Int = 1,
        onRecoverableError: ((Error) -> Void)? = nil,
        onUncaughtError: ((Error) -> Void)? = nil
    ) {
        self.surfaceId = surfaceId
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

    /// The underlying JS runtime (internal implementation detail).
    private var runtime: JSRuntime?

    /// Layout observer for viewport size changes.
    private var layoutObserver: NSKeyValueObservation?

    // MARK: - Initialization

    /// Creates a new root. Use `ReactDomNativeKit.createRoot()` instead.
    internal init(container: UIView, options: RootOptions = RootOptions()) {
        self.container = container
        self.options = options
    }

    // MARK: - Public API

    /// Renders React content from the specified bundle.
    ///
    /// This loads and executes the JS bundle, which should call the renderer
    /// to create the React tree. The bundle is expected to set up the React
    /// app and render to the native surface.
    ///
    /// Unlike react-dom's `root.render(<App />)`, you don't pass a React
    /// element because the element is defined in the JS bundle.
    ///
    /// - Parameters:
    ///   - bundle: URL to the JS bundle. Supports:
    ///     - `file://` URLs for local bundles
    ///     - `http://` or `https://` URLs for remote bundles (downloaded first)
    ///   - completion: Called when rendering starts or fails.
    ///     - `nil` error means bundle loaded and executed successfully
    ///     - Non-nil error describes what went wrong
    public func render(bundle: URL, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            print("[ReactDomNativeKit] Warning: Cannot render to an unmounted root.")
            completion?(RootError.alreadyUnmounted)
            return
        }

        // Create runtime if needed
        if runtime == nil {
            runtime = JSRuntime()

            // Set up error handler if provided
            if let onError = options.onUncaughtError {
                runtime?.engine.exceptionHandler = { message, _ in
                    onError(RootError.jsException(message))
                }
            }

            // Register surface
            runtime?.bindings.registerSurface(surfaceId: options.surfaceId, rootView: container)

            // Observe layout changes
            setupLayoutObserver()
        }

        // Load and execute bundle
        loadBundle(from: bundle) { [weak self] result in
            switch result {
            case .success(let source):
                self?.executeBundle(source: source, sourceURL: bundle)
                completion?(nil)
            case .failure(let error):
                print("[ReactDomNativeKit] Failed to load bundle: \(error)")
                self?.options.onRecoverableError?(error)
                completion?(error)
            }
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

        // Unregister surface
        runtime?.bindings.unregisterSurface(surfaceId: options.surfaceId)

        // Clear container
        container.subviews.forEach { $0.removeFromSuperview() }

        // Release runtime
        runtime = nil

        print("[ReactDomNativeKit] Root unmounted")
    }

    // MARK: - Internal

    /// Updates the viewport size. Called automatically on layout changes.
    internal func updateViewportSize() {
        runtime?.updateViewportSize(
            width: container.bounds.width,
            height: container.bounds.height
        )
    }

    /// Reloads the JS bundle. Used for hot reload.
    ///
    /// - Parameters:
    ///   - bundle: URL to the JS bundle to reload.
    ///   - completion: Called when reload completes or fails.
    public func reload(bundle: URL, completion: ((Error?) -> Void)? = nil) {
        guard !isUnmounted else {
            completion?(RootError.alreadyUnmounted)
            return
        }

        // Tear down existing runtime
        runtime?.bindings.unregisterSurface(surfaceId: options.surfaceId)
        container.subviews.forEach { $0.removeFromSuperview() }
        runtime = nil

        // Recreate runtime (same logic as render())
        runtime = JSRuntime()
        if let onError = options.onUncaughtError {
            runtime?.engine.exceptionHandler = { message, _ in
                onError(RootError.jsException(message))
            }
        }
        runtime?.bindings.registerSurface(surfaceId: options.surfaceId, rootView: container)
        updateViewportSize()

        // Load and execute new bundle
        loadBundle(from: bundle) { [weak self] result in
            switch result {
            case .success(let source):
                self?.executeBundle(source: source, sourceURL: bundle)
                completion?(nil)
            case .failure(let error):
                print("[ReactDomNativeKit] Failed to reload bundle: \(error)")
                self?.options.onRecoverableError?(error)
                completion?(error)
            }
        }
    }

    // MARK: - Private

    private func setupLayoutObserver() {
        // Observe bounds changes to update viewport size
        layoutObserver = container.observe(\.bounds, options: [.new]) { [weak self] _, _ in
            self?.updateViewportSize()
        }

        // Initial size update
        updateViewportSize()
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
            return "Runtime not initialized - call render() first"
        }
    }
}
