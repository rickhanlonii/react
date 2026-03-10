# Demo Todo App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a standalone iOS Demo app that renders a single Todo fixture with a hidden debug menu for switching between Server Only, Hydrated, and PPR rendering modes.

**Architecture:** SwiftUI `@main` app with `UIViewControllerRepresentable` bridging to ReactDomNativeKit ViewControllers. Hits the same RSC/SSR servers as Falcon Demo (:6000/:6001). New server fixture `37-demo-todo.js` with static header shell + Suspense-wrapped async todo list.

**Tech Stack:** SwiftUI, UIKit, ReactDomNativeKit (local SPM), React Server Components, Suspense, Server Actions

---

### Task 1: Create the server fixture

**Files:**
- Create: `example/server/src/fixtures/37-demo-todo.js`

**Step 1: Create the fixture file**

Create `example/server/src/fixtures/37-demo-todo.js` with this content:

```javascript
const React = require('react');
const {Suspense} = React;
const {getTodos, addTodo, toggleTodo, deleteTodo} = require('../actions/todo-actions');
const TodoAppList = require('../components/TodoAppList');
const AddTodoForm = require('../components/AddTodoForm');

const fixture = {
  title: 'Demo Todo',
  description: 'Standalone demo — Todo app with Suspense loading',
  category: 'Full Pages',
  config: {
    hideNavBar: true,
  },
};

const colors = {
  bg: '#f2f2f7',
  card: '#ffffff',
  text: '#1c1c1e',
  secondary: '#8e8e93',
  skeleton: '#e5e5ea',
  divider: '#c6c6c8',
};

const card = {
  backgroundColor: colors.card,
  borderRadius: 12,
  padding: 16,
};

function SkeletonRow() {
  return (
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 12}}>
      <div style={{width: 24, height: 24, borderRadius: 12, backgroundColor: colors.skeleton}} />
      <div style={{flex: 1, height: 14, backgroundColor: colors.skeleton, borderRadius: 7}} />
    </div>
  );
}

function TodoListSkeleton() {
  return (
    <div style={card}>
      <SkeletonRow />
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 36}} />
      <SkeletonRow />
      <div style={{height: 1, backgroundColor: colors.divider, marginLeft: 36}} />
      <SkeletonRow />
    </div>
  );
}

async function TodoListSection() {
  await new Promise(resolve => setTimeout(resolve, 800));
  const todos = getTodos();
  return (
    <div style={card}>
      <TodoAppList
        todos={todos}
        toggleTodo={toggleTodo}
        deleteTodo={deleteTodo}
      />
    </div>
  );
}

function App() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.bg,
        minHeight: '100%',
        padding: 16,
        gap: 12,
      }}>
      {/* Static shell — renders immediately, cached by PPR */}
      <div style={{paddingTop: 56, paddingBottom: 4}}>
        <h1 style={{color: colors.text, marginTop: 0, marginBottom: 4}}>Todos</h1>
        <p style={{color: colors.secondary, fontSize: 14, marginTop: 0, marginBottom: 0}}>
          A simple todo app powered by React Server Components
        </p>
      </div>

      <div style={card}>
        <AddTodoForm addTodo={addTodo} />
      </div>

      {/* Dynamic section — streams in via Suspense, resumed by PPR */}
      <Suspense fallback={<TodoListSkeleton />}>
        <TodoListSection />
      </Suspense>
    </div>
  );
}

module.exports = App;
module.exports.default = App;
module.exports.fixture = fixture;
```

**Step 2: Verify the fixture loads in Falcon Demo**

Start the dev server (`cd example && npm run dev`), open Falcon Demo, navigate to the new "Demo Todo" fixture, and confirm it renders with the loading skeleton then the todo list.

**Step 3: Commit**

```bash
git add example/server/src/fixtures/37-demo-todo.js
git commit -m "feat: add 37-demo-todo fixture for standalone Demo app"
```

---

### Task 2: Set up Xcode project with ReactDomNativeKit SPM dependency

This task requires manual Xcode steps. The engineer must:

1. Open `Demo/Demo.xcodeproj` in Xcode
2. Select the Demo project in the navigator → "Package Dependencies" tab
3. Click "+" → "Add Local..." → navigate to `packages/react-dom-native/ios`
4. Select all four library products: `JSEngine`, `ReactDomNativeKit`, `ShadowTree`, `Yoga`
5. Add an `Info.plist` file to the Demo target (or configure via build settings)
6. Ensure `NSAppTransportSecurity` → `NSAllowsLocalNetworking = true` is set

**Step 1: Add the SPM dependency in Xcode**

Open the project, add the local package at `../../packages/react-dom-native/ios`, link all four products to the Demo target.

**Step 2: Create Info.plist**

Create `Demo/Demo/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
```

**Step 3: Configure the target to use the Info.plist**

In Xcode → Demo target → Build Settings → search "Info.plist File" → set to `Demo/Info.plist`.

**Step 4: Commit**

```bash
git add Demo/
git commit -m "chore: add ReactDomNativeKit SPM dependency to Demo project"
```

---

### Task 3: Create the ViewControllers

**Files:**
- Create: `Demo/Demo/HydrationViewController.swift`
- Create: `Demo/Demo/ServerOnlyViewController.swift`
- Create: `Demo/Demo/PrerenderViewController.swift`

**Step 1: Create HydrationViewController.swift**

