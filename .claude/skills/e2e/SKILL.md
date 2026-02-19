---
name: e2e
description: E2E layout comparison between react-dom (web) and react-dom-native. Run tests, add fixtures, compare layouts, fix issues.
argument-hint: <action> e.g. "run tests", "add fixture for <p> in <div>", "compare headings"
---

# E2E Layout Comparison

Compares layout output between react-dom (WKWebView) and react-dom-native (UIKit/Yoga) for shared React component fixtures. Uses the LayoutCompare iOS app on the **Falcon E2E** simulator.

## Arguments

`$ARGUMENTS` — free-form description of what to do. Common patterns:

- **Run tests**: "run tests", "run all fixtures", "check layout"
- **Add fixture**: "add fixture for `<p>` inside `<div>`", "new fixture for lists"
- **Compare specific**: "compare headings", "check div-basic"
- **Fix issues**: "find the first issue and create a plan to fix it"

## Architecture

- **Dev server** (`localhost:6100`): Serves JS bundles via esbuild watch mode. Auto-rebuilds on file changes.
- **HTTP results server** (`localhost:6101`): Runs inside the iOS app, exposes test results as JSON.
- **Auto-rerun**: The app polls `/bundle-version` every 2s. When bundles change, it automatically reruns all fixtures.

## One-Time Setup

Set XcodeBuildMCP session defaults for the LayoutCompare app:
```
session_set_defaults:
  projectPath: tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj
  scheme: LayoutCompare
  simulatorName: Falcon E2E
  simulatorId: 50E9E48E-D7F7-4338-9873-3EB801137EE7
```

Start the dev server and build/launch the app:
```bash
cd /Users/rickhanlonii/oss/falcon && npm run dev:e2e &
```
Then `build_run_sim` to build and launch the app.

## Workflow: Run All Tests

### After JS-only changes (fastest — ~2s)
1. Edit the JS file — esbuild auto-rebuilds, the app detects the version change and auto-reruns
2. Poll for results:
   ```
   WebFetch http://localhost:6101/results
   ```
3. If `status` is `"running"`, wait 2s and poll again
4. When `status` is `"complete"`, read `passed`, `total`, and `fixtures` for details

### After Swift changes (~12s)
1. `build_run_sim` — rebuild and relaunch the app
2. Wait 3-5s for the app to start and auto-run fixtures
3. Poll for results: `WebFetch http://localhost:6101/results`

### Force rerun (no file changes)
```bash
curl -X POST http://localhost:6101/run-all
```
Then poll `WebFetch http://localhost:6101/results` for completion.

### Launch with auto-run (no UI interaction needed)
Build the app with `build_sim`, then:
```
launch_app_sim with args: ["--run-all"]
```
Poll `http://localhost:6101/results` for results.

## Results Format

`GET http://localhost:6101/results` returns:
```json
{
  "status": "complete",
  "passed": 10,
  "total": 10,
  "fixtures": {
    "div-basic": { "passed": true, "elements": 3, "diffs": [] },
    "headings": { "passed": false, "elements": 7, "diffs": [...] }
  }
}
```

Each diff in the `diffs` array has: `path`, `property`, `web`, `native`, `delta` (numeric) or `webString`, `nativeString` (string comparison).

## Workflow: Compare Specific Fixture

1. Build and run the app if not already running
2. Tap the target fixture in the list
3. Take a `screenshot` for visual side-by-side comparison
4. Check `WebFetch http://localhost:6101/results` for structured diff data

## Workflow: Add Fixture

1. Create a new JSX file in `tests/e2e/fixtures/`:
   ```jsx
   var React = require('react');
   module.exports = function FixtureName() {
     return (
       <div>
         {/* elements to test */}
       </div>
     );
   };
   ```
   - Use inline styles only (no CSS classes)
   - Keep fixtures focused on one layout concern
   - Use numeric values for dimensions (width, height, margin, padding)

