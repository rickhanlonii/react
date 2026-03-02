import UIKit

public func resume(_ container: UIView, postponed: Data, url: URL) throws -> Root {
    throw RootError.resumeFailed(
        NSError(domain: "ReactDomNativeKit", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "resume() is not yet implemented"])
    )
}
