'use strict';

// Webpack loader that patches the Flight client's _timeOrigin computation.
//
// Problem: The Flight client computes _timeOrigin = N_row - performance.timeOrigin
// to map server timestamps to the client's time domain. This compares clocks
// across processes (Node.js RSC server vs native iOS app), which drift 50-120ms
// on macOS due to CLOCK_REALTIME vs CLOCK_MONOTONIC divergence. The drift causes
// server component timestamps to become negative, getting clamped to 0 by React's
// `0 > startTime ? 0 : startTime`, placing them before Prerender First Paint.
//
// Fix: Replace with `performance.now()`, which maps server request start (time 0)
// to the client's current timeline position. This is approximately correct since
// the N row arrives shortly after the server starts processing the request.

module.exports = function (source) {
  return source.replace(
    /response\._timeOrigin\s*=\s*\+row\s*-\s*performance\.timeOrigin/g,
    'response._timeOrigin = performance.now()'
  );
};
