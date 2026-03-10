# Plan: Fix Suspense Hydration Mismatch

## Context

When an async server component is wrapped in `<Suspense>`, SSR renders the fallback. When the async component resolves and its content includes a client component, React reports a hydration mismatch:

```
<Suspense fallback={<div>}>
  <TodoListSection>
    <TodoApp ...>
+     <div style={{display:"flex",flexDirection:"column",gap:14}}>  ← client has this
-                                                                   ← SSR had nothing
```

This is a general framework bug affecting any async server component → client component inside Suspense.

## Root Cause (Hypothesis)

**`$$completeRoot` prematurely deletes the SSR tree.** Two paths exist for hydration commit:

| Path | When | SSR tree preserved? |
|------|------|---------------------|
| `$$onHydrationCommit` | Pure hydration (SSR tree reused as-is) | Yes — comment says "DON'T remove" |
| `$$completeRoot` | React produced new children (partial mismatch) | **No — `ssrTrees.removeValue(forKey:)`** |

When `$$completeRoot` fires (e.g. due to a minor prop difference triggering client-render fallback), it deletes `ssrTrees`. Subsequent `revealBoundaryInSSRTree()` calls become no-ops (guard fails on missing tree). React's retry callback fires `getFirstHydratableChildWithinSuspenseInstance` → reads stale/missing children → mismatch.

**Evidence**: `Bindings+Registration.swift` line 816 removes `ssrTrees`, while line 838-840 (`$$onHydrationCommit`) explicitly preserves them with a comment explaining why.

## Phase 1: Repro Script

Script already exists at `scripts/test-hydration.sh`. Usage:

```bash
bash scripts/test-hydration.sh          # full: relaunch + navigate + check logs
bash scripts/test-hydration.sh --quick  # just read logs + screenshot (no relaunch)
```

The script relaunches the app with log capture, navigates to fixture `37-demo-todo`, waits for hydration, reads logs, takes a screenshot, and reports pass/fail based on "Hydration failed" in logs.

## Phase 2: Add Diagnostic Logging

### Agent 1: Swift-side logging

**`Bindings+Registration.swift`** — `$$completeRoot` handler (~line 812):
```swift
print("[Hydration Debug] $$completeRoot: surfaceId=\(surfaceId), ssrTree exists=\(self.ssrTrees[surfaceId] != nil)")
```

**`Bindings+SSR.swift`** — `revealBoundaryInSSRTree` (~line 66):
```swift
print("[Hydration Debug] revealBoundaryInSSRTree: surfaceId=\(surfaceId), boundaryId=\(boundaryId), tree exists=\(ssrTrees[surfaceId] != nil)")
```

**`Root+BoundaryReveals.swift`** — `scheduleRevealFlush` (~line 22):
```swift
print("[Hydration Debug] scheduleRevealFlush: hydrationStarted=\(hydrationStarted), hydrationCommitted=\(hydrationCommitted), pending=\(pendingReveals.count)")
```

### Agent 2: JS-side logging

**`HostConfig.js`** — `replaceContainerChildren` (~line 292):
```javascript
console.log('[Hydration Debug] replaceContainerChildren: newChildren=' + (newChildren == null ? 'null' : newChildren.length));
```

**`HostConfig.js`** — `$$notifyBoundaryRevealed` (~line 543):
```javascript
console.log('[Hydration Debug] $$notifyBoundaryRevealed: id=' + boundaryId + ', found=' + !!instance);
```

**`HostConfig.js`** — `getFirstHydratableChildWithinSuspenseInstance` (~line 587):
```javascript
console.log('[Hydration Debug] getChildWithinSuspense: pending=' + instance.pending + ', hasChild=' + !!child);
```

### Agent 3: Server-side stream logging (optional)

Add a log in `ssr-server.js` Fizz chunk handler to see the instruction sequence.

## Phase 3: Confirm Root Cause

Run the repro script and look for this sequence:
1. `replaceContainerChildren: newChildren=N` (not null) → `$$completeRoot` path taken
2. `$$completeRoot: ssrTree exists=true` → tree deleted
3. `revealBoundaryInSSRTree: tree exists=false` → reveal fails silently
4. `$$notifyBoundaryRevealed: found=true` → retry fires
5. Hydration mismatch error

## Phase 4: Fix

### Fix A — Don't delete SSR tree in `$$completeRoot`

**File**: `Bindings+Registration.swift` (~line 812-817)

```swift
// Before:
if self.hydrationInProgress.contains(surfaceId) {
    self.hydrationInProgress.remove(surfaceId)
    self.onHydrationComplete?(surfaceId)
    self.ssrTrees.removeValue(forKey: surfaceId)  // ← DELETE THIS LINE
}

// After:
if self.hydrationInProgress.contains(surfaceId) {
    self.hydrationInProgress.remove(surfaceId)
    self.onHydrationComplete?(surfaceId)
    // DON'T remove ssrTrees here — dehydrated boundary retries still
    // need the SSR tree for hydration traversal via revealBoundaryInSSRTree.
    // Matches $$onHydrationCommit behavior. Cleanup on unmount.
}
```

This aligns `$$completeRoot` with the existing `$$onHydrationCommit` behavior (line 838-840).

### Fix B (if needed) — Investigate WHY `$$completeRoot` fires instead of `$$onHydrationCommit`

If the root cause is that some other element triggers a full client-render (e.g., `<input type="search">` SSR props don't match client props), fix the prop mismatch so `$$onHydrationCommit` is used instead. This is the deeper fix.

### Fix C (defensive) — `revealBoundaryInSSRTree` should warn on missing tree

**File**: `Bindings+SSR.swift` (~line 67)

```swift
guard let tree = ssrTrees[surfaceId] else {
    print("[Warning] revealBoundaryInSSRTree: no SSR tree for surfaceId \(surfaceId)")
    return
}
```

## Phase 5: Verification

1. Remove debug logging (keep meaningful warnings)
2. Run repro script — verify no "Hydration failed" errors
3. Screenshot the todo app — verify items load correctly
4. Test all three rendering modes (server, hydrated, ppr)
5. Run `npm run test:swift` to check for regressions

## Critical Files

| File | Purpose |
|------|---------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` | `$$completeRoot` handler — primary fix location (line 816) |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+SSR.swift` | `revealBoundaryInSSRTree` — fails silently when tree missing (line 66) |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+BoundaryReveals.swift` | `flushPendingReveals` — reveal orchestration (line 62) |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root+SSR.swift` | Reveal wiring, hydration start (lines 119-128) |
| `packages/react-dom-native/src/renderer/HostConfig.js` | `replaceContainerChildren` routing, hydration traversal (line 292) |
| `packages/react-dom-native/src/server/NativeFizzConfig.js` | SSR instruction format reference |
| `example/server/src/fixtures/37-demo-todo.js` | Test fixture with nested Suspense |

## Agent Team Structure

| Agent | Role | Scope |
|-------|------|-------|
| **swift-debugger** | Add Swift logging, apply Fix A, rebuild | `Bindings+Registration.swift`, `Bindings+SSR.swift`, `Root+BoundaryReveals.swift` |
| **js-debugger** | Add JS logging, update bundle.js | `HostConfig.js`, `bundle.js` |
| **verifier** | Run repro script, take screenshots, report results | `scripts/test-hydration.sh` |

Agents work in parallel: swift-debugger + js-debugger add logging simultaneously → verifier runs repro → analyze results → swift-debugger applies fix → verifier re-runs.
