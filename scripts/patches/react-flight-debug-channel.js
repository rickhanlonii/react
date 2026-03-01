'use strict';

// Patch: react-server-dom-webpack debug channel fix
//
// React's moveDebugInfoFromChunkToInnerValue unconditionally splices
// _debugInfo off chunks when they resolve. With a debug channel
// (hasReadable: true), the debug info needs to stay on chunks so
// flushComponentPerformance can emit console.timeStamp calls with
// server component names and timing data.
//
// This patch adds a module-level flag that's set when a response with
// debugChannel.hasReadable is created, and skips the splice when active.
//
// Bug: https://github.com/facebook/react/issues/XXXXX
// Affects: react-server-dom-webpack 19.2.x

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
if (code.indexOf('__hasDebugChannelReadable__') !== -1) {
  console.log('[patch] react-flight-debug-channel: already applied');
  process.exit(0);
}

var patches = 0;

// 1. Add the flag declaration after the WeakMap initialization
var anchor1 = 'new ("function" === typeof WeakMap ? WeakMap : Map)();\n';
var insert1 = '    var __hasDebugChannelReadable__ = false;\n';
if (code.indexOf(anchor1) !== -1) {
  code = code.replace(anchor1, anchor1 + insert1);
  patches++;
} else {
  console.error('[patch] Could not find anchor 1 (WeakMap init)');
  process.exit(1);
}

// 2. Set the flag in the ResponseInstance constructor
var anchor2 = 'this._debugChannel = debugChannel;\n';
var insert2 = '      if (debugChannel && debugChannel.hasReadable) __hasDebugChannelReadable__ = true;\n';
if (code.indexOf(anchor2) !== -1) {
  code = code.replace(anchor2, anchor2 + insert2);
  patches++;
} else {
  console.error('[patch] Could not find anchor 2 (_debugChannel assignment)');
  process.exit(1);
}

// 3. Guard moveDebugInfoFromChunkToInnerValue
var anchor3 = 'function moveDebugInfoFromChunkToInnerValue(chunk, value) {\n';
var replace3 = 'function moveDebugInfoFromChunkToInnerValue(chunk, value) {\n      if (__hasDebugChannelReadable__) return;\n';
if (code.indexOf(anchor3) !== -1) {
  code = code.replace(anchor3, replace3);
  patches++;
} else {
  console.error('[patch] Could not find anchor 3 (moveDebugInfoFromChunkToInnerValue)');
  process.exit(1);
}

fs.writeFileSync(TARGET, code);
console.log('[patch] react-flight-debug-channel: applied (' + patches + ' patches)');
