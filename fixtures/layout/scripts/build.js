'use strict';

var esbuild = require('esbuild');
var path = require('path');
var fs = require('fs');

var E2E_ROOT = path.resolve(__dirname, '..');
var RESOURCES_DIR = path.resolve(E2E_ROOT, 'LayoutCompare/LayoutCompare/LayoutCompare/Resources');

// Ensure output directory exists
if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, {recursive: true});
}

// Copy index.html to resources
fs.copyFileSync(
  path.resolve(E2E_ROOT, 'web/index.html'),
  path.resolve(RESOURCES_DIR, 'index.html')
);

async function build() {
  // Web bundle: react + react-dom + fixtures
  var webResult = await esbuild.build({
    entryPoints: [path.resolve(E2E_ROOT, 'web/entry.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    platform: 'browser',
    define: {
      __DEV__: 'true',
      'process.env.NODE_ENV': '"development"',
    },
    outfile: path.resolve(RESOURCES_DIR, 'web-fixtures.js'),
    logLevel: 'info',
  });

  if (webResult.errors.length > 0) {
    console.error('Web bundle build failed');
    process.exit(1);
  }
  console.log('Web bundle built: ' + path.resolve(RESOURCES_DIR, 'web-fixtures.js'));

  // Native bundle: react + react-dom-native renderer + fixtures
  var nativeResult = await esbuild.build({
    entryPoints: [path.resolve(E2E_ROOT, 'native/entry.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    platform: 'neutral',
    mainFields: ['module', 'main'],
    define: {
      __DEV__: 'true',
      'process.env.NODE_ENV': '"development"',
    },
    outfile: path.resolve(RESOURCES_DIR, 'native-fixtures.js'),
    logLevel: 'info',
  });

  if (nativeResult.errors.length > 0) {
    console.error('Native bundle build failed');
    process.exit(1);
  }
  console.log('Native bundle built: ' + path.resolve(RESOURCES_DIR, 'native-fixtures.js'));

  console.log('All bundles built successfully.');
}

build().catch(function(err) {
  console.error(err);
  process.exit(1);
});
