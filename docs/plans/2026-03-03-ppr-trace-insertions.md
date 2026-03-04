# PPR Performance Trace: Missing Native Tree Insertions

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix PPR (partial pre-rendering) commit timing so native tree insertions (CREATE, INSERT mutations) appear in performance traces.

**Architecture:** The Renderer unification (commit 50f39d1) ensured SSR/PPR commits go through the same `commitTree()` pipeline. But the tracing state management and timing data pipeline still have gaps that cause PPR commit events to be silently dropped before reaching the PerformanceTracer.

**Tech Stack:** Swift (Root+Prerender.swift, Root+SSR.swift, Renderer.swift, PerformanceTracer.swift, JSRuntime.swift), JavaScript (HostConfig.js)

---

## Root Cause Analysis

The native commit timing pipeline has **5 hops**, each with a guard condition. A failure at ANY hop silently drops the timing data with no error or warning:

```
Hop 1: renderer.tracingEnabled → commitTree collects timing
Hop 2: onTimingCollected      → pushes to Bindings or buffers in Root
Hop 3: addSSRCommitTimings    → buffers in Bindings.pendingSSRCommitTimings
Hop 4: reportNativeCommitTimings (JS) → checks $$isTracing()
Hop 5: tracer.reportTimeStamp → filters end >= tracingStartMs
```

### Issue 1: `renderer.tracingEnabled` stale during PPR commits (Hop 1)

**Location:** `Root+Prerender.swift:67`, `Root+SSR.swift:66`

The SSR/PPR path sets `renderer.tracingEnabled` **once at initialization**, reading `ReactRuntime.shared.isTracingActive`. If tracing starts AFTER initialization but BEFORE commits, `tracingEnabled` remains false and no timing is collected.

The CSR path (`Bindings+Registration.swift:509`) syncs `renderer.tracingEnabled = self.nativeTracingEnabled` **before every commit**. The SSR/PPR path does not.

While `syncTracingToRenderers()` (ReactRuntime.swift:285-289) updates all active renderers when tracing starts, there's a race: if a PPR Root is created and commits between `syncTracingToRenderers` calls, the sync is missed.

```
CSR:  sync ──→ commit ──→ sync ──→ commit   ← synced before EVERY commit ✓
PPR:  sync-once ──→ commit ──→ commit ──→ ...  ← stale after init ✗
```

**Affected commits:**
- `Root+Prerender.swift:135` — "Resume First Paint"
- `Root+Prerender.swift:116` — "Resume Reveal" (pre-hydration)
- `Root+Prerender.swift:274` — "Resume Reveal" (post-hydration)
- `Root+SSR.swift:255` — "SSR First Paint"
- `Root+SSR.swift:232` — "SSR Reveal"
- `Root+SSR.swift:171` — "SSR Reveal" (post-hydration)
- `Root+SSR.swift:367` — "Server-Only Reveal"
- `Root+SSR.swift:386` — "Server-Only First Paint"
- `Root+SSR.swift:479` — "SSR Reveal" (test hook)
- `Root+SSR.swift:497` — "SSR First Paint" (test hook)

### Issue 2: Retroactive event filter drops recent PPR timestamps (Hop 5)

**Location:** `PerformanceTracer.swift:78`

```swift
guard isTrackInit || end >= tracingStartMs else { return }
```

When a reload occurs, `JSRuntime.init()` calls `resetPerformanceOrigin()` (PerformanceNow.swift:20), resetting the monotonic clock to 0. PPR prelude replay is synchronous and runs ~immediately after origin reset, producing small timestamps (e.g. 5-50ms). But `tracer.startTracing()` runs later (after bundle download), setting `tracingStartMs` to a larger value (e.g. 500ms). The PPR commit timestamps are LESS than `tracingStartMs` and get filtered out as "retroactive" — even though they're from the CURRENT page load.

```
Timeline after origin reset:
  T=0ms    resetPerformanceOrigin()
  T=5ms    PPR first paint commit (commitEnd=5)
  T=500ms  tracer.startTracing() → tracingStartMs=500
  T=600ms  timings pushed to JS
  T=600ms  reportTimeStamp: end(5) >= tracingStartMs(500)? → NO → DROPPED!
```

