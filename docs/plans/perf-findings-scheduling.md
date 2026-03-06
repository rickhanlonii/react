# Performance Findings: Scheduling + SSR Reveal + Hydration

## Executive Summary

The 29ms of "Waiting for Paint" is caused by React's scheduler using `setTimeout(fn, 0)` as its task scheduling primitive in JSC, combined with passive effects being intentionally deferred until "after paint." Since there is no real `requestAnimationFrame` or `MessageChannel` in the JSC environment, `setTimeout(fn, 0)` via GCD's `asyncAfter(.now() + .milliseconds(0))` introduces ~4-10ms per yield point. The SSR reveal pipeline adds further overhead through throttled boundary reveals (300ms batching window) and a `DispatchQueue.main.async` hop in the hydration committed callback.

---

## 1. How the Scheduler Coordinates Rendering and Paint

### Scheduler Task Scheduling Primitive

The React scheduler (`bundle.js:42883-42897`) selects its scheduling primitive in this order:

1. `setImmediate` -- **not available** in JSC (no polyfill registered)
2. `MessageChannel` -- **not available** in JSC (no polyfill registered)
3. `setTimeout(fn, 0)` -- **this is what runs**

```javascript
// bundle.js:42883-42897
if ("function" === typeof localSetImmediate)
  var schedulePerformWorkUntilDeadline = function () {
    localSetImmediate(performWorkUntilDeadline);
  };
else if ("undefined" !== typeof MessageChannel) {
  var channel = new MessageChannel(), port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;
  schedulePerformWorkUntilDeadline = function () { port.postMessage(null); };
} else
  schedulePerformWorkUntilDeadline = function () {
    localSetTimeout(performWorkUntilDeadline, 0);  // <-- THIS PATH
  };
```

The `setTimeout` polyfill in `JSRuntime.swift:691-714` uses `DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(delayMs))`. Even with `delayMs=0`, GCD's `asyncAfter` has inherent overhead (typically 1-4ms on iOS, sometimes more under load) because it goes through the run loop.

### The Commit -> Passive Effects Pipeline

When React finishes a commit, it schedules passive effects (useEffect cleanup/setup) via the scheduler:

```javascript
// bundle.js:31710-31716 (inside commitRootImpl)
scheduleCallback(NormalPriority$1, function () {
  trackSchedulerEvent();
  pendingDelayedCommitReason === IMMEDIATE_COMMIT &&
    (pendingDelayedCommitReason = DELAYED_PASSIVE_COMMIT);
  flushPassiveEffects();
  return null;
});
```

This `scheduleCallback` ultimately calls `schedulePerformWorkUntilDeadline()`, which is `setTimeout(fn, 0)`. The time between the commit ending and passive effects starting is logged as "Waiting for Paint" (or "Waiting") in the trace.

### requestPostPaintCallback -- Synchronous (No Paint Gate)

```javascript
// HostConfig.js:367-369
exports.requestPostPaintCallback = function requestPostPaintCallback(callback) {
  callback(Date.now());  // Called immediately, no actual paint wait
};
```

This means React's "post paint" callback fires synchronously, not after a real paint. The "Waiting for Paint" label is misleading in this environment -- it's really "Waiting for Scheduler" since there's no paint gate. React sets `pendingDelayedCommitReason = DELAYED_PASSIVE_COMMIT` because the passive effects haven't run yet, and uses this label in the trace.

### requestPaint and needsPaint

```javascript
// bundle.js:42935-42937
exports.unstable_requestPaint = function () { needsPaint = !0; };
```

When `needsPaint` is true, `shouldYieldToHost()` returns true immediately (bundle.js:42834), causing React to yield to the host even if the 5ms frame interval hasn't elapsed. This is called after commit (bundle.js:31924) to "let the browser paint." In JSC there is no browser paint, so this forces an unnecessary yield via `setTimeout(fn, 0)`.

---

