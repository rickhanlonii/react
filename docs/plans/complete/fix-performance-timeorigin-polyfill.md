# Fix: performance.timeOrigin polyfill uses wrong clock source

## Problem

In PPR performance traces, server component events appear at `start=0ms` (before Prerender First Paint at ~40ms) instead of at ~105ms (after Prerender First Paint). The timestamps are negative and get clamped to 0 by React's `0 > startTime ? 0 : startTime`.

## Root Cause

The `performance.timeOrigin` polyfill uses a different clock source than `performance.now()`:

- `performance.timeOrigin` = `Date().timeIntervalSince1970 * 1000.0` → **CLOCK_REALTIME**
- `performance.now()` = `CACurrentMediaTime() - origin` → **CLOCK_MONOTONIC**

Browsers guarantee the invariant `performance.timeOrigin + performance.now() ≈ Date.now()` by deriving both from the same underlying clock. Our polyfill breaks this invariant because CLOCK_REALTIME and CLOCK_MONOTONIC diverge over time due to NTP adjustments.

### How this manifests

React's Flight server sends the N row as `performance.timeOrigin + performance.now()` (a high-resolution monotonic timestamp in Unix epoch). The Flight client computes:

```
_timeOrigin = N_row - performance.timeOrigin
```

Server component `debugInfo.time` values (relative to request start, ~0.2ms) are rebased as:

```
rebased = debugInfo.time + _timeOrigin
```

When the invariant holds (browser, or fresh dev server), `_timeOrigin` is positive and the math works. When the clocks have drifted (long-running Node.js dev server), `_timeOrigin` becomes negative, making rebased timestamps negative. React clamps these to 0.

### Why it only appears after the dev server runs for a while

On a freshly restarted server, `performance.timeOrigin + performance.now() ≈ Date.now()` with <3ms error. After hours of uptime, NTP adjustments to CLOCK_REALTIME accumulate 50-120ms of drift from CLOCK_MONOTONIC, and the N row value diverges from `Date.now()` by that amount.

### Why browsers don't hit this

1. Browser `performance.timeOrigin` maintains the invariant with `performance.now()` by construction
2. Browser page loads take ~200ms+, so even with some server-side drift, `_timeOrigin` stays positive
3. Our native reload is much faster (~50ms), leaving less buffer to absorb drift

### Key source locations

| File | What |
|------|------|
| `PerformanceTracer.swift:31` | `timeOrigin = Date().timeIntervalSince1970 * 1000.0` (CLOCK_REALTIME) |
| `PerformanceNow.swift:14` | `CACurrentMediaTime() * 1000.0 - _monotonicOrigin` (CLOCK_MONOTONIC) |
| `JSRuntime.swift:160` | Sets JS `performance.timeOrigin` from `tracer.timeOrigin` |
| `JSRuntime.swift:163-166` | Sets JS `performance.now()` from `tracer.now()` → `performanceNow()` |

## Verification

After fixing, run this test:

1. Start the dev server and let it run for several minutes (or longer)
2. Navigate to `05-nested-suspense`, PPR variant
3. Run a performance trace with `reload: true`
4. Verify server component events (NestedSuspense, SlowSection) start AFTER Prerender First Paint

Expected timeline:
```
Prerender First Paint:     ~40ms
Server components start:  ~100ms  (after Prerender First Paint)
First SSR Reveal:         ~550ms  (500ms SlowSection resolved)
```

If server components appear at 0ms or before Prerender First Paint, the invariant is still broken.

Additional verification: check that `performance.timeOrigin + performance.now()` equals `Date.now()` (within 1ms) at any point during the app's lifetime, not just at init.
