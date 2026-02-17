'use strict';

// Babel for JSX transformation — must be registered BEFORE node-register
require('@babel/register')({
  babelrc: false,
  ignore: [/node_modules/],
  only: [/example\/server\/src/],
  presets: ['@babel/preset-react'],
  targets: {node: 'current'},
});

// Intercepts require() for 'use client' files — creates client reference proxies
require('react-server-dom-webpack/node-register')();

var fs = require('fs');
var express = require('express');
var esbuild = require('esbuild');
var React = require('react');
var path = require('path');
var url = require('url');
var {PassThrough, Transform} = require('stream');

var app = express();
var PORT = 6000;

// Build client manifest programmatically.
// Maps file:// URLs (what node-register uses as $$id) to {id, chunks, name}.
// The `id` field is what appears in Flight I rows and must match the native module map keys.
function buildClientManifest() {
  var componentsDir = path.resolve(__dirname, 'src/components');
  var manifest = {};
  var components = ['Counter', 'TextInput'];

  for (var i = 0; i < components.length; i++) {
    var name = components[i];
    var filePath = path.join(componentsDir, name + '.jsx');
    var fileURL = url.pathToFileURL(filePath).href;

    // node-register creates proxies with $$id = fileURL
    // renderToPipeableStream looks up manifest[$$id] to get metadata for I rows
    manifest[fileURL] = {
      id: name,
      chunks: [],
      name: '*',
    };
    // Also register specific export variants
    manifest[fileURL + '#'] = {
      id: name,
      chunks: [],
      name: 'default',
    };
    manifest[fileURL + '#default'] = {
      id: name,
      chunks: [],
      name: 'default',
    };
  }

  return manifest;
}

var clientManifest = buildClientManifest();

var SERVER_SRC_DIR = path.resolve(__dirname, 'src');
var ENTRY_POINT = path.resolve(__dirname, '../../packages/react-dom-native/src/entry.js');

var frameworkBuildConfig = {
  entryPoints: [ENTRY_POINT],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'neutral',
  mainFields: ['module', 'main'],
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  },
  sourcemap: 'inline',
  write: false,
};

// Clear require cache for server source files so edits are picked up on next request.
function clearServerSourceCache() {
  Object.keys(require.cache).forEach(function (key) {
    if (key.startsWith(SERVER_SRC_DIR)) {
      delete require.cache[key];
    }
  });
}

// Get the latest mtime across all server source files.
// This lets the native app detect server component changes and refetch the RSC stream.
function getLatestVersion() {
  var latest = 0;

  // Check server source files
  function walkDir(dir) {
    var entries = fs.readdirSync(dir, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        try {
          var stat = fs.statSync(fullPath);
          latest = Math.max(latest, stat.mtimeMs);
        } catch (err) {
          // ignore
        }
      }
    }
  }
  walkDir(SERVER_SRC_DIR);

  return latest;
}

// Serve framework bundle (built on-the-fly from source)
app.get('/bundle.js', async function (req, res) {
  try {
    var result = await esbuild.build(frameworkBuildConfig);
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(result.outputFiles[0].text);
  } catch (err) {
    console.error('[server] Bundle build failed:', err);
    res.status(500).send('// Bundle build failed: ' + err.message);
  }
});

// Serve client component modules (built on-the-fly from JSX source)
var COMPONENTS_DIR = path.resolve(__dirname, 'src/components');
var REACT_SHIM = path.resolve(__dirname, '../scripts/react-shim.js');

