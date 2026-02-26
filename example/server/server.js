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
var React = require('react');

var app = express();
var PORT = parseInt(process.env.PORT, 10) || 6000;

// Webpack-generated client manifest. Re-read on every request in dev
// so webpack rebuilds are picked up without restarting the server.
var MANIFEST_PATH = path.resolve(__dirname, '../build/react-client-manifest.json');

function getClientManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

var SERVER_SRC_DIR = path.resolve(__dirname, 'src');

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

// Serve webpack output (bundle, chunks, manifests) as static files
app.use(express.static(path.resolve(__dirname, '../build')));

app.get('/bundle-version', function (req, res) {
  res.json({ version: getLatestVersion() });
});

// Discover fixtures from the fixtures directory
var FIXTURES_DIR = path.resolve(__dirname, 'src/fixtures');

app.get('/fixtures', function (req, res) {
  clearServerSourceCache();
  var files = fs.readdirSync(FIXTURES_DIR)
    .filter(function(f) { return f.endsWith('.js'); })
    .sort();

  var fixtures = files.map(function(f) {
    var mod = require(path.join(FIXTURES_DIR, f));
    var meta = mod.fixture || {};
    var name = f.replace('.js', '');
    return {
      name: name,
      title: meta.title || name,
      description: meta.description || '',
      category: meta.category || 'Other',
      config: meta.config || {},
    };
  });

  var categoryOrder = [];
  var categoryMap = {};
  for (var i = 0; i < fixtures.length; i++) {
    var cat = fixtures[i].category;
    if (!categoryMap[cat]) {
      categoryMap[cat] = [];
      categoryOrder.push(cat);
    }
    categoryMap[cat].push({
      name: fixtures[i].name,
      title: fixtures[i].title,
      description: fixtures[i].description,
      config: fixtures[i].config,
    });
  }

  var grouped = categoryOrder.map(function(cat) {
    return { category: cat, fixtures: categoryMap[cat] };
  });

  res.json(grouped);
});

app.get('/fixtures/:name', function (req, res) {
  clearServerSourceCache();

  var fixturePath = path.join(FIXTURES_DIR, req.params.name + '.js');
  if (!fs.existsSync(fixturePath)) {
    res.status(404).send('Fixture not found: ' + req.params.name);
    return;
  }

  var mod = require(fixturePath);
  var FixtureComponent = mod.default || mod;
  var element = React.createElement(FixtureComponent);

  res.setHeader('Content-Type', 'text/x-component');
  res.setHeader('Access-Control-Allow-Origin', '*');

  var renderToPipeableStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;
  var stream = renderToPipeableStream(element, getClientManifest());
  stream.pipe(res);
});

app.get('/', function (req, res) {
  clearServerSourceCache();

  var mod = require('./src/fixtures/06-kitchen-sink');
  var AppComponent = mod.default || mod;
  var element = React.createElement(AppComponent);

  res.setHeader('Content-Type', 'text/x-component');
  res.setHeader('Access-Control-Allow-Origin', '*');

  var renderToPipeableStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;
  var stream = renderToPipeableStream(element, getClientManifest());
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
