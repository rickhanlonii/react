import Foundation

/// Tags a URLRequest with a CDP resource type so NetworkInterceptor can report it.
/// Call on a `URLRequest` before passing it to `URLSession.dataTask(with:)`.
///
/// Valid values: `"Document"`, `"Script"`, `"Image"`, `"Fetch"`, `"Other"`.
public func setNetworkResourceType(_ type: String, on request: inout URLRequest) {
    let mutable = (request as NSURLRequest).mutableCopy() as! NSMutableURLRequest
    URLProtocol.setProperty(type, forKey: NetworkInterceptor.resourceTypeKey, in: mutable)
    request = mutable as URLRequest
}

/// Tags a URLRequest with a CDP initiator type so NetworkInterceptor can report it.
/// Valid values: `"parser"` (native), `"script"` (JS fetch).
public func setNetworkInitiator(_ type: String, on request: inout URLRequest) {
    let mutable = (request as NSURLRequest).mutableCopy() as! NSMutableURLRequest
    URLProtocol.setProperty(type, forKey: NetworkInterceptor.initiatorKey, in: mutable)
    request = mutable as URLRequest
}

/// Intercepts all URLSession requests and reports them to DevTools via the inspector proxy.
/// Uses the standard URLProtocol pattern: intercept → log → forward to real network → log response.
///
/// Registration uses URLSessionConfiguration swizzling (same approach as OHHTTPStubs/Alamofire)
/// because URLProtocol.registerClass only affects URLSession.shared, not custom sessions.
final class NetworkInterceptor: URLProtocol {

    // MARK: - Static state

    /// Callback to send messages to the inspector proxy (set by ReactRuntime)
    static var sendToProxy: ((String) -> Void)?

    /// Whether the interceptor is currently active
    private static var isRegistered = false

    /// Track whether $$fetch initiated the current request (thread-local flag)
    /// Uses CDP initiator types: "script" for JS fetch, "parser" for native
    static var currentInitiator: String = "parser"

    /// CDP resource type for the current request (e.g. "Script", "Document", "Image", "Fetch")
    static var currentResourceType: String = "Other"

    /// Register the interceptor to capture all URLSession requests.
    /// Swizzles URLSessionConfiguration.default and .ephemeral to inject
    /// NetworkInterceptor into protocolClasses on every new session.
    static func register() {
        guard !isRegistered else { return }
        isRegistered = true

        // Also register globally for URLSession.shared
        URLProtocol.registerClass(NetworkInterceptor.self)

        // Swizzle URLSessionConfiguration to inject into custom sessions
        let defaultSel = NSSelectorFromString("defaultSessionConfiguration")
        let ephemeralSel = NSSelectorFromString("ephemeralSessionConfiguration")
        let swizzledDefaultSel = #selector(URLSessionConfiguration.swizzled_defaultSessionConfiguration)
        let swizzledEphemeralSel = #selector(URLSessionConfiguration.swizzled_ephemeralSessionConfiguration)

        if let m1 = class_getClassMethod(URLSessionConfiguration.self, defaultSel),
           let m2 = class_getClassMethod(URLSessionConfiguration.self, swizzledDefaultSel) {
            method_exchangeImplementations(m1, m2)
        }
        if let m1 = class_getClassMethod(URLSessionConfiguration.self, ephemeralSel),
           let m2 = class_getClassMethod(URLSessionConfiguration.self, swizzledEphemeralSel) {
            method_exchangeImplementations(m1, m2)
        }

        print("[NetworkInterceptor] Registered (with URLSessionConfiguration swizzle)")
    }

    // MARK: - Request tagging

    /// Key used to mark requests as already-handled (prevent infinite recursion)
    private static let handledKey = "com.falcon.NetworkInterceptor.handled"

    /// Keys for per-request metadata (set via URLProtocol.setProperty)
    static let resourceTypeKey = "com.falcon.NetworkInterceptor.resourceType"
    static let initiatorKey = "com.falcon.NetworkInterceptor.initiator"

    // MARK: - URLProtocol overrides