app.get('/modules/:file', async function (req, res) {
  var name = req.params.file.replace(/\.js$/, '');
  var sourcePath = path.join(COMPONENTS_DIR, name + '.jsx');
  if (!fs.existsSync(sourcePath)) {
    sourcePath = path.join(COMPONENTS_DIR, name + '.js');
  }
  if (!fs.existsSync(sourcePath)) {
    res.status(404).send('Module not found: ' + req.params.file);
    return;
  }
  try {
    var result = await esbuild.build({
      entryPoints: [sourcePath],
      bundle: true,
      format: 'iife',
      globalName: '__module',
      target: ['es2020'],
      platform: 'neutral',
      mainFields: ['module', 'main'],
      define: {
        __DEV__: 'true',
        'process.env.NODE_ENV': '"development"',
      },
      alias: {
        'react': REACT_SHIM,
      },
      jsx: 'transform',
      write: false,
    });
    var code = '"use client";\n' + result.outputFiles[0].text;
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(code);
  } catch (err) {
    console.error('[server] Module build failed:', err);
    res.status(500).send('// Module build failed: ' + err.message);
  }
});

app.get('/bundle-version', function (req, res) {
  res.json({ version: getLatestVersion() });
});

app.get('/', function (req, res) {
  // Clear require cache so edits to server components are picked up
  clearServerSourceCache();

  // Dynamic import to ensure babel + node-register hooks are active
  var App = require('./src/App');
  // Handle both default export styles
  var AppComponent = App.default || App;
  var element = React.createElement(AppComponent);

  res.setHeader('Content-Type', 'text/x-component');
  res.setHeader('Access-Control-Allow-Origin', '*');

  var renderToPipeableStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;
  var stream = renderToPipeableStream(element, clientManifest);
  stream.pipe(res);
});

// ---------------------------------------------------------------------------
// SSR endpoint — produces native instruction stream
//
// Pipeline: RSC components → Flight stream → Flight client (in-process)
//           → React elements → Native SSR → instruction stream
// ---------------------------------------------------------------------------

// Build SSR module map: maps module IDs to actual component requires.
// The Flight client uses this to resolve client references (I rows) to
// real component functions during SSR.
function buildSSRModuleMap() {
  var moduleMap = {};
  var components = ['Counter', 'TextInput'];

  for (var i = 0; i < components.length; i++) {
    var name = components[i];
    // Map module ID (used in Flight I rows) to an object that
    // has a '*' or 'default' export returning the component.
    // For SSR, we require the actual JSX file directly.
    moduleMap[name] = {
      '*': {id: name, chunks: [], name: '*'},
      'default': {id: name, chunks: [], name: 'default'},
    };
  }

  return moduleMap;
}

var ssrModuleMap = buildSSRModuleMap();

app.get('/ssr', function (req, res) {
  clearServerSourceCache();

  var App = require('./src/App');
  var AppComponent = App.default || App;
  var element = React.createElement(AppComponent);

  // Step 1: Render RSC → Flight stream
  var renderToFlightStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;
  var flightStream = renderToFlightStream(element, clientManifest);

  // Step 2: Intercept the Flight stream to emit D instructions inline.
  // Each Flight row is written to the response as a ["D", row] instruction
  // as soon as it arrives, interleaved with Fizz output. Rows that arrive
  // before onShellReady (before headers are sent) are buffered briefly.
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

  // Pipe: flightStream → flightCapture → passThrough (for Flight client)
  var passThrough = new PassThrough();
  flightStream.pipe(flightCapture).pipe(passThrough);

  var createFromNodeStream =
    require('react-server-dom-webpack/client.node').createFromNodeStream;

  var ssrManifest = {
    moduleMap: ssrModuleMap,
    moduleLoading: null,
    serverModuleMap: null,
  };

  var rootThenable = createFromNodeStream(passThrough, ssrManifest);

  // Step 3: Render with Fizz, passing the Flight thenable directly.
  // Fizz handles thenable children natively: it calls unwrapThenable()
  // which throws SuspenseException if pending, rendering Suspense
  // fallbacks immediately. When Flight chunks resolve, Fizz resumes
  // via pingTask() and streams reveal instructions.
  var nativeSSR = require('react-dom-native/server');

  var renderToNativeStream = nativeSSR.renderToPipeableStream;
  var nativeStream = renderToNativeStream(rootThenable, {
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
});

app.listen(PORT, function () {
  console.log('RSC server listening on http://localhost:' + PORT);
});
