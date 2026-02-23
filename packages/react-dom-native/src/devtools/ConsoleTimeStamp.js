'use strict';

// ---------------------------------------------------------------------------
// Extended console.timeStamp override
//
// React emits performance data via the extended Chrome format:
//   console.timeStamp(name, start, end, track, trackGroup, color)
//
// JSC's built-in console.timeStamp only handles the standard single-arg form.
// This override detects the extended 6-arg format and routes it to the
// PerformanceTracer for collection during profiling sessions.
//
// Reference: ReactCommon/jsinspector-modern/RuntimeTargetConsole.cpp
// ---------------------------------------------------------------------------

var originalTimeStamp = console.timeStamp;

console.timeStamp = function (label, start, end, track, trackGroup, color) {
  if (arguments.length <= 1) {
    // Standard single-arg call — pass through to original
    if (originalTimeStamp) {
      originalTimeStamp.call(console, label);
    }
    return;
  }
  // Extended format — report to tracer for Chrome DevTools Performance panel
  if (typeof __PERFORMANCE_TRACER__ !== 'undefined') {
    __PERFORMANCE_TRACER__.reportTimeStamp(
      label,
      start,
      end,
      track,
      trackGroup,
      color,
    );
  }
};