## 2. What Causes the 29ms of Idle Waiting

The 29ms breaks down across ~7 "Waiting for Paint" events. Each one is a `setTimeout(fn, 0)` hop. The sources are:

### Source 1: Post-commit passive effect scheduling (~7 hops)
After each React commit, passive effects are scheduled via `scheduleCallback` which calls `setTimeout(fn, 0)`. With the SSR + hydration pipeline producing multiple commits (SSR First Paint commit, SSR Reveals, Hydration commit, post-hydration retry commits), each commit generates a yield point.

### Source 2: The `needsPaint = true` yield
After calling `requestPaint()` at bundle.js:31924, the scheduler's `shouldYieldToHost()` returns true, forcing work to yield even if under the 5ms budget. The next `schedulePerformWorkUntilDeadline()` call queues via `setTimeout(fn, 0)`.

### Source 3: GCD asyncAfter overhead
Each `DispatchQueue.main.asyncAfter(.now() + .milliseconds(0))` call doesn't execute immediately -- it schedules to the next run loop iteration. Under load (layout, CATransaction, view hierarchy updates on the main thread), this can take 4-10ms.

### Why It's Worse Than Web
On web, `MessageChannel.postMessage()` fires at the start of the next task (microtask-like timing, sub-ms). `setTimeout(fn, 0)` in browsers is clamped to ~4ms after nested calls (HTML spec), and in iOS GCD it's similar or worse due to run loop integration.

---

## 3. The SSR Reveal Pipeline (Step by Step)

### SSR First Paint
1. `URLSession` streams SSR instruction data chunks to `InstructionStreamParser` (on main queue)
2. Parser calls `SSRCoordinator` which routes to `ShadowTreeBuilder`
3. On `didReceiveRootComplete()`, `treeBuilder.onRootComplete` fires
4. `Root+SSR.swift:228`: `renderer.commitTree(newChildren: rootChildren, label: "SSR First Paint")`
5. `commitTree` does: Yoga layout -> diff (no old tree) -> mutations (CREATE+INSERT all) -> syncAllFrames -> CATransaction completion block

### SSR Boundary Reveal
1. Stream delivers segment content (`S...S` instructions) and reveal command (`X`)
2. `SSRCoordinator.didReceiveRevealBoundary(id:)` calls `onBoundaryRevealQueued`
3. `Root.queueBoundaryReveal(id:, contentNodes:)` appends to `pendingReveals` and calls `scheduleRevealFlush()`
4. **Throttling logic** (`Root+BoundaryReveals.swift:22-59`):
   - If hydration started but not committed: **blocked** (returns early)
   - If hydration committed: flush immediately
   - If pre-hydration, within LCP window (2300ms): delay by `FALLBACK_THROTTLE_MS` (300ms)
   - If pre-hydration, past LCP window: flush immediately
5. `flushPendingReveals()` calls either:
   - Pre-hydration: `ssrCoordinator.processReveal(id:)` -> `ShadowTreeBuilder.revealBoundaryImmutable()` -> `onViewsNeedUpdate` -> `renderer.commitTree(label: "SSR Reveal")`
   - Post-hydration: `bindings.revealBoundaryInCurrentTree()` + `$$notifyBoundaryRevealed(id)` in JS

### Hydration
1. Bootstrap URL from SSR stream triggers `ReactRuntime.boot()`
2. After boot, `doHydrate` closure runs (may be deferred via `pendingHydration` until shell completes)
3. Switches renderer to Bindings' shared ViewRegistry + MutationApplier
4. Registers SSR tree for hydration traversal via `registerSurfaceForHydration` and `registerSSRTree`
5. Calls `rt.hydrateSurface(surfaceId:)` which evaluates JS to call `hydrateRoot()`
6. React walks the SSR tree via `$$getFirstSSRChild`, `$$getSSRChildOf`, `$$getNextSSRSibling`
7. `hydrateInstance` attaches fiber references to existing shadow nodes via `$$setInstanceHandle`
8. On commit, `$$completeRoot` or `$$onHydrationCommit` fires
9. `onHydrationCommitted()` uses `DispatchQueue.main.async` (**another hop!**) before setting `hydrationCommitted = true` and flushing pending reveals

