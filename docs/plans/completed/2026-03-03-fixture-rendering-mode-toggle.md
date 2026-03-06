# Fixture Rendering Mode Toggle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global segmented control (Server / Hydrated / PPR) to the Falcon Demo app so any fixture can be rendered in any mode.

**Architecture:** Replace per-fixture `ssrEndpoint` config with a global `@AppStorage` rendering mode. The segmented control lives in `CategoryListView`. `FixtureRootView` reads the global mode to dispatch to the appropriate view controller. All fixtures work in all modes (with graceful degradation).

**Tech Stack:** SwiftUI, UIKit, Express/Node.js

---

### Task 1: Remove `ssrEndpoint` from fixture configs

**Files:**
- Modify: `example/server/src/fixtures/30-prerender-resume.js:8-10`
- Modify: `example/server/src/fixtures/31-server-only.js:8-10`

**Step 1: Remove `ssrEndpoint` from fixture 30**

In `example/server/src/fixtures/30-prerender-resume.js`, change:

```javascript
  config: {
    ssrEndpoint: 'prerender',
  },
```

to:

```javascript
  config: {},
```

**Step 2: Remove `ssrEndpoint` from fixture 31**

In `example/server/src/fixtures/31-server-only.js`, change:

```javascript
  config: {
    ssrEndpoint: 'server-only',
  },
```

to:

```javascript
  config: {},
```

**Step 3: Commit**

```bash
git add example/server/src/fixtures/30-prerender-resume.js example/server/src/fixtures/31-server-only.js
git commit -m "refactor: remove ssrEndpoint from fixture configs"
```

---

### Task 2: Remove `ssrEndpoint` from Swift model and add rendering mode

**Files:**
- Modify: `example/Falcon/Falcon/FalconApp.swift:5-9` (FixtureConfig struct)
- Modify: `example/Falcon/Falcon/FalconApp.swift:104-144` (CategoryListView)
- Modify: `example/Falcon/Falcon/FalconApp.swift:169-234` (FixtureDetailView + FixtureRootView)

**Step 1: Remove `ssrEndpoint` from `FixtureConfig`**

In `FalconApp.swift`, change the `FixtureConfig` struct from:

```swift
struct FixtureConfig: Codable {
    var hideNavBar: Bool?
    var backgroundColor: String?
    var ssrEndpoint: String?
}
```

to:

```swift
struct FixtureConfig: Codable {
    var hideNavBar: Bool?
    var backgroundColor: String?
}
```

**Step 2: Add rendering mode enum and segmented control to `CategoryListView`**

Add a `RenderingMode` enum before `CategoryListView`:

```swift
enum RenderingMode: String, CaseIterable {
    case server = "server"
    case hydrated = "hydrated"
    case ppr = "ppr"

    var label: String {
        switch self {
        case .server: return "Server"
        case .hydrated: return "Hydrated"
        case .ppr: return "PPR"
        }
    }
}
```

In `CategoryListView`, add the `@AppStorage` property:

```swift
@AppStorage("renderingMode") private var renderingMode: String = RenderingMode.hydrated.rawValue
```

Add the segmented control above the `List` by wrapping in a `VStack`:

```swift
var body: some View {
    VStack(spacing: 0) {
        Picker("Rendering Mode", selection: $renderingMode) {
            ForEach(RenderingMode.allCases, id: \.rawValue) { mode in
                Text(mode.label).tag(mode.rawValue)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal)
        .padding(.vertical, 8)

        List(store.categories) { category in
            NavigationLink(value: NavDestination.category(category.category)) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(category.category)
                            .font(.headline)
                        Text("\(category.fixtures.count) fixture\(category.fixtures.count == 1 ? "" : "s")")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }
        }
    }
    .navigationTitle("Fixtures")
    .onAppear {
        store.fetchFixtures()
        if !hasAutoNavigated, path.isEmpty, let last = store.lastViewedFixture {
            hasAutoNavigated = true
            let parts = last.split(separator: "/", maxSplits: 1)
            if parts.count == 2 {
                let category = String(parts[0])
                let fixture = String(parts[1])
                path.append(NavDestination.category(category))
                path.append(NavDestination.fixture(fixture))
            }
        }
    }
    .onChange(of: path) { newPath in
        if newPath.isEmpty {
            store.lastViewedFixture = nil
        }
    }
}
```

