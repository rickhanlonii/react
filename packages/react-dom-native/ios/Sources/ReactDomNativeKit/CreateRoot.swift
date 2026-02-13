import UIKit

// ---------------------------------------------------------------------------
// createRoot
//
// Module-level function to create a Root, mirroring react-dom/client's API:
//
//   // react-dom (JavaScript)
//   import { createRoot } from 'react-dom/client';
//   const root = createRoot(document.getElementById('root'));
//
//   // ReactDomNativeKit (Swift)
//   import ReactDomNativeKit
//   let root = createRoot(containerView)
//
// ---------------------------------------------------------------------------

/// Creates a Root for rendering React content into a container view.
///
/// This is the primary entry point for ReactDomNativeKit, mirroring
/// react-dom/client's `createRoot()` function.
///
/// Example usage:
/// ```swift
/// import ReactDomNativeKit
///
/// class MyViewController: UIViewController {
///     private var root: Root?
///
///     override func viewDidLoad() {
///         super.viewDidLoad()
///         root = createRoot(view)
///         root?.render(serverURL: "http://localhost:6000") { error in
///             if let error = error {
///                 print("Failed: \(error)")
///             }
///         }
///     }
///
///     deinit {
///         root?.unmount()
///     }
/// }
/// ```
///
/// - Parameter container: The UIView to render React content into.
/// - Returns: A Root that can be used to render and unmount.
public func createRoot(_ container: UIView) -> Root {
    return Root(container: container)
}

/// Creates a Root with custom options.
///
/// Example usage:
/// ```swift
/// let options = RootOptions(
///     onRecoverableError: { error in
///         print("React error: \(error)")
///     }
/// )
/// let root = createRoot(view, options: options)
/// root.render(serverURL: "http://localhost:6000") { error in
///     if let error = error {
///         print("Render failed: \(error)")
///     }
/// }
/// ```
///
/// - Parameters:
///   - container: The UIView to render React content into.
///   - options: Configuration options for the root.
/// - Returns: A Root that can be used to render and unmount.
public func createRoot(_ container: UIView, options: RootOptions) -> Root {
    return Root(container: container, options: options)
}