2. Register in `tests/e2e/fixtures/index.js`:
   ```js
   'fixture-name': { component: require('./fixture-name'), description: 'What it tests' },
   ```

3. The dev server auto-rebuilds. Wait 2-3s, then check results via HTTP.

4. If dev server is not running: `node tests/e2e/scripts/build.js`, then `build_run_sim`

## Workflow: Fix Layout Issues

When diffs are found, the fix is usually in one of these files:

| File | What it controls |
|------|-----------------|
| `packages/react-dom-native/src/yoga-layout/defaults.js` | Element-type Yoga defaults (flexDirection, margins, fontSize) |
| `packages/react-dom-native/src/renderer/HostConfig.js` | `createInstance` merges element defaults with user styles |
| `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift` | Applies style dict to Yoga nodes |
| `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift` | Swift-side default styles per element |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` | Creates UIKit views, applies visual props |

**Common diff patterns and fixes:**

- **fontSize mismatch (web=16, native=0)**: Web reports computed fontSize on all elements via `getComputedStyle`. Non-text elements (div, etc.) don't set fontSize natively. This is expected — ignore fontSize diffs on container elements.
- **width mismatch**: Check if the container width differs (390 web vs native). May be a viewport/surface size issue.
- **y/height mismatch on text elements**: Default margins differ. Fix in `defaults.js` by adjusting the element's marginTop/marginBottom defaults.
- **Spacing between elements**: Yoga doesn't collapse margins like CSS. If parent uses `gap` and children have margins, spacing doubles. Fix by adjusting margin defaults or removing gap.

**Fixing workflow:**
1. Identify the diff from `http://localhost:6101/results`
2. Determine cause (e.g., native `<p>` has 16px marginTop but web CSS reset removed it)
3. Fix in `defaults.js` or `ElementDefaults.swift`
4. JS change: dev server auto-rebuilds, app auto-reruns — poll results in ~2s
5. Swift change: `build_run_sim` — poll results in ~12s
6. Verify fix via HTTP results

## Project Structure

```
tests/e2e/
  fixtures/           # Shared React component fixtures (JSX)
    index.js           # Fixture registry
    div-basic.jsx      # Basic div with dimensions
    div-nested.jsx     # Nested divs with flex layout
    p-text.jsx         # Paragraph with text
    headings.jsx       # h1-h6
    flex-layout.jsx    # Flex direction, alignment
    box-model.jsx      # Margin/padding combinations
  web/
    entry.js           # Web bundle entry (react-dom createRoot + extractLayout)
    index.html         # HTML shell for WKWebView
  native/
    entry.js           # Native bundle entry (react-dom-native createRoot)
  scripts/
    build.js           # esbuild: builds web + native bundles → Resources/
    dev.js             # Dev server: esbuild watch + Express on :6100
  LayoutCompare/       # iOS app
    LayoutCompare/
      LayoutCompare.xcodeproj
      LayoutCompare/
        LayoutCompareApp.swift       # Starts HTTPResultsServer
        FixtureListView.swift        # Fixture list + auto-rerun + --run-all
        ComparisonView.swift         # Split view + scrollable diff list
        WebRenderer.swift            # Loads from dev server :6100
        NativeRenderer.swift         # Loads from dev server :6100
        HTTPResultsServer.swift      # HTTP server on :6101
        LayoutExtractor.swift
        LayoutComparer.swift
        LayoutNode.swift
```

## Diff Data Format

Each `LayoutDiff` has:
- `path`: tree path (e.g. `root > div[0] > p[1]`)
- `property`: what differs (`width`, `height`, `x`, `y`, `styles.fontSize`, `styles.marginTop`, `childCount`)
- `web`: web value (Double)
- `native`: native value (Double)
- `delta`: web - native (positive = web is larger)

String diffs have `webString` and `nativeString` instead.

Tolerance is 2px — diffs within 2px are ignored.
