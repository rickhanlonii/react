import Foundation
import QuartzCore
import ShadowTree

/// Native performance tracer — owns tracing state and Chrome Trace Format event buffer.
/// Replaces the JS-side __PERFORMANCE_TRACER__ object.
class PerformanceTracer {

    // MARK: - Tracing state

    private(set) var isTracing = false
    private var tracingStartTs: Double = 0  // µs — for screenshot alignment
    private var events: [[String: Any]] = []
    private var nextId = 0
    private var nextInteractionId = 1
    private let pid = 1
    private let tid = 1

    // MARK: - Performance entry storage (for getEntriesByType/Name)

    private var marks: [[String: Any]] = []
    private var measures: [[String: Any]] = []

    // MARK: - Time origin

    /// Unix epoch milliseconds at init — matches browser `performance.timeOrigin`.
    let timeOrigin: Double

    init() {
        timeOrigin = Date().timeIntervalSince1970 * 1000.0
    }

    /// Returns milliseconds elapsed since the monotonic origin (matches browser `performance.now()`).
    func now() -> Double {
        performanceNow()
    }

    // MARK: - Tracing lifecycle

    func startTracing() {
        isTracing = true
        tracingStartTs = now() * 1000.0 // µs
        nextId = 0
        events = [
            // Process/thread metadata — required by Chrome DevTools MetaHandler
            ["name": "process_name", "cat": "__metadata", "ph": "M",
             "pid": pid, "tid": 0, "ts": 0, "args": ["name": "Falcon"]],
            ["name": "thread_name", "cat": "__metadata", "ph": "M",
             "pid": pid, "tid": tid, "ts": 0, "args": ["name": "CrRendererMain"]],
        ]
    }

    func stopTracing() -> (events: [[String: Any]], tracingStartTs: Double) {
        isTracing = false
        let result = events
        let startTs = tracingStartTs
        events = []
        return (result, startTs)
    }

    // MARK: - Event reporting

    /// Reports a timeStamp event (used by React's extended console.timeStamp and
    /// native commit timings). Generates begin/end async event pair.
    func reportTimeStamp(
        label: String, start: Double, end: Double,
        track: String, trackGroup: String?, color: String,
        properties: [[String]]? = nil
    ) {
        guard isTracing else { return }
        let id = nextEventId()
        var devtools: [String: Any] = ["track": track, "color": color]
        if let trackGroup = trackGroup {
            devtools["trackGroup"] = trackGroup
        }
        if let properties = properties {
            devtools["properties"] = properties
        }
        let startUs = start * 1000.0
        let endUs = end * 1000.0
        let detailJSON = serializeJSON(["devtools": devtools])
        events.append([
            "id2": ["local": id], "name": label, "cat": "blink.user_timing",
            "ph": "b", "ts": startUs, "pid": pid, "tid": tid,
            "args": ["detail": detailJSON],
        ])
        events.append([
            "id2": ["local": id], "name": label, "cat": "blink.user_timing",
            "ph": "e", "ts": endUs, "pid": pid, "tid": tid,
            "args": [:] as [String: Any],
        ])
    }

    /// Reports a performance.measure event (used by React's performance.measure calls).
    /// The detail object is passed through as-is (contains devtools track metadata).
    func reportMeasure(name: String, start: Double, duration: Double, detail: Any?) {
        guard isTracing else { return }
        let id = nextEventId()
        let detailJSON: String
        if let dict = detail as? [String: Any] {
            detailJSON = serializeJSON(dict)
        } else if let str = detail as? String {
            detailJSON = str
        } else {
            detailJSON = "{}"
        }
        events.append([
            "id2": ["local": id], "name": name, "cat": "blink.user_timing",
            "ph": "b", "ts": start * 1000.0, "pid": pid, "tid": tid,
            "args": ["detail": detailJSON],
        ])
        events.append([
            "id2": ["local": id], "name": name, "cat": "blink.user_timing",
            "ph": "e", "ts": (start + duration) * 1000.0, "pid": pid, "tid": tid,
            "args": [:] as [String: Any],
        ])
    }

    /// Reports a performance.mark event as an Instant event.
    func reportMark(name: String, startTime: Double) {
        guard isTracing else { return }
        events.append([
            "name": name, "cat": "blink.user_timing",
            "ph": "I", "ts": startTime * 1000.0,
            "pid": pid, "tid": tid, "args": [:] as [String: Any],
        ])
    }

    /// Reports an EventTiming interaction event for the Chrome DevTools Interactions track.
    func reportInteraction(
        eventType: String, interactionId: Int,
        inputTime: Double, processingStart: Double, processingEnd: Double
    ) {
        guard isTracing else { return }
        let id = "interaction-\(interactionId)"
        let duration = max(Int(round((processingEnd - inputTime) / 8.0)) * 8, 1)
        let inputTimeUs = inputTime * 1000.0
        let endTimeUs = processingEnd * 1000.0
        events.append([
            "name": "EventTiming", "cat": "devtools.timeline",
            "ph": "b", "id": id, "ts": inputTimeUs, "pid": pid, "tid": tid,
            "args": ["data": [
                "type": eventType, "interactionId": interactionId,
                "duration": duration, "timeStamp": inputTime,
                "processingStart": processingStart, "processingEnd": processingEnd,
                "cancelable": true, "nodeId": 0, "interactionOffset": 0,
            ]],
        ])
        events.append([
            "name": "EventTiming", "cat": "devtools.timeline",
            "ph": "e", "id": id, "ts": endTimeUs, "pid": pid, "tid": tid,
            "args": [:] as [String: Any],
        ])
    }

    func getNextInteractionId() -> Int {
        let id = nextInteractionId
        nextInteractionId += 1
        return id
    }

    // MARK: - Performance entry storage

    func addMark(_ entry: [String: Any]) {
        marks.append(entry)
    }

    func addMeasure(_ entry: [String: Any]) {
        measures.append(entry)
    }

    func clearMarks(_ name: String?) {
        if let name = name {
            marks.removeAll { ($0["name"] as? String) == name }
        } else {
            marks.removeAll()
        }
    }

    func clearMeasures(_ name: String?) {
        if let name = name {
            measures.removeAll { ($0["name"] as? String) == name }
        } else {
            measures.removeAll()
        }
    }

    func getEntriesByType(_ type: String) -> [[String: Any]] {
        switch type {
        case "mark": return marks
        case "measure": return measures
        default: return []
        }
    }

    func getEntriesByName(_ name: String, type: String?) -> [[String: Any]] {
        let all: [[String: Any]]
        if let type = type {
            all = getEntriesByType(type)
        } else {
            all = marks + measures
        }
        return all.filter { ($0["name"] as? String) == name }
    }

    func findMarkTime(_ name: String) -> Double {
        for entry in marks.reversed() {
            if (entry["name"] as? String) == name {
                return (entry["startTime"] as? Double) ?? 0
            }
        }
        return 0
    }

    // MARK: - Helpers

    private func nextEventId() -> String {
        let id = nextId
        nextId += 1
        return "0x" + String(id, radix: 16)
    }

    /// Minimal JSON serializer for dictionaries — avoids Foundation JSONSerialization
    /// overhead for the small, flat devtools metadata objects.
    private func serializeJSON(_ dict: [String: Any]) -> String {
        // Use JSONSerialization for correctness (these are small objects)
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return str
    }
}
