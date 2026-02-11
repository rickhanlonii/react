'use strict';

var esbuild = require('esbuild');
var path = require('path');
var os = require('os');

/**
 * Bundles a single test file with the Fantom runtime setup prepended.
 * Returns the path to the output bundle.
 */
async function bundleTest(testFilePath) {
  var outfile = path.join(
    os.tmpdir(),
    'fantom-' +
      path.basename(testFilePath, '.js') +
      '-' +
      Date.now() +
      '.js',
  );

  await esbuild.build({
    entryPoints: [testFilePath],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    platform: 'neutral',
    mainFields: ['module', 'main'],
    loader: {'.js': 'jsx'},
    jsx: 'transform',
    inject: [path.resolve(__dirname, '../runtime/setup.js')],
    define: {
      __DEV__: 'true',
      'process.env.NODE_ENV': '"test"',
    },
    outfile: outfile,
    sourcemap: 'inline',
    logLevel: 'warning',
  });

  return outfile;
}

module.exports = {bundleTest: bundleTest};
