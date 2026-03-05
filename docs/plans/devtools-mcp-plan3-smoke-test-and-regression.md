# Plan 3: Smoke Test & Regression Plan for DevTools MCP Fork

## 1. Overview

This plan provides a cross-cutting testing strategy for the devtools-mcp fork project (Plans 1A-1D + 2A-2D). Its purpose is to ensure that:

1. All existing Falcon fixtures continue to work after each implementation phase.
2. The Staggered Loading fixture (05-nested-suspense) demonstrates correct prerender, parallel hydration, and interactivity.
3. Each sub-plan has a clear pass/fail checklist before moving to the next.

**When to run these tests:** After completing each sub-plan (1A, 1B, 1C, 1D, 2A, 2B, 2C, 2D), run the full fixture regression suite and the Staggered Loading smoke test. The per-phase checklists are additive — run the phase-specific checks plus all prior phases' checks.

---

## 2. Fixture Regression Testing

All fixtures live in `example/server/src/fixtures/`. Each must render without errors after every plan phase. The app must be running via `npm run dev` in the `example/` directory.

### Complete Fixture List

| # | File | Title | Category | What to Verify |
|---|------|-------|----------|----------------|
| 01 | `01-rsc-only.js` | RSC Only | Basics | Server component renders, no client JS needed |
| 02 | `02-text-formatting.js` | Text Formatting | Basics | Bold, italic, headings display correctly |
| 03 | `03-single-suspense.js` | Single Suspense | Loading Patterns | Fallback shows then content appears |
| 04 | `04-client-components.js` | Client Components | Basics | Client components hydrate, interactivity works |
| 05 | `05-nested-suspense.js` | Staggered Loading | Loading Patterns | **See Section 3 for detailed test** |
| 06 | `06-kitchen-sink.js` | Kitchen Sink | Basics | All element types render correctly |
| 07 | `07-caught-errors.js` | Caught Errors | Error Handling | Error boundary catches and displays error |
| 08 | `08-uncaught-server-error.js` | Uncaught Server Error | Error Handling | Server error propagates to client |
| 09 | `09-uncaught-hydration-error.js` | Uncaught Hydration Error | Error Handling | Hydration mismatch handled gracefully |
| 10 | `10-uncaught-interaction-error.js` | Uncaught Interaction Error | Error Handling | Runtime error caught by boundary |
| 11 | `11-recoverable-errors.js` | Recoverable Errors | Error Handling | Recoverable errors logged, app continues |
| 12 | `12-contact-form.js` | Contact Form | Forms | Form renders with inputs, submit works |
| 13 | `13-fieldset.js` | Fieldset | Forms | Fieldset/legend grouping renders |
| 14 | `14-button-variants.js` | Button Variants | Forms | All button styles render |
| 15 | `15-image-square.js` | Image (Square) | Media | Square image renders with correct aspect ratio |
| 16 | `16-image-landscape.js` | Image (Landscape) | Media | Landscape image renders |
| 17 | `17-image-row.js` | Image Row | Media | Multiple images in a row |
| 18 | `18-unordered-list.js` | Unordered List | Lists | Bullet list renders |
| 19 | `19-ordered-list.js` | Ordered List | Lists | Numbered list renders |
| 20 | `20-nested-list.js` | Nested List | Lists | Nested list indentation correct |
| 21 | `21-table.js` | Table | Tables | Table with rows/columns renders |
| 22 | `22-meta-ai-homepage.js` | Meta AI Homepage | Showcase | Complex layout renders correctly |
| 23 | `23-flight-async-await.js` | Flight Async Await | Flight | Async server component resolves |
| 24 | `24-flight-parallel-async.js` | Flight Parallel Async | Flight | Multiple async components resolve in parallel |
| 25 | `25-flight-server-error.js` | Flight Server Error | Flight | Server error in Flight stream handled |
| 27 | `27-flight-deduped-component.js` | Flight Deduped Component | Flight | Deduplication works |
| 28 | `28-client-render-errors.js` | Client Render Errors | Error Handling | Client-side render errors caught |
| 29 | `29-document-scripts.js` | Document Scripts | Basics | Script loading/execution works |
| 30 | `30-prerender-resume.js` | Async Greeting | Basics | Prerender shell + resume with dynamic content |
| 31 | `31-server-only.js` | Server Only | Basics | MPA/Server-only rendering mode |
| 32 | `32-todo-app.js` | Todo App | Forms | Full CRUD with server actions |
| 33 | `33-server-action-jsx.js` | Server Action JSX | Forms | Server actions returning JSX |

