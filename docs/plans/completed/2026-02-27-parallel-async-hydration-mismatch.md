# Parallel Async Hydration Mismatch Investigation & Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Investigate and fix the hydration mismatch warnings in the `testFlightParallelAsyncRendersAndHydrates` E2E test (fixture `24-flight-parallel-async`).

**Architecture:** The mismatch occurs because the SSR stream renders pending Suspense boundaries with skeleton fallbacks (`B`/`/B`), then reveals them asynchronously via segments (`S`/`/S` + `X`). By the time hydration runs, the revealed content's tree structure may not match what the Flight client resolves to. The fix likely involves ensuring the SSR-revealed tree and the Flight-resolved tree produce identical structures, or that the hydration walker correctly handles the revealed-boundary state.

**Tech Stack:** React Fizz (SSR), Flight client, custom React reconciler (HostConfig.js), Swift SSRCoordinator, ShadowTreeBuilder

---

## Background

### What the fixture does

`24-flight-parallel-async.js` has two `<Suspense>` boundaries with async server components:
- Boundary 0: `<ParallelSection label="Left" delay={500}>` + `<ParallelSection label="Right" delay={1500}>`
- Boundary 1: `<ParallelSection label="A" delay={300}>` + `<ParallelSection label="B" delay={600}>` + `<ParallelSection label="C" delay={900}>`

### What the SSR stream produces

```
Shell:
  O div (root container)
    O div (header), h1 "Parallel Async", p description, C, C
    B 0 (pending boundary)
      fallback skeleton divs...
    /B
    B 1 (pending boundary)
      fallback skeleton divs...
    /B
  C
  R (root complete)

Streaming reveals (async, in order of resolution):
  S 4 → A content (300ms)
  S 2 → Left content (500ms)
  S 5 → B content (600ms)
  S 6 → C content (900ms)
  X 1 (reveal boundary 1: splices A, B, C)
  S 3 → Right content (1500ms)
  X 0 (reveal boundary 0: splices Left, Right)
```

### The mismatch

The test logs show:
```
[JS WARN] Recoverable: Hydration failed because the server rendered HTML didn't match the client.
```

This fires twice (once per Suspense boundary). The hydration is "recoverable" — React falls back to client rendering for the mismatched subtrees — but this defeats the purpose of SSR (double work, visual flash).

### Likely root causes

The mismatch could come from several sources. **The investigation tasks below are ordered to narrow down the root cause before attempting a fix.**

Hypotheses (most to least likely):

1. **Fallback vs content structure**: The SSR tree has `#suspense(pending=true)` → fallback children at the time hydration walks the tree, but the Flight-resolved React tree expects `#suspense` → content children. Even if the reveal fires before hydration reaches this node, the `ssrTrees` data structure may be stale.

2. **Reveal timing vs hydration walk**: The `X` reveal may update the shadow tree (via `revealBoundaryImmutable`) but the `ssrTrees` map in Bindings (used by `$$getFirstSSRChild`/`$$getNextSSRSibling`) may not reflect the updated tree. So hydration walks the pre-reveal tree structure.

3. **Content node wrapper mismatch**: After reveal, the `#suspense` wrapper has `pending=false` and content children. But the content children were built by a separate `ShadowTreeBuilder` (segment builder) and may have a different structure than what Fizz would have produced inline (e.g., missing a wrapper `div` or extra nodes).

4. **Text node splitting**: The fixture renders `{delay}ms` as `<p>{delay}ms</p>`. Fizz may split this into two text nodes (`"500"` + `"ms"`) differently than the Flight client. (The CSR test confirmed these ARE separate labels, but the Flight client may produce them identically.)

---

## Task 1: Add diagnostic logging to trace the mismatch

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js` (hydration functions)

**Step 1: Add detailed logging to `diffHydratedPropsForDevWarnings` and `canHydrateInstance`**

Add temporary logging to trace exactly which SSR node fails to match:

```js
// In canHydrateInstance (line ~753):
exports.canHydrateInstance = function(instance, type, props, inRootOrSingleton) {
  console.log('[Hydration] canHydrateInstance: SSR type=' + instance.type + ' expected=' + type + ' match=' + (instance.type === type));
  if (instance.type === type) {
    return instance;
  }
  return null;
};

