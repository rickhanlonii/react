'use strict';

// ---------------------------------------------------------------------------
// React DevTools Backend Setup
//
// Initializes the React DevTools backend so React detects the hook at load
// time and enables ProfileMode on root fibers.
//
// MUST load before React so the DevTools hook's console.* patches are in
// place when React checks for them at module init time.
//
// Initialization order:
//   1. Native console injection (Swift — already done before bundle eval)
//   2. This module — installs DevTools hook, patches console
//   3. React loads — detects patched console and DevTools hook
// ---------------------------------------------------------------------------

if (__DEV__) {
  // react-devtools-core uses `window` and `self` to find the global hook.
  // JSC doesn't have either, so alias them to globalThis.
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }
  if (typeof globalThis.self === 'undefined') {
    globalThis.self = globalThis;
  }

  var devtools = require('react-devtools-core/backend');

  // Install the full DevTools hook (with sub/emit/rendererInterfaces).
  devtools.initialize();
}
