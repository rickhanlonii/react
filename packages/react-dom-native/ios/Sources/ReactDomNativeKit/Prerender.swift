import UIKit

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
