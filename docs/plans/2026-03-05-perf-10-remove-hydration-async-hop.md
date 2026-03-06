# Perf 10: Remove Async Hop in onHydrationCommitted

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save 2-5ms by removing the `DispatchQueue.main.async` hop in `onHydrationCommitted()`.

**Architecture:** After hydration commits, `onHydrationCommitted()` wraps its work in `DispatchQueue.main.async` to "give React time to set up dehydrated Suspense fibers." But `registerSuspenseInstanceRetry` runs synchronously during the commit, so the retry callbacks are already registered by the time `onHydrationCommitted` is called. The async hop adds an unnecessary GCD delay before flushing pending reveals.

**Tech Stack:** Swift, GCD

---

### Task 1: Remove the async wrapper

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift`

**Step 1: Find and modify onHydrationCommitted**

Find `onHydrationCommitted()` (around line 622). The current code looks like:

```swift
func onHydrationCommitted() {
    DispatchQueue.main.async { [weak self] in
        self?.hydrationCommitted = true
        if !self?.pendingReveals.isEmpty ?? false {
            self?.flushPendingReveals()
        }
    }
}
```

Change to synchronous execution:

```swift
func onHydrationCommitted() {
    hydrationCommitted = true
    if !pendingReveals.isEmpty {
        flushPendingReveals()
    }
}
```

**Step 2: Build and run**

Run: `/build demo`
Expected: App loads with SSR + hydration. Suspense boundaries reveal correctly. Post-hydration reveals flush immediately instead of after a GCD hop.

**Step 3: Verify SSR reveal behavior**

Navigate to a page with Suspense boundaries. All boundaries should still reveal correctly after hydration completes.

**Step 4: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift
git commit -m "perf: remove unnecessary async hop in onHydrationCommitted"
```
