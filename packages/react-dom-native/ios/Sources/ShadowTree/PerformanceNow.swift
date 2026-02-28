import Foundation
import QuartzCore

/// Monotonic clock baseline (CACurrentMediaTime * 1000) set at first access.
/// All `performanceNow()` values are relative to this.
private let _monotonicOrigin: Double = CACurrentMediaTime() * 1000.0

/// Returns milliseconds elapsed since the monotonic origin, matching
/// `performance.now()` in the JS polyfill. Safe to call from any thread.
/// Used by Bindings, MutationApplier, Differentiator, etc. for tracing timestamps.
public func performanceNow() -> Double {
    CACurrentMediaTime() * 1000.0 - _monotonicOrigin
}
