import UIKit
import ReactDomNativeKit

class PrerenderViewController: UIViewController {
    private let fixtureName: String
    private var root: Root?

    private static let prerenderCacheKey = "prerenderCache"

    init(fixtureName: String) {
        self.fixtureName = fixtureName
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let prerenderURL = "http://localhost:6001/prerender/\(fixtureName)"
        let resumeURL = "http://localhost:6001/resume/\(fixtureName)"

        // Check device cache
        if let data = Self.loadCachedPrerender(for: fixtureName) {
            // Cache hit — replay instantly, then resume for dynamic content
            root = resumeRoot(view, data: data, url: resumeURL)

            // Revalidate in the background for next load
            Self.revalidatePrerender(for: fixtureName, url: prerenderURL)

            // Also revalidate on reload (Cmd+Shift+R, perf tracing)
            let fixture = fixtureName
            root?.onReload = {
                Self.revalidatePrerender(for: fixture, url: prerenderURL)
            }
            return
        }

        // Cache miss — fetch from server
        guard let url = URL(string: prerenderURL) else { return }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        setNetworkResourceType("Document", on: &request)
        let task = URLSession.shared.dataTask(with: request) { [weak self] responseData, _, error in
            guard let self = self, let responseData = responseData, error == nil else { return }
            DispatchQueue.main.async {
                let result = Self.parsePrerenderResponse(responseData)
                Self.saveCachedPrerender(for: self.fixtureName, data: result)
                self.root = resumeRoot(self.view, data: result, url: resumeURL)
            }
        }
        task.resume()
    }

    /// Stale-while-revalidate: re-fetch /prerender in the background and
    /// update the cache if the shell has changed. Next load picks up the new version.
    private static func revalidatePrerender(for fixture: String, url: String) {
        guard let urlObj = URL(string: url) else { return }
        var request = URLRequest(url: urlObj)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        setNetworkResourceType("Document", on: &request)
        let task = URLSession.shared.dataTask(with: request) { responseData, _, error in
            guard let responseData = responseData, error == nil else { return }
            let fresh = parsePrerenderResponse(responseData)

            DispatchQueue.main.async {
                let cached = loadCachedPrerender(for: fixture)
                if cached == nil || fresh.prelude != cached!.prelude || fresh.postponed != cached!.postponed {
                    saveCachedPrerender(for: fixture, data: fresh)
                }
            }
        }
        task.resume()
    }

    // MARK: - Prerender Response Parsing

    /// Splits the raw prerender response into prelude bytes and postponed state.
    /// The POSTPONED instruction is the last line — everything before it is the prelude.
    private static func parsePrerenderResponse(_ data: Data) -> PrerenderResult {
        let newline = UInt8(ascii: "\n")
        let postponedPrefix = Data("[\"POSTPONED\",".utf8)

        // Scan backwards for the POSTPONED line
        for i in stride(from: data.count - 2, through: 0, by: -1) {
            if data[i] == newline {
                let lineStart = i + 1
                let remaining = data[lineStart...]
                if remaining.starts(with: postponedPrefix) {
                    let prelude = Data(data[0...i])
                    // Extract the postponed JSON: strip ["POSTPONED", prefix and ]\n suffix
                    let jsonStart = lineStart + postponedPrefix.count
                    let jsonEnd = data.count - 2  // strip ]\n
                    if jsonEnd > jsonStart {
                        let postponed = Data(data[jsonStart..<jsonEnd])
                        return PrerenderResult(prelude: prelude, postponed: postponed)
                    }
                }
                break
            }
        }

        // Fallback: treat entire response as prelude with empty postponed
        return PrerenderResult(prelude: data, postponed: Data())
    }

    // MARK: - Device Cache (UserDefaults)

    private static func loadCachedPrerender(for fixture: String) -> PrerenderResult? {
        guard let dict = UserDefaults.standard.dictionary(forKey: "\(prerenderCacheKey)_\(fixture)"),
              let preludeBase64 = dict["prelude"] as? String,
              let postponedBase64 = dict["postponed"] as? String,
              let prelude = Data(base64Encoded: preludeBase64),
              let postponed = Data(base64Encoded: postponedBase64) else { return nil }
        return PrerenderResult(prelude: prelude, postponed: postponed)
    }

    private static func saveCachedPrerender(for fixture: String, data: PrerenderResult) {
        let dict: [String: String] = [
            "prelude": data.prelude.base64EncodedString(),
            "postponed": data.postponed.base64EncodedString(),
        ]
        UserDefaults.standard.set(dict, forKey: "\(prerenderCacheKey)_\(fixture)")
    }

    deinit {
        root?.unmount()
    }
}
