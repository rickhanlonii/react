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
    // webworker target: no DOM APIs, uses importScripts for chunk loading
    // We don't actually use importScripts — Swift evaluates chunks directly —
    // but this gives us the right chunk format (array-push/JSONP) without
    // requiring document or window.
    target: 'webworker',
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      mainFields: ['module', 'main'],
    },
    module: {
      rules: [
        {
          test: /\.jsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react'],
            },
          },
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        __DEV__: isDev ? 'true' : 'false',
        'process.env.NODE_ENV': JSON.stringify(mode),
      }),
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
    ],
    devtool: isDev ? 'source-map' : false,
    optimization: {
      minimize: !isDev,
    },
  };
};
