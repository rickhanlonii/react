import Foundation
import QuartzCore
import ShadowTree

/// Native performance tracer — owns tracing state and Chrome Trace Format event buffer.
/// Replaces the JS-side __PERFORMANCE_TRACER__ object.
class PerformanceTracer {

    // MARK: - Tracing state

    private(set) var isTracing = false
    private var tracingStartTs: Double = 0  // µs — for screenshot alignment
    private var tracingStartMs: Double = 0  // ms — for filtering retroactive events
    private var events: [[String: Any]] = []
    private var nextId = 0
    private var nextInteractionId = 1
    private let pid = 1
    private let tid = 1

    // MARK: - Performance entry storage (for getEntriesByType/Name)

    private var marks: [[String: Any]] = []
    private var measures: [[String: Any]] = []

    // MARK: - Time origin

    /// Unix epoch milliseconds, derived from the monotonic clock so that the
    /// browser invariant `timeOrigin + performance.now() ≈ Date.now()` holds.
    /// Using `Date.now() - performanceNow()` ensures both sides use the same
    /// clock source (CLOCK_MONOTONIC via CACurrentMediaTime), avoiding drift
    /// between CLOCK_REALTIME and CLOCK_MONOTONIC from NTP adjustments.
    let timeOrigin: Double

    init() {
        timeOrigin = Date().timeIntervalSince1970 * 1000.0 - performanceNow()
    }

    /// Returns milliseconds elapsed since the monotonic origin (matches browser `performance.now()`).
    func now() -> Double {
        performanceNow()
    }

    // MARK: - Tracing lifecycle

    func startTracing() {
        isTracing = true
        let nowMs = now()
        tracingStartMs = nowMs
        tracingStartTs = nowMs * 1000.0 // µs
        nextId = 0
        events = [
            // Process/thread metadata — required by Chrome DevTools MetaHandler
            ["name": "process_name", "cat": "__metadata", "ph": "M",
             "pid": pid, "tid": 0, "ts": 0, "args": ["name": "Falcon"]],
            ["name": "thread_name", "cat": "__metadata", "ph": "M",
             "pid": pid, "tid": tid, "ts": 0, "args": ["name": "CrRendererMain"]],
        ]
    }