### Issue 3: Timing buffer discarded on tracing start (Hop 3)

**Location:** `JSRuntime.swift:346`

```swift
case "start-tracing":
    ...
    self.bindings.pendingSSRCommitTimings.removeAll()
```

When "start-tracing" arrives, `pendingSSRCommitTimings` is cleared. This is correct for timings from a previous page load. But if PPR timing was just pushed to `pendingSSRCommitTimings` moments before (e.g., the `onTimingCollected` callback pushed it because `bindings.nativeTracingEnabled` was already true from a prior tracing session), the discard drops valid data.

The `guard !self.tracer.isTracing` early return prevents this during normal "Reload and Profile" flow, but the race exists if tracing restarts (stop → start) while PPR commits are in-flight.

### Why SSR works but PPR doesn't

SSR streaming takes time (network I/O), so SSR first paint typically happens AFTER the runtime boots and tracing is fully initialized. PPR prelude replay is **synchronous** — it runs in the same call stack as `startResume()`, completing before the runtime can boot and before `tracer.startTracing()` runs. This timing difference causes PPR commits to fall through the cracks of Issue 1 and Issue 2.

## Fix

The fix has two parts:

### Part A: Sync `tracingEnabled` before every SSR/PPR commit

Instead of syncing once at initialization, sync the latest tracing state before every `commitTree()` call. This mirrors what `$$completeRoot` does at `Bindings+Registration.swift:509`.

### Part B: Exclude current-page-load SSR/PPR timings from retroactive filter

The retroactive event filter in `PerformanceTracer.reportTimeStamp` needs to allow events from the current page load, even if their timestamps are before `tracingStartMs`. The simplest approach: set `tracingStartMs` to 0 (or the origin reset time) when tracing starts during boot, so that all events from the current page load pass the filter.

---

### Task 1: Add `currentTracingEnabled` helper to Root

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

**Step 1: Add helper method**

Add a computed property to Root that returns the current tracing state, preferring Bindings' `nativeTracingEnabled` (most up-to-date) with fallback to `ReactRuntime.isTracingActive`:

```swift
// In Root.swift, add after the renderer property

/// Returns the current tracing state, preferring Bindings' state.
var currentTracingEnabled: Bool {
    if let bindings = ReactRuntime.shared.bindings {
        return bindings.nativeTracingEnabled
    }
    return ReactRuntime.shared.isTracingActive
}
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift
git commit -m "feat: add currentTracingEnabled helper to Root"
```

---

### Task 2: Sync tracing before every PPR commit

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Prerender.swift`

**Step 1: Remove one-time sync at init**

Delete line 67 (`self.renderer.tracingEnabled = ReactRuntime.shared.isTracingActive`). The per-commit sync in step 2 replaces it.

**Step 2: Add sync before each commitTree call**

At each `commitTree()` call site, add `self.renderer.tracingEnabled = currentTracingEnabled` immediately before:

Line 135 (Resume First Paint):
```swift
self.renderer.tracingEnabled = currentTracingEnabled
self.renderer.commitTree(newChildren: rootChildren, label: "Resume First Paint")
```

Line 116 (Resume Reveal, pre-hydration):
```swift
self.renderer.tracingEnabled = currentTracingEnabled
self.renderer.commitTree(newChildren: newRootChildren, label: "Resume Reveal")
```

Line 274 (Resume Reveal, post-hydration):
```swift
self?.renderer.tracingEnabled = self?.currentTracingEnabled ?? false
self?.renderer.commitTree(newChildren: newRootChildren, label: "Resume Reveal")
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+Prerender.swift
git commit -m "fix: sync tracing state before each PPR commit"
```

---

### Task 3: Sync tracing before every SSR commit

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`

**Step 1: Remove one-time sync at init**

Delete line 66 (`self.renderer.tracingEnabled = ReactRuntime.shared.isTracingActive`).

**Step 2: Add sync before each commitTree call**

Apply the same pattern as Task 2 to ALL `commitTree()` call sites in Root+SSR.swift:

