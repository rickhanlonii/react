# Fixture Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monolithic demo app with a fixture-based system where each fixture is an independent Flight/Fizz/hydrate root, browsable via native SwiftUI navigation.

**Architecture:** Server discovers fixture files from `example/server/src/fixtures/`, exposes `/fixtures` (JSON list) and `/fixtures/:name` (Flight stream) endpoints. Native iOS app shows a SwiftUI NavigationStack with fixture list → detail view. Each detail view creates a fresh React Root. Last-viewed fixture persisted in UserDefaults for seamless iteration.

**Tech Stack:** Express (server), React RSC/Flight/Fizz (rendering), SwiftUI + UIKit (native navigation), UserDefaults (persistence)

---

### Task 1: Create fixture files from existing App.js

**Files:**
- Create: `example/server/src/fixtures/rsc-only.js`
- Create: `example/server/src/fixtures/client-components.js`
- Create: `example/server/src/fixtures/single-suspense.js`
- Create: `example/server/src/fixtures/nested-suspense.js`
- Create: `example/server/src/fixtures/text-formatting.js`
- Create: `example/server/src/fixtures/kitchen-sink.js`

**Step 1: Create the fixtures directory and all 6 fixture files**

Each fixture uses CommonJS (`module.exports`) to match the existing server code style. Each exports a `fixture` metadata object and a default component.

`example/server/src/fixtures/rsc-only.js`:
```js
const React = require('react');

const fixture = {
  title: 'RSC Only',
  description: 'Pure server components — no client components, no Suspense',
};

function RscOnly() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>RSC Only</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Pure server-rendered content with no client JavaScript
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Server Content</h3>
        <p style={{color: '#1c1c1e', marginTop: 0}}>
          This entire page is rendered on the server. No client components are loaded.
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Static List</h3>
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>• Item one</p>
          <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>• Item two</p>
          <p style={{color: '#1c1c1e', marginTop: 0, marginBottom: 0}}>• Item three</p>
        </div>
      </div>
    </div>
  );
}

module.exports = RscOnly;
module.exports.default = RscOnly;
module.exports.fixture = fixture;
```

`example/server/src/fixtures/client-components.js` — imports Counter and Tabs from `../components/`, wraps them in cards (no Suspense, no async delays):
```js
const React = require('react');
const Counter = require('../components/Counter');
const Tabs = require('../components/Tabs');

const fixture = {
  title: 'Client Components',
  description: 'RSC with client components — tests Flight module loading and hydration',
};

function ClientComponents() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Client Components</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Server-rendered with interactive client components
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Counter</h3>
        <Counter initialCount={0} />
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Tabs</h3>
        <Tabs tabs={[
          {label: 'Tab 1', content: <p style={{color: '#1c1c1e', marginTop: 0}}>Content for tab one</p>},
          {label: 'Tab 2', content: <p style={{color: '#1c1c1e', marginTop: 0}}>Content for tab two</p>},
          {label: 'Tab 3', content: <p style={{color: '#1c1c1e', marginTop: 0}}>Content for tab three</p>},
        ]} />
      </div>
    </div>
  );
}

module.exports = ClientComponents;
module.exports.default = ClientComponents;
module.exports.fixture = fixture;
```

`example/server/src/fixtures/single-suspense.js` — one async server component in a Suspense boundary:
```js
const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Single Suspense',
  description: 'One async server component in a Suspense boundary with skeleton fallback',
};

async function SlowContent({delay}) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return (
    <div>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>Loaded Content</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>
        This content was loaded after a {delay}ms delay on the server.
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '80%'}} />
    </div>
  );
}

function SingleSuspense() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Single Suspense</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          One Suspense boundary with async server content
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <Suspense fallback={<Skeleton />}>
          <SlowContent delay={1500} />
        </Suspense>
      </div>
    </div>
  );
}

module.exports = SingleSuspense;
module.exports.default = SingleSuspense;
module.exports.fixture = fixture;
```

