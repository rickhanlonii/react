# Fixture Render Modes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow demo app fixtures to specify their rendering mode — CSR, SSR (no hydration), or SSR + hydration — so each fixture exercises a specific rendering pipeline.

**Architecture:** Add a `renderMode` field to the fixture metadata (`fixture.config`). The server passes it through the existing `/fixtures` API. The Swift `FixtureConfig` decodes it, and `FixtureViewController` branches on it to call the appropriate `Root` API. A new `.ssrOnly` case in `Root.RenderMode` ensures hot reload recovery works for SSR-only fixtures.

**Tech Stack:** JavaScript (fixture metadata), Swift (FixtureConfig, FixtureViewController, Root)

---

### Task 1: Add `ssrOnly` render mode to `Root.swift`

The `Root` class tracks render mode for hot reload recovery via `rerender()`. Currently it has `.csr` and `.ssr` (which means SSR + hydration). SSR-only (no hydration) leaves `renderMode` as `nil` because `renderMode` is only set inside `hydrateRoot()` (line 833). We need a new case so hot reload works for SSR-only fixtures.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Add `.ssrOnly` case to `RenderMode` enum**

In `Root.swift` around line 72, the `RenderMode` enum currently has:

```swift
private enum RenderMode {
    case csr(serverURL: String)
    case ssr(ssrURL: String, flightURL: String)
}
```

Change it to:

```swift
private enum RenderMode {
    case csr(serverURL: String)
    case ssrOnly(ssrURL: String)
    case ssr(ssrURL: String, flightURL: String)
}
```

**Step 2: Handle `.ssrOnly` in `rerender()`**

In the `rerender()` method (around line 238), the switch on `renderMode` currently handles `.csr` and `.ssr`. Add the new case between them:

```swift
case .ssrOnly(let ssrURL):
    print("[Root] Re-rendering (SSR only) — \(ssrURL)")
    renderWithSSR(serverURL: ssrURL) { error in
        if let error = error {
            print("[Root] SSR-only re-render failed: \(error)")
        }
    }
    renderMode = .ssrOnly(ssrURL: ssrURL)
```

Note: We re-set `renderMode` after calling `renderWithSSR` because `renderWithSSR` doesn't set it (only `hydrateRoot` and `render` set `renderMode`).

**Step 3: Add public `renderSSROnly` convenience method**

Add a public method after the existing `render(serverURL:)` method (around line 134). This calls `renderWithSSR` and sets the render mode so hot reload works:

```swift
/// Renders using SSR only — no JavaScript, no hydration, no interactivity.
///
/// Use this for static content that doesn't need client-side React.
/// The content will be rendered instantly from the SSR stream but won't
/// respond to events or update.
public func renderSSROnly(serverURL: String, completion: ((Error?) -> Void)? = nil) {
    renderWithSSR(serverURL: serverURL, completion: completion)
    renderMode = .ssrOnly(ssrURL: serverURL)
}
```

**Step 4: Build to verify no compile errors**

Run: `npm run test:swift 2>&1 | tail -5`
Expected: Build succeeds (tests may or may not all pass — we just need compilation)

**Step 5: Commit**

```
feat: add ssrOnly render mode to Root for SSR without hydration
```

---

### Task 2: Add `renderMode` to Swift `FixtureConfig` and plumb through to `FixtureViewController`

**Files:**
- Modify: `example/Falcon/Falcon/FalconApp.swift`

**Step 1: Add `renderMode` to `FixtureConfig`**

In `FalconApp.swift` line 6, `FixtureConfig` currently has:

```swift
struct FixtureConfig: Codable {
    var hideNavBar: Bool?
    var backgroundColor: String?
}
```

Add:

```swift
struct FixtureConfig: Codable {
    var hideNavBar: Bool?
    var backgroundColor: String?
    var renderMode: String?
}
```

**Step 2: Pass `renderMode` to `FixtureRootView`**

`FixtureDetailView` (line 189) currently creates `FixtureRootView` with just `fixtureName`:

```swift
FixtureRootView(fixtureName: fixtureName)
```

Change to:

```swift
FixtureRootView(fixtureName: fixtureName, renderMode: fixtureConfig?.renderMode ?? "ssr+hydration")
```

**Step 3: Update `FixtureRootView` to accept and pass `renderMode`**

`FixtureRootView` (line 218) currently has:

```swift
struct FixtureRootView: UIViewControllerRepresentable {
    let fixtureName: String

    func makeUIViewController(context: Context) -> FixtureViewController {
        return FixtureViewController(fixtureName: fixtureName)
    }

    func updateUIViewController(_ vc: FixtureViewController, context: Context) {}
}
```

Change to:

```swift
struct FixtureRootView: UIViewControllerRepresentable {
    let fixtureName: String
    let renderMode: String

    func makeUIViewController(context: Context) -> FixtureViewController {
        return FixtureViewController(fixtureName: fixtureName, renderMode: renderMode)
    }

    func updateUIViewController(_ vc: FixtureViewController, context: Context) {}
}
```