Copy from `example/Falcon/Falcon/HydrationViewController.swift` — it's identical:

```swift
import UIKit
import ReactDomNativeKit

class HydrationViewController: UIViewController {
    private let fixtureName: String
    private var root: Root?

    init(fixtureName: String) {
        self.fixtureName = fixtureName
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
        root = hydrateRoot(view, url: ssrURL)
    }

    deinit {
        root?.unmount()
    }
}
```

**Step 2: Create ServerOnlyViewController.swift**

Copy from `example/Falcon/Falcon/ServerOnlyViewController.swift`:

```swift
import UIKit
import ReactDomNativeKit

class ServerOnlyViewController: UIViewController {
    private let fixtureName: String
    private var root: Root?

    init(fixtureName: String) {
        self.fixtureName = fixtureName
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
        root = createRootFromFetch(view, url: ssrURL)
    }

    deinit {
        root?.unmount()
    }
}
```

**Step 3: Create PrerenderViewController.swift**

Copy from `example/Falcon/Falcon/PrerenderViewController.swift` — the full ~125 line file including prerender caching, stale-while-revalidate, and response parsing.

**Step 4: Verify build**

Build the project in Xcode (Cmd+B) targeting the Demo simulator. It should compile without errors.

**Step 5: Commit**

```bash
git add Demo/Demo/HydrationViewController.swift Demo/Demo/ServerOnlyViewController.swift Demo/Demo/PrerenderViewController.swift
git commit -m "feat: add ViewControllers for hydration, server-only, and PPR modes"
```

---

### Task 4: Rewrite DemoApp.swift with rendering mode support and debug menu

**Files:**
- Modify: `Demo/Demo/DemoApp.swift`
- Delete: `Demo/Demo/ContentView.swift`

**Step 1: Delete ContentView.swift**

```bash
rm Demo/Demo/ContentView.swift
```

**Step 2: Rewrite DemoApp.swift**

Replace the contents of `Demo/Demo/DemoApp.swift` with:

```swift
import SwiftUI
import UIKit
import ReactDomNativeKit

// MARK: - Rendering Mode

enum RenderingMode: String, CaseIterable {
    case server = "server"
    case hydrated = "hydrated"
    case ppr = "ppr"

    var label: String {
        switch self {
        case .server: return "Server Only"
        case .hydrated: return "Hydrated"
        case .ppr: return "Partial Prerender"
        }
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, UIApplicationDelegate {
    var jsRuntime: JSRuntime?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        return true
    }
}

// MARK: - App Entry Point

@main
struct DemoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @AppStorage("renderingMode") private var renderingMode: String = RenderingMode.hydrated.rawValue
    @State private var showDebugMenu = false

    private let fixtureName = "37-demo-todo"

    var body: some Scene {
        WindowGroup {
            DemoRootView(fixtureName: fixtureName, renderingMode: renderingMode)
                .id(renderingMode)
                .ignoresSafeArea()
                .sheet(isPresented: $showDebugMenu) {
                    DebugMenuView(renderingMode: $renderingMode, showDebugMenu: $showDebugMenu)
                        .presentationDetents([.medium])
                }
                .onKeyPress(.init("d"), modifiers: [.command, .shift]) {
                    showDebugMenu.toggle()
                    return .handled
                }
        }
    }
}

// MARK: - Debug Menu

struct DebugMenuView: View {
    @Binding var renderingMode: String
    @Binding var showDebugMenu: Bool

    var body: some View {
        NavigationStack {
            List {
                Section("Rendering Mode") {
                    ForEach(RenderingMode.allCases, id: \.rawValue) { mode in
                        Button {
                            renderingMode = mode.rawValue
                            showDebugMenu = false
                        } label: {
                            HStack {
                                Text(mode.label)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if renderingMode == mode.rawValue {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(.blue)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Debug")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        showDebugMenu = false
                    }
                }
            }
        }
    }
}

// MARK: - UIViewControllerRepresentable Bridge

struct DemoRootView: UIViewControllerRepresentable {
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

**Step 3: Verify build**

Build in Xcode (Cmd+B). Should compile without errors.

**Step 4: Commit**

```bash
git add -A Demo/Demo/
git commit -m "feat: implement DemoApp with rendering mode debug menu (Cmd+Shift+D)"
```

---

### Task 5: Build and test end-to-end

**Step 1: Start the dev server**

```bash
cd example && npm run dev
```

**Step 2: Build and run on Demo simulator**

Build and run the Demo app in Xcode targeting the "Demo" simulator.

**Step 3: Verify Hydrated mode (default)**

- App should launch and show the "Todos" header and add form immediately
- After ~800ms, the todo list should stream in (replacing the skeleton)
- Add a todo, toggle it, delete it — server actions should work

**Step 4: Verify debug menu**

- Press Cmd+Shift+D — the debug menu sheet should appear
- "Hydrated" should have a checkmark
- Select "Server Only" — app should reload in server-only mode (no interactivity)
- Cmd+Shift+D again → select "Partial Prerender" — app should show cached shell instantly, then resume

**Step 5: Commit the plan doc**

```bash
mkdir -p docs/plans/complete
mv docs/plans/2026-03-09-demo-todo-app-design.md docs/plans/complete/
mv docs/plans/2026-03-09-demo-todo-app.md docs/plans/complete/
git add docs/plans/
git commit -m "docs: move demo todo app plans to complete"
```
