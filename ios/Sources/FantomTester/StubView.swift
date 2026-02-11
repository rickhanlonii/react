import Foundation

// ---------------------------------------------------------------------------
// StubView
//
// A lightweight tree structure that mirrors what UIView would be, but is a
// plain Swift class with no UIKit dependency. Used by the FantomTester to
// capture the rendered output for test assertions.
// ---------------------------------------------------------------------------

class StubView {
    /// The HTML element type (e.g. "div", "p", "button")
    let elementType: String

    /// Current props dictionary
    var props: [String: Any]

    /// Ordered child views
    var children: [StubView]

    /// Layout frame computed by Yoga
    var frame: CGRect

    init(elementType: String, props: [String: Any] = [:]) {
        self.elementType = elementType
        self.props = props
        self.children = []
        self.frame = .zero
    }

    /// Recursively serializes the StubView tree to a JSON-compatible dictionary.
    func toJSON() -> [String: Any] {
        var result: [String: Any] = [
            "type": elementType,
        ]

        if !props.isEmpty {
            // Filter to serializable props only
            result["props"] = serializeProps(props)
        }

        if !children.isEmpty {
            result["children"] = children.map { $0.toJSON() }
        }

        if frame != .zero {
            result["frame"] = [
                "x": frame.origin.x,
                "y": frame.origin.y,
                "width": frame.size.width,
                "height": frame.size.height
            ]
        }

        return result
    }

    /// Converts props to a JSON-serializable dictionary, handling nested values.
    private func serializeProps(_ props: [String: Any]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in props {
            if let dict = value as? [String: Any] {
                result[key] = serializeProps(dict)
            } else if let array = value as? [Any] {
                result[key] = array
            } else if let str = value as? String {
                result[key] = str
            } else if let num = value as? NSNumber {
                result[key] = num
            } else if let bool = value as? Bool {
                result[key] = bool
            } else {
                result[key] = "\(value)"
            }
        }
        return result
    }
}
