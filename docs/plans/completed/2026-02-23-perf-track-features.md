# Performance Track Missing Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 5 missing performance track features (aborted components, errored components, deduped components, aborted awaits, errored IO) to match upstream React's `ReactFlightPerformanceTrack.js`.

**Architecture:** The `flushComponentPerformance` reverse walk in `client.js` currently only handles the "normal" case (`endTimeIdx > -1`). We need to add: (1) an `else` branch for aborted entries when there's no end time marker, (2) `isLastComponent` tracking + chunk status check for errored components, (3) dedup logging on re-visit, and (4) errored IO flag check in `flushServerRequestTiming`.

**Tech Stack:** JavaScript (CommonJS), Jest tests

---

### Task 1: Add Aborted Component Support

When the server stream ends before a component finishes rendering, the D rows have a start time but no closing time marker. The upstream handles this in the `else` branch (when `endTimeIdx === -1`) and uses `'warning'` color.

**Files:**
- Modify: `packages/react-dom-native/src/flight-client/client.js:909-913`
- Test: `packages/react-dom-native/src/flight-client/__tests__/client.test.js:975-1048` (2 existing failing tests)

**Step 1: Run the failing tests to confirm they fail**

Run: `npm test -- --testPathPattern='flight-client' 2>&1 | tail -30`
Expected: 2 FAIL — `'emits aborted component with warning color when no end time marker'` and `'handles mix of completed and aborted components'`

**Step 2: Add the aborted branch to the reverse walk**

In `client.js`, after the closing brace of the `if (endTimeIdx > -1)` block (line 909) and before the `endTime = time;` line (line 911), add an `else` branch:

```js
      } else {
        // Aborted: no end time marker found yet. Entries between the end of
        // the debugInfo array and this time marker were still in progress
        // when the stream ended.
        endTime = time; // If we don't find anything else the endTime is the start time.
        for (var ai = debugInfo.length - 1; ai > di; ai--) {
          var abortCandidate = debugInfo[ai];
          if (typeof abortCandidate === 'object' && abortCandidate !== null && typeof abortCandidate.name === 'string') {
            if (componentEndTime > childrenEndTime) {
              childrenEndTime = componentEndTime;
            }
            // Aborted component — use 'warning' color
            var abortStart = time + timeOrigin;
            var abortChildrenEnd = childrenEndTime + timeOrigin;
            if (trackIdx < 10) {
              console.timeStamp(
                abortCandidate.name,
                abortStart < 0 ? 0 : abortStart,
                abortChildrenEnd,
                trackNames[trackIdx],
                'Server Components ⚛',
                'warning'
              );
            }
            componentEndTime = time;
            result.component = abortCandidate;
          }
        }
      }
```

This matches upstream lines 4632-4674 of `ReactFlightClient.js`. We handle aborted awaits in a later task.

**Step 3: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern='flight-client' 2>&1 | tail -30`
Expected: Both aborted component tests PASS

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/flight-client/client.js
git commit -m "Add aborted component support to performance track

When the server stream ends before a component finishes rendering,
emit the component entry with 'warning' color instead of silently
skipping it."
```

---

### Task 2: Add Errored Component Support

When a server component throws, the chunk gets an E row which sets `chunk.status = 'rejected'`. The rootmost component in that chunk should use `'error'` color. This requires:
1. Tracking `isLastComponent` — the first component processed in the reverse walk is the "last" (rootmost)
2. Checking `root.status === REJECTED` for that component

**Files:**
- Modify: `packages/react-dom-native/src/flight-client/client.js:839-914`
- Test: `packages/react-dom-native/src/flight-client/__tests__/client.test.js:1050-1085` (1 existing failing test)

**Step 1: Run the failing test to confirm it fails**

Run: `npm test -- --testPathPattern='flight-client' --testNamePattern='errored component' 2>&1 | tail -20`
Expected: FAIL — `'emits errored component with error color when chunk is rejected'`

**Step 2: Add `isLastComponent` tracking and error check**

In `client.js`, inside the `if (debugInfo)` block starting at line 840, add `isLastComponent` initialization after the existing variables:

```js
    var isLastComponent = true;
```

Add it right after `var endTimeIdx = -1;` (line 844).

Then modify the **normal case** component render block (inside `if (endTimeIdx > -1)`, the `if (typeof candidate.name === 'string')` branch). Replace the color calculation:

**Before** (lines 864-868):
```js
            var selfTime = componentEndTime - time;
            var color =
              selfTime < 0.5 ? 'primary-light' :
              selfTime < 50 ? 'primary' :
              selfTime < 500 ? 'primary-dark' : 'error';
```

**After:**
```js
            var selfTime = componentEndTime - time;
            var color;
            if (isLastComponent && root.status === REJECTED) {
              color = 'error';
            } else {
              color =
                selfTime < 0.5 ? 'primary-light' :
                selfTime < 50 ? 'primary' :
                selfTime < 500 ? 'primary-dark' : 'error';
            }
```