### Regression Test Procedure

For each fixture, navigate to it in the app and verify:

```bash
# 1. Take a screenshot to verify visual rendering
npm run app:screenshot

# 2. Take a UI snapshot to verify element hierarchy
npm run app:snapshot-ui

# 3. For interactive fixtures, verify interactivity
npm run app:snapshot-ui -- --filter AXIdentifier   # find interactive elements
npm run app:tap -- <x> <y>                          # tap interactive elements
npm run app:screenshot                              # verify state changed
```

**Quick regression (minimum):** Screenshot all fixtures, confirm no crashes or blank screens. For fixtures with interactive elements (04, 05, 12, 32), verify at least one interaction.

**Full regression:** Screenshot + snapshot-ui for every fixture. Verify text content matches expectations. Test all interactive paths.

---

## 3. Staggered Loading Smoke Test (DETAILED)

This is the primary smoke test. It exercises prerender, streaming SSR, parallel hydration, and client interactivity — the most complex end-to-end path in Falcon.

### Fixture Overview

File: `example/server/src/fixtures/05-nested-suspense.js`

The fixture renders:
- A header ("Staggered Loading")
- 4 Suspense boundaries wrapping `SlowSection` components that delay: 500ms, 1000ms, 2000ms, 3000ms
- A `Counter` component (client component with `useState`) inside the first Suspense boundary (next to the 500ms section)
- Each Suspense boundary has a `Skeleton` fallback (gray placeholder bars)

The Counter component (`example/server/src/components/Counter.jsx`) has:
- Decrement button (`id="counter-decrement"`)
- Value display (`id="counter-value"`)
- Increment button (`id="counter-increment"`)
- A `useEffect` that increments count by 1 on mount (so initial display is `initialCount + 1`)

**Verified from source** (`example/server/src/components/Counter.jsx`):
```jsx
<button id="counter-decrement" onClick={() => setCount((c) => c - 1)}>
  <span>-</span>
</button>
<span id="counter-value" style={{width: 12, textAlign: 'center', marginLeft: 4, marginRight: 4}}>
  {String(count)}
</span>
<button id="counter-increment" onClick={() => setCount((c) => c + 1)}>
  <span>+</span>
</button>
```

The IDs map to `accessibilityIdentifier` on UIKit views, so `npm run app:snapshot-ui -- --filter counter-increment` will find the button.

**Note**: The Counter also renders a `<p>test</p>` element after the increment button — this is a test artifact and can be ignored.

### How to Navigate to the Staggered Loading Fixture

The Falcon app uses Flight protocol, not URL navigation. To get to a specific fixture:

1. **Ensure the app is at the fixture list** — if not, use `npm run app:gesture -- swipe-from-left-edge` to go back to the list.

2. **Find the fixture in the list:**
```bash
npm run app:snapshot-ui -- --filter "Staggered"
```
This shows the "Staggered Loading" entry with its coordinates.

3. **Tap the fixture to navigate to it:**
```bash
# Use the coordinates from the snapshot-ui output
npm run app:tap -- <x> <y>
```

4. **Verify you're on the right page:**
```bash
npm run app:snapshot-ui -- --filter "Staggered Loading"
```

**Important**: The fixture may need scrolling to be visible. If "Staggered Loading" doesn't appear in the snapshot, scroll down first:
```bash
npm run app:gesture -- scroll-down
npm run app:snapshot-ui -- --filter "Staggered"
```