    func stopTracing() -> (events: [[String: Any]], tracingStartTs: Double, tracingStopTs: Double) {
        isTracing = false
        let stopTs = now() * 1000.0 // µs
        let result = events
        let startTs = tracingStartTs
        events = []
        return (result, startTs, stopTs)
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
        // Drop retroactive events from before the trace started (e.g. Flight
        // client replaying server request IO info from the initial page load).
        // Allow track-init events (start == end, tiny timestamps) through.
        let isTrackInit = start == end && start < 1.0
        guard isTrackInit || end >= tracingStartMs else { return }
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
            "args": [
                "detail": detailJSON,
                // Chrome adds these fields when it captures console.timeStamp natively.
                // Include them so Chrome DevTools recognizes these as extension track events.
                "startTime": start,
                "callTime": (timeOrigin + start) * 1000.0,
            ] as [String: Any],
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
        guard start + duration >= tracingStartMs else { return }
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
            "args": [
                "detail": detailJSON,
                "startTime": start,
                "callTime": (timeOrigin + start) * 1000.0,
            ] as [String: Any],
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

    // MARK: - Native commit timing reporting

    private func durationColor(_ startMs: Double, _ endMs: Double) -> String {
        let duration = endMs - startMs
        return duration < 0.5 ? "primary-light" : duration < 50 ? "primary" : "primary-dark"
    }

    /// Reports all trace events for a native commit, translating the timing dict
    /// into reportTimeStamp calls. This is the Swift equivalent of the former
    /// JS reportNativeCommitTimings function.
    func reportCommitTimings(_ t: [String: Any]) {
        guard isTracing else { return }

        let commitStart = (t["commitStart"] as? Double) ?? 0
        let commitEnd = (t["commitEnd"] as? Double) ?? 0
        let layoutStart = (t["layoutStart"] as? Double) ?? 0
        let layoutEnd = (t["layoutEnd"] as? Double) ?? 0
        let diffStart = (t["diffStart"] as? Double) ?? 0
        let diffEnd = (t["diffEnd"] as? Double) ?? 0
        let mutationsStart = (t["mutationsStart"] as? Double) ?? 0
        let mutationsEnd = (t["mutationsEnd"] as? Double) ?? 0
        let syncStart = (t["syncStart"] as? Double) ?? 0
        let syncEnd = (t["syncEnd"] as? Double) ?? 0
        let yogaStart = (t["yogaStart"] as? Double) ?? 0
        let yogaEnd = (t["yogaEnd"] as? Double) ?? 0
        let textRemeasureStart = (t["textRemeasureStart"] as? Double) ?? 0
        let textRemeasureEnd = (t["textRemeasureEnd"] as? Double) ?? 0
        let scrollStart = (t["scrollStart"] as? Double) ?? 0
        let scrollEnd = (t["scrollEnd"] as? Double) ?? 0
        let nodeCount = t["nodeCount"] as? Int ?? 0
        let treeDepth = t["treeDepth"] as? Int ?? 0
        let rootTypes = (t["rootTypes"] as? String) ?? ""
        let mutationCount = t["mutationCount"] as? Int ?? 0
        let creates = t["creates"] as? Int ?? 0
        let updates = t["updates"] as? Int ?? 0
        let deletes = t["deletes"] as? Int ?? 0
        let inserts = t["inserts"] as? Int ?? 0
        let removes = t["removes"] as? Int ?? 0
        let affectedTypes = (t["affectedTypes"] as? String) ?? "none"
        let didRemeasure = (t["didRemeasure"] as? Bool) ?? false

        // Shadow Tree track — outer Commit span
        let label = (t["label"] as? String) ?? "Commit"
        reportTimeStamp(label: label, start: commitStart, end: commitEnd,
            track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(commitStart, commitEnd),
            properties: [["Nodes", String(nodeCount)],
                         ["Tree depth", String(treeDepth)],
                         ["Root elements", rootTypes]])

        // Shadow Tree track — sub-spans
        let prepareStart = (t["prepareStart"] as? Double) ?? 0
        let prepareEnd = (t["prepareEnd"] as? Double) ?? 0
        if prepareEnd > prepareStart {
            reportTimeStamp(label: "Prepare", start: prepareStart, end: prepareEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(prepareStart, prepareEnd))
        }
        if layoutEnd > layoutStart {
            reportTimeStamp(label: "Blocked (Layout)", start: layoutStart, end: layoutEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: "secondary-light")
        }
        if diffEnd > diffStart {
            reportTimeStamp(label: "Diff", start: diffStart, end: diffEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(diffStart, diffEnd),
                properties: [["Mutations", String(mutationCount)],
                             ["Creates", String(creates)],
                             ["Updates", String(updates)],
                             ["Deletes", String(deletes)]])
        }
        if mutationsEnd > mutationsStart {
            reportTimeStamp(label: "Apply Mutations (\(mutationCount))", start: mutationsStart, end: mutationsEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(mutationsStart, mutationsEnd),
                properties: [["Inserts", String(inserts)],
                             ["Removes", String(removes)],
                             ["Affected elements", affectedTypes]])
        }
        if syncEnd > syncStart {
            reportTimeStamp(label: "Sync Frames", start: syncStart, end: syncEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(syncStart, syncEnd))
        }

        let cleanupStart = (t["cleanupStart"] as? Double) ?? 0
        let cleanupEnd = (t["cleanupEnd"] as? Double) ?? 0
        if cleanupEnd > cleanupStart {
            reportTimeStamp(label: "Cleanup", start: cleanupStart, end: cleanupEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(cleanupStart, cleanupEnd))
        }

        // Cleanup sub-spans
        let treePromoteStart = (t["treePromoteStart"] as? Double) ?? 0
        let treePromoteEnd = (t["treePromoteEnd"] as? Double) ?? 0
        if treePromoteEnd > treePromoteStart {
            reportTimeStamp(label: "Tree Promote", start: treePromoteStart, end: treePromoteEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(treePromoteStart, treePromoteEnd))
        }

        let nodeGCStart = (t["nodeGCStart"] as? Double) ?? 0
        let nodeGCEnd = (t["nodeGCEnd"] as? Double) ?? 0
        if nodeGCEnd > nodeGCStart {
            reportTimeStamp(label: "Node GC", start: nodeGCStart, end: nodeGCEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(nodeGCStart, nodeGCEnd))
        }

        let devtoolsNotifyStart = (t["devtoolsNotifyStart"] as? Double) ?? 0
        let devtoolsNotifyEnd = (t["devtoolsNotifyEnd"] as? Double) ?? 0
        if devtoolsNotifyEnd > devtoolsNotifyStart {
            reportTimeStamp(label: "DevTools Notify", start: devtoolsNotifyStart, end: devtoolsNotifyEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(devtoolsNotifyStart, devtoolsNotifyEnd))
        }

        // Post-mutation phases
        let attachStart = (t["attachStart"] as? Double) ?? 0
        let attachEnd = (t["attachEnd"] as? Double) ?? 0
        if attachEnd > attachStart {
            reportTimeStamp(label: "Attach & Promote", start: attachStart, end: attachEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: durationColor(attachStart, attachEnd))
        }

        let screenshotStart = (t["screenshotStart"] as? Double) ?? 0
        let screenshotEnd = (t["screenshotEnd"] as? Double) ?? 0
        if screenshotEnd > screenshotStart {
            reportTimeStamp(label: "Screenshot", start: screenshotStart, end: screenshotEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: "warning")
        }

        // Prepare Paint — the UIKit view mutation window (mutations + sync + attach)
        let preparePaintStart = (t["preparePaintStart"] as? Double) ?? 0
        let preparePaintEnd = (t["preparePaintEnd"] as? Double) ?? 0
        if preparePaintEnd > preparePaintStart {
            reportTimeStamp(label: "Prepare Paint", start: preparePaintStart, end: preparePaintEnd,
                track: "Shadow Tree", trackGroup: "Native ⚛", color: "tertiary")
        }

        // Layout track — outer Calculate Layout span
        if layoutEnd > layoutStart {
            reportTimeStamp(label: "Calculate Layout", start: layoutStart, end: layoutEnd,
                track: "Layout", trackGroup: "Native ⚛", color: durationColor(layoutStart, layoutEnd),
                properties: [["Nodes", String(nodeCount)],
                             ["Second pass", didRemeasure ? "yes" : "no"]])
        }

        // Layout track — sub-spans
        if yogaEnd > yogaStart {
            reportTimeStamp(label: "Yoga", start: yogaStart, end: yogaEnd,
                track: "Layout", trackGroup: "Native ⚛", color: durationColor(yogaStart, yogaEnd),
                properties: [["Nodes", String(nodeCount)]])
        }
        if didRemeasure {
            reportTimeStamp(label: "Text Remeasure", start: textRemeasureStart, end: textRemeasureEnd,
                track: "Layout", trackGroup: "Native ⚛", color: "warning")
        }

        let readFramesStart = (t["readFramesStart"] as? Double) ?? 0
        let readFramesEnd = (t["readFramesEnd"] as? Double) ?? 0
        if readFramesEnd > readFramesStart {
            reportTimeStamp(label: "Read Frames", start: readFramesStart, end: readFramesEnd,
                track: "Layout", trackGroup: "Native ⚛", color: durationColor(readFramesStart, readFramesEnd),
                properties: [["Nodes", String(nodeCount)]])
        }

        if scrollEnd > scrollStart {
            reportTimeStamp(label: "Scroll Content", start: scrollStart, end: scrollEnd,
                track: "Layout", trackGroup: "Native ⚛", color: durationColor(scrollStart, scrollEnd))
        }

        // Diff Nodes — per-node timing, nested below Diff on Shadow Tree track
        if let diffNodes = t["diffNodes"] as? [Any], diffNodes.count > 0 {
            var i = 0
            while i + 2 < diffNodes.count {
                let name = diffNodes[i] as? String ?? ""
                let start = diffNodes[i + 1] as? Double ?? 0
                let end = diffNodes[i + 2] as? Double ?? 0
                reportTimeStamp(label: name, start: start, end: end,
                    track: "Shadow Tree", trackGroup: "Native ⚛", color: "primary-light")
                i += 3
            }
        }

        // Mutation Nodes — per-mutation timing, nested below Apply Mutations on Shadow Tree track
        if let mutationNodes = t["mutationNodes"] as? [Any], mutationNodes.count > 0 {
            var i = 0
            while i + 3 < mutationNodes.count {
                let op = mutationNodes[i] as? String ?? ""
                let type = mutationNodes[i + 1] as? String ?? ""
                let start = mutationNodes[i + 2] as? Double ?? 0
                let end = mutationNodes[i + 3] as? Double ?? 0
                reportTimeStamp(label: "\(op) \(type)", start: start, end: end,
                    track: "Shadow Tree", trackGroup: "Native ⚛", color: "primary-light")
                i += 4
            }
        }

        // Layout Nodes — per-node timing from readLayoutFrames + syncAllFrames, nested on Layout track
        if let layoutNodes = t["layoutNodes"] as? [Any], layoutNodes.count > 0 {
            var i = 0
            while i + 2 < layoutNodes.count {
                let name = layoutNodes[i] as? String ?? ""
                let start = layoutNodes[i + 1] as? Double ?? 0
                let end = layoutNodes[i + 2] as? Double ?? 0
                reportTimeStamp(label: name, start: start, end: end,
                    track: "Layout", trackGroup: "Native ⚛", color: "primary-light")
                i += 3
            }
        }
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
