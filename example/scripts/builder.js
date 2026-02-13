'use strict';

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const REACT_SHIM = path.resolve(__dirname, 'react-shim.js');

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

  // Discovers client components
  function discoverClientComponents() {
    var componentsDir = path.join(rootDir, 'server/src/components');
    if (!fs.existsSync(componentsDir)) return [];

    return fs.readdirSync(componentsDir)
      .filter(function(f) { return f.endsWith('.jsx') || f.endsWith('.js'); })
      .map(function(f) {
        return {
          name: f.replace(/\.(jsx|js)$/, ''),
          entryPoint: path.join(componentsDir, f),
        };
      });
  }

  // Builds a single client component as a standalone IIFE
  async function buildComponentModule(component) {
    var outdir = path.join(rootDir, 'server/modules');
    if (!fs.existsSync(outdir)) {
      fs.mkdirSync(outdir, {recursive: true});
    }

    await esbuild.build({
      entryPoints: [component.entryPoint],
      bundle: true,
      format: 'iife',
      globalName: '__module',
      target: ['es2020'],
      platform: 'neutral',
      mainFields: ['module', 'main'],
      define: {
        __DEV__: mode === 'development' ? 'true' : 'false',
        'process.env.NODE_ENV': JSON.stringify(mode),
      },
      alias: {
        'react': REACT_SHIM,
      },
      jsx: 'transform',
      minify: false,
      sourcemap: false,
      outfile: path.join(outdir, component.name + '.js'),
      logLevel: 'warning',
    });
  }

  async function build() {
    // Build framework bundle
    const result = await esbuild.build(config);

    // Build component modules
    const components = discoverClientComponents();
    for (const component of components) {
      await buildComponentModule(component);
    }

    return {
      errors: result.errors,
      warnings: result.warnings,
      outfile,
    };
  }

  return {build, config};
}

module.exports = {createBuilder};
