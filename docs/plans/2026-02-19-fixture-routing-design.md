# Fixture Routing Design

## Problem

The Falcon demo app has a single monolithic `App.js` that renders everything in one Flight/Fizz/hydrate cycle. We need multiple independent test fixtures (e.g. "RSC Only", "Nested Suspense") that can be browsed, selected, and iterated on individually. Each fixture must be its own complete Flight/Fizz/hydrate root.

## Design

### Server: Fixture Discovery & Rendering

**Fixture directory:** `example/server/src/fixtures/`

Each fixture is a single JS file with two exports:

```js
export const fixture = {
  title: 'RSC Only',
  description: 'Server components with no client components'
};

export default function RscOnly() {
  return <div style={{padding: 16}}><h1>Hello from the server</h1></div>;
}
```

**New endpoints on the Flight server (port 6000):**

| Endpoint | Response | Purpose |
|----------|----------|---------|
| `GET /fixtures` | JSON: `[{name, title, description}]` | Fixture list for native app |
| `GET /fixtures/:name` | Flight stream | RSC render of named fixture |

Fixture discovery: read `fixtures/` directory, require each file, extract the `fixture` named export. Cache cleared on each request (like existing App.js behavior) so edits are picked up immediately.

**New endpoint on the SSR server (port 6001):**

| Endpoint | Response | Purpose |
|----------|----------|---------|
| `GET /ssr/:name` | Fizz instruction stream | SSR render of named fixture |

The SSR endpoint fetches from `/fixtures/:name` on the Flight server (instead of `/`), then pipes through the existing Fizz pipeline.

### Native iOS: Fixture Navigation

```
FalconApp
└── NavigationStack
    ├── FixtureListView (root)
    │   └── List: title + description per fixture
    │       └── NavigationLink → FixtureDetailView
    └── FixtureDetailView (pushed)
        └── UIViewControllerRepresentable → FixtureViewController
            └── Creates Root, calls renderAndHydrate(fixtureName)
```

**FixtureListView:** SwiftUI `List` displaying fixtures. Fetches from `GET /fixtures`, caches response to disk. On launch, shows cached list immediately, refreshes from server in background.

**FixtureDetailView:** Wraps a `FixtureViewController` that creates a fresh React `Root`, calls `renderAndHydrate()` with fixture-specific URLs:
- SSR: `http://localhost:6001/ssr/{fixtureName}`
- Flight: `http://localhost:6000/fixtures/{fixtureName}`

On disappear (back navigation), calls `root?.unmount()`.

**Persisted navigation state:** The last-viewed fixture name is stored in `UserDefaults`. On launch, if a stored fixture exists, the app navigates directly to it (skipping the list). Back navigation clears the stored value. This enables seamless iteration — rebuild the app and it resumes on the same fixture.

**Dev reload:** Polling moves into `FixtureDetailView`. On version change, the current fixture is re-rendered (unmount → fresh mount). No need to return to the list.

### Initial Fixtures

| File | Title | Tests |
|------|-------|-------|
| `rsc-only.js` | RSC Only | Pure server components, no client code, no Suspense |
| `client-components.js` | Client Components | RSC + client components (Counter, Tabs), Flight module loading + hydration |
| `single-suspense.js` | Single Suspense | One async component in one Suspense boundary with skeleton fallback |
| `nested-suspense.js` | Nested Suspense | Multiple nested Suspense boundaries with staggered delays |
| `text-formatting.js` | Text Formatting | Inline text elements: bold, italic, underline, code, mark, sub, sup |
| `kitchen-sink.js` | Kitchen Sink | Full original App.js content — all 5 card sections combined |

Existing client components (`Counter.jsx`, `TextInput.jsx`, etc.) remain in `server/src/components/` and are shared across fixtures.

### Data Flow

```
1. Launch → FixtureListView
   ├── Read cached fixtures.json (if exists) → show list
   └── Fetch GET /fixtures → update cache + list

2. Tap fixture → store name in UserDefaults → push FixtureDetailView
   └── FixtureViewController creates Root
       ├── Phase 1: renderWithSSR(/ssr/{name}) → Fizz stream → native shell
       └── Phase 2: hydrateRoot(/fixtures/{name}) → Flight stream → interactive

3. Back → unmount root → clear UserDefaults → show list

4. Relaunch → UserDefaults has fixture → skip list → render fixture directly
```

### Existing App.js

The current `App.js` and `GET /` endpoint are replaced by the fixture system. The `kitchen-sink.js` fixture preserves the original content.
