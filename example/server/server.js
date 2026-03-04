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
var {PassThrough} = require('stream');
var express = require('express');
var React = require('react');
var url = require('url');

// __webpack_require__ and __webpack_chunk_load__ — needed by decodeReply/decodeAction
// to resolve server action modules via resolveServerReference -> requireModule.
// The RSC server runs Node.js, so we use require() directly and skip chunk loading.
// Server action IDs are file:// URLs (set by node-register's registerServerReference).
globalThis.__webpack_require__ = function (id) {
  if (id.startsWith('file://')) {
    return require(url.fileURLToPath(id));
  }
  return require(id);
};
globalThis.__webpack_chunk_load__ = function () {
  return Promise.resolve();
};

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

// Build server manifest — maps server action IDs to module metadata.
//
// resolveServerReference (in react-server-dom-webpack) looks up entries
// by full ID ("file:///path.js#export") first, then falls back to
// module path ("file:///path.js") splitting at the last #.
//
// Each entry: { id: moduleId, chunks: [], name: exportName }
// - id: passed to __webpack_require__ to load the module
// - chunks: empty (Node.js require, no chunk loading needed)
// - name: the export to access on the module
var SERVER_ACTIONS_DIR = path.resolve(__dirname, 'src/actions');

function getServerManifest() {
  var manifest = {};
  if (!fs.existsSync(SERVER_ACTIONS_DIR)) return manifest;

  var files = fs.readdirSync(SERVER_ACTIONS_DIR).filter(function (f) {
    return f.endsWith('.js');
  });

  for (var i = 0; i < files.length; i++) {
    var filePath = path.resolve(SERVER_ACTIONS_DIR, files[i]);
    var fileUrl = url.pathToFileURL(filePath).href;

    // Require the module (node-register will handle 'use server')
    var mod = require(filePath);

    // Register each exported function in the manifest
    for (var exportName in mod) {
      if (typeof mod[exportName] === 'function') {
        var fullId = fileUrl + '#' + exportName;
        // Entry keyed by full ID (primary lookup path)
        manifest[fullId] = {
          id: fileUrl,
          chunks: [],
          name: exportName,
        };
      }
    }

    // Also register by module path (fallback lookup path).
    // When resolveServerReference splits at #, it looks up manifest[modulePath]
    // and uses the name from the metadata. We register with name '' so the
    // full-ID path is preferred (it has the correct export name).
    manifest[fileUrl] = {
      id: fileUrl,
      chunks: [],
      name: '',
    };
  }

  return manifest;
}

// Serve webpack output (bundle, chunks, manifests) as static files
app.use(express.static(path.resolve(__dirname, '../build')));

// Body parsing for server action requests.
// Interactive callServer sends Content-Type: text/plain with encoded args.
// MPA form POST sends application/x-www-form-urlencoded from native form submission.
app.use(express.text({type: 'text/plain'}));
app.use(express.urlencoded({extended: true}));

// Test script endpoint — sets a global variable to confirm script execution
app.get('/test-script.js', function (req, res) {
  res.type('application/javascript');
  res.send('globalThis.__TEST_SCRIPT_EXECUTED__ = true;');
});

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

// Render a React element to a Flight stream with debug channel multiplexing.
// Debug rows are prefixed with \t so the SSR server can demultiplex them.
function renderFlightWithDebugChannel(element, res) {
  res.setHeader('Content-Type', 'text/x-component');
  res.setHeader('Access-Control-Allow-Origin', '*');

  var renderToPipeableStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;

  // Use a PassThrough to collect debug output, but pass a write-only wrapper
  // to renderToPipeableStream. A PassThrough is duplex (has both .read() and
  // .write()), and React's server code would use it as both a readable (for
  // receiving commands) and a writable (for sending debug data), causing it
  // to read its own output as commands and crash.
  var debugPassThrough = new PassThrough();
  var debugWritable = {
    write: function(chunk) { return debugPassThrough.write(chunk); },
    end: function() { debugPassThrough.end(); },
    destroy: function(err) { debugPassThrough.destroy(err); },
    on: function() { return debugWritable; },
  };
  var stream = renderToPipeableStream(element, getClientManifest(), {
    debugChannel: debugWritable,
  });

  // Manual piping — interleave main + debug rows
  var mainOut = new PassThrough();
  stream.pipe(mainOut);

  // Debug row line buffering state
  var debugPartial = '';

  mainOut.on('data', function(chunk) { res.write(chunk); });
  debugPassThrough.on('data', function(chunk) {
    // Prefix complete lines with \t, buffer partials
    var text = debugPartial + chunk.toString();
    var lines = text.split('\n');
    debugPartial = lines.pop(); // last element is partial or empty
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].length > 0) {
        res.write('\t' + lines[i] + '\n');
      }
    }
  });

  var mainDone = false, debugDone = false;
  mainOut.on('end', function() { mainDone = true; if (debugDone) res.end(); });
  debugPassThrough.on('end', function() {
    if (debugPartial) { res.write('\t' + debugPartial + '\n'); debugPartial = ''; }
    debugDone = true;
    if (mainDone) res.end();
  });
}