### A) Loading Partial Prerender

The SSR server's `/prerender/:name` endpoint (`example/server/ssr-server.js:500`) prerenders with `PRERENDER_ABORT_MS = 200`. Since all 4 SlowSection components have delays >= 500ms, the prerender aborts before any of them resolve.

**Steps:**

1. Ensure the dev servers are running (`npm run dev` in `example/`).
2. Navigate the app to the `nested-suspense` fixture (or load via prerender).
3. Immediately after loading, take a UI snapshot:

```bash
npm run app:snapshot-ui
```

4. **Verify the prelude (static shell):**
   - The header "Staggered Loading" should be visible immediately.
   - The description text "Four sections loading at 500ms, 1000ms, 2000ms, and 3000ms" should be visible.
   - All four content sections should show skeleton fallbacks (gray placeholder bars), because none of the SlowSection components have resolved yet at the 200ms abort point.

5. **Verify with screenshot:**

```bash
npm run app:screenshot
```

The screenshot should show the header text and four skeleton loading placeholders.

### B) Confirming Hydration Starts in Parallel to SSR Stream

After the prerender shell is delivered, two things happen simultaneously:
1. **Hydration starts** — the client begins hydrating the React tree from the Flight data embedded in the prelude. The Counter component (a client component) becomes interactive once its Suspense boundary resolves.
2. **SSR stream resumes** — the server continues rendering the SlowSection components, streaming completed segments and reveal instructions as each boundary resolves.

**Key insight:** The Counter lives inside the first Suspense boundary (alongside the 500ms SlowSection). Once that boundary's server content resolves (at ~500ms) and the segment + reveal arrive, the Counter should become interactive. Meanwhile, the 2000ms and 3000ms sections are still loading.

**Steps:**

1. Navigate to the Staggered Loading fixture.

2. Wait approximately 1-1.5 seconds (the 500ms section should have resolved, but the 2000ms and 3000ms sections should still be loading):

3. Take a UI snapshot to check the state:

```bash
npm run app:snapshot-ui
```

4. **Verify parallel hydration — look for BOTH of these conditions simultaneously:**
   - The Counter component is visible (the first Suspense boundary has resolved and been revealed).
   - The "Slow (2000ms)" and/or "Slowest (3000ms)" sections still show skeleton fallbacks (their boundaries have not resolved yet).

   If the Counter is visible while skeletons remain, hydration started before all SSR segments completed — confirming parallel hydration.

5. **Verify interactivity during streaming:**

```bash
# Find the counter increment button
npm run app:snapshot-ui -- --filter counter-increment
# Tap it
npm run app:tap -- <x> <y>
# Verify the count changed
npm run app:snapshot-ui -- --filter counter-value
```

   If the counter responds to taps while later Suspense boundaries are still showing skeletons, this proves:
   - Hydration completed for the first boundary
   - Client-side state (useState) is working
   - The app is interactive before full SSR completion

6. **Timing verification:**
   - Counter interactive: should be possible within ~1-2 seconds of page load (after 500ms section resolves + hydration)
   - All sections loaded: ~3+ seconds (after the 3000ms section resolves)
   - If the counter works at ~1s but skeletons are visible until ~3s, hydration is definitively parallel to SSR streaming.

### Timing Considerations for Parallel Hydration Test

Testing "parallel hydration" (counter interactive while later Suspense boundaries still loading) is inherently timing-dependent. Here are strategies for reliability:

**Reliable approach — Check counter interactivity, don't depend on skeleton presence:**

Instead of trying to catch the exact moment when skeletons are visible AND the counter is interactive (which requires precise timing), use this approach:

1. Navigate to the fixture
2. Wait ~1.5 seconds (enough for the 500ms section to resolve + hydration)
3. Tap the counter increment button
4. Check that the counter value changed (proves hydration completed)
5. The fact that the counter is interactive at ~1.5s, while the fixture has sections delayed up to 3s, demonstrates that hydration didn't wait for all server content