**Step 3: Update `FixtureDetailView` to pass rendering mode instead of `ssrEndpoint`**

Change `FixtureDetailView` to read the global rendering mode and pass it to `FixtureRootView`:

Add the `@AppStorage` property to `FixtureDetailView`:

```swift
@AppStorage("renderingMode") private var renderingMode: String = RenderingMode.hydrated.rawValue
```

Change the `FixtureRootView` instantiation from:

```swift
FixtureRootView(fixtureName: fixtureName, ssrEndpoint: fixtureConfig?.ssrEndpoint ?? "ssr")
```

to:

```swift
FixtureRootView(fixtureName: fixtureName, renderingMode: renderingMode)
```

**Step 4: Update `FixtureRootView` to dispatch based on rendering mode**

Change `FixtureRootView` from:

```swift
struct FixtureRootView: UIViewControllerRepresentable {
    let fixtureName: String
    let ssrEndpoint: String

    func makeUIViewController(context: Context) -> UIViewController {
        switch ssrEndpoint {
        case "prerender":
            return PrerenderViewController(fixtureName: fixtureName)
        case "server-only":
            return ServerOnlyViewController(fixtureName: fixtureName)
        default:
            return HydrationViewController(fixtureName: fixtureName)
        }
    }

    func updateUIViewController(_ vc: UIViewController, context: Context) {}
}
```

to:

```swift
struct FixtureRootView: UIViewControllerRepresentable {
    let fixtureName: String
    let renderingMode: String

    func makeUIViewController(context: Context) -> UIViewController {
        switch renderingMode {
        case RenderingMode.server.rawValue:
            return ServerOnlyViewController(fixtureName: fixtureName)
        case RenderingMode.ppr.rawValue:
            return PrerenderViewController(fixtureName: fixtureName)
        default:
            return HydrationViewController(fixtureName: fixtureName)
        }
    }

    func updateUIViewController(_ vc: UIViewController, context: Context) {}
}
```

**Step 5: Commit**

```bash
git add example/Falcon/Falcon/FalconApp.swift
git commit -m "feat: add global rendering mode toggle (Server/Hydrated/PPR)"
```

---

### Task 3: Verify the app builds and all three modes work

**Step 1: Build the app**

Use `/build demo` to build and run the Falcon Demo app.

**Step 2: Take a screenshot to verify the segmented control appears**

```bash
npm run app:screenshot
```

Verify the segmented control shows "Server / Hydrated / PPR" at the top of the category list.

**Step 3: Test Hydrated mode (default)**

Open any fixture (e.g. Kitchen Sink). Take a screenshot. Verify it renders with full interactivity.

**Step 4: Navigate back, switch to Server mode**

Tap the "Server" segment. Open the same fixture. Take a screenshot. Verify it renders (client components visible but not interactive).

**Step 5: Navigate back, switch to PPR mode**

Tap the "PPR" segment. Open the same fixture. Take a screenshot. Verify it renders via prerender+resume.

**Step 6: Verify mode persists across app restart**

Kill and relaunch the app. Verify the last selected mode is still active.

**Step 7: Commit design doc to completed plans**

```bash
mv docs/plans/2026-03-03-fixture-rendering-mode-toggle-design.md docs/plans/complete/
git add docs/plans/complete/2026-03-03-fixture-rendering-mode-toggle-design.md
git add -u docs/plans/2026-03-03-fixture-rendering-mode-toggle-design.md
git commit -m "docs: move fixture rendering mode toggle design to complete"
```