// CORS preflight for server action POST requests
app.options('/fixtures/:name', function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, rsc-action');
  res.status(204).end();
});

app.post('/fixtures/:name', function (req, res) {
  clearServerSourceCache();

  var rscAction = req.headers['rsc-action'];

  if (rscAction) {
    // Interactive mode: callServer sent action ID in header + encoded args in body.
    // The client called encodeReply(args) which produces either a JSON string
    // or FormData. For now we handle the string case (no binary blobs in args).
    var serverModule = require('react-server-dom-webpack/server');
    var decodeReply = serverModule.decodeReply;

    var serverManifest = getServerManifest();

    // Decode the reply body (serialized arguments).
    // decodeReply accepts a string or FormData. When given a string, it
    // internally wraps it in FormData. Returns a thenable (React's internal
    // Promise-like), which must be wrapped in Promise.resolve() so .then()
    // returns a proper Promise for chaining.
    var bodyPromise;
    if (typeof req.body === 'string' && req.body.length > 0) {
      bodyPromise = Promise.resolve(decodeReply(req.body, serverManifest));
    } else {
      bodyPromise = Promise.resolve([]);
    }

    bodyPromise.then(function (decodedArgs) {
      // Resolve the server action function from the manifest.
      // The action ID is the $$id set by node-register, e.g.
      // "file:///path/to/todo-actions.js#addTodo"
      var idx = rscAction.lastIndexOf('#');
      if (idx === -1) {
        res.status(400).send('Invalid action ID (missing #): ' + rscAction);
        return Promise.resolve();
      }
      var modulePath = rscAction.slice(0, idx);
      var exportName = rscAction.slice(idx + 1);

      // Load the module via __webpack_require__ (which calls Node require)
      var mod = __webpack_require__(modulePath);
      var fn = mod[exportName];
      if (typeof fn !== 'function') {
        res.status(404).send('Server action not found: ' + rscAction);
        return Promise.resolve();
      }

      // Execute the action
      return Promise.resolve(fn.apply(null, decodedArgs));
    }).then(function (actionResult) {
      // Skip re-rendering if an error response was already sent (e.g. invalid
      // action ID or action not found returned early in the previous .then()).
      if (res.headersSent) return;

      // Return the action result (return value of the server action) as a
      // Flight stream. useActionState uses this as the new state.
      // The client will separately re-fetch the fixture to get the updated tree.
      renderFlightWithDebugChannel(actionResult, res);
    }).catch(function (error) {
      console.error('[RSC] Server action error:', error);
      if (!res.headersSent) {
        res.status(500).send('Server action failed: ' + error.message);
      }
    });
  } else {
    // MPA mode: form POST with URL-encoded form data from native form submission.
    // Build FormData from parsed body, decode the action, execute it,
    // then re-render the fixture as a new Flight stream.
    var fixtureName = req.params.name;
    var serverModule = require('react-server-dom-webpack/server');
    var decodeAction = serverModule.decodeAction;
    var serverManifest = getServerManifest();

    var formData = new FormData();
    if (req.body && typeof req.body === 'object') {
      for (var key in req.body) {
        formData.append(key, req.body[key]);
      }
    }

    var actionPromise = decodeAction(formData, serverManifest);

    function renderFixtureStream() {
      clearServerSourceCache();
      var fixturePath = path.join(FIXTURES_DIR, fixtureName + '.js');
      if (!fs.existsSync(fixturePath)) {
        res.status(404).send('Fixture not found: ' + fixtureName);
        return;
      }
      var mod = require(fixturePath);
      var FixtureComponent = mod.default || mod;
      renderFlightWithDebugChannel(React.createElement(FixtureComponent), res);
    }

    if (!actionPromise) {
      // No action found in form data — just re-render the fixture
      renderFixtureStream();
      return;
    }

    actionPromise
      .then(function (action) {
        return action();
      })
      .then(function () {
        // Action executed — re-render the fixture with updated state
        renderFixtureStream();
      })
      .catch(function (error) {
        console.error('[RSC] MPA action error:', error);
        if (!res.headersSent) {
          res.status(500).send('MPA action failed: ' + error.message);
        }
      });
  }
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

  renderFlightWithDebugChannel(element, res);
});

app.get('/', function (req, res) {
  clearServerSourceCache();

  var mod = require('./src/fixtures/06-kitchen-sink');
  var AppComponent = mod.default || mod;
  var element = React.createElement(AppComponent);

  renderFlightWithDebugChannel(element, res);
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