### Paint Scheduling (CATransaction)
```swift
// Renderer.swift:176-181
if tracing {
    let callback = onPaintTimingCollected
    CATransaction.setCompletionBlock {
        let nativePaintEnd = performanceNow()
        callback?(nativePaintEnd)
    }
}
```
CATransaction completion fires after Core Animation commits the layer tree to the render server. This is the real "paint" -- it happens asynchronously after `commitTree` returns. The timing from `preparePaintEnd` to `nativePaintEnd` is reported as "Native Paint" in the trace.

---

## 4. Concrete Optimization Ideas

### Optimization 1: Add `setImmediate` polyfill (estimated: -15-20ms)
**Impact: HIGH** -- This is the single biggest win.

The scheduler checks for `setImmediate` first. A polyfill using `DispatchQueue.main.async` (without the `asyncAfter` deadline overhead) would fire faster than `setTimeout(fn, 0)`:

```swift
// In JSRuntime.setupTimerPolyfills():
engine.setGlobalFunction("setImmediate") { [weak self, weak engine] args in
    guard let self = self, let engine = engine else { return nil }
    let callback = args[0]
    engine.protect(callback)
    let timerId = self.nextTimerId
    self.nextTimerId += 1
    DispatchQueue.main.async { [weak engine] in
        _ = engine?.callFunction(callback, args: [])
        engine?.unprotect(callback)
    }
    return engine.makeNumber(Double(timerId))
}
```

Even better: a `MessageChannel` polyfill would give the scheduler its preferred path, which uses `port.postMessage()`. This avoids GCD overhead entirely and fires in the same run loop iteration.

### Optimization 2: Flush passive effects synchronously after commit (estimated: -5-10ms)
**Impact: MEDIUM**

In the event handler (`renderer.js:107-108`), passive effects are already flushed synchronously:
```javascript
reconciler.flushSyncWork();
reconciler.flushPassiveEffects();
```

For SSR hydration commits, passive effects could also be flushed synchronously instead of going through the scheduler. This would eliminate one `setTimeout` hop per commit. The risk is blocking the main thread longer per commit, but since there's no browser paint to yield to, this is pure gain.

### Optimization 3: Remove `requestPaint()` yield (estimated: -3-5ms)
**Impact: MEDIUM**

`requestPaint()` sets `needsPaint = true`, forcing `shouldYieldToHost()` to return true immediately. Since JSC has no browser paint (no rAF, no compositor), this yield is wasted. Options:

a) Override `Scheduler.unstable_requestPaint` to be a no-op:
```javascript
// After requiring Scheduler
Scheduler.unstable_requestPaint = function() {}; // no-op in JSC
```

b) Or set `frameInterval` to a higher value (e.g., 100ms) so the scheduler rarely yields during initial render.

### Optimization 4: Eliminate `DispatchQueue.main.async` in `onHydrationCommitted` (estimated: -2-5ms)
**Impact: LOW-MEDIUM**

```swift
// Root+SSR.swift:622
func onHydrationCommitted() {
    DispatchQueue.main.async { [weak self] in  // <-- unnecessary hop
        self.hydrationCommitted = true
        if !self.pendingReveals.isEmpty {
            self.flushPendingReveals()
        }
    }
}
```

The comment says this gives React time to set up dehydrated Suspense fibers, but `registerSuspenseInstanceRetry` runs synchronously during the commit. If the retry callbacks are already registered by the time `onHydrationCommitted` is called, the async hop is unnecessary. Test by removing the async wrapper.

