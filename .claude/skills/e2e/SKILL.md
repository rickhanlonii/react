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

Start the dev server (if not already running) and build/launch the app:

**Do NOT wrap commands** in custom bash — no `echo`, `2>&1`, `2>/dev/null`, `sleep`, `&`, `; echo "EXIT CODE: $?"`, piping through `python3 -c`, or similar. Run each command directly using the Bash tool.

Check if the server is already running:
```bash
curl -s http://localhost:6100/bundle-version
```
If that fails, start it:
```
Bash(command: "cd /Users/rickhanlonii/oss/falcon && npm run dev:e2e", run_in_background: true)
```
Wait 5 seconds, then re-check the health endpoint to confirm it's up.

Then build and launch the app via the build server (see note below) or ask the user to build manually.

**Build server** (`npm run build-server`, running in a separate terminal on port 6002) is currently configured for the **Falcon demo app only**. To build the LayoutCompare app, use `xcodebuild` directly via the Bash tool:
```bash
cd /Users/rickhanlonii/oss/falcon && xcodebuild -project tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj -scheme LayoutCompare -destination 'id=50E9E48E-D7F7-4338-9873-3EB801137EE7' build
```
If this fails with `sandbox-exec: sandbox_apply: Operation not permitted`, the build must be done outside Claude's sandbox (ask the user to build manually).

**Do NOT use `build_run_sim`, `build_sim`, or `launch_app_sim`** — these XcodeBuildMCP tools fail due to Claude's sandbox blocking `sandbox-exec`.

## Workflow: Run All Tests

### After JS-only changes (fastest — ~2s)
1. Edit the JS file — esbuild auto-rebuilds, the app detects the version change and auto-reruns
2. Poll for results (use `curl` via Bash — `WebFetch` does not work for localhost):
   ```bash
   curl -s http://localhost:6101/results
   ```
3. If `status` is `"running"`, wait 2s and poll again
4. When `status` is `"complete"`, read `passed`, `total`, and `fixtures` for details

### After Swift changes (~12s)
1. Rebuild the app — use `xcodebuild` directly or ask the user to rebuild (see Setup above). **Do NOT use `build_run_sim`** — it fails due to sandbox restrictions.
2. Wait 3-5s for the app to start and auto-run fixtures
3. Poll for results:
   ```bash
   curl -s http://localhost:6101/results
   ```

### Force rerun (no file changes)
```bash
curl -X POST http://localhost:6101/run-all
```
Then poll for results:
```bash
curl -s http://localhost:6101/results
```

### Launch with auto-run (no UI interaction needed)
Build the app (see Setup above), then launch with:
```bash
xcrun simctl launch 50E9E48E-D7F7-4338-9873-3EB801137EE7 com.react.LayoutCompare --run-all
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
    "div-basic": { "passed": true, "elements": 3, "diffs": [], "pixelDiff": { "mismatchedPixels": 0, "totalPixels": 329160, "percentage": 0.0 } },
    "headings": { "passed": true, "elements": 7, "diffs": [], "pixelDiff": { "mismatchedPixels": 10226, "totalPixels": 329160, "percentage": 3.1 } }
  }
}
```

Each diff in the `diffs` array has: `path`, `property`, `web`, `native`, `delta` (numeric) or `webString`, `nativeString` (string comparison).

Each `pixelDiff` has: `mismatchedPixels`, `totalPixels`, `percentage`. This compares WKWebView and UIView snapshots pixel-for-pixel at 390x844 1x scale. A fixture can have 0 layout diffs but >0% pixel mismatch (e.g., text rendering differences).

## Workflow: Compare Specific Fixture

1. Build and run the app if not already running
2. Tap the target fixture in the list
3. Take a `screenshot` for visual side-by-side comparison
4. Check results via `curl -s http://localhost:6101/results`

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

4. If dev server is not running: `node tests/e2e/scripts/build.js`, then rebuild the app (see Setup above)

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
5. Swift change: rebuild the app (see Setup above) — poll results in ~12s
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
        PixelComparer.swift          # Pixel-level snapshot comparison
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

## Pixel Diff

Each fixture also gets a `PixelDiffResult` with:
- `mismatchedPixels`: count of non-matching pixels
- `totalPixels`: total pixels compared (329,160 for 390x844)
- `percentage`: mismatch percentage

The pixel comparison snapshots WKWebView and UIView at 390x844 1x scale, then walks the RGBA buffers counting exact pixel mismatches (zero tolerance). This catches visual differences that layout tree comparison misses (text anti-aliasing, border rendering, color differences).

In the app UI:
- **Fixture list**: green checkmark = 0 diffs AND 0% pixels; orange warning = 0 diffs but >0% pixels; red X = has layout diffs (also shows pixel %)
- **Summary bar**: shows total passed, total diffs, and count of fixtures with pixel mismatches
- **ComparisonView**: shows pixel diff in the summary bar alongside layout diffs