`example/server/src/fixtures/nested-suspense.js` — multiple nested Suspense boundaries with staggered delays:
```js
const React = require('react');
const {Suspense} = React;

const fixture = {
  title: 'Nested Suspense',
  description: 'Multiple nested Suspense boundaries with staggered delays',
};

async function SlowSection({label, delay}) {
  await new Promise(resolve => setTimeout(resolve, delay));
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 8}}>{label}</h3>
      <p style={{color: '#1c1c1e', marginTop: 0}}>Loaded after {delay}ms</p>
    </div>
  );
}

function Skeleton({label}) {
  return (
    <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 20, width: 120}} />
      <div style={{backgroundColor: '#e5e5ea', borderRadius: 7, height: 14, width: '60%', marginTop: 8}} />
    </div>
  );
}

function NestedSuspense() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Nested Suspense</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Boundaries resolve in order: 500ms, 1000ms, 2000ms, 3000ms
        </p>
      </div>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Fast (500ms)" delay={500} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Medium (1000ms)" delay={1000} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Slow (2000ms)" delay={2000} />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <SlowSection label="Slowest (3000ms)" delay={3000} />
      </Suspense>
    </div>
  );
}

module.exports = NestedSuspense;
module.exports.default = NestedSuspense;
module.exports.fixture = fixture;
```

`example/server/src/fixtures/text-formatting.js` — extracted from existing App.js rich text section:
```js
const React = require('react');

const fixture = {
  title: 'Text Formatting',
  description: 'Inline text elements: bold, italic, underline, code, mark, sub, sup',
};

function TextFormatting() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', backgroundColor: '#f2f2f7', minHeight: '100%', padding: 16, gap: 16}}>
      <div style={{paddingTop: 48, paddingBottom: 8}}>
        <h1 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Text Formatting</h1>
        <p style={{color: '#8e8e93', fontSize: 15, marginTop: 0}}>
          Inline text formatting elements
        </p>
      </div>
      <div style={{backgroundColor: '#ffffff', borderRadius: 12, padding: 16}}>
        <h3 style={{color: '#1c1c1e', marginTop: 0, marginBottom: 4}}>Rich Text</h3>
        <div style={{height: 1, backgroundColor: '#c6c6c8', marginTop: 8, marginBottom: 12}} />
        <p style={{color: '#1c1c1e'}}>
          This is <b>bold</b>, <i>italic</i>, and <u>underlined</u> text.
        </p>
        <p style={{color: '#1c1c1e'}}>
          Inline <code>code</code> and <mark>highlighted</mark> text.
        </p>
        <p style={{color: '#1c1c1e'}}>
          H<sub>2</sub>O and E=mc<sup>2</sup> with sub and superscripts.
        </p>
      </div>
    </div>
  );
}

module.exports = TextFormatting;
module.exports.default = TextFormatting;
module.exports.fixture = fixture;
```

`example/server/src/fixtures/kitchen-sink.js` — the full original App.js content. Copy the entire App function and all helper components/styles from `App.js` into this file:
```js
// Copy the entire content of App.js here, but rename the export and add fixture metadata:
// ... (all existing imports, styles, skeletons, sections from App.js) ...

const fixture = {
  title: 'Kitchen Sink',
  description: 'Full demo — all 5 card sections with Suspense, client components, and rich text',
};

// ... (App function body unchanged) ...

module.exports = App;
module.exports.default = App;
module.exports.fixture = fixture;
```

**Step 2: Verify fixture files are syntactically valid**

Run: `cd /Users/rickhanlonii/oss/falcon/example/server && node -e "require('./src/fixtures/rsc-only')"`

Repeat for each fixture file. Expected: no errors.

**Step 3: Commit**

```bash
git add example/server/src/fixtures/
git commit -m "feat(fixtures): create 6 fixture files from existing App.js"
```

---

### Task 2: Add fixture endpoints to Flight server

**Files:**
- Modify: `example/server/server.js`

**Step 1: Add `GET /fixtures` endpoint**

Add after the existing `GET /bundle-version` handler (line 179) and before `GET /` (line 181):

```js
// Discover fixtures from the fixtures directory
var FIXTURES_DIR = path.resolve(__dirname, 'src/fixtures');

app.get('/fixtures', function (req, res) {
  clearServerSourceCache();
  var files = fs.readdirSync(FIXTURES_DIR)
    .filter(function(f) { return f.endsWith('.js'); })
    .sort();

  var fixtures = files.map(function(f) {
    var mod = require(path.join(FIXTURES_DIR, f));
    var meta = mod.fixture || {};
    var name = f.replace('.js', '');
    return {
      name: name,
      title: meta.title || name,
      description: meta.description || '',
    };
  });

  res.json(fixtures);
});
```

**Step 2: Add `GET /fixtures/:name` endpoint**

Add after the `/fixtures` endpoint:

