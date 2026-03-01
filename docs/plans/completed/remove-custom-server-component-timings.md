# Plan: Remove custom server component timing flush

## Context

`entry.js` has a custom `emitServerComponentTimings()` function that manually walks the
Flight chunk tree and emits `console.timeStamp` calls for server components. This was
added to work around React's built-in `flushInitialRenderPerformance` firing before
streamed Suspense content arrives.

React's built-in mechanism (in `react-server-dom-webpack/client.browser`) already handles
this automatically — `_replayConsole` defaults to `true`, and `flushInitialRenderPerformance`
fires when pending chunks resolve. Next.js relies on this with zero framework code.

## Changes

All changes are in `packages/react-dom-native/src/entry.js`:

1. **Remove `activeFlightTree` variable** (line 55)

2. **Remove the custom flush in `closeFlightDataStream`** (lines 102-109) — delete the
   `__DEV__` block that sets a 1000ms timeout to call `emitServerComponentTimings(tree)`.
   Keep the rest of `closeFlightDataStream` (closing the writer) as-is.

3. **Remove the entire `emitServerComponentTimings` function** (lines 198-269)

4. **Remove `activeFlightTree` assignments** in `renderFromStream` (line 282) and
   `hydrateFromStream` (line 300)
