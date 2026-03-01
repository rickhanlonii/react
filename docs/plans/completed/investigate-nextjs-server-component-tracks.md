# Investigation: Why server component tracks work in Next.js without our patch

**Date**: 2026-03-01
**Status**: Completed

## Summary

**Answer: "We find a React version difference"** — Next.js bundles its own React Flight client
(compiled from a different React snapshot) that simply **does not have
`moveDebugInfoFromChunkToInnerValue`**. The function doesn't exist in any Next.js-bundled
Flight client (stable or experimental). Since it never runs, `_debugInfo` stays on chunks
naturally, and `flushComponentPerformance` works without any patch.

Our React 19.2.4 introduced `moveDebugInfoFromChunkToInnerValue` (to move debug info from
chunks to resolved React elements for DevTools). This breaks `flushComponentPerformance`
because it empties `_debugInfo` from chunks before the performance flush runs. Our patch
is the correct fix for 19.2.4.

## Detailed Findings

### Step 1: React versions

| | React | Flight client | Has `moveDebugInfoFromChunkToInnerValue` | Has `flushComponentPerformance` |
|---|---|---|---|---|
| **Falcon** | 19.2.4 | react-server-dom-webpack 19.2.4 | YES (patched with guard) | YES |
| **Next.js stable** | 19.1.0 (bundled in `next/dist/compiled/react-server-dom-webpack/`) | Custom build | NO | NO |
| **Next.js experimental** | Canary (bundled in `next/dist/compiled/react-server-dom-webpack-experimental/`) | Custom build | NO | YES |
| **React source** (main) | HEAD | Source | YES (no guard) | YES |

Key differences in `ReactPromise` constructor:

```javascript
// React 19.2.4 (Falcon)
this._children = [];
this._debugChunk = null;
this._debugInfo = [];       // ← initialized as empty array

// Next.js experimental
this._children = [];
this._debugInfo = this._debugChunk = null;  // ← initialized as null
```

### Step 2: Next.js's own tracing

Next.js does **NOT** have independent server component performance tracing. The "Server
Components" track comes from React's `flushComponentPerformance`, which exists only in the
**experimental** Flight client bundled inside Next.js. The stable Flight client has neither
`flushComponentPerformance` nor `moveDebugInfoFromChunkToInnerValue`.

### Step 3: Why `_debugInfo` survives in Next.js

In Next.js's experimental Flight client:

1. **No `moveDebugInfoFromChunkToInnerValue`** — the function simply doesn't exist
2. **No `processChunkDebugInfo`** — the wrapper function doesn't exist either
3. **No `splice(0)` on `_debugInfo`** — no splice calls touch debug info arrays
4. **`wakeChunk(listeners, value)`** — simpler signature, no `chunk` parameter, can't move debug info

So when `flushInitialRenderPerformance` fires:
```javascript
function flushInitialRenderPerformance(response) {
  if (response._replayConsole) {
    var rootChunk = getChunk(response, 0);
    isArrayImpl(rootChunk._children) &&
      (markAllTracksInOrder(),
      flushComponentPerformance(response, rootChunk, 0, -Infinity, -Infinity));
  }
}
```

It reads `rootChunk._children` (for tree traversal) and `rootChunk._debugInfo` (for timing/naming),
both of which still have data because nothing spliced them.

### Step 4: Why it breaks in React 19.2.4

In our React 19.2.4:

1. **`moveDebugInfoFromChunkToInnerValue` exists** — called from `wakeChunk` when a chunk resolves
2. **`chunk._debugInfo.splice(0)`** — empties the array and moves entries to the resolved value's `_debugInfo`
3. **`flushInitialRenderPerformance` fires later** (100ms timeout after last chunk resolves) — by this point,
   `rootChunk._debugInfo` is `[]` (empty, but truthy), so the for loops iterate 0 times
4. **No component names or timing** → no `console.timeStamp` calls → no server component tracks

### Step 5: Why our patch is correct

Our patch in `scripts/patches/react-flight-debug-channel.js` adds:

```javascript
function moveDebugInfoFromChunkToInnerValue(chunk, value) {
  if (__hasDebugChannelReadable__) return;  // ← skip when debug channel active
  // ... original splice logic
}
```

This matches the Next.js experimental behavior: debug info stays on chunks, and
`flushComponentPerformance` can read it. The guard is scoped to when a debug channel
with `hasReadable` is active, so it doesn't affect the normal DevTools flow (moving
debug info to React elements for inspection).

## Conclusion

The `moveDebugInfoFromChunkToInnerValue` function was added to React 19.2.x to support
React DevTools (moving debug info from chunks onto resolved React elements). The Next.js
experimental build was compiled from a React snapshot that predates this addition, so server
component tracks work naturally there.

**Our patch is correct.** It's the minimal fix: skip the splice when a debug channel is
active (which is exactly when `flushComponentPerformance` needs the data on chunks). The
upstream fix would be for React to either:
1. Not splice debug info when `flushComponentPerformance` hasn't run yet
2. Read debug info from a separate structure that isn't affected by the splice
3. Remove `moveDebugInfoFromChunkToInnerValue` entirely (as the experimental build does)

**No further action needed** — our postinstall patch is the right approach until React
upstream resolves the conflict between `moveDebugInfoFromChunkToInnerValue` and
`flushComponentPerformance`.
