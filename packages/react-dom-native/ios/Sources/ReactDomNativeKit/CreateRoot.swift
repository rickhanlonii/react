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
/// This is the primary entry point for client-side rendering (CSR).
/// For SSR + hydration, use the `hydrateRoot(view, url:)` free function instead.
///
/// Example usage:
/// ```swift
/// import ReactDomNativeKit
///
/// // SSR + Hydration (recommended):
/// let root = hydrateRoot(view, url: "http://localhost:6001/ssr/page")
///
/// // Client-side rendering:
/// let root = createRoot(view)
/// root.render(url: "http://localhost:6000/fixtures/page") { error in
///     if let error = error {
///         print("Failed: \(error)")
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
/// - Parameters:
///   - container: The UIView to render React content into.
///   - options: Configuration options for the root.
/// - Returns: A Root that can be used to render and unmount.
public func createRoot(_ container: UIView, options: RootOptions) -> Root {
    return Root(container: container, options: options)
}