### Optimization 5: Batch SSR reveals into a single commit (estimated: -5-10ms for multi-reveal cases)
**Impact: MEDIUM** (for pages with multiple Suspense boundaries)

Currently each reveal calls `renderer.commitTree()` separately, doing full layout + diff + mutations. If multiple boundaries resolve in the same stream chunk:

```swift
// In flushPendingReveals, batch all reveals then commit once:
func flushPendingReveals() {
    guard !pendingReveals.isEmpty else { return }
    let reveals = pendingReveals
    pendingReveals.removeAll()

    // Process all reveals into the tree without committing
    for reveal in reveals {
        ssrCoordinator?.processRevealWithoutCommit(id: reveal.id)
    }
    // Single commit for all reveals
    let newRootChildren = ssrCoordinator?.currentRootChildren ?? []
    renderer.commitTree(newChildren: newRootChildren, label: "SSR Reveal (batched \(reveals.count))")
}
```

This saves N-1 layout+diff+mutation passes for N simultaneous reveals.

### Optimization 6: Make hydration non-blocking via incremental hydration (estimated: variable)
**Impact: LOW** (hydration is already fast at 5.5ms)

Hydration at 5.5ms for the current page isn't a bottleneck. But for larger pages, `hydrateInstance` calls `$$setInstanceHandle` per node synchronously. This could theoretically be batched, but the overhead is minimal since it's just setting a property on the ShadowNodeFamily.

### Optimization 7: Overlap SSR data processing with paint (estimated: -2-5ms)
**Impact: LOW**

The SSR stream is processed on `.main` queue via `URLSession(delegateQueue: .main)`. Instruction parsing and shadow tree building could happen on a background queue, with only `commitTree` calls dispatched to main. However, since `ShadowTreeBuilder` creates Yoga nodes (not thread-safe), this would require careful synchronization and is likely not worth the complexity for the current page size.

---

## 5. Priority Ranking

| # | Optimization | Estimated Impact | Effort | Risk |
|---|-------------|-----------------|--------|------|
| 1 | `setImmediate` / `MessageChannel` polyfill | -15-20ms | Low | Low |
| 2 | Flush passive effects synchronously | -5-10ms | Low | Medium |
| 3 | No-op `requestPaint` in JSC | -3-5ms | Trivial | Low |
| 4 | Remove async hop in `onHydrationCommitted` | -2-5ms | Trivial | Medium |
| 5 | Batch SSR reveals into single commit | -5-10ms | Medium | Low |
| 6 | Incremental hydration | Variable | High | High |
| 7 | Background SSR parsing | -2-5ms | High | High |

Optimizations 1-4 are independent and could be applied together for a combined improvement of ~25-40ms. Optimization 5 requires changes to the SSR coordinator but is architecturally clean.

---

## 6. Key Code Paths

| Component | File | Purpose |
|-----------|------|---------|
| Scheduler fallback | `bundle.js:42883-42897` | `setTimeout(fn, 0)` as task scheduler |
| setTimeout polyfill | `JSRuntime.swift:691-714` | GCD asyncAfter implementation |
| Passive effect scheduling | `bundle.js:31710-31716` | Post-commit `scheduleCallback` |
| requestPaint / needsPaint | `bundle.js:42935, 42834` | Forces yield after commit |
| requestPostPaintCallback | `HostConfig.js:367-369` | Synchronous (no actual paint wait) |
| commitTree | `Renderer.swift:94-268` | Unified layout/diff/mutations/paint |
| CATransaction paint | `Renderer.swift:176-181` | Real paint timing via completion block |
| SSR reveal throttle | `Root+BoundaryReveals.swift:22-59` | 300ms batching window |
| Hydration committed | `Root+SSR.swift:620-633` | Async hop before reveal flush |
| Reveal processing | `SSRCoordinator.swift:265-288` | Tree mutation for boundary reveal |
| Event dispatch | `renderer.js:104-108` | discreteUpdates + flushSync + flushPassive |
