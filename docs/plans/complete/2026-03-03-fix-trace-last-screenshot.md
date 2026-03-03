# Fix Missing Last Frame in Performance Traces

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the race condition where the last screenshot frame is dropped from performance traces because `screenshotCapture.stop()` is called before in-flight screenshot-data messages arrive.

**Architecture:** Move `screenshotCapture.stop()` from the synchronous stop handler into the async callback that fires after `trace-data` is received from the app. This ensures all in-flight screenshot messages are buffered before we stop accepting them.

**Tech Stack:** Node.js (inspector-proxy.js)

---

## Root Cause

In `inspector-proxy.js`, when Chrome DevTools sends `Tracing.end`:

1. `screenshotCapture.stop()` is called immediately — sets `isCapturingScreenshots = false`
2. `stop-tracing` is sent to the app
3. A promise waits for `trace-data` from the app

But `handleScreenshotData` (line 1643) checks `isCapturingScreenshots` and silently drops any `screenshot-data` messages that arrive after `stop()`. Since `stop()` runs synchronously before the app even receives `stop-tracing`, any in-flight screenshot from the last React commit is dropped.

The same bug exists in all three domains: **Tracing**, **NodeTracing**, and **Profiler**.

## Fix

Defer `screenshotCapture.stop()` until AFTER `trace-data` is received — right before `emitTraceEvents` merges the screenshots into the trace.

---

### Task 1: Fix Tracing domain — defer stop until trace-data received

**Files:**
- Modify: `example/scripts/inspector-proxy.js:138-170`

**Step 1: Move `screenshotCapture.stop()` from the synchronous handler into the promise callback**

Change the `end` handler in `createTracingDomain` (lines 138–170) from:

```js
case 'end': {
    log('Tracing', 'end — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
    screenshotCapture.stop();                                    // ← BUG: too early
    if (ctx.sendToApp) {
      ctx.sendToApp(JSON.stringify({type: 'stop-tracing'}));
    }
    // ...
    tracePromise.then(function (traceData) {
      // ...
      emitTraceEvents(ws, id, events, 'Tracing', targetId, ctx, screenshotCapture, tracingStartTs);
    });
    return null;
}
```

To:

```js
case 'end': {
    log('Tracing', 'end — sendToApp=' + (ctx.sendToApp ? 'yes' : 'NO'));
    if (ctx.sendToApp) {
      ctx.sendToApp(JSON.stringify({type: 'stop-tracing'}));
    }
    // ...
    tracePromise.then(function (traceData) {
      screenshotCapture.stop();                                  // ← FIXED: after trace-data
      // ...
      emitTraceEvents(ws, id, events, 'Tracing', targetId, ctx, screenshotCapture, tracingStartTs);
    });
    return null;
}
```

Concretely, delete line 140 (`screenshotCapture.stop();`) and add it as the first line inside `tracePromise.then()` (before the existing code on line 160).

**Step 2: Verify the change**

Read the modified function to confirm `screenshotCapture.stop()` is inside `tracePromise.then()` and no longer in the synchronous handler.

---

### Task 2: Fix NodeTracing domain — same pattern

**Files:**
- Modify: `example/scripts/inspector-proxy.js:218-250`

**Step 1: Move `screenshotCapture.stop()` from the synchronous handler into the promise callback**

Same fix as Task 1 but in `createNodeTracingDomain`. Delete line 220 (`screenshotCapture.stop();`) and add it as the first line inside `tracePromise.then()` (before the existing code on line 240).

**Step 2: Verify the change**

Read the modified function to confirm the fix.

---

### Task 3: Fix Profiler domain — same pattern

**Files:**
- Modify: `example/scripts/inspector-proxy.js:561-563`

**Step 1: Move `screenshotCapture.stop()` into `maybeFinishStop`**

The Profiler domain uses a different pattern — it has `maybeFinishStop()` which waits for both trace data and profiler response. Move `screenshotCapture.stop()` from line 563 to inside `maybeFinishStop()`, right before the `emitTraceEvents` call (line 639).

Delete line 563 (`screenshotCapture.stop();`) and add `screenshotCapture.stop();` as a new line before line 639 (`emitTraceEvents(ws, null, events, ...)`).

**Step 2: Verify the change**

Read the modified function to confirm the fix.

---

### Task 4: Commit

**Step 1: Commit the fix**

```bash
git add example/scripts/inspector-proxy.js
git commit -m "fix: defer screenshotCapture.stop() to prevent dropping last trace frame

screenshotCapture.stop() was called synchronously in the Tracing.end
handler, setting isCapturingScreenshots=false before in-flight
screenshot-data messages from the app could arrive. This caused the
last commit screenshot to be silently dropped.

Move stop() into the async callback that fires after trace-data is
received, ensuring all screenshots are buffered before we stop
accepting them. Applied to Tracing, NodeTracing, and Profiler domains."
```
