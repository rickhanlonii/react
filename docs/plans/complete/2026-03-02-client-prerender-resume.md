# Client-Side Prerender + Resume Implementation Plan

**Goal:** Move prerender caching to the device. The native app fetches the static shell from `/prerender/:name` once, caches it locally, then calls `/resume/:name` with the postponed state to get fresh dynamic content. Subsequent loads replay the cached prelude instantly (no network for the shell).

**Architecture:**
- Server: Split current single `/prerender/:name` endpoint into two: `GET /prerender/:name` (returns prelude + postponed state) and `POST /resume/:name` (accepts postponed state, returns dynamic content)
- Client: New `prerenderRoot(view, url:)` API that checks device cache, replays prelude if cached, then resumes from server. Falls back to full prerender on cache miss.

---

### Task 1: Add `["POSTPONED"]` instruction to server prerender endpoint

**Files:**
- Modify: `example/server/ssr-server.js`

Refactor the existing `GET /prerender/:name` endpoint. Instead of doing prerender+resume in one response, return ONLY the prelude + postponed state:

1. Run `doPrerender()` (fetch Flight, prerenderToNodeStream with abort)
2. Return the prelude instruction stream as-is
3. Append a new instruction at the end: `["POSTPONED", <postponed-state-JSON>]`
4. Include Flight JS bootstrap rows before the prelude (same ordering fix we already have)

The response looks like:
```
["JS","self.__next_f.push([0])"]
...Flight JS rows from prerender phase...
["O","div",...]
...static shell...
["BOOT","http://localhost:6000/bundle.js"]
["R"]
["POSTPONED",{"nextSegmentId":1,"replayNodes":[...],...}]
```

No resume happens server-side. The client gets the prelude to cache and the postponed state to send back later.

**Cache the prerender result server-side too** (keep `prerenderCache`) so repeated `GET /prerender/:name` requests don't re-run the Fizz prerender — they serve the same cached prelude + postponed.

---

### Task 2: Add `POST /resume/:name` server endpoint

**Files:**
- Modify: `example/server/ssr-server.js`

New endpoint that accepts postponed state and returns the resume instruction stream:

1. Parse postponed state from request body (`req.body.postponed`)
2. Deep-clone it (Fizz mutates replayNodes)
3. Fetch fresh Flight stream from RSC server
4. Set up Flight capture/demux (same as existing `handlePrerenderResume`)
5. Call `resumeToPipeableStream` with the postponed state
6. Return: Flight JS bootstrap → resume Fizz output (segments + reveals) → Flight JS close instructions
7. End response when both Fizz and Flight capture are done (same race-condition fix)

Add `app.use(express.json({ limit: '1mb' }))` for JSON body parsing (or add it only to this route).

Response looks like:
```
["JS","self.__next_f.push([0])"]
...Flight JS rows...
["S",0]...content...["/S"]
["X",0]
...more segments...
["JS","...closeFlightDataStream..."]
```

---

### Task 3: Add `["POSTPONED"]` instruction type to native parser

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamParser.swift`
- Modify: `packages/react-dom-native/ios/Sources/ShadowTree/InstructionStreamDelegate.swift` (or wherever the delegate protocol is)

Add a new instruction case:
- Parser: when instruction[0] == `"POSTPONED"`, extract instruction[1] as the postponed JSON
- Delegate: add `didReceivePostponedState(data: Data)` callback
- SSRCoordinator: forward to a new closure `onPostponedStateReceived: ((Data) -> Void)?`

---

### Task 4: Implement on-device prerender cache

**Files:**
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/PrerenderCache.swift`

Simple file-based cache keyed by URL:

```swift
class PrerenderCache {
    static let shared = PrerenderCache()

    struct Entry: Codable {
        let prelude: Data      // Raw instruction stream bytes (replayable)
        let postponed: Data    // Serialized postponed state JSON
    }

    func get(for url: String) -> Entry?
    func set(for url: String, prelude: Data, postponed: Data)
    func remove(for url: String)
    func clear()
}
```

Storage: `FileManager` in the app's caches directory (`/Library/Caches/ReactPrerender/`). Key is a hash of the URL. Use `Codable` + `JSONEncoder/Decoder` for serialization.

---

