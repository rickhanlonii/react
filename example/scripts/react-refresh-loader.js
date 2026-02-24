'use strict';

// Webpack loader that wraps each module with per-module $RefreshReg$/$RefreshSig$
// scoping. This ensures react-refresh family IDs are unique across modules —
// without this, two modules both exporting "Button" would share a family.

var RefreshRuntimePath = require.resolve('react-refresh/runtime');

module.exports = function reactRefreshLoader(source) {
  // Use resourcePath as the unique module identifier for family registration
  var moduleId = this.resourcePath;

  return [
    // Save previous globals (the entry.js no-ops or a parent module's wrapper)
    'var prevRefreshReg = globalThis.$RefreshReg$;',
    'var prevRefreshSig = globalThis.$RefreshSig$;',
    'var RefreshRuntime = require(' + JSON.stringify(RefreshRuntimePath) + ');',
    'globalThis.$RefreshReg$ = function(type, id) {',
    '  RefreshRuntime.register(type, ' + JSON.stringify(moduleId) + ' + " " + id);',
    '};',
    'globalThis.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;',
    '',
    source,
    '',
    '// Restore previous globals',
    'globalThis.$RefreshReg$ = prevRefreshReg;',
    'globalThis.$RefreshSig$ = prevRefreshSig;',
  ].join('\n');
};
