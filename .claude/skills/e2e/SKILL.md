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

## Prerequisites

Before any workflow, ensure JS bundles are built:
```bash
cd /Users/rickhanlonii/oss/falcon && node tests/e2e/scripts/build.js
```

XcodeBuildMCP session defaults should already be configured (persisted in `.xcodebuildmcp/config.yaml`):
- Project: `tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj`
- Scheme: `LayoutCompare`
- Simulator: `Falcon E2E` (`50E9E48E-D7F7-4338-9873-3EB801137EE7`)

If not set, call `session_set_defaults` with those values.

## Workflow: Run All Tests

1. Build JS bundles: `node tests/e2e/scripts/build.js`
2. Build and run: `build_run_sim` (builds LayoutCompare scheme, launches on Falcon E2E)
3. Wait 5 seconds for fixture list to load
4. For each fixture in the list:
   a. Tap the fixture name
   b. Wait 5 seconds for comparison to complete
   c. Take a `screenshot` — the bottom section shows diff summary + scrollable diff detail list
   d. Read the diff results from the screenshot (path, property, web value, native value, delta)
   e. Swipe back (`gesture` preset `swipe-from-left-edge`) to return to fixture list
5. Summarize: which fixtures passed (0 diffs), which failed, and the specific mismatches

## Workflow: Compare Specific Fixture

1. If app is not running, build and run: `build_run_sim`
2. Wait for fixture list, then tap the target fixture
3. Wait 5 seconds, then `screenshot`
4. Read diff detail list from the screenshot
5. For the full structured JSON data, use `launch_app_logs_sim` instead of `build_run_sim`, tap the fixture, wait, then `stop_sim_log_cap` — the logs will contain:
   ```
   [LayoutCompare] fixture=<name> elements=<n> diffs=<n>
   [LayoutCompare] <JSON array of LayoutDiff objects>
   ```

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

3. Rebuild JS bundles: `node tests/e2e/scripts/build.js`

4. Rebuild and run the app: `build_run_sim`

5. Verify the new fixture appears in the list, tap it, screenshot the comparison

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
1. Identify the diff (e.g., `root > p[0].y` web=0 native=16)
2. Determine cause (e.g., native `<p>` has 16px marginTop but web CSS reset removed it)
3. Fix in `defaults.js` or `ElementDefaults.swift`
4. If JS change: bundles auto-rebuild if dev server is running, otherwise `node tests/e2e/scripts/build.js`
5. If Swift change: `build_run_sim` to rebuild
6. Re-check the fixture

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
  LayoutCompare/       # iOS app
    LayoutCompare/
      LayoutCompare.xcodeproj
      LayoutCompare/
        LayoutCompareApp.swift
        FixtureListView.swift
        ComparisonView.swift       # Split view + scrollable diff list
        WebRenderer.swift
        NativeRenderer.swift
        LayoutExtractor.swift
        LayoutComparer.swift
        LayoutNode.swift
        Resources/                 # Built JS bundles + HTML (copied by build.js)
```

## Diff Data Format

Each `LayoutDiff` has:
- `path`: tree path (e.g. `root > div[0] > p[1]`)
- `property`: what differs (`width`, `height`, `x`, `y`, `styles.fontSize`, `styles.marginTop`, `childCount`)
- `web`: web value (Double)
- `native`: native value (Double)
- `delta`: web - native (positive = web is larger)

Tolerance is 2px — diffs within 2px are ignored.
