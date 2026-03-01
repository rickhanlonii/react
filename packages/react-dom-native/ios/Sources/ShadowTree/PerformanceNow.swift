import Foundation
import QuartzCore

/// Monotonic clock baseline (CACurrentMediaTime * 1000).
/// All `performanceNow()` values are relative to this.
/// Reset via `resetPerformanceOrigin()` on page navigation so that
/// `performance.now()` starts at 0 — matching browser behavior.
private var _monotonicOrigin: Double = CACurrentMediaTime() * 1000.0

/// Returns milliseconds elapsed since the monotonic origin, matching
/// `performance.now()` in the JS polyfill. Safe to call from any thread.
/// Used by Bindings, MutationApplier, Differentiator, etc. for tracing timestamps.
public func performanceNow() -> Double {
    CACurrentMediaTime() * 1000.0 - _monotonicOrigin
}

/// Resets the monotonic origin so `performanceNow()` restarts at 0.
/// Called when a new JSRuntime is created (page navigation / reload)
/// to match browser `performance.now()` behavior.
public func resetPerformanceOrigin() {
    _monotonicOrigin = CACurrentMediaTime() * 1000.0
}
