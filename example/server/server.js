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
var React = require('react');
var path = require('path');
var url = require('url');

var app = express();
var PORT = 3001;

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

var BUNDLE_PATH = path.resolve(__dirname, '../Falcon/Falcon/Resources/bundle.js');
var SERVER_SRC_DIR = path.resolve(__dirname, 'src');

// Clear require cache for server source files so edits are picked up on next request.
function clearServerSourceCache() {
  Object.keys(require.cache).forEach(function (key) {
    if (key.startsWith(SERVER_SRC_DIR)) {
      delete require.cache[key];
    }
  });
}

// Get the latest mtime across the bundle and all server source files.
// This lets the native app detect both client and server component changes.
function getLatestVersion() {
  var latest = 0;

  // Check bundle mtime
  try {
    var bundleStat = fs.statSync(BUNDLE_PATH);
    latest = Math.max(latest, bundleStat.mtimeMs);
  } catch (err) {
    // bundle doesn't exist yet
  }

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

app.get('/bundle.js', function (req, res) {
  try {
    var source = fs.readFileSync(BUNDLE_PATH, 'utf8');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(source);
  } catch (err) {
    res.status(404).send('bundle.js not found — run npm run build first');
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

app.listen(PORT, function () {
  console.log('RSC server listening on http://localhost:' + PORT);
});