```js
app.get('/fixtures/:name', function (req, res) {
  clearServerSourceCache();

  var fixturePath = path.join(FIXTURES_DIR, req.params.name + '.js');
  if (!fs.existsSync(fixturePath)) {
    res.status(404).send('Fixture not found: ' + req.params.name);
    return;
  }

  var mod = require(fixturePath);
  var FixtureComponent = mod.default || mod;
  var element = React.createElement(FixtureComponent);

  res.setHeader('Content-Type', 'text/x-component');
  res.setHeader('Access-Control-Allow-Origin', '*');

  var renderToPipeableStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;
  var stream = renderToPipeableStream(element, buildClientManifest());
  stream.pipe(res);
});
```

**Step 3: Update `GET /` to render kitchen-sink by default**

Replace the existing `GET /` handler body to use the kitchen-sink fixture:

```js
app.get('/', function (req, res) {
  clearServerSourceCache();

  var mod = require('./src/fixtures/kitchen-sink');
  var AppComponent = mod.default || mod;
  var element = React.createElement(AppComponent);

  res.setHeader('Content-Type', 'text/x-component');
  res.setHeader('Access-Control-Allow-Origin', '*');

  var renderToPipeableStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;
  var stream = renderToPipeableStream(element, buildClientManifest());
  stream.pipe(res);
});
```

**Step 4: Test the endpoints manually**

Start the server: `cd /Users/rickhanlonii/oss/falcon/example && npm run dev`

Run: `curl http://localhost:6000/fixtures | python3 -m json.tool`
Expected: JSON array with 6 fixtures, each with name/title/description.

Run: `curl http://localhost:6000/fixtures/rsc-only`
Expected: Flight stream output (text starting with row identifiers).

**Step 5: Commit**

```bash
git add example/server/server.js
git commit -m "feat(server): add fixture list and render endpoints"
```

---

### Task 3: Add fixture SSR endpoint

**Files:**
- Modify: `example/server/ssr-server.js`

**Step 1: Add `GET /ssr/:name` endpoint**

The existing `GET /ssr` handler fetches from `FLIGHT_SERVER + '/'`. Add a new route that fetches from `/fixtures/:name` instead. Add this before the existing `GET /ssr` route:

```js
app.get('/ssr/:name', function (req, res) {
  var fixtureName = req.params.name;
  // Fetch the Flight stream for this specific fixture
  http.get(FLIGHT_SERVER + '/fixtures/' + fixtureName, function (flightRes) {
    if (flightRes.statusCode !== 200) {
      res.status(502).send('Flight server returned status ' + flightRes.statusCode + ' for fixture ' + fixtureName);
      return;
    }

    // ... (identical pipeline to existing /ssr handler from here) ...
```

The body of the handler is identical to the existing `/ssr` handler — the only difference is the Flight URL. Extract the shared SSR rendering logic into a helper function:

```js
function handleSSR(flightURL, req, res) {
  http.get(flightURL, function (flightRes) {
    // ... entire existing /ssr handler body (lines 70-231) ...
  }).on('error', function (err) {
    console.error('[SSR] Failed to fetch Flight stream:', err.message);
    res.status(502).send('Failed to connect to Flight server: ' + err.message);
  });
}

app.get('/ssr/:name', function (req, res) {
  handleSSR(FLIGHT_SERVER + '/fixtures/' + req.params.name, req, res);
});

app.get('/ssr', function (req, res) {
  handleSSR(FLIGHT_SERVER + '/', req, res);
});
```

**Step 2: Test the SSR endpoint**

Run: `curl http://localhost:6001/ssr/rsc-only`
Expected: Native instruction stream (JSON array rows).

**Step 3: Commit**

```bash
git add example/server/ssr-server.js
git commit -m "feat(ssr): add per-fixture SSR endpoint"
```

---

### Task 4: Rewrite FalconApp.swift with NavigationStack + fixture list

**Files:**
- Modify: `example/Falcon/Falcon/FalconApp.swift`

**Step 1: Define the Fixture model and FixtureStore**

Add at the top of FalconApp.swift (below imports):

