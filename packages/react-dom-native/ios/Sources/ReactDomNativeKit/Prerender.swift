import UIKit

/// Resumes a prerendered root — replays the cached prelude instantly to show
/// the static shell, then POSTs the postponed state to the resume URL for
/// fresh dynamic content and hydration.
///
/// The app is responsible for fetching `GET /prerender/:name` and caching the
/// result on-device. This function takes the cached data and a resume URL:
///
///     let data = deviceCache.get("fixture")
///     if data == nil {
///         data = fetch("http://localhost:6001/prerender/page")
///         deviceCache.set("fixture", data)
///     }
///     let root = resumeRoot(view, data: data, url: "http://localhost:6001/resume/page")
///
/// - Parameters:
///   - container: The UIView to render into.
///   - data: The prerender result (prelude bytes + postponed state) from a previous
///     `GET /prerender/:name` response.
///   - url: URL of the resume endpoint (e.g. "http://localhost:6001/resume/page").
///   - options: Optional configuration (error callbacks).
/// - Returns: A Root that will become interactive after hydration completes.
public func resumeRoot(
    _ container: UIView,
    data: PrerenderResult,
    url: String,
    options: RootOptions = RootOptions()
) -> Root {
    let root = Root(container: container, options: options)
    root.startResume(data: data, resumeURL: url)
    return root
}

public func prerender(_ container: UIView, bundle: String) async throws -> PrerenderResult {
    throw RootError.prerenderFailed(
        NSError(domain: "ReactDomNativeKit", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "prerender(bundle:) is not yet implemented"])
    )
}

public func prerender(_ container: UIView, url: URL) async throws -> PrerenderResult {
    throw RootError.prerenderFailed(
        NSError(domain: "ReactDomNativeKit", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "prerender(url:) is not yet implemented"])
    )
}
