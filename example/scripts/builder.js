'use strict';

const esbuild = require('esbuild');
const path = require('path');

function createBuilder(options) {
  const rootDir = options.rootDir;
  const outfile =
    options.outfile ||
    path.resolve(rootDir, '../packages/react-dom-native/ios/Sources/ReactDomNativeKit/Resources/bundle.js');
  const mode = options.mode || 'development';

  // Framework bundle config
  const config = {
    entryPoints: [path.resolve(rootDir, '../packages/react-dom-native/src/entry.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    platform: 'neutral',
    mainFields: ['module', 'main'],
    define: {
      __DEV__: mode === 'development' ? 'true' : 'false',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    minify: mode === 'production',
    sourcemap: mode === 'development',
    outfile,
    logLevel: 'warning',
  };

  async function build() {
    // Build framework bundle (component modules are built on-the-fly by the server)
    const result = await esbuild.build(config);

    return {
      errors: result.errors,
      warnings: result.warnings,
      outfile,
    };
  }

  return {build, config};
}

module.exports = {createBuilder};