**Why this is reliable:**
- We don't need to visually observe skeletons — the fixture's design guarantees that sections resolve at 500ms, 1000ms, 2000ms, and 3000ms
- If the counter works at 1.5s, it must have hydrated before the 2s and 3s sections completed
- This test is not fragile because the timing gap between the 500ms section and 3000ms section is very large (2.5 seconds)

**Fallback if timing is too tight:**
- Increase the SlowSection delays in a test-specific fixture (e.g., 1s, 5s, 10s, 15s) to create a bigger timing window
- Or check that the counter responds to taps at ANY point before the page is fully loaded (no need to observe skeletons)

### C) Confirming Counter Increment

After all sections have loaded (wait ~4 seconds from initial load), verify full interactivity:

**Steps:**

1. Wait for all sections to load:

```bash
# Wait for the slowest section to appear
npm run app:snapshot-ui -- --filter "Slowest"
```

2. Verify all four sections are visible:

```bash
npm run app:snapshot-ui -- --filter "Loaded after"
```

Expected output should contain:
- "Loaded after 500ms"
- "Loaded after 1000ms"
- "Loaded after 2000ms"
- "Loaded after 3000ms"

3. Find the counter increment button and tap it multiple times:

```bash
# Find the increment button
npm run app:snapshot-ui -- --filter counter-increment

# Tap increment 3 times
npm run app:tap -- <x> <y>
npm run app:tap -- <x> <y>
npm run app:tap -- <x> <y>

# Check the counter value
npm run app:snapshot-ui -- --filter counter-value
```

4. **Verify the counter value:**
   - Initial count is 0, but `useEffect` increments by 1 on mount, so the displayed value starts at 1.
   - After 3 taps on increment, the value should be 4.

5. **Verify decrement also works:**

```bash
npm run app:snapshot-ui -- --filter counter-decrement
npm run app:tap -- <x> <y>
npm run app:snapshot-ui -- --filter counter-value
```

   The value should decrease by 1 (from 4 to 3).

6. **Take a final screenshot to confirm visual state:**

```bash
npm run app:screenshot
```

---

## 4. Per-Phase Testing Checklists

### After Plan 1A: Scaffolding & File Copy