```swift
struct Fixture: Identifiable, Codable {
    var id: String { name }
    let name: String
    let title: String
    let description: String
}

@MainActor
class FixtureStore: ObservableObject {
    @Published var fixtures: [Fixture] = []
    @Published var isLoading = false

    private static let cacheKey = "cachedFixtures"
    private static let lastFixtureKey = "lastViewedFixture"

    var lastViewedFixture: String? {
        get { UserDefaults.standard.string(forKey: Self.lastFixtureKey) }
        set { UserDefaults.standard.set(newValue, forKey: Self.lastFixtureKey) }
    }

    init() {
        loadCached()
    }

    private func loadCached() {
        guard let data = UserDefaults.standard.data(forKey: Self.cacheKey),
              let cached = try? JSONDecoder().decode([Fixture].self, from: data) else { return }
        fixtures = cached
    }

    private func saveCache() {
        guard let data = try? JSONEncoder().encode(fixtures) else { return }
        UserDefaults.standard.set(data, forKey: Self.cacheKey)
    }

    func fetchFixtures() {
        isLoading = true
        let url = URL(string: "\(serverBaseURL())/fixtures")!
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.isLoading = false
                guard let data = data, error == nil else { return }
                guard let decoded = try? JSONDecoder().decode([Fixture].self, from: data) else { return }
                self.fixtures = decoded
                self.saveCache()
            }
        }.resume()
    }

    private func serverBaseURL() -> String {
        return "http://localhost:6000"
    }
}
```

**Step 2: Rewrite FalconApp to use NavigationStack**

```swift
@main
struct FalconApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var store = FixtureStore()

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                FixtureListView()
                    .environmentObject(store)
            }
        }
    }
}
```

**Step 3: Create FixtureListView**

```swift
struct FixtureListView: View {
    @EnvironmentObject var store: FixtureStore
    @State private var navigateToFixture: String?

    var body: some View {
        List(store.fixtures) { fixture in
            NavigationLink(value: fixture.name) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(fixture.title)
                        .font(.headline)
                    Text(fixture.description)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Fixtures")
        .navigationDestination(for: String.self) { name in
            FixtureDetailView(fixtureName: name)
                .environmentObject(store)
        }
        .onAppear {
            store.fetchFixtures()
            // If there's a stored fixture, navigate to it
            if let last = store.lastViewedFixture {
                navigateToFixture = last
            }
        }
        .navigationDestination(isPresented: Binding(
            get: { navigateToFixture != nil },
            set: { if !$0 { navigateToFixture = nil; store.lastViewedFixture = nil } }
        )) {
            if let name = navigateToFixture {
                FixtureDetailView(fixtureName: name)
                    .environmentObject(store)
            }
        }
    }
}
```

Note: The auto-navigation via `navigateToFixture` may need adjustment depending on SwiftUI version. The key behavior: if `lastViewedFixture` is set, push the detail view on appear. If the user navigates back, clear it.

**Step 4: Create FixtureDetailView**

```swift
struct FixtureDetailView: View {
    let fixtureName: String
    @EnvironmentObject var store: FixtureStore

    var body: some View {
        FixtureRootView(fixtureName: fixtureName)
            .ignoresSafeArea()
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                store.lastViewedFixture = fixtureName
            }
    }
}

struct FixtureRootView: UIViewControllerRepresentable {
    let fixtureName: String

    func makeUIViewController(context: Context) -> FixtureViewController {
        return FixtureViewController(fixtureName: fixtureName)
    }

    func updateUIViewController(_ vc: FixtureViewController, context: Context) {}
}
```

**Step 5: Create FixtureViewController**

Move the core logic from `FalconRootViewController` into a new `FixtureViewController` that takes a fixture name:

