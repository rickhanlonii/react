# Perf 01: Add setImmediate Polyfill

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate 15-20ms of scheduler idle time by providing `setImmediate` so React's scheduler avoids the slow `setTimeout(fn, 0)` fallback.

**Architecture:** React's scheduler checks for `setImmediate` first, then `MessageChannel`, then `setTimeout`. In JSC, neither `setImmediate` nor `MessageChannel` exist, so it falls back to `setTimeout(fn, 0)` which uses `DispatchQueue.main.asyncAfter(.now() + .milliseconds(0))` — adding 4-10ms per yield via GCD run loop overhead. A `setImmediate` polyfill using `DispatchQueue.main.async` (no deadline) fires faster.

**Tech Stack:** Swift, JavaScriptCore, GCD

---

### Task 1: Add setImmediate polyfill

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift:691`

**Step 1: Add setImmediate before setTimeout in setupTimerPolyfills**

Insert this block at the top of `setupTimerPolyfills()` (before the `setTimeout` registration at line 693):

```swift
// setImmediate — used by React's scheduler for fast task scheduling.
// Uses DispatchQueue.main.async (no deadline) which fires faster than
// asyncAfter(.now() + .milliseconds(0)) used by setTimeout.
engine.setGlobalFunction("setImmediate") { [weak self, weak engine] args in
    guard let self = self, let engine = engine else { return nil }
    let callback = args[0]
    let timerId = self.nextTimerId
    self.nextTimerId += 1
    engine.protect(callback)

    let workItem = DispatchWorkItem { [weak self, weak engine] in
        self?.timers.removeValue(forKey: timerId)
        _ = engine?.callFunction(callback, args: [])
        engine?.unprotect(callback)
    }
    self.timers[timerId] = workItem
    DispatchQueue.main.async(execute: workItem)
    return engine.makeNumber(Double(timerId))
}

// clearImmediate (uses same clearTimeout/clearInterval mechanism)
engine.setGlobalFunction("clearImmediate") { [weak self, weak engine] args in
    guard let self = self, let engine = engine else { return nil }
    let timerId = engine.toInt(args[0]) ?? 0
    if let workItem = self.timers.removeValue(forKey: timerId) {
        workItem.cancel()
    }
    return nil
}
```

**Step 2: Build and run**

Run: `/build demo`
Expected: App builds and loads. React's scheduler now uses `setImmediate` path.

**Step 3: Run a perf trace and compare**

Use falcon-devtools MCP `performance_start_trace` with reload+autoStop. Compare "Waiting for Paint" durations — should drop from ~29ms to ~9-14ms.

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift
git commit -m "perf: add setImmediate polyfill to avoid slow setTimeout scheduler fallback"
```