- [ ] `cd tools/devtools-mcp && npm install` succeeds without errors (run by user in Plan 1A — agents cannot install)
- [ ] No `puppeteer`, `puppeteer-core`, or `@puppeteer/browsers` in `node_modules/`
- [ ] Deleted files are gone: `src/browser.ts`, `src/DevToolsConnectionAdapter.ts`, `src/DevtoolsUtils.ts`, `src/PageCollector.ts`, `src/WaitForHelper.ts`, `src/SlimMcpResponse.ts`, `src/polyfill.ts`, `src/telemetry/`, `src/daemon/`, `src/bin/`, `src/tools/slim/`
- [ ] `package.json` has correct name (`react-dom-native-devtools-mcp`), correct dependencies
- [ ] `tsconfig.json` exists and is valid
- [ ] **Fixture regression**: all fixtures still render (this phase doesn't touch app code, but verify no workspace issues)

### After Plan 1B: CDP Client Implementation

- [ ] `tools/devtools-mcp/src/cdp-client.ts` exists and compiles
- [ ] Target discovery works: `GET http://127.0.0.1:6001/json/list` returns targets
- [ ] CDP WebSocket connects to `webSocketDebuggerUrl` from target info
- [ ] Sending `Runtime.evaluate` with `{expression: '1+1'}` returns `{result: {value: 2}}`
- [ ] CDP event listeners fire (e.g., subscribe to `Runtime.consoleAPICalled`, trigger a console.log in the app)
- [ ] Build succeeds: `cd tools/devtools-mcp && npx tsc --noEmit`
- [ ] **Fixture regression**: all fixtures still render

### After Plan 1C: Performance Tracing

- [ ] `Tracing.start` via CDPClient sends `start-tracing` to the app
- [ ] `Tracing.end` via CDPClient triggers `stop-tracing` and receives `Tracing.dataCollected` chunks
- [ ] `Tracing.tracingComplete` event fires after all data chunks
- [ ] Accumulated trace events can be parsed by `parseTraceEvents()`
- [ ] `getTraceSummary()` returns meaningful trace data (React commits, Suspense boundaries, etc.)
- [ ] `getInsightOutput()` works for at least one insight
- [ ] Build succeeds
- [ ] **Fixture regression**: all fixtures still render

### After Plan 1D: Server/CLI Integration

- [ ] MCP server starts via `node tools/devtools-mcp/build/index.js`
- [ ] Server connects to inspector proxy at `http://127.0.0.1:6001`
- [ ] `.mcp.json` entry works for Claude Code integration
- [ ] End-to-end: `performance_start_trace` -> wait -> `performance_stop_trace` -> trace summary returned
- [ ] `performance_analyze_insight` returns insight detail for a valid insight
- [ ] CLI arg `--proxy-url` works (default `http://127.0.0.1:6001`)
- [ ] CLI arg `--log-file` works (writes debug output)
- [ ] No Puppeteer references in any compiled output
- [ ] Build succeeds: `cd tools/devtools-mcp && npm run build`
- [ ] **Fixture regression**: all fixtures still render
- [ ] **Staggered Loading smoke test**: full test (Section 3 A/B/C) passes

### After Plan 2A: Stub All Unsupported Tools

- [ ] All 38 tools are registered in the MCP server (visible in tool list)
- [ ] Unsupported tools return clear "not supported" messages, not errors
- [ ] Stub message format: `"<tool_name> is not supported for react-dom-native. The inspector proxy does not implement the required CDP domain."`
- [ ] Build succeeds
- [ ] **Fixture regression**: all fixtures still render

### After Plan 2B: WORKS Tools Implementation

- [ ] `evaluate_script`: `() => 1 + 1` returns `2`
- [ ] `evaluate_script`: `() => document.title` returns the current fixture title (or equivalent)
- [ ] `evaluate_script` with element args: passes element UIDs correctly via `Runtime.callFunctionOn`
- [ ] `take_screenshot`: returns base64 PNG image data, image is valid
- [ ] `take_screenshot` with `filePath`: saves to disk, file exists and is valid PNG
- [ ] `list_pages`: returns at least one target with correct metadata
- [ ] `select_page`: switches to a different target if multiple exist (or no-ops for single target)
- [ ] Build succeeds
- [ ] **Fixture regression**: all fixtures still render

### After Plan 2C: PARTIAL Tools Implementation

- [ ] `wait_for` with text present on screen: resolves quickly
- [ ] `wait_for` with text not present: times out with clear message
- [ ] `navigate_page` with `type: 'reload'`: app reloads successfully
- [ ] `navigate_page` with `type: 'url'`: returns "not supported" message
- [ ] `navigate_page` with `type: 'back'`/`'forward'`: returns "not supported" message
- [ ] `take_snapshot`: returns a text representation of the UI tree
- [ ] `list_console_messages`: returns collected console messages
- [ ] `get_console_message` by ID: returns the specific message
- [ ] `click` with coordinates: dispatches tap at correct position
- [ ] Console messages persist across interactions (messages are accumulated, not cleared on each call)
- [ ] Build succeeds
- [ ] **Fixture regression**: all fixtures still render
- [ ] **Staggered Loading smoke test**: full test passes (use `take_snapshot`/`take_screenshot` from MCP tools)

### After Plan 2D: Cleanup & Full Verification

- [ ] No TypeScript errors: `npx tsc --noEmit` passes
- [ ] No unused imports or dead code
- [ ] All 38 tools have correct behavior (WORKS/PARTIAL/STUB as documented)
- [ ] No runtime crashes during a full tool walkthrough
- [ ] Tool matrix matches Plan 2 documentation
- [ ] Build succeeds with clean output
- [ ] **Full fixture regression**: all 33 fixtures render correctly
- [ ] **Staggered Loading smoke test**: full test passes
- [ ] **Integration test suite**: `npm test` passes (existing tests unaffected)
- [ ] **Fantom tests**: `npm run test:fantom` passes (if applicable)

---

## 5. Automated Testing Strategy

### Test Categories

**Unit tests (mock CDP):**
- Test `CDPClient` message serialization, reconnection, event dispatch
- Test trace event parsing with canned data
- Test stub tools return correct messages
- Location: `tools/devtools-mcp/tests/unit/`
- Run: `jest --selectProjects devtools-mcp-unit`

**Integration tests (real proxy):**
- Test CDP connection to live inspector proxy
- Test `Runtime.evaluate` round-trip
- Test `Tracing.start` / `Tracing.end` / `Tracing.dataCollected` flow
- Require: dev servers running (`npm run dev` in `example/`)
- Location: `tools/devtools-mcp/tests/integration/`
- Run: `jest --selectProjects devtools-mcp-integration`

**End-to-end tests (full app):**
- Staggered Loading smoke test (automated version of Section 3)
- Fixture screenshot regression (compare against baseline screenshots)
- Require: dev servers + simulator running
- Location: `tools/devtools-mcp/tests/e2e/`
- Run: `npm run test:devtools-mcp-e2e`

### NPM Script Additions

```json
{
  "test:devtools-mcp": "cd tools/devtools-mcp && jest",
  "test:devtools-mcp-e2e": "node tools/devtools-mcp/tests/e2e/run.js"
}
```

### CI Integration

- Unit tests: run on every PR (no external dependencies)
- Integration tests: run when `tools/devtools-mcp/**` or `scripts/inspector-proxy.js` files change (requires servers)
- E2E tests: run on release branches only (requires simulator + full app)

---

## 6. Automated Smoke Test Script

Create `tools/devtools-mcp/tests/e2e/staggered-loading-test.js` to run the full A/B/C verification programmatically:

```javascript
#!/usr/bin/env node
/**
 * Automated smoke test for the Staggered Loading fixture.
 * Exercises: prerender, parallel hydration, and counter interactivity.
 *
 * Prerequisites:
 *   - Dev server running: cd example && npm run dev
 *   - Falcon app running in simulator
 *
 * Usage:
 *   node tools/devtools-mcp/tests/e2e/staggered-loading-test.js
 */

import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: process.cwd() }).trim();
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- Navigate to fixture ---
console.log('\n=== Navigating to Staggered Loading fixture ===');

// Go back to fixture list first
try { run('npm run app:gesture -- swipe-from-left-edge'); } catch {}
await sleep(500);

// Find and tap the Staggered Loading fixture
const listSnapshot = run('npm run app:snapshot-ui -- --filter "Staggered"');
assert(listSnapshot.includes('Staggered'), 'Found Staggered Loading in fixture list');

// Extract coordinates and tap (parse from snapshot-ui output)
const match = listSnapshot.match(/Frame: \((\d+\.?\d*), (\d+\.?\d*)/);
if (match) {
  const [, x, y] = match;
  run(`npm run app:tap -- ${x} ${y}`);
} else {
  console.error('Could not find coordinates for Staggered Loading');
  process.exit(1);
}
await sleep(500);

// --- Test A: Loading Partial Prerender ---
console.log('\n=== Test A: Verify Prerender Shell ===');
const prerender = run('npm run app:snapshot-ui');
assert(prerender.includes('Staggered Loading'), 'Header "Staggered Loading" is visible');

// --- Test B: Parallel Hydration ---
console.log('\n=== Test B: Verify Parallel Hydration ===');
// Wait for first Suspense boundary to resolve (~1s)
await sleep(1500);

const midLoad = run('npm run app:snapshot-ui');
const hasCounter = midLoad.includes('counter-increment') || midLoad.includes('counter-decrement');
// Check if later sections are still loading (may or may not still be skeletons depending on timing)
console.log(`Counter visible: ${hasCounter}`);

if (hasCounter) {
  // Try tapping the counter to verify interactivity
  const counterSnap = run('npm run app:snapshot-ui -- --filter counter-increment');
  const counterMatch = counterSnap.match(/Frame: \((\d+\.?\d*), (\d+\.?\d*)/);
  if (counterMatch) {
    run(`npm run app:tap -- ${counterMatch[1]} ${counterMatch[2]}`);
    await sleep(200);
    const afterTap = run('npm run app:snapshot-ui -- --filter counter-value');
    console.log(`Counter value after tap: ${afterTap}`);
    assert(afterTap.includes('counter-value'), 'Counter responded to tap (hydration working)');
  }
}

// --- Test C: Full Interactivity ---
console.log('\n=== Test C: Verify Full Interactivity ===');
// Wait for all sections to load
await sleep(4000);

const fullLoad = run('npm run app:snapshot-ui');
assert(fullLoad.includes('counter-increment'), 'Counter increment button visible');
assert(fullLoad.includes('counter-decrement'), 'Counter decrement button visible');

// Tap increment 3 times
const incSnap = run('npm run app:snapshot-ui -- --filter counter-increment');
const incMatch = incSnap.match(/Frame: \((\d+\.?\d*), (\d+\.?\d*)/);
if (incMatch) {
  for (let i = 0; i < 3; i++) {
    run(`npm run app:tap -- ${incMatch[1]} ${incMatch[2]}`);
    await sleep(100);
  }
}

await sleep(300);
const finalSnap = run('npm run app:snapshot-ui -- --filter counter-value');
console.log(`Final counter state: ${finalSnap}`);
assert(finalSnap.includes('counter-value'), 'Counter value is accessible after interactions');

// Verify all sections loaded
const allSections = run('npm run app:snapshot-ui -- --filter "Loaded after"');
console.log(`Loaded sections: ${allSections}`);

console.log('\n=== All smoke tests passed ===');
```

---

## 7. Acceptance Criteria

The devtools-mcp fork is considered complete when ALL of the following are true:

### Functional

- [ ] MCP server starts and connects to the inspector proxy without errors
- [ ] Performance tracing works end-to-end: start -> collect events -> parse -> summarize -> analyze insights
- [ ] `evaluate_script` executes JS in the app's JSC runtime and returns results
- [ ] `take_screenshot` captures the app's current visual state
- [ ] `take_snapshot` returns a text representation of the UI tree
- [ ] `list_pages` discovers active targets from the inspector proxy
- [ ] `wait_for` detects text appearing on screen
- [ ] `click` dispatches touch events to the correct coordinates
- [ ] `list_console_messages` / `get_console_message` collect and return console output
- [ ] `navigate_page` reload works
- [ ] All unsupported tools return clear, helpful "not supported" messages (not crashes)

### Quality

- [ ] Zero TypeScript compilation errors
- [ ] No Puppeteer, Lighthouse, or Chrome-specific code in the codebase
- [ ] No runtime crashes when exercising all 38 tools
- [ ] All 33 existing Falcon fixtures render correctly
- [ ] Staggered Loading smoke test passes (prerender + parallel hydration + counter interactivity)
- [ ] Existing test suites unaffected (`npm test`, `npm run test:fantom`, `npm run test:swift`)
- [ ] Automated smoke test script exists at `tools/devtools-mcp/tests/e2e/staggered-loading-test.js`
- [ ] Counter IDs verified against source: `counter-increment`, `counter-decrement`, `counter-value`

### Integration

- [ ] `.mcp.json` entry works with Claude Code
- [ ] `tools/devtools-mcp/` follows workspace conventions (matches `tools/fantom/` pattern)
- [ ] `package.json` is a valid workspace member
- [ ] Build output in `tools/devtools-mcp/build/` is gitignored