    override class func canInit(with request: URLRequest) -> Bool {
        // Don't intercept requests we've already handled (prevents infinite loop)
        if URLProtocol.property(forKey: handledKey, in: request) != nil {
            return false
        }
        // Don't intercept WebSocket upgrade requests (HotReload connection)
        if request.value(forHTTPHeaderField: "Upgrade")?.lowercased() == "websocket" {
            return false
        }
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    // MARK: - Instance state

    private var dataTask: URLSessionDataTask?
    private var receivedData = Data()
    private var receivedResponse: HTTPURLResponse?
    private let requestId = UUID().uuidString
    private var startTime: TimeInterval = 0
    private let initiator: String
    private let resourceType: String

    override init(request: URLRequest, cachedResponse: CachedURLResponse?, client: URLProtocolClient?) {
        // Read metadata from request properties (set via setNetworkResourceType/setNetworkInitiator),
        // falling back to static vars for call sites that use the old pattern
        self.initiator = URLProtocol.property(forKey: NetworkInterceptor.initiatorKey, in: request) as? String
            ?? NetworkInterceptor.currentInitiator
        self.resourceType = URLProtocol.property(forKey: NetworkInterceptor.resourceTypeKey, in: request) as? String
            ?? NetworkInterceptor.currentResourceType
        super.init(request: request, cachedResponse: cachedResponse, client: client)
    }

    // MARK: - Loading

    override func startLoading() {
        startTime = performanceNow() // ms, same clock as tracing

        // Send requestWillBeSent event
        let initiatorData: [String: Any] = initiator == "parser"
            ? ["type": initiator, "url": request.url?.absoluteString ?? ""]
            : ["type": initiator]
        sendEvent("network-request-will-be-sent", [
            "requestId": requestId,
            "url": request.url?.absoluteString ?? "",
            "method": request.httpMethod ?? "GET",
            "headers": request.allHTTPHeaderFields ?? [:],
            "body": request.httpBody.flatMap { String(data: $0, encoding: .utf8) } as Any,
            "startTime": startTime,
            "initiator": initiator,
            "initiatorData": initiatorData,
            "resourceType": resourceType,
            "timestamp": startTime,
        ])

        // Mark the request as handled and forward to real network
        let mutableRequest = (request as NSURLRequest).mutableCopy() as! NSMutableURLRequest
        URLProtocol.setProperty(true, forKey: NetworkInterceptor.handledKey, in: mutableRequest)

        // Use a config that excludes our interceptor to prevent re-entry
        let config = URLSessionConfiguration.default
        config.protocolClasses = config.protocolClasses?.filter { $0 != NetworkInterceptor.self }
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        dataTask = session.dataTask(with: mutableRequest as URLRequest)
        dataTask?.resume()
    }

    override func stopLoading() {
        dataTask?.cancel()
    }

    // MARK: - Event sending

    private func sendEvent(_ type: String, _ data: [String: Any]) {
        guard let sendToProxy = NetworkInterceptor.sendToProxy else { return }
        var message = data
        message["type"] = type
        if let jsonData = try? JSONSerialization.data(withJSONObject: message),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            sendToProxy(jsonString)
        }
    }
}

// MARK: - URLSessionDataDelegate

extension NetworkInterceptor: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        receivedResponse = response as? HTTPURLResponse

        // Send responseReceived event
        let httpResponse = response as? HTTPURLResponse
        var responseHeaders: [String: String] = [:]
        if let headerFields = httpResponse?.allHeaderFields {
            for (key, value) in headerFields {
                responseHeaders[String(describing: key)] = String(describing: value)
            }
        }

        sendEvent("network-response-received", [
            "requestId": requestId,
            "url": response.url?.absoluteString ?? "",
            "statusCode": httpResponse?.statusCode ?? 0,
            "headers": responseHeaders,
            "mimeType": response.mimeType ?? "",
            "timestamp": performanceNow(),
        ])

        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        client?.urlProtocol(self, didLoad: data)
        receivedData.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let endTime = performanceNow()
        let duration = endTime - startTime

        if let error = error {
            client?.urlProtocol(self, didFailWithError: error)
            sendEvent("network-loading-failed", [
                "requestId": requestId,
                "errorText": error.localizedDescription,
                "duration": duration,
                "timestamp": endTime,
            ])
        } else {
            client?.urlProtocolDidFinishLoading(self)

            // Encode body: try UTF-8 text first, fall back to base64
            let bodyString: String
            let isBase64: Bool
            if let text = String(data: receivedData, encoding: .utf8) {
                bodyString = text
                isBase64 = false
            } else {
                bodyString = receivedData.base64EncodedString()
                isBase64 = true
            }

            sendEvent("network-loading-finished", [
                "requestId": requestId,
                "duration": duration,
                "size": receivedData.count,
                "body": bodyString,
                "base64Encoded": isBase64,
                "timestamp": endTime,
            ])
        }
    }
}

// MARK: - URLSessionConfiguration swizzle

extension URLSessionConfiguration {
    /// Swizzled replacement for +[NSURLSessionConfiguration defaultSessionConfiguration].
    /// After swizzle, calling `.default` routes here; calling `swizzled_` routes to the original.
    @objc dynamic class func swizzled_defaultSessionConfiguration() -> URLSessionConfiguration {
        let config = self.swizzled_defaultSessionConfiguration() // calls original (swapped)
        config.injectInterceptor()
        return config
    }

    /// Swizzled replacement for +[NSURLSessionConfiguration ephemeralSessionConfiguration].
    @objc dynamic class func swizzled_ephemeralSessionConfiguration() -> URLSessionConfiguration {
        let config = self.swizzled_ephemeralSessionConfiguration() // calls original (swapped)
        config.injectInterceptor()
        return config
    }

    private func injectInterceptor() {
        var protocols = self.protocolClasses ?? []
        if !protocols.contains(where: { $0 == NetworkInterceptor.self }) {
            protocols.insert(NetworkInterceptor.self, at: 0)
        }
        self.protocolClasses = protocols
    }
}