// In canHydrateSuspenseInstance (line ~766):
exports.canHydrateSuspenseInstance = function(instance) {
  console.log('[Hydration] canHydrateSuspenseInstance: type=' + instance.type + ' pending=' + instance.pending + ' fallback=' + instance.fallback);
  if (instance.type === '#suspense') {
    return instance;
  }
  return null;
};

// In canHydrateTextInstance (line ~759):
exports.canHydrateTextInstance = function(instance, text) {
  console.log('[Hydration] canHydrateTextInstance: SSR text="' + instance.text + '" expected="' + text + '" SSR type=' + instance.type);
  if (instance.type === '#text') {
    return instance;
  }
  return null;
};

// In getFirstHydratableChildWithinSuspenseInstance (line ~748):
exports.getFirstHydratableChildWithinSuspenseInstance = function(instance) {
  var child = $$getSSRChildOf(instance._ssrNodeRef);
  console.log('[Hydration] getFirstChildWithinSuspense: ssrRef=' + instance._ssrNodeRef + ' pending=' + instance.pending + ' child=' + (child ? child.type : 'null'));
  return child;
};
```

**Step 2: Run the E2E test and capture logs**

Run: `npm run test:e2e-swift 2>&1 | tee /tmp/hydration-debug.log`

Look for the sequence of hydration traversal calls around the `#suspense` boundaries. The logs will show:
- Whether `canHydrateSuspenseInstance` finds the `#suspense` node
- Whether `getFirstHydratableChildWithinSuspenseInstance` returns fallback or content
- Which `canHydrateInstance` call first fails (expected vs actual type)

**Step 3: Analyze the log output**