Then add `isLastComponent = false;` right after `result.component = candidate;` (line 882):

```js
            result.component = candidate;
            isLastComponent = false;
```

The same `isLastComponent = false` is already handled in the aborted branch from Task 1, but add it there too if not already present — after `result.component = abortCandidate;` in the aborted loop.

**Step 3: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern='flight-client' 2>&1 | tail -30`
Expected: Errored component test PASSES. All previous tests still pass.

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/flight-client/client.js
git commit -m "Add errored component support to performance track

When a chunk is rejected (server component threw), the rootmost
component uses 'error' color. Uses isLastComponent tracking to
identify which component was rendering when the error occurred."
```

---

### Task 3: Add Deduped Component Support

When the same chunk is referenced by multiple parents, `flushComponentPerformance` is called again for the same chunk. The second visit hits the early-return path at lines 767-771. Currently it returns without logging. We need to emit a `'name [deduped]'` entry with `'primary-light'` color.

The upstream logic (lines 4429-4443 of `ReactFlightClient.js`):
- Check `parentEndTime > -Infinity` (ensures we have a valid parent)
- Check `parentEndTime < previousEndTime` (ensures span is visible)
- Check `previousResult.component !== null` (ensures there's a component to dedup)
- Emit with label `name + ' [deduped]'`, start = `parentEndTime`, end = `previousEndTime`, color = `'primary-light'`

**Files:**
- Modify: `packages/react-dom-native/src/flight-client/client.js:766-771`
- Test: `packages/react-dom-native/src/flight-client/__tests__/client.test.js:1087-1136` (1 existing failing test)

**Step 1: Run the failing test to confirm it fails**

Run: `npm test -- --testPathPattern='flight-client' --testNamePattern='deduped' 2>&1 | tail -20`
Expected: FAIL — `'emits deduped entry when the same chunk is referenced by multiple parents'`

**Step 2: Add dedup logging to the early-return path**

Replace lines 766-771:

**Before:**
```js
  // If already visited (dedup), return previous result
  if (!Array.isArray(root._children)) {
    var previousResult = root._children;
    previousResult.track = trackIdx;
    return previousResult;
  }
```

**After:**
```js
  // If already visited (dedup), log a lightweight dedup entry and return
  if (!Array.isArray(root._children)) {
    var previousResult = root._children;
    var previousEndTime = previousResult.endTime;
    if (
      parentEndTime > -Infinity &&
      parentEndTime < previousEndTime &&
      previousResult.component !== null &&
      trackIdx < 10
    ) {
      var dedupName = previousResult.component.name + ' [deduped]';
      var dedupStart = parentEndTime + response._timeOrigin;
      var dedupEnd = previousEndTime + response._timeOrigin;
      console.timeStamp(
        dedupName,
        dedupStart < 0 ? 0 : dedupStart,
        dedupEnd,
        trackNames[trackIdx],
        'Server Components ⚛',
        'primary-light'
      );
    }
    previousResult.track = trackIdx;
    return previousResult;
  }
```

**Step 3: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern='flight-client' 2>&1 | tail -30`
Expected: Deduped component test PASSES. All previous tests still pass.

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/flight-client/client.js
git commit -m "Add deduped component support to performance track

When the same chunk is visited twice (referenced by multiple parents),
emit a lightweight '[deduped]' entry with primary-light color instead
of silently returning."
```

---

### Task 4: Add Aborted Await Support

When a component starts awaiting but the stream ends before the await resolves, the await entry in the aborted branch should use `'warning'` color. This goes in the `else` branch added in Task 1.

The upstream logic (lines 4657-4672 of `ReactFlightClient.js`):
- Check `candidateInfo.awaited && candidateInfo.awaited.env != null`
- Use `asyncInfo.awaited.end` as fallback endTime if available
- Emit with label `'await ' + name`, color `'warning'`

**Files:**
- Modify: `packages/react-dom-native/src/flight-client/client.js` (the `else` branch from Task 1)
- Test: `packages/react-dom-native/src/flight-client/__tests__/client.test.js:1138-1173` (1 existing failing test)

**Step 1: Run the failing test to confirm it fails**

Run: `npm test -- --testPathPattern='flight-client' --testNamePattern='aborted await' 2>&1 | tail -20`
Expected: FAIL — `'emits aborted await with warning color when no end time marker'`

**Step 2: Add aborted await handling to the else branch**

In the `else` branch added in Task 1, after the aborted component `if` block (after `result.component = abortCandidate;`), add an `else if` for awaited entries:

```js
          else if (typeof abortCandidate === 'object' && abortCandidate !== null && abortCandidate.awaited && abortCandidate.awaited.env != null) {
            // Aborted await — use awaited.end as fallback endTime if available
            if (abortCandidate.awaited.end > endTime) {
              endTime = abortCandidate.awaited.end;
            }
            if (endTime > childrenEndTime) {
              childrenEndTime = endTime;
            }
            var abortAwaitName = 'await ' + abortCandidate.awaited.name;
            var abortAwaitStart = time + timeOrigin;
            var abortAwaitEnd = endTime + timeOrigin;
            if (trackIdx < 10) {
              console.timeStamp(
                abortAwaitName,
                abortAwaitStart < 0 ? 0 : abortAwaitStart,
                abortAwaitEnd,
                trackNames[trackIdx],
                'Server Components ⚛',
                'warning'
              );
            }
          }
```

**Step 3: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern='flight-client' 2>&1 | tail -30`
Expected: Aborted await test PASSES. All previous tests still pass.

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/flight-client/client.js
git commit -m "Add aborted await support to performance track

When a component's await is in progress when the stream aborts,
emit the await entry with 'warning' color. Uses awaited.end as
fallback end time when available."
```

---

### Task 5: Add Errored IO Support

When a server I/O operation (e.g. fetch) fails, its J row entry should use `'error'` color in the Server Requests track. The upstream checks `ioInfo.errored` flag in `logIOInfoErrored()`.

**Files:**
- Modify: `packages/react-dom-native/src/flight-client/client.js:960-986` (`flushServerRequestTiming`)
- Test: `packages/react-dom-native/src/flight-client/__tests__/client.test.js:1175-1211` (1 existing failing test)

**Step 1: Run the failing test to confirm it fails**

Run: `npm test -- --testPathPattern='flight-client' --testNamePattern='errored IO' 2>&1 | tail -20`
Expected: FAIL — `'emits errored IO with error color in Server Requests track'`

**Step 2: Add errored flag check in flushServerRequestTiming**

In `flushServerRequestTiming`, modify the color selection inside the for loop. Replace lines 966-976:

**Before:**
```js
    // Color based on first character of name (matches React's getIOColor)
    var color;
    if (label.length > 0) {
      switch (label.charCodeAt(0) % 3) {
        case 0: color = 'tertiary-light'; break;
        case 1: color = 'tertiary'; break;
        default: color = 'tertiary-dark'; break;
      }
    } else {
      color = 'tertiary';
    }
```

**After:**
```js
    // Errored IO uses 'error' color; otherwise color based on first character
    var color;
    if (io.errored) {
      color = 'error';
    } else if (label.length > 0) {
      switch (label.charCodeAt(0) % 3) {
        case 0: color = 'tertiary-light'; break;
        case 1: color = 'tertiary'; break;
        default: color = 'tertiary-dark'; break;
      }
    } else {
      color = 'tertiary';
    }
```

**Step 3: Run the tests to verify they pass**

Run: `npm test -- --testPathPattern='flight-client' 2>&1 | tail -30`
Expected: Errored IO test PASSES. ALL tests pass (including all 6 previously-failing fixtures).

**Step 4: Commit**

```bash
git add packages/react-dom-native/src/flight-client/client.js
git commit -m "Add errored IO support to Server Requests performance track

When a J row has errored:true, render it with 'error' color in the
Server Requests track instead of the normal tertiary color."
```

---

### Task 6: Final Verification

**Step 1: Run all tests**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass, including all 6 previously-failing performance track fixtures.

**Step 2: Visual verification with demo app**

Use `/build-demo` to build and run the Falcon demo app.

Navigate to the Flight Test fixtures:
- **Async Await** — verify `await sleep` entries appear below component bars
- **Server Error** — verify FailingSection shows red `'error'` color
- **Aborted Suspense** — verify VerySlowSection shows yellow `'warning'` color
- **Deduped Component** — verify second SharedData shows `'SharedData [deduped]'`

**Step 3: Commit any remaining changes**

If any adjustments were needed during visual verification, commit them.

---

## Reference

| Feature | Upstream Function | Color | Our Location |
|---------|------------------|-------|--------------|
| Aborted component | `logComponentAborted` (lines 144-197) | `'warning'` | `else` branch in reverse walk |
| Errored component | `logComponentErrored` (lines 200-257) | `'error'` | `isLastComponent && root.status === REJECTED` check |
| Deduped component | `logDedupedComponentRender` (lines 260-298) | `'primary-light'` | Early-return path in `flushComponentPerformance` |
| Aborted await | `logComponentAwaitAborted` (lines 375-421) | `'warning'` | `else` branch, awaited sub-case |
| Errored IO | `logIOInfoErrored` (lines 542-590) | `'error'` | `io.errored` check in `flushServerRequestTiming` |

## Key Files

| File | Purpose |
|------|---------|
| `packages/react-dom-native/src/flight-client/client.js` | All implementation changes (Tasks 1-5) |
| `packages/react-dom-native/src/flight-client/__tests__/client.test.js` | 6 existing failing test fixtures (no new tests needed) |
| Upstream `ReactFlightClient.js:4366-4680` | Reference for `logComponentInfo` + `flushComponentPerformance` |
| Upstream `ReactFlightPerformanceTrack.js:144-540` | Reference for all log functions |
