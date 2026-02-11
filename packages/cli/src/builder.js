'use strict';

const esbuild = require('esbuild');
const path = require('path');

function createBuilder(options) {
  const rootDir = options.rootDir;
  const outfile =
    options.outfile ||
    path.join(rootDir, 'ios/Sources/ReactDomNative/Resources/bundle.js');
  const mode = options.mode || 'development';

  const config = {
    entryPoints: [path.join(rootDir, 'packages/entry/index.js')],
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
