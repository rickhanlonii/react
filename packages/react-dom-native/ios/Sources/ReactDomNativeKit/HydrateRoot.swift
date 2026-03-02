import UIKit

/// Hydrates server-rendered content for instant display + interactivity.
///
/// The SSR stream at the given URL contains everything needed:
/// 1. View instructions — parsed incrementally, build shadow tree, create UIKit views
/// 2. Suspense boundary instructions — fallback/reveal pairs, progressively revealed
/// 3. Flight data — embedded as JS instructions, extracted and buffered for hydration
/// 4. Bootstrap script URL — tells the package what JS bundle to load
///
/// The package manages all streaming and fetching internally.
///
/// - Parameters:
///   - container: The UIView to render into.
///   - url: URL of the SSR endpoint (e.g. "http://localhost:6001/ssr/page").
///   - options: Optional configuration (error callbacks).
/// - Returns: A Root that will become interactive after hydration completes.
public func hydrateRoot(
    _ container: UIView,
    url: String,
    options: RootOptions = RootOptions()
) -> Root {
    let root = Root(container: container, options: options)
    root.startHydration(url: url)
    return root
}
