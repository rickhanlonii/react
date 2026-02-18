'use strict';

var esbuild = require('esbuild');
var express = require('express');
var path = require('path');
var fs = require('fs');

var E2E_ROOT = path.resolve(__dirname, '..');
var PORT = 6100;

// Track latest bundle version (mtime-based, like example/server/server.js)
var bundleVersion = Date.now();

// Source directories to watch for version changes
var WATCH_DIRS = [
  path.join(E2E_ROOT, 'fixtures'),
  path.join(E2E_ROOT, 'web'),
  path.join(E2E_ROOT, 'native'),
  path.resolve(E2E_ROOT, '../../packages/react-dom-native/src'),
];

function getLatestMtime() {
  var latest = 0;
  for (var dir of WATCH_DIRS) {
    if (!fs.existsSync(dir)) continue;
    var files = fs.readdirSync(dir, {recursive: true});
    for (var file of files) {
      var fullPath = path.join(dir, file);
      try {
        var stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.mtimeMs > latest) {
          latest = stat.mtimeMs;
        }
      } catch (e) {}
    }
  }
  return latest;
}

// Shared esbuild options (same as build.js)
var webBuildOptions = {
  entryPoints: [path.resolve(E2E_ROOT, 'web/entry.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  },
  write: false, // keep in memory
};

var nativeBuildOptions = {
  entryPoints: [path.resolve(E2E_ROOT, 'native/entry.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'neutral',
  mainFields: ['module', 'main'],
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  },
  write: false,
};

// In-memory bundle cache
var webBundle = null;
var nativeBundle = null;

async function buildBundles() {
  var webResult = await esbuild.build(webBuildOptions);
  webBundle = webResult.outputFiles[0].text;

  var nativeResult = await esbuild.build(nativeBuildOptions);
  nativeBundle = nativeResult.outputFiles[0].text;

  bundleVersion = Date.now();
  console.log('[dev] Bundles rebuilt (version ' + bundleVersion + ')');
}

async function startServer() {
  // Initial build
  await buildBundles();

  // Start Express server
  var app = express();

  app.get('/web-fixtures.js', function(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(webBundle);
  });

  app.get('/native-fixtures.js', function(req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(nativeBundle);
  });

  app.get('/index.html', function(req, res) {
    var html = fs.readFileSync(path.resolve(E2E_ROOT, 'web/index.html'), 'utf8');
    // Rewrite the script src to point to dev server
    html = html.replace('web-fixtures.js', 'http://localhost:' + PORT + '/web-fixtures.js');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(html);
  });

  app.get('/bundle-version', function(req, res) {
    res.json({version: bundleVersion});
  });

  app.listen(PORT, function() {
    console.log('[dev] E2E dev server listening on http://localhost:' + PORT);
  });

  // Watch for changes and rebuild
  var chokidar;
  try {
    chokidar = require('chokidar');
  } catch (e) {
    // Fallback: poll for mtime changes
    console.log('[dev] chokidar not available, using mtime polling');
    var lastMtime = getLatestMtime();
    setInterval(async function() {
      var currentMtime = getLatestMtime();
      if (currentMtime > lastMtime) {
        lastMtime = currentMtime;
        try {
          await buildBundles();
        } catch (err) {
          console.error('[dev] Rebuild failed:', err.message);
        }
      }
    }, 1000);
    return;
  }

  var watcher = chokidar.watch(WATCH_DIRS, {
    ignoreInitial: true,
    ignored: /node_modules/,
  });
  watcher.on('change', async function(filePath) {
    console.log('[dev] Changed: ' + path.relative(E2E_ROOT, filePath));
    try {
      await buildBundles();
    } catch (err) {
      console.error('[dev] Rebuild failed:', err.message);
    }
  });
}

startServer().catch(function(err) {
  console.error(err);
  process.exit(1);
});
