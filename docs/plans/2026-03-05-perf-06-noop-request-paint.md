# Perf 06: No-op Scheduler.unstable_requestPaint

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save 3-5ms by preventing React from yielding to a non-existent browser paint cycle.

**Architecture:** After each commit, React calls `requestPaint()` which sets `needsPaint = true`, causing `shouldYieldToHost()` to return true immediately. This forces React to yield via `setTimeout(fn, 0)` to "let the browser paint." In JSC there is no browser paint, so this yield is wasted — it just adds another GCD hop.

**Tech Stack:** JavaScript

---

### Task 1: Override requestPaint to no-op

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`

**Step 1: Add requestPaint no-op**

Find the `requestPostPaintCallback` export (around line 367). Near it, add:

```javascript
// In JSC there is no browser paint to yield to, so requestPaint is a no-op.
// This prevents the scheduler from forcing an unnecessary yield after commit.
exports.requestPaint = function requestPaint() {};
```

If `requestPaint` is not already exported from HostConfig (it may be handled internally by the scheduler bundle), the alternative approach is to patch it in `renderer.js` after requiring the reconciler:

```javascript
// After: const reconciler = require('./reconciler');
// Override scheduler's requestPaint since JSC has no browser paint
const Scheduler = require('scheduler');
Scheduler.unstable_requestPaint = function() {};
```

Check which approach the bundled React code uses. The scheduler's `requestPaint` is at `bundle.js:42935`:
```javascript
exports.unstable_requestPaint = function () { needsPaint = !0; };
```

The simplest fix is to override it in `renderer.js` after imports.

**Step 2: Build and run**

Run: `/build demo`
Expected: App works identically. Scheduler no longer forces yields after commit.

**Step 3: Run perf trace**

Compare "Waiting for Paint" durations — should see fewer/shorter waits.

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/renderer/renderer.js
git commit -m "perf: no-op requestPaint in JSC since there is no browser paint to yield to"
```
