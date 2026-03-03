import UIKit

/// Renders server-rendered content without hydration (no client-side React).
///
/// The SSR stream at the given URL is processed for view instructions only:
/// 1. View instructions — parsed incrementally, build shadow tree, create UIKit views
/// 2. Suspense boundary instructions — fallback/reveal pairs, progressively revealed
/// 3. Flight data and bootstrap scripts are ignored (no JS runtime boots)
///
/// The result is a static native view tree — no interactivity, no client components.
///
/// - Parameters:
///   - container: The UIView to render into.
///   - url: URL of the SSR endpoint (e.g. "http://localhost:6001/ssr/page").
///   - options: Optional configuration (error callbacks).
/// - Returns: A Root that displays the server-rendered content.
public func createRootFromFetch(
    _ container: UIView,
    url: String,
    options: RootOptions = RootOptions()
) -> Root {
    let root = Root(container: container, options: options)
    root.startServerOnly(url: url)
    return root
}
