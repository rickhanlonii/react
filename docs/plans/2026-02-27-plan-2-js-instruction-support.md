# Plan 2: JS Instruction Support in SSR Client

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `["JS", code]` instruction type to the SSR instruction stream that evaluates JavaScript in JSC when encountered by the Swift client. This is the native equivalent of a browser executing `<script>` tags inline in HTML.

**Architecture:** The `InstructionStreamParser` gets a new `"JS"` opcode. `SSRCoordinator` passes the code string to a callback. `Root.swift` either evaluates it immediately (if the JS engine is booted) or buffers it for replay after boot. This is entirely non-breaking and additive — no existing instructions change, and nothing emits `"JS"` instructions yet.

**Tech Stack:** Swift (InstructionStreamParser, SSRCoordinator, Root, ReactRuntime)

**Depends on:** Plan 1 (polyfills should be in place first, though not strictly required)

---

## Context

### Current instruction set

Defined in `InstructionStreamParser.swift` (line 1-22) and `NativeFizzConfig.js`:

| Opcode | Format | Purpose |
|--------|--------|---------|
| `"O"` | `["O","div",{...}]` | Open element |
| `"T"` | `["T","text"]` | Text node |
| `"C"` | `["C"]` | Close element |
| `"B"` | `["B",id]` | Begin Suspense boundary |
| `"/B"` | `["/B"]` | End boundary |
| `"S"` | `["S",id]` | Begin segment |
| `"/S"` | `["/S"]` | End segment |
| `"X"` | `["X",id]` | Reveal boundary |
| `"R"` | `["R"]` | Root shell complete |
| `"P"` | `["P",id]` | Placeholder |
| `"D"` | `["D","row"]` | Flight data (will eventually be replaced by JS instructions) |
| `"E"` | `["E",id,"digest"]` | Client-render boundary |

### How the delegate protocol works

`InstructionStreamDelegate` (line 25-39 of InstructionStreamParser.swift) defines one method per instruction type. `SSRCoordinator` implements the protocol and either handles instructions directly or forwards via callback closures to `Root.swift`.

### How JS evaluation works in the runtime

`ReactRuntime.swift` holds a `JSRuntime` which has an `engine: JSEngine` with an `evaluate(_:)` method. Any Swift code with access to `ReactRuntime.shared` can evaluate JS.

---

### Task 1: Add `didReceiveJavaScript` to delegate protocol

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift`

**Step 1: Add delegate method**

Add to the `InstructionStreamDelegate` protocol (after line 37, before `didReceiveError`):

```swift
func didReceiveJavaScript(code: String)
```

**Step 2: Add opcode to header comment**

Update the comment block at top (after line 21) to include:

```
//   ["JS","code"]            Evaluate JavaScript
```

**Step 3: Add case to processLine() switch**

In the switch statement (after the `"E"` case, before `default`), add:

```swift
case "JS":
    // Evaluate JavaScript: ["JS", "code string"]
    guard array.count >= 2, let code = array[1] as? String else {
        delegate?.didReceiveError(
            InstructionParseError.invalidFormat("JS instruction missing code string")
        )
        return
    }
    delegate?.didReceiveJavaScript(code: code)
```

**Step 4: Verify Swift tests pass**

Run: `npm run test:swift`
Expected: Compiler errors in SSRCoordinator (doesn't conform to updated protocol yet). That's expected — we fix it in Task 2.

---

### Task 2: Add JS instruction handling to SSRCoordinator

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift`

**Step 1: Add callback property**

After the existing `onFlightDataReceived` property (line 53), add:

```swift
/// Called when a JS instruction is received from the SSR stream.
/// Used to evaluate JavaScript code in the JSC engine.
var onJavaScriptReceived: ((String) -> Void)?
```

**Step 2: Add delegate method implementation**

After `didReceiveFlightData` (line 323), add:

```swift
func didReceiveJavaScript(code: String) {
    onJavaScriptReceived?(code)
}
```

**Step 3: Verify Swift tests pass**

Run: `npm run test:swift`
Expected: PASS (protocol conformance satisfied, callback is nil so it's a no-op)

**Step 4: Commit**

```
feat: add JS instruction type to SSR instruction stream parser
```

---

### Task 3: Wire JS evaluation in Root.swift

Connect the `"JS"` instruction to actual JavaScript evaluation. Use the same buffering strategy as Flight data: buffer before the JS engine boots, evaluate immediately after.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`

**Step 1: Add evaluateScript method to ReactRuntime**

In `ReactRuntime.swift`, add a public method:

```swift
/// Evaluate arbitrary JavaScript code in the JS engine.
/// Used by the SSR client to execute inline scripts (["JS", code] instructions).
internal func evaluateScript(_ code: String) {
    runtime?.engine.evaluate(code)
}
```

**Step 2: Add JS buffer property to Root**

In `Root.swift`, near the existing `ssrFlightDataBuffer` property, add:

```swift
/// Buffer for JavaScript code received from JS instructions before the JS engine boots.
/// Replayed during hydration after the engine is ready.
private var ssrJavaScriptBuffer: [String] = []
```

**Step 3: Wire the callback in renderWithSSR()**

In `renderWithSSR()`, alongside the existing `coordinator.onFlightDataReceived` wiring, add:

```swift
coordinator.onJavaScriptReceived = { [weak self] code in
    guard let self = self else { return }
    if self.hydrationStarted {
        // JS engine is booted — evaluate immediately
        ReactRuntime.shared.evaluateScript(code)
    } else {
        // Buffer for evaluation after boot
        self.ssrJavaScriptBuffer.append(code)
    }
}
```

**Step 4: Replay buffered JS during hydration**

In `doHydrate()`, before the existing Flight data replay (`hydrateSurface` call), add:

```swift
// Replay buffered JS instructions from the SSR stream
for code in self.ssrJavaScriptBuffer {
    ReactRuntime.shared.evaluateScript(code)
}
self.ssrJavaScriptBuffer.removeAll()
```

**Step 5: Verify Swift tests pass**

Run: `npm run test:swift`
Expected: PASS

**Step 6: Verify E2E tests pass**

Run: `npm run test:e2e-swift`
Expected: PASS (no instructions emit "JS" yet, so this is a no-op path)

**Step 7: Commit**

```
feat: wire JS instruction evaluation in Root with pre-boot buffering
```
