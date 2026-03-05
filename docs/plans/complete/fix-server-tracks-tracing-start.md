# Fix: Server component events appear before Prerender First Paint in PPR traces

## Status: Fixed

## Problem

In PPR performance traces, server component events (SlowSection, NestedSuspense, await SlowSection) appeared at `start=0.000ms`, before Prerender First Paint (~40ms). The expected timeline:

1. Prerender First Paint (cached shell painted)
2. Server components render (after resume request)

## Root Cause

The Flight client's N row handler computes `_timeOrigin = N_row - performance.timeOrigin` to map server timestamps to the client's time domain. This compares clocks across processes:

- **Server** (Node.js RSC): `performance.timeOrigin + performance.now()` uses `CLOCK_REALTIME` epoch + `CLOCK_MONOTONIC` elapsed
- **Client** (Swift): `performance.timeOrigin` uses `Date()` (wall clock), `performance.now()` uses `CACurrentMediaTime()` (monotonic)

On macOS, `CLOCK_REALTIME` and `CLOCK_MONOTONIC` diverge over time due to NTP adjustments. The accumulated drift (50-120ms observed) makes `_timeOrigin` negative. Server component times (~0.2ms relative to request start) rebase to negative values, which React clamps to 0 via `0 > startTime ? 0 : startTime`.

### Verified with logging

```
N row (server clock):     1772685007478
Client timeOrigin:        1772685007541
_timeOrigin:              -63ms          ← negative due to clock drift
debugInfo.time:           0.2ms          ← relative to server request start
Rebased:                  -62.8ms        → clamped to 0
```

## Fix

Webpack loader (`example/scripts/flight-time-origin-loader.js`) patches the Flight client's N row handler:

```js
// Before: response._timeOrigin = +row - performance.timeOrigin;
// After:  response._timeOrigin = performance.now();
```

Using `performance.now()` maps server time 0 (request start) to the client's current timeline position. This is correct since the N row arrives shortly after the server starts processing. No cross-process clock comparison needed.

### Result

```
Before fix:                      After fix:
  Server components:   0.0ms       Server components:  59.7ms
  Prerender First Paint: 42ms      Prerender First Paint: 42ms
  ← wrong, before paint            ← correct, after paint
```

## Files Changed

- `example/webpack.config.js` — webpack plugin to apply the loader
- `example/scripts/flight-time-origin-loader.js` — loader that patches the Flight client