**Step 4: Update `FixtureViewController` to accept `renderMode` and branch rendering**

Update the init (line 232):

```swift
class FixtureViewController: UIViewController {
    private let fixtureName: String
    private let renderMode: String
    private var root: Root?

    init(fixtureName: String, renderMode: String = "ssr+hydration") {
        self.fixtureName = fixtureName
        self.renderMode = renderMode
        super.init(nibName: nil, bundle: nil)
    }
```

Replace `renderAndHydrate()` (line 252) with a `renderFixture()` method that branches on mode:

```swift
private func renderFixture() {
    let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
    let flightURL = "http://localhost:6000/fixtures/\(fixtureName)"

    switch renderMode {
    case "csr":
        root?.render(serverURL: flightURL) { [weak self] error in
            if let error = error {
                print("[Falcon] CSR render failed for \(self?.fixtureName ?? ""): \(error)")
            } else {
                print("[Falcon] CSR render complete for \(self?.fixtureName ?? "")")
            }
        }

    case "ssr":
        root?.renderSSROnly(serverURL: ssrURL) { [weak self] error in
            if let error = error {
                print("[Falcon] SSR render failed for \(self?.fixtureName ?? ""): \(error)")
            } else {
                print("[Falcon] SSR render complete for \(self?.fixtureName ?? "")")
            }
        }

    default: // "ssr+hydration"
        root?.renderWithSSR(serverURL: ssrURL) { [weak self] error in
            if let error = error {
                print("[Falcon] Render failed for \(self?.fixtureName ?? ""): \(error)")
            }
        }
        root?.hydrateRoot(serverURL: flightURL) { [weak self] error in
            if let error = error {
                print("[Falcon] Hydration failed: \(error)")
            } else {
                print("[Falcon] Hydration complete for \(self?.fixtureName ?? "")")
            }
        }
    }
}
```

Update `viewDidLoad` (line 248) to call `renderFixture()` instead of `renderAndHydrate()`:

```swift
root = createRoot(view)
renderFixture()
```

**Step 5: Build to verify no compile errors**

Run: `cd example && xcodebuild build -project Falcon/Falcon.xcodeproj -scheme Falcon -destination 'platform=iOS Simulator,name=iPhone 16' 2>&1 | tail -10`
Expected: Build succeeds

**Step 6: Commit**

```
feat: plumb renderMode from fixture config through to FixtureViewController
```

---

### Task 3: Add fixtures that exercise CSR and SSR-only modes

Currently all fixtures use the default SSR + hydration. Add `renderMode` to a couple fixtures to exercise the other paths.

**Files:**
- Modify: `example/server/src/fixtures/01-rsc-only.js`
- Create: `example/server/src/fixtures/26-csr-counter.js`

**Step 1: Set `01-rsc-only` to SSR-only mode**

This fixture is pure server content with no client components, so SSR-only is the natural fit. In `01-rsc-only.js`, change the fixture metadata:

```js
const fixture = {
  title: 'RSC Only',
  description: 'Pure server components — no client components, no Suspense',
  category: 'Basics',
  config: {
    renderMode: 'ssr',
  },
};
```

**Step 2: Create a CSR fixture**

Create `example/server/src/fixtures/26-csr-counter.js`:

```js
const React = require('react');
const Counter = require('../components/Counter');

const fixture = {
  title: 'CSR Counter',
  description: 'Client-side rendered counter — no SSR, JS renders everything',
  category: 'Basics',
  config: {
    renderMode: 'csr',
  },
};

function CSRCounter() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>CSR Counter</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Rendered entirely on the client — no server HTML
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Counter</h3>
        <Counter initialCount={0} />
      </div>
    </div>
  );
}

module.exports = CSRCounter;
module.exports.default = CSRCounter;
module.exports.fixture = fixture;
```

**Step 3: Commit**

```
feat: add renderMode to RSC Only fixture and new CSR Counter fixture
```

---

### Task 4: Build and verify all three render modes work

**Step 1: Build and run the demo app**

Use `/build-demo` to build and run the Falcon demo app.

**Step 2: Verify SSR + hydration (default)**

Navigate to Basics > Client Components. This uses the default `ssr+hydration` mode. Verify:
- Content appears instantly (SSR)
- Counter is interactive (hydration worked)

**Step 3: Verify SSR-only**

Navigate to Basics > RSC Only. This uses `renderMode: 'ssr'`. Verify:
- Content appears instantly (SSR)
- Console shows "SSR render complete" (not "Hydration complete")

**Step 4: Verify CSR**

Navigate to Basics > CSR Counter. This uses `renderMode: 'csr'`. Verify:
- Content appears after JS boots (brief blank screen expected)
- Counter is interactive

**Step 5: Commit (if any fixes were needed)**

```
fix: address issues found during render mode verification
```
