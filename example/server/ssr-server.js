'use strict';

// SSR server — Fizz renderer for native
//
// Runs WITHOUT --conditions react-server so require('react') returns the
// full client React with hooks (useState, useEffect, etc.). Fetches the
// Flight stream from the Flight server (port 6000), resolves client
// components via the Flight client, and renders them through Fizz.

// Babel for JSX transformation
require('@babel/register')({
  babelrc: false,
  ignore: [/node_modules/],
  only: [/example\/server\/src/],
  presets: ['@babel/preset-react'],
  targets: {node: 'current'},
});

var http = require('http');
var path = require('path');
var express = require('express');
var React = require('react');
var {PassThrough, Transform} = require('stream');

var app = express();
var PORT = 6001;
var FLIGHT_SERVER = 'http://localhost:6000';

// __webpack_require__ — the Flight client calls this to resolve client
// component modules from I rows. In this SSR process, we simply require
// the actual component file (babel handles JSX, 'use client' is harmless).
var COMPONENTS_DIR = path.resolve(__dirname, 'src/components');

globalThis.__webpack_require__ = function (id) {
  return require(path.join(COMPONENTS_DIR, id + '.jsx'));
};

// Build SSR module map: maps module IDs to their export metadata.
// The Flight client uses this to resolve client references (I rows).
function buildSSRModuleMap() {
  var moduleMap = {};
  var components = ['Counter', 'TextInput'];

  for (var i = 0; i < components.length; i++) {
    var name = components[i];
    moduleMap[name] = {
      '*': {id: name, chunks: [], name: '*'},
      'default': {id: name, chunks: [], name: 'default'},
    };
  }

  return moduleMap;
}

var ssrModuleMap = buildSSRModuleMap();

// ---------------------------------------------------------------------------
// SSR endpoint — produces native instruction stream
//
// Pipeline: Flight server (port 6000) → Flight stream (HTTP)
//           → Flight client → React elements → Fizz → instruction stream
// ---------------------------------------------------------------------------

app.get('/ssr', function (req, res) {
  // Fetch the Flight stream from the RSC server
  http.get(FLIGHT_SERVER + '/', function (flightRes) {
    if (flightRes.statusCode !== 200) {
      res.status(502).send('Flight server returned status ' + flightRes.statusCode);
      return;
    }

    // Intercept the Flight stream to emit D instructions inline.
    // Each Flight row is written to the response as a ["D", row] instruction
    // as soon as it arrives, interleaved with Fizz output.
    var shellReady = false;
    var pendingDRows = [];
    var partialRow = '';

    function emitDRow(row) {
      if (shellReady) {
        res.write(JSON.stringify(['D', row]) + '\n');
      } else {
        pendingDRows.push(row);
      }
    }

    var flightCapture = new Transform({
      transform: function (chunk, encoding, callback) {
        // Pass data through to the Flight client unchanged
        this.push(chunk);

        // Parse rows (newline-delimited) and emit as D instructions
        var text = chunk.toString();
        var lines = text.split('\n');

        // First element joins with any partial row from previous chunk
        lines[0] = partialRow + lines[0];
        partialRow = '';

        // Last element may be incomplete (no trailing newline)
        if (text[text.length - 1] !== '\n') {
          partialRow = lines.pop();
        } else {
          // Remove trailing empty string from split
          if (lines[lines.length - 1] === '') {
            lines.pop();
          }
        }

        for (var i = 0; i < lines.length; i++) {
          if (lines[i] !== '') {
            emitDRow(lines[i]);
          }
        }

        callback();
      },
      flush: function (callback) {
        // Flush any remaining partial row
        if (partialRow !== '') {
          emitDRow(partialRow);
          partialRow = '';
        }
        callback();
      },
    });

    // Pipe: flightRes → flightCapture → passThrough (for Flight client)
    var passThrough = new PassThrough();
    flightRes.pipe(flightCapture).pipe(passThrough);

    var createFromNodeStream =
      require('react-server-dom-webpack/client.node').createFromNodeStream;

    var ssrManifest = {
      moduleMap: ssrModuleMap,
      moduleLoading: null,
      serverModuleMap: null,
    };

    // Create a Root component that consumes Flight data via React.use().
    // Flight data arrives progressively, and Fizz renders each chunk as
    // it resolves through Suspense boundaries.
    var cachedResult;
    var Root = function () {
      if (!cachedResult) {
        cachedResult = createFromNodeStream(passThrough, ssrManifest);
      }
      return React.use(cachedResult);
    };

    var nativeSSR = require('react-dom-native/server');
    var renderToNativeStream = nativeSSR.renderToPipeableStream;
    var nativeStream = renderToNativeStream(React.createElement(Root), {
      onShellReady: function () {
        res.setHeader('Content-Type', 'application/x-native-ssr');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');

        // Flush any D rows that arrived before the shell was ready.
        for (var i = 0; i < pendingDRows.length; i++) {
          res.write(JSON.stringify(['D', pendingDRows[i]]) + '\n');
        }
        pendingDRows = null;
        shellReady = true;

        var fizzPassThrough = new PassThrough();
        nativeStream.pipe(fizzPassThrough);

        fizzPassThrough.on('data', function (chunk) {
          res.write(chunk);
        });

        fizzPassThrough.on('end', function () {
          res.end();
        });
      },
      onShellError: function (error) {
        console.error('[SSR] Shell error:', error);
        res.status(500).send('SSR shell error: ' + error.message);
      },
      onError: function (error) {
        console.error('[SSR] Error:', error);
      },
    });
  }).on('error', function (err) {
    console.error('[SSR] Failed to fetch Flight stream:', err.message);
    res.status(502).send('Failed to connect to Flight server: ' + err.message);
  });
});

app.listen(PORT, function () {
  console.log('SSR server listening on http://localhost:' + PORT);
});
