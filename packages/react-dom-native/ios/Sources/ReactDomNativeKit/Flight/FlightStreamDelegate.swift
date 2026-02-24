import Foundation

// ---------------------------------------------------------------------------
// FlightStreamDelegate
//
// URLSession data delegate that feeds streaming HTTP response data into a
// FlightStreamClient. Follows the same pattern as SSRStreamDelegate but
// routes data through the Flight row parser instead of the SSR instruction
// stream parser.
//
// All delegate callbacks run on the main thread (delegateQueue: .main)
// since the FlightStreamClient calls into JSEngine which must be on the
// main thread.
// ---------------------------------------------------------------------------

class FlightStreamDelegate: NSObject, URLSessionDataDelegate {

    private let client: FlightStreamClient

    init(client: FlightStreamClient) {
        self.client = client
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let text = String(data: data, encoding: .utf8) else { return }
        client.processString(text)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            print("[Flight] Stream error: \(error)")
            client.reportError(error)
        } else {
            client.close()
        }
    }
}
