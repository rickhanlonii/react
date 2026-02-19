'use strict';

// Babel for JSX transformation — must be registered BEFORE node-register
require('@babel/register')({
  babelrc: false,
  ignore: [/node_modules/],
  only: [/example\/server\/src/],
  presets: ['@babel/preset-react'],
  targets: {node: 'current'},
});

var path = require('path');

// Intercepts require() for 'use client' files — creates client reference proxies
require('react-server-dom-webpack/node-register')();

var fs = require('fs');
var express = require('express');
var esbuild = require('esbuild');
var React = require('react');
var url = require('url');

var app = express();
var PORT = 6000;

// Build client manifest programmatically.
// Maps file:// URLs (what node-register uses as $$id) to {id, chunks, name}.
// The `id` field is what appears in Flight I rows and must match the native module map keys.
function buildClientManifest() {
  var componentsDir = path.resolve(__dirname, 'src/components');
  var manifest = {};
  var components = fs.readdirSync(componentsDir)
    .filter(function(f) { return f.endsWith('.jsx'); })
    .map(function(f) { return f.replace('.jsx', ''); });

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

// Client manifest is rebuilt per-request in dev so new components are picked up.

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
  var stream = renderToPipeableStream(element, buildClientManifest());
  stream.pipe(res);
});

var server = app.listen(PORT, function () {
  console.log('RSC server listening on http://localhost:' + PORT);
});
server.on('error', function(err) {
  if (err.code === 'EADDRINUSE') {
    var http = require('http');
    http.get('http://localhost:' + PORT + '/bundle-version', function(res) {
      console.log('Port ' + PORT + ' already has a healthy RSC server running, exiting.');
      process.exit(0);
    }).on('error', function() {
      console.error('Port ' + PORT + ' is in use by a non-RSC-server process.');
      console.error('Run: kill $(lsof -ti :' + PORT + ')');
      process.exit(1);
    });
    return;
  }
  throw err;
});
