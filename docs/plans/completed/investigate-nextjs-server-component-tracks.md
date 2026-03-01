# Investigation: Why server component tracks work in Next.js without our patch

**Date**: 2026-03-01
**Status**: Completed

## Summary

**Answer: Our React 19.2.4 npm build is missing an upstream fix.** Next.js 16.2.0-canary.53
bundles a React Flight client compiled from a newer React commit than npm 19.2.4. That newer
build has BOTH `moveDebugInfoFromChunkToInnerValue` (which splices `_debugInfo` off chunks)
AND a fallback in `flushComponentPerformance` that reads `_debugInfo` from the resolved value
when the chunk's array is empty. Our npm 19.2.4 has the splice but NOT the fallback.

**Action: Replace our `moveDebugInfoFromChunkToInnerValue` patch with a
`flushComponentPerformance` fallback patch** that adds the same value-reading logic the
upstream React source already has.

## Detailed Findings

### The versions

| | React | Flight client | Has `moveDebugInfoFromChunkToInnerValue` | Has value fallback in `flushComponentPerformance` |
|---|---|---|---|---|
| **Falcon (npm)** | 19.2.4 | react-server-dom-webpack 19.2.4 | YES | **NO** (bug) |
| **Next.js 16 (bundled)** | 19.2.4 (newer commit) | Bundled in `next/dist/compiled/` | YES | **YES** |
| **React source** (main) | HEAD | Source | YES | **YES** |

Next.js bundles its own compiled React in `next/dist/compiled/react-server-dom-webpack/`.
Even though the npm `react` package is 19.2.4, the bundled Flight client is from a newer
React commit that includes the fallback fix.

### The bug in our build

In our npm React 19.2.4, `flushComponentPerformance` does:

```javascript
var children = root._children,
  debugInfo = root._debugInfo;
if (debugInfo) {  // ← empty [] is truthy, but length is 0
  // for loops iterate 0 times — no timing data found
```

The `_debugInfo` array was emptied by `moveDebugInfoFromChunkToInnerValue` (splice(0)) and
moved to the resolved value's `_debugInfo`. But `flushComponentPerformance` never looks there.

### The upstream fix (in React source + Next.js 16 bundled build)

The React source (main) and Next.js 16's bundled Flight client have this fallback:

```javascript
var debugInfo = root._debugInfo;
if (0 === debugInfo.length && "fulfilled" === root.status) {
  var resolvedValue = resolveLazy(root.value);
  // Check if the value got the debug info from moveDebugInfoFromChunkToInnerValue
  if (typeof resolvedValue === 'object' && resolvedValue !== null &&
      (isArray(resolvedValue) || ...) &&
      isArray(resolvedValue._debugInfo)) {
    // "It's possible that the value has been given the debug info.
    //  In that case we need to look for it on the resolved value."
    debugInfo = resolvedValue._debugInfo;
  }
}
```

This handles the case where `moveDebugInfoFromChunkToInnerValue` moved debug info from
the chunk to the value — `flushComponentPerformance` just follows it there.

### Why our current patch works (but is wrong)

Our patch in `scripts/patches/react-flight-debug-channel.js` prevents the splice:

```javascript
function moveDebugInfoFromChunkToInnerValue(chunk, value) {
  if (__hasDebugChannelReadable__) return;  // ← skip splice entirely
```

This works because debug info stays on chunks, so `flushComponentPerformance` finds it.
But it's fighting the system — the upstream solution is to let the splice happen and have
`flushComponentPerformance` follow the data to the value.

### Correct fix

Replace our `moveDebugInfoFromChunkToInnerValue` patch with a `flushComponentPerformance`
patch that adds the value fallback. This:
1. Matches the upstream React behavior exactly
2. Doesn't interfere with `moveDebugInfoFromChunkToInnerValue` (DevTools needs it)
3. Works without `debugChannel` — the fix is in the consumer, not the producer
4. Will become a no-op when we upgrade to a React version that includes the fix