### Task 5: Implement `prerenderRoot()` public API

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Prerender.swift`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` (add `RenderMode.prerender` case + prerender state properties)
- Create: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Prerender.swift`

Public API (matches `hydrateRoot` pattern — synchronous, starts async work internally):

```swift
/// Prerender + resume: static shell from cache (or server), dynamic content from /resume.
/// - url: prerender endpoint, e.g. "http://localhost:6001/prerender/30-prerender-resume"
///   Resume URL derived by replacing /prerender/ with /resume/ in the path.
public func prerenderRoot(_ view: UIView, url: String) -> Root
```

**Root+Prerender.swift** implements `startPrerender(url:)`:

1. Derive resume URL: replace `/prerender/` → `/resume/` in path
2. Check `PrerenderCache.shared.get(for: url)`
3. **Cache hit:**
   a. Create SSR infrastructure (ShadowTreeBuilder, BoundaryManager, InstructionStreamParser, SSRCoordinator)
   b. Replay cached prelude bytes through the parser → builds shadow tree → UIKit views (instant, no network)
   c. Post postponed state to resume URL → process resume instruction stream (segments, reveals, Flight JS)
   d. Start hydration (same as `startHydration` — boot runtime, replay JS buffer, hydrate)
4. **Cache miss:**
   a. Fetch `GET url` → instruction stream (same SSR infrastructure)
   b. Process instructions as they stream in (build views progressively)
   c. When `["POSTPONED", {...}]` arrives → extract and cache prelude + postponed
   d. Post postponed state to resume URL → process resume instructions
   e. Start hydration

The prerender flow reuses all existing SSR infrastructure: `InstructionStreamParser`, `SSRCoordinator`, `ShadowTreeBuilder`, `BoundaryManager`, boundary reveal throttling, hydration lifecycle. The difference is TWO HTTP requests instead of one, with caching between them.

Add to Root.swift:
```swift
enum RenderMode {
    case csr(serverURL: String)
    case ssr(url: String)
    case prerender(prerenderURL: String, resumeURL: String)
}
```

Add prerender-specific state:
```swift
var prerenderResumeURL: String?
var prerenderPostponedState: Data?
```

---

### Task 6: Handle Flight URL derivation for prerender paths

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift` (or Root+Prerender.swift)

The existing Flight URL derivation checks for `/ssr/` in the path (line 191). For prerender, the SSR URL will contain `/prerender/` or `/resume/`. Update the derivation to handle both:

```swift
let knownPrefixes = ["ssr", "prerender", "resume"]
if let ssrURL = URL(string: url),
   ssrURL.pathComponents.count >= 3,
   knownPrefixes.contains(ssrURL.pathComponents[1]) {
    fixturePath = "/fixtures/" + ssrURL.pathComponents.dropFirst(2).joined(separator: "/")
}
```

---

### Task 7: Update demo app to use `prerenderRoot`

**Files:**
- Modify: `example/Falcon/Falcon/FalconApp.swift`

Update `FixtureViewController` to use `prerenderRoot` when `ssrEndpoint == "prerender"`:

```swift
override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear

    let baseURL = "http://localhost:6001/\(ssrEndpoint)/\(fixtureName)"
    if ssrEndpoint == "prerender" {
        root = prerenderRoot(view, url: baseURL)
    } else {
        root = hydrateRoot(view, url: baseURL)
    }
}
```

---

### Task 8: Verify end-to-end

1. Run `npm test` and `npx jest --selectProjects server` — all tests pass
2. Start dev servers, build and run Falcon Demo
3. Navigate to Prerender + Resume fixture
4. **First load:** static shell appears → skeletons → dynamic content fills in (prelude fetched from server, cached on device)
5. **Cmd+Shift+R:** static shell appears INSTANTLY (from device cache, no network for shell) → dynamic content fills in (from /resume endpoint)
6. Verify other fixtures still work normally via `/ssr/` path
7. Commit

---

### Flow Diagram

```
FIRST LOAD (cache miss):

  Device                          SSR Server               RSC Server
    │                                │                         │
    │  GET /prerender/fixture        │                         │
    │───────────────────────────────>│  GET /fixtures/fixture ──>
    │                                │  <── Flight stream ─────┤
    │                                │  prerenderToNodeStream() │
    │                                │  abort after 200ms       │
    │  <── prelude instructions ─────┤                         │
    │  <── ["POSTPONED",{...}] ──────┤                         │
    │                                │                         │
    │  Cache prelude+postponed       │                         │
    │  to ~/Library/Caches/          │                         │
    │                                │                         │
    │  POST /resume/fixture          │                         │
    │  Body: {postponed: {...}}      │                         │
    │───────────────────────────────>│  GET /fixtures/fixture ──>
    │                                │  <── Flight stream ─────┤
    │                                │  resumeToPipeableStream()│
    │  <── Flight JS + segments ─────┤                         │
    │  <── ["X",0] reveals ──────────┤                         │
    │  <── closeFlightDataStream ────┤                         │
    │                                │                         │
    │  Hydrate                       │                         │


SUBSEQUENT LOAD (cache hit):

  Device                          SSR Server               RSC Server
    │                                │                         │
    │  Replay cached prelude         │                         │
    │  (instant, NO network)         │                         │
    │  ┌──────────────┐              │                         │
    │  │ Static shell │              │                         │
    │  │ [skeletons]  │              │                         │
    │  └──────────────┘              │                         │
    │                                │                         │
    │  POST /resume/fixture          │                         │
    │  Body: {postponed: {...}}      │                         │
    │───────────────────────────────>│  GET /fixtures/fixture ──>
    │                                │  <── Flight stream ─────┤
    │  <── segments + reveals ───────┤                         │
    │  ┌──────────────┐              │                         │
    │  │ Static shell │              │                         │
    │  │ Dynamic data │              │                         │
    │  └──────────────┘              │                         │
    │                                │                         │
    │  Hydrate                       │                         │
```
