import Foundation

// ---------------------------------------------------------------------------
// InstructionStreamParser
//
// Receives streaming data chunks from URLSession and parses them into
// discrete instructions. Each instruction is a JSON array on its own line.
//
// Instruction format:
//   ["O","div",{...props}]   Open element
//   ["T","text content"]      Text node
//   ["C"]                     Close element
//   ["B",id]                  Begin Suspense boundary
//   ["/B"]                    End boundary
//   ["S",id]                  Begin completed segment
//   ["/S"]                    End completed segment
//   ["X",id]                  Execute boundary reveal
//   ["R"]                     Root shell complete
//   ["P",id]                  Placeholder
//   ["D","flight_row"]        Embedded Flight data
//   ["E",id,"digest"]         Client-render boundary (error)
//   ["JS","code"]             Evaluate JavaScript
// ---------------------------------------------------------------------------

/// Delegate protocol for handling parsed instructions.
public protocol InstructionStreamDelegate: AnyObject {
    func didReceiveOpenElement(type: String, props: [String: Any])
    func didReceiveTextNode(text: String)
    func didReceiveCloseElement()
    func didReceiveBeginBoundary(id: Int)
    func didReceiveEndBoundary()
    func didReceiveBeginSegment(id: Int)
    func didReceiveEndSegment()
    func didReceiveRevealBoundary(id: Int)
    func didReceiveRootComplete()
    func didReceivePlaceholder(id: Int)
    func didReceiveFlightData(row: String)
    func didReceiveClientRenderBoundary(id: Int, errorDigest: String?)
    func didReceiveJavaScript(code: String)
    func didReceiveError(_ error: Error)
}

public class InstructionStreamParser {

    public weak var delegate: InstructionStreamDelegate?

    /// Buffer for incomplete lines (data received between newlines)
    private var lineBuffer: Data = Data()

    public init() {}

    // MARK: - Public API

    /// Feed a chunk of streaming data to the parser.
    /// Call this as data arrives from URLSession.
    public func receive(data: Data) {
        lineBuffer.append(data)
        processBuffer()
    }

    /// Signal that the stream has ended. Processes any remaining buffered data.
    public func finish() {
        if !lineBuffer.isEmpty {
            processLine(lineBuffer)
            lineBuffer = Data()
        }
    }

    /// Reset the parser state for reuse.
    public func reset() {
        lineBuffer = Data()
    }

    // MARK: - Private

    /// Scans the buffer for complete lines (newline-delimited) and processes them.
    private func processBuffer() {
        let newline = UInt8(ascii: "\n")

        while let newlineIndex = lineBuffer.firstIndex(of: newline) {
            let lineData = lineBuffer[lineBuffer.startIndex..<newlineIndex]
            lineBuffer = lineBuffer[(newlineIndex + 1)...]

            if !lineData.isEmpty {
                processLine(Data(lineData))
            }
        }
    }

    /// Parses a single JSON line and dispatches to the delegate.
    private func processLine(_ lineData: Data) {
        do {
            guard let array = try JSONSerialization.jsonObject(with: lineData) as? [Any],
                  let opcode = array.first as? String else {
                delegate?.didReceiveError(
                    InstructionParseError.invalidFormat("Expected JSON array with string opcode")
                )
                return
            }

            switch opcode {
            case "O":
                // Open element: ["O", type] or ["O", type, {props}]
                guard array.count >= 2, let type = array[1] as? String else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("O instruction missing type")
                    )
                    return
                }
                let props = array.count >= 3 ? (array[2] as? [String: Any] ?? [:]) : [:]
                delegate?.didReceiveOpenElement(type: type, props: props)

            case "T":
                // Text node: ["T", "text content"]
                guard array.count >= 2, let text = array[1] as? String else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("T instruction missing text")
                    )
                    return
                }
                delegate?.didReceiveTextNode(text: text)

            case "C":
                // Close element: ["C"]
                delegate?.didReceiveCloseElement()

            case "B":
                // Begin boundary: ["B", id]
                guard array.count >= 2, let id = toInt(array[1]) else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("B instruction missing id")
                    )
                    return
                }
                delegate?.didReceiveBeginBoundary(id: id)

            case "/B":
                // End boundary: ["/B"]
                delegate?.didReceiveEndBoundary()

            case "S":
                // Begin segment: ["S", id]
                guard array.count >= 2, let id = toInt(array[1]) else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("S instruction missing id")
                    )
                    return
                }
                delegate?.didReceiveBeginSegment(id: id)

            case "/S":
                // End segment: ["/S"]
                delegate?.didReceiveEndSegment()

            case "X":
                // Reveal boundary: ["X", id]
                guard array.count >= 2, let id = toInt(array[1]) else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("X instruction missing id")
                    )
                    return
                }
                delegate?.didReceiveRevealBoundary(id: id)

            case "R":
                // Root complete: ["R"]
                delegate?.didReceiveRootComplete()

            case "P":
                // Placeholder: ["P", id]
                guard array.count >= 2, let id = toInt(array[1]) else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("P instruction missing id")
                    )
                    return
                }
                delegate?.didReceivePlaceholder(id: id)

            case "D":
                // Flight data: ["D", "flight_row"]
                guard array.count >= 2, let row = array[1] as? String else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("D instruction missing row data")
                    )
                    return
                }
                delegate?.didReceiveFlightData(row: row)

            case "E":
                // Client-render boundary: ["E", id, "digest"]
                guard array.count >= 2, let id = toInt(array[1]) else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("E instruction missing id")
                    )
                    return
                }
                let digest = array.count >= 3 ? array[2] as? String : nil
                delegate?.didReceiveClientRenderBoundary(id: id, errorDigest: digest)

            case "JS":
                // Evaluate JavaScript: ["JS", "code string"]
                guard array.count >= 2, let code = array[1] as? String else {
                    delegate?.didReceiveError(
                        InstructionParseError.invalidFormat("JS instruction missing code string")
                    )
                    return
                }
                delegate?.didReceiveJavaScript(code: code)

            default:
                delegate?.didReceiveError(
                    InstructionParseError.unknownOpcode(opcode)
                )
            }
        } catch {
            delegate?.didReceiveError(
                InstructionParseError.jsonParseError(error)
            )
        }
    }

    /// Helper to convert NSNumber/Int values from JSON to Int.
    private func toInt(_ value: Any) -> Int? {
        if let i = value as? Int {
            return i
        }
        if let n = value as? NSNumber {
            return n.intValue
        }
        return nil
    }
}

// MARK: - Errors

public enum InstructionParseError: Error, CustomStringConvertible {
    case invalidFormat(String)
    case unknownOpcode(String)
    case jsonParseError(Error)

    public var description: String {
        switch self {
        case .invalidFormat(let msg):
            return "Invalid instruction format: \(msg)"
        case .unknownOpcode(let opcode):
            return "Unknown instruction opcode: \(opcode)"
        case .jsonParseError(let error):
            return "JSON parse error: \(error.localizedDescription)"
        }
    }
}