The key question: when hydration walks into the `#suspense` boundary, does it see:
- (a) Fallback skeleton children (reveal hasn't happened yet)
- (b) Content children (reveal already happened, `pending=false`)
- (c) Stale tree structure (reveal happened but `ssrTrees` not updated)

Document findings. This determines which hypothesis is correct and which fix to apply.

**Step 4: Commit diagnostics**

```
git add packages/react-dom-native/src/renderer/HostConfig.js
git commit -m "debug: add hydration traversal logging for parallel async investigation"
```

---

## Task 2: Verify ssrTrees is updated after boundary reveals

**Files:**
- Read: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` (lines ~470-500, `revealBoundaryInCurrentTree`)
- Read: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` (hydration flow)

**Step 1: Trace the reveal → ssrTrees update path**

In `Bindings.swift`, the `revealBoundaryInCurrentTree` method (around line 470) updates `currentTrees[surfaceId]` with the revealed tree. But hydration traversal uses `ssrTrees[surfaceId]` (set during SSR parsing). Verify:

1. Are `ssrTrees` and `currentTrees` the same dictionary? (Likely not — SSR tree vs committed tree)
2. After a reveal, does `ssrTrees` get updated? Or only `currentTrees`?
3. The hydration bindings (`$$getFirstSSRChild`, `$$getSSRChildOf`, `$$getNextSSRSibling`) read from `ssrTrees` — if reveals only update `currentTrees`, the hydration walker sees stale fallback content.

**Step 2: Add a Swift log to confirm**

In `Bindings.swift`, in the `$$getFirstSSRChild` handler (line ~1874), add a log showing the tree structure:

```swift
print("[ReactDomNativeKit] getFirstSSRChild(\(surfaceId)): tree has \(tree.count) root children, first=\(first.family.elementType)")
// Also log children of #suspense nodes to see if they're fallback or content
for child in tree {
    if child.family.elementType == "#suspense" {
        let pending = (child.props["pending"] as? Bool) ?? false
        print("[ReactDomNativeKit]   #suspense pending=\(pending) children=\(child.children.count): \(child.children.map { $0.family.elementType })")
    }
}
```

**Step 3: Run and analyze**

Run: `npm run test:e2e-swift`

Check if `#suspense` nodes in the SSR tree still show `pending=true` with fallback children when hydration starts.

**Step 4: Commit**

```
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "debug: add SSR tree state logging during hydration traversal"
```

---

## Task 3: Apply the fix (based on findings from Tasks 1-2)

The fix depends on the root cause identified above. Below are the fix strategies for each hypothesis:

### Fix A: Update ssrTrees after boundary reveal (most likely)

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

If `ssrTrees` is not updated after reveals, the hydration walker sees stale fallback content. The fix:

```swift
// In revealBoundaryInCurrentTree (or wherever reveals update the tree):
// After computing newTree, ALSO update ssrTrees so hydration sees the revealed content.
ssrTrees[surfaceId] = newTree
```

This ensures `$$getFirstSSRChild` / `$$getSSRChildOf` / `$$getNextSSRSibling` return content nodes (not fallback) after a reveal completes.

### Fix B: Defer hydration until all reveals complete

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift`

If the issue is that hydration starts while reveals are still in-flight, the fix is to wait for all pending boundaries to be revealed before calling `hydrateRoot`. This might already be partially handled — check if `Root.hydrateRoot` waits for the SSR stream to fully complete (including all `X` reveals).

### Fix C: Handle pending boundaries during hydration

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`

If boundaries are intentionally still pending during hydration (dehydrated Suspense), ensure:
1. `isSuspenseInstancePending` returns `true` for these boundaries
2. `getFirstHydratableChildWithinSuspenseInstance` returns the fallback children (which React should skip/replace)
3. React correctly treats them as dehydrated boundaries and registers retry callbacks

This is the most complex fix but may be the correct approach for streaming SSR where content arrives progressively.

**Step 1: Implement the fix based on Task 1-2 findings**

Apply the appropriate fix from A, B, or C above.

**Step 2: Run the E2E tests**

Run: `npm run test:e2e-swift`

Expected: `testFlightParallelAsyncRendersAndHydrates` passes **without** hydration mismatch warnings.

**Step 3: Commit**

```
git add <modified files>
git commit -m "fix: resolve hydration mismatch for parallel async Suspense boundaries"
```

---

## Task 4: Remove diagnostic logging

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift`

**Step 1: Remove all temporary logging added in Tasks 1-2**

Revert the `console.log` and `print` statements added for debugging. Keep any logging that was already there before this investigation.

**Step 2: Run the full E2E test suite to verify nothing regressed**

Run: `npm run test:e2e-swift`

Expected: All tests pass (except pre-existing flaky `testFlightServerErrorHandled`).

**Step 3: Commit**

```
git add packages/react-dom-native/src/renderer/HostConfig.js packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift
git commit -m "cleanup: remove hydration debug logging"
```

---

## Task 5: Strengthen the test to assert no hydration warnings

**Files:**
- Modify: `packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndSSRTests.swift`

**Step 1: Update `testFlightParallelAsyncRendersAndHydrates` to capture JS console warnings**

The test currently only checks that content appears. Add an assertion that no hydration mismatch warnings were emitted. Check if there's an existing mechanism to capture JS warnings in tests (look at `testRecoverableErrorsHydrate` for reference — it may already test for the presence of recoverable errors).

If no mechanism exists, this task can be deferred. The key validation is that the `[JS WARN] Recoverable: Hydration failed` messages no longer appear in the test output.

**Step 2: Run the test**

Run: `npm run test:e2e-swift`

Expected: Test passes with no hydration mismatch warnings in output.

**Step 3: Commit**

```
git add packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndSSRTests.swift
git commit -m "test: assert no hydration mismatch in parallel async fixture"
```

---

## Key Files Reference

| File | Role |
|------|------|
| `example/server/src/fixtures/24-flight-parallel-async.js` | The fixture (async server components + Suspense) |
| `packages/react-dom-native/src/server/NativeFizzConfig.js` | Fizz SSR config — produces B/S/X instructions |
| `packages/react-dom-native/src/renderer/HostConfig.js` | Hydration functions (canHydrate*, hydrateInstance, etc.) |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/SSRCoordinator.swift` | Parses SSR stream, manages boundary reveals |
| `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift` | `revealBoundaryImmutable` — swaps fallback for content |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` | `ssrTrees`, `makeSSRNodeRef`, hydration traversal bindings |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Root.swift` | Orchestrates SSR → hydration flow |
| `packages/react-dom-native/ios/Tests/ReactDomNativeTests/EndToEndSSRTests.swift:598` | The failing test |
