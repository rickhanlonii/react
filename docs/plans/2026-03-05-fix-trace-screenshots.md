# Fix: Screenshots Missing from MCP Performance Traces

**Goal:** When `performance_start_trace` is called via the falcon-devtools MCP, the resulting trace file should include per-commit screenshot events (category `disabled-by-default-devtools.screenshot`) so the Chrome DevTools filmstrip shows visual state at each React commit.

**Problem:** The MCP sends `Tracing.start` with `includedCategories: ['disabled-by-default-devtools.screenshot']` via CDP. The inspector proxy's `createTracingDomain` correctly detects this and calls `screenshotCapture.start()`, which sends `enable-commit-screenshots` to the app. The app captures screenshots after each commit and sends `screenshot-data` messages back. But no screenshot events appear in the final trace output.

**Tech Stack:** TypeScript (MCP server), JS (inspector proxy), Swift (app)

---

### Task 1: Add logging and reproduce

**Files:**
- `example/scripts/inspector-proxy.js`

Add temporary `console.log` statements at each stage to trace the flow:

1. `createTracingDomain.handle('start')` — confirm `wantsScreenshots(params)` returns true
2. `screenshotCapture.start()` — confirm it's called and `sendToApp` is non-null
3. `screenshotCapture.handleScreenshotData()` — confirm screenshot-data messages arrive from app
4. `screenshotCapture.getEvents()` — confirm buffered screenshots are returned
5. `emitTraceEvents()` — confirm screenshot events are merged into the trace output

Run a trace via the MCP tool and check the SSR server stdout for these logs.

**Likely failure points (investigate in order):**

- **`sendToApp` is null when `screenshotCapture.start()` runs.** After `Page.reload`, the app reconnects with a new WebSocket. `setSendToApp` should re-send `enable-commit-screenshots` if `isCapturingScreenshots` is true (line 1776). But there may be a race: if `Tracing.start` arrives before the app has connected, `sendToApp` is null and the `enable-commit-screenshots` message is lost.

- **Screenshot-data messages arrive but aren't buffered.** The `handleScreenshotData` method checks `isCapturingScreenshots` — if timing is off, the flag might not be set yet.

- **`getEvents()` is called before screenshots arrive.** `Tracing.end` collects trace data and calls `screenshotCapture.getEvents()`. If the app sends screenshot-data after `getEvents()` has already been called (because trace data arrives first), the screenshots are missed.

- **The CDP flow differs from the Chrome DevTools flow.** Chrome DevTools connects via the same `/__cdp/` WebSocket and uses the same `Tracing` domain. But the MCP's `CDPClient` might handle the response/event flow differently — e.g., it might not wait long enough after `Tracing.end` for all data chunks to arrive.

### Task 2: Fix the root cause

Based on findings from Task 1, fix the issue. Common fixes:

- **Race with sendToApp:** Buffer the `enable-commit-screenshots` command and replay it in `setSendToApp` (this is already implemented at line 1776 — verify it's actually executing).

- **Race with getEvents:** Ensure `screenshotCapture.stop()` and `getEvents()` are called AFTER all screenshot-data messages have been received. The current flow is: `Tracing.end` → app sends `stop-tracing` → app responds with `trace-data` → proxy calls `emitTraceEvents` which calls `screenshotCapture.stop()` then `getEvents()`. But screenshot-data messages may still be in-flight. Fix: add a small delay or wait for the app to acknowledge `disable-commit-screenshots` before calling `getEvents()`.

- **MCP-specific issue:** The MCP's `stopTracingAndAppendOutput` listens for `Tracing.dataCollected` + `Tracing.tracingComplete`. The proxy emits these in `emitTraceEvents`. Verify that the screenshot events are included in the `Tracing.dataCollected` chunks, not sent separately.

### Task 3: Verify

1. Run `performance_start_trace` with `reload: true, autoStop: false`
2. Wait for all content to load
3. Run `performance_stop_trace` with a `filePath`
4. Parse the trace file and confirm `disabled-by-default-devtools.screenshot` events exist with `args.snapshot` containing base64 image data
5. Optionally load the trace in Chrome DevTools and confirm the filmstrip shows frames

### Task 4: Commit

```bash
git add example/scripts/inspector-proxy.js tools/devtools-mcp/src/tools/performance.ts
git commit -m "fix: include commit screenshots in MCP performance traces"
```