- `startHydration()` → "SSR First Paint" (line 255)
- `startHydration()` → "SSR Reveal" pre-hydration (line 232)
- `startHydration()` → "SSR Reveal" post-hydration (line 171)
- `startServerOnly()` → "Server-Only Reveal" (line 367)
- `startServerOnly()` → "Server-Only First Paint" (line 386)
- `feedSSRData()` → "SSR Reveal" test hook (line 479)
- `feedSSRData()` → "SSR First Paint" test hook (line 497)

For each, add `self.renderer.tracingEnabled = currentTracingEnabled` (or `self?.renderer.tracingEnabled = self?.currentTracingEnabled ?? false` for weak self closures) immediately before the `commitTree()` call.

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift
git commit -m "fix: sync tracing state before each SSR commit"
```

---

### Task 4: Fix retroactive event filter for current-page-load events

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift`

**Step 1: Set tracingStartMs to 0 when starting tracing during boot**

In ReactRuntime.swift, the boot completion handler (around line 545-551) calls `tracer.startTracing()` if `tracingActive` is true. After calling `startTracing()`, reset `tracingStartMs` to 0 so that PPR commits from the current page load (which have small timestamps after origin reset) are not filtered:

```swift
if self.tracingActive {
    if let jsRuntime = self.runtime {
        jsRuntime.tracer.startTracing()
        // Reset tracingStartMs to 0 so that SSR/PPR commits from
        // this page load are not filtered as "retroactive". The
        // origin was just reset in JSRuntime.init(), so all events
        // from this page load have small, valid timestamps.
        jsRuntime.tracer.resetTracingStart()
        jsRuntime.bindings.nativeTracingEnabled = true
        jsRuntime.bindings.pushPendingSSRCommitTimingsToJS()
    }
}
```

**Step 2: Add resetTracingStart to PerformanceTracer**

In PerformanceTracer.swift, add a method to reset `tracingStartMs` to 0:

```swift
/// Resets tracingStartMs to 0, allowing events from the current page
/// load to pass the retroactive event filter. Called during boot when
/// tracing was active before reload — the origin was just reset, so
/// all timestamps are fresh and valid.
func resetTracingStart() {
    tracingStartMs = 0
}
```

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/PerformanceTracer.swift
git commit -m "fix: allow current-page-load events through retroactive filter"
```

---

### Task 5: Verify the fix

**Step 1: Build and run**

Run `/build demo` to build and launch the app.

**Step 2: Test PPR tracing**

1. Open Chrome DevTools connected to the app
2. Navigate to a prerender fixture
3. Start tracing (click Record in Performance tab)
4. Trigger a reload
5. Stop tracing
6. Verify the trace shows "Resume First Paint" and "Resume Reveal" entries on the Shadow Tree track, with nested CREATE/INSERT mutation entries

**Step 3: Test SSR tracing still works**

1. Navigate to an SSR fixture
2. Start tracing
3. Trigger a reload
4. Stop tracing
5. Verify SSR First Paint and SSR Reveal entries appear correctly

**Step 4: Test CSR tracing still works**

1. Navigate to a CSR fixture
2. Start tracing
3. Interact with the app
4. Stop tracing
5. Verify Commit entries appear correctly

**Step 5: Commit**

```bash
git commit --allow-empty -m "test: verify PPR, SSR, and CSR tracing all work"
```

---

### Task 6: Clean up

**Step 1: Remove `syncTracingToRenderers`**

With per-commit tracing sync in place, `syncTracingToRenderers()` (ReactRuntime.swift:285-289) is no longer needed for SSR/PPR paths. The CSR path already syncs via `$$completeRoot`. Consider removing `syncTracingToRenderers` and its call sites (ReactRuntime.swift:736, 740) if no other consumers exist.

**Step 2: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/ReactRuntime.swift
git commit -m "refactor: remove syncTracingToRenderers (per-commit sync replaces it)"
```

**Step 3: Move plan to complete**

```bash
mv docs/plans/2026-03-03-ppr-trace-insertions.md docs/plans/complete/
git add docs/plans/complete/2026-03-03-ppr-trace-insertions.md
git commit -m "docs: move PPR trace fix plan to complete"
```