```swift
class FixtureViewController: UIViewController {
    private let fixtureName: String
    private var root: Root?

    init(fixtureName: String) {
        self.fixtureName = fixtureName
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0xF2/255.0, green: 0xF2/255.0, blue: 0xF7/255.0, alpha: 1.0)

        #if DEBUG
        Root.devBundleURL = URL(string: "http://localhost:6000/bundle.js")
        #endif

        root = createRoot(view)
        renderAndHydrate()

        #if DEBUG
        startDevReloadPolling()
        #endif
    }

    private func renderAndHydrate() {
        let ssrURL = "http://localhost:6001/ssr/\(fixtureName)"
        let flightURL = "http://localhost:6000/fixtures/\(fixtureName)"

        root?.renderWithSSR(serverURL: ssrURL) { [weak self] error in
            if let error = error {
                print("[Falcon] Render failed for \(self?.fixtureName ?? ""): \(error)")
            } else {
                self?.root?.hydrateRoot(serverURL: flightURL) { error in
                    if let error = error {
                        print("[Falcon] Hydration failed: \(error)")
                    } else {
                        print("[Falcon] Hydration complete for \(self?.fixtureName ?? "")")
                    }
                }
            }
        }
    }

    // Dev reload polling — same logic as old FalconRootViewController
    #if DEBUG
    private var reloadTimer: Timer?
    private var lastBundleVersion: Double = 0

    private func startDevReloadPolling() {
        let versionURL = URL(string: "http://localhost:6000/bundle-version")!
        fetchBundleVersion(from: versionURL) { [weak self] version in
            self?.lastBundleVersion = version
        }
        reloadTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.checkForBundleUpdate(versionURL: versionURL)
        }
    }

    private func checkForBundleUpdate(versionURL: URL) {
        fetchBundleVersion(from: versionURL) { [weak self] version in
            guard let self = self, version > 0, version != self.lastBundleVersion else { return }
            self.lastBundleVersion = version
            print("[Falcon] Bundle updated, reloading fixture \(self.fixtureName)...")
            self.root?.unmount()
            self.root = createRoot(self.view)
            self.renderAndHydrate()
        }
    }

    private func fetchBundleVersion(from url: URL, completion: @escaping (Double) -> Void) {
        URLSession.shared.dataTask(with: url) { data, _, _ in
            DispatchQueue.main.async {
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let version = json["version"] as? Double else {
                    completion(0)
                    return
                }
                completion(version)
            }
        }.resume()
    }
    #endif

    deinit {
        #if DEBUG
        reloadTimer?.invalidate()
        #endif
        root?.unmount()
    }
}
```

**Step 6: Remove old FalconRootViewController and RootView**

Delete the old `FalconRootViewController` class and `RootView` struct — they're replaced by the fixture navigation system.

**Step 7: Commit**

```bash
git add example/Falcon/Falcon/FalconApp.swift
git commit -m "feat(ios): add fixture navigation with SwiftUI NavigationStack"
```

---

### Task 5: Delete ContentView.swift (unused)

**Files:**
- Delete: `example/Falcon/Falcon/ContentView.swift`

**Step 1: Delete the file**

`ContentView.swift` is the Xcode template placeholder. It's not used anywhere.

**Step 2: Remove from Xcode project if needed**

If there's a `project.pbxproj`, the file reference may need removal. Check if the project builds without it.

**Step 3: Commit**

```bash
git rm example/Falcon/Falcon/ContentView.swift
git commit -m "chore: remove unused ContentView.swift"
```

---

### Task 6: Build and test the full flow

**Step 1: Start the dev server**

Run: `cd /Users/rickhanlonii/oss/falcon/example && npm run dev`

**Step 2: Test server endpoints**

```bash
curl http://localhost:6000/fixtures | python3 -m json.tool
# Expected: 6 fixtures with name/title/description

curl -s http://localhost:6000/fixtures/rsc-only | head -5
# Expected: Flight stream rows

curl -s http://localhost:6001/ssr/rsc-only | head -5
# Expected: Native instruction stream rows
```

**Step 3: Build and run the iOS app**

Use `/build-demo` skill to build and run on the Falcon Demo simulator.

**Step 4: Verify the fixture list appears**

Take a screenshot. Expected: SwiftUI List with 6 fixture rows showing title + description.

**Step 5: Verify a fixture renders**

Tap "RSC Only". Expected: the fixture renders its content in a fresh React root.

**Step 6: Verify back navigation**

Tap back. Expected: returns to fixture list. Tap another fixture. Expected: renders independently.

**Step 7: Verify persisted navigation**

Tap "RSC Only". Rebuild the app. Expected: app launches directly into "RSC Only" without showing the list.

**Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: fixture routing integration fixes"
```

---

### Task 7: Update the old App.js

**Files:**
- Modify: `example/server/src/App.js`

**Step 1: Simplify App.js to redirect to kitchen-sink**

Since the `GET /` endpoint now uses `fixtures/kitchen-sink.js`, update `App.js` to just re-export from kitchen-sink for backwards compatibility (or delete it if nothing else references it):

```js
// App.js now delegates to the kitchen-sink fixture
module.exports = require('./fixtures/kitchen-sink');
```

**Step 2: Commit**

```bash
git add example/server/src/App.js
git commit -m "refactor: App.js delegates to kitchen-sink fixture"
```
