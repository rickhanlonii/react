'use strict';

// Patch: flushComponentPerformance value fallback
//
// React's moveDebugInfoFromChunkToInnerValue splices _debugInfo off chunks
// and moves it to the resolved value. But our npm React 19.2.4 build of
// flushComponentPerformance only reads _debugInfo from chunks, not values.
//
// The upstream React source (and Next.js 16's bundled build) already has a
// fallback: when chunk._debugInfo is empty and the chunk is fulfilled, read
// _debugInfo from the resolved value instead. Our build is just missing it.
//
// This patch adds that fallback — identical to the upstream fix.
// Upstream: https://github.com/facebook/react/blob/main/packages/react-client/src/ReactFlightClient.js
// Comment: "It's possible that the value has been given the debug info.
//           In that case we need to look for it on the resolved value."
//
// Affects: react-server-dom-webpack 19.2.4 (npm)

var fs = require('fs');
var path = require('path');

var TARGET = path.resolve(
  __dirname,
  '..',
  '..',
  'node_modules',
  'react-server-dom-webpack',
  'cjs',
  'react-server-dom-webpack-client.browser.development.js'
);

if (!fs.existsSync(TARGET)) {
  console.log('[patch] Skipping — target file not found');
  process.exit(0);
}

var code = fs.readFileSync(TARGET, 'utf8');

// Check if already patched
if (code.indexOf('__flushComponentPerformance_patched__') !== -1) {
  console.log('[patch] react-flight-debug-channel: already applied');
  process.exit(0);
}

// Remove old patch artifacts if present (from previous moveDebugInfoFromChunkToInnerValue patch)
if (code.indexOf('__hasDebugChannelReadable__') !== -1) {
  // Remove the flag declaration
  code = code.replace('    var __hasDebugChannelReadable__ = false;\n', '');
  // Remove the flag setter in ResponseInstance constructor
  code = code.replace('      if (debugChannel && debugChannel.hasReadable) __hasDebugChannelReadable__ = true;\n', '');
  // Remove the guard in moveDebugInfoFromChunkToInnerValue
  code = code.replace('      if (__hasDebugChannelReadable__) return;\n', '');
  console.log('[patch] Removed old moveDebugInfoFromChunkToInnerValue patch');
}

var patches = 0;

// Add the value fallback to flushComponentPerformance.
// Replace the simple debugInfo assignment with the fallback that checks the resolved value.
var anchor = 'var children = root._children,\n        debugInfo = root._debugInfo;\n      if (debugInfo) {';
var replacement = 'var children = root._children,\n        debugInfo = root._debugInfo;\n      var __flushComponentPerformance_patched__ = true;\n      if (0 === debugInfo.length && "fulfilled" === root.status) {\n        var resolvedValue = resolveLazy(root.value);\n        "object" === typeof resolvedValue &&\n          null !== resolvedValue &&\n          (isArrayImpl(resolvedValue) ||\n            "function" === typeof resolvedValue[ASYNC_ITERATOR] ||\n            resolvedValue.$$typeof === REACT_ELEMENT_TYPE ||\n            resolvedValue.$$typeof === REACT_LAZY_TYPE) &&\n          isArrayImpl(resolvedValue._debugInfo) &&\n          (debugInfo = resolvedValue._debugInfo);\n      }\n      if (debugInfo) {';

if (code.indexOf(anchor) !== -1) {
  // Use function replacement to avoid $$ being treated as escape sequence
  code = code.replace(anchor, function() { return replacement; });
  patches++;
} else {
  console.error('[patch] Could not find anchor (flushComponentPerformance debugInfo assignment)');
  process.exit(1);
}

fs.writeFileSync(TARGET, code);
console.log('[patch] react-flight-debug-channel: applied (' + patches + ' patch)');
