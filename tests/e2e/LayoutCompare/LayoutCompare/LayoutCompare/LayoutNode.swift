import Foundation

/// Represents a node in the layout tree, shared between web and native extraction.
struct LayoutNode: Codable {
    let type: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let styles: [String: LayoutValue]
    let children: [LayoutNode]
}

/// A value that can be either a number or a string, for style properties.
enum LayoutValue: Codable, Equatable {
    case number(Double)
    case string(String)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let num = try? container.decode(Double.self) {
            self = .number(num)
        } else if let str = try? container.decode(String.self) {
            self = .string(str)
        } else {
            self = .number(0)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .number(let n):
            try container.encode(n)
        case .string(let s):
            try container.encode(s)
        }
    }

    var numericValue: Double? {
        switch self {
        case .number(let n): return n
        case .string: return nil
        }
    }

    var stringValue: String? {
        switch self {
        case .number: return nil
        case .string(let s): return s
        }
    }
}
