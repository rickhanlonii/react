'use strict';

const path = require('path');
const webpack = require('webpack');
const ReactFlightWebpackPlugin = require('react-server-dom-webpack/plugin');

const EXAMPLE_ROOT = __dirname;
const ENTRY = path.resolve(EXAMPLE_ROOT, '../packages/react-dom-native/src/entry.js');
const OUTPUT_DIR = path.resolve(EXAMPLE_ROOT, 'build');
const COMPONENTS_DIR = path.resolve(EXAMPLE_ROOT, 'server/src/components');

module.exports = function (env) {
  const mode = env && env.production ? 'production' : 'development';
  const isDev = mode === 'development';

  return {
    mode,
    entry: ENTRY,
    output: {
      path: OUTPUT_DIR,
      filename: 'bundle.js',
      // Chunks use JSONP-push format: globalThis["webpackChunkfalcon"].push(...)
      // When Swift evaluates a chunk file, the push handler installs its modules
      globalObject: 'globalThis',
      chunkFilename: '[name].js',
      // Must be explicit — 'auto' tries document.currentScript which doesn't exist in JSC
      publicPath: '/',
      clean: true,
    },
    // web target: uses document.createElement('script') for chunk loading,
    // which the document polyfill intercepts (fetches via URLSession +
    // evaluates in JSC). This gives us standard JSONP chunk loading.
    target: 'web',
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      mainFields: ['module', 'main'],
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: [
            // Runs second: wraps module with per-module $RefreshReg$ scoping
            isDev && {
              loader: require.resolve('./scripts/react-refresh-loader'),
            },
            // Runs first: transpiles JSX + injects $RefreshReg$/$RefreshSig$ calls
            {
              loader: 'babel-loader',
              options: {
                presets: ['@babel/preset-react'],
                plugins: isDev ? [require.resolve('react-refresh/babel')] : [],
              },
            },
          ].filter(Boolean),
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        __DEV__: isDev ? 'true' : 'false',
        'process.env.NODE_ENV': JSON.stringify(mode),
      }),
      // Expose __webpack_module_cache__ as __webpack_require__.c so that
      // $$performFastRefresh can bust cached modules before re-requiring them.
      isDev && {
        apply(compiler) {
          compiler.hooks.compilation.tap('ExposeModuleCache', (compilation) => {
            compilation.hooks.additionalTreeRuntimeRequirements.tap(
              'ExposeModuleCache',
              (chunk) => {
                compilation.addRuntimeModule(
                  chunk,
                  new (class extends webpack.RuntimeModule {
                    constructor() { super('expose module cache'); }
                    generate() { return '__webpack_require__.c = __webpack_module_cache__;'; }
                  })()
                );
              }
            );
          });
        },
      },
      // Expose installedChunks as __webpack_require__.ic so that
      // $$refreshChunks can clear installed status before re-loading chunks.
      isDev && {
        apply(compiler) {
          compiler.hooks.compilation.tap('ExposeInstalledChunks', (compilation) => {
            compilation.hooks.additionalTreeRuntimeRequirements.tap(
              'ExposeInstalledChunks',
              (chunk) => {
                compilation.addRuntimeModule(
                  chunk,
                  new (class extends webpack.RuntimeModule {
                    constructor() { super('expose installed chunks'); }
                    generate() {
                      return 'if (typeof installedChunks !== "undefined") { __webpack_require__.ic = installedChunks; }';
                    }
                  })()
                );
              }
            );
          });
        },
      },
      // Auto-discovers 'use client' files in the components directory,
      // adds them as async dependencies, and emits manifest JSON files.
      new ReactFlightWebpackPlugin({
        isServer: false,
        clientReferences: {
          directory: COMPONENTS_DIR,
          recursive: true,
          include: /\.(js|jsx)$/,
        },
      }),
    ].filter(Boolean),
    devtool: isDev ? 'source-map' : false,
    optimization: {
      minimize: !isDev,
    },
  };
};
