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
var fs = require('fs');
var path = require('path');
var express = require('express');
var React = require('react');
var {PassThrough, Transform} = require('stream');
var {WebSocketServer} = require('ws');
var {createInspectorProxy, mountInspectorRoutes, createCDPUpgradeHandler} = require('../scripts/inspector-proxy');

var app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({extended: true}));
var PORT = parseInt(process.env.PORT, 10) || 6001;
var FLIGHT_SERVER = process.env.FLIGHT_SERVER || 'http://localhost:6000';

// __webpack_require__ — the Flight client calls this to resolve client
// component modules from I rows. In this SSR process, we resolve webpack
// module IDs (relative paths like "./server/src/components/Counter.jsx")
// back to the actual source files on disk.
globalThis.__webpack_require__ = function (id) {
  var resolved = path.resolve(__dirname, '..', id);
  // Clear require cache to pick up changes without server restart
  delete require.cache[require.resolve(resolved)];
  return require(resolved);
};

// __webpack_chunk_load__ — the Flight client calls this to load chunks.
// In SSR we don't load chunks (modules are required directly from disk),
// so this returns a resolved promise.
globalThis.__webpack_chunk_load__ = function () {
  return Promise.resolve();
};

// Webpack-generated manifests. Re-read on every request in dev
// so webpack rebuilds are picked up without restarting the server.
var SSR_MANIFEST_PATH = path.resolve(__dirname, '../build/react-ssr-manifest.json');

function getSSRManifest() {
  var ssrManifest = JSON.parse(fs.readFileSync(SSR_MANIFEST_PATH, 'utf8'));

  // The plugin generates SSR manifest entries as { specifier, name } but
  // react-server-dom-webpack/client.node expects { id, chunks, name }.
  // Transform: use the webpack module ID as the id for __webpack_require__,
  // with empty chunks (SSR requires modules directly from disk).
  var transformedModuleMap = {};
  var moduleMap = ssrManifest.moduleMap;
  for (var moduleId in moduleMap) {
    var exports = moduleMap[moduleId];
    var transformedExports = {};
    for (var exportName in exports) {
      transformedExports[exportName] = {
        id: moduleId,
        chunks: [],
        name: exports[exportName].name,
      };
    }
    transformedModuleMap[moduleId] = transformedExports;
  }

  return {
    moduleLoading: null,
    moduleMap: transformedModuleMap,
  };
}

// ---------------------------------------------------------------------------
// Server manifest for decodeAction/decodeFormState
//
// Maps action IDs (file URLs) to module metadata so the SSR server can
// resolve server action functions from form data.
// ---------------------------------------------------------------------------

function getServerManifest() {
  var manifest = {};
  var url = require('url');
  var serverSrcDir = path.resolve(__dirname, 'src');

  function scanDir(dir) {
    var entries = fs.readdirSync(dir, {withFileTypes: true});
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.jsx')) {
        try {
          var content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes("'use server'") || content.includes('"use server"')) {
            var mod = require(fullPath);
            var fileUrl = url.pathToFileURL(fullPath).href;
            for (var exportName in mod) {
              if (typeof mod[exportName] === 'function') {
                var fullId = fileUrl + '#' + exportName;
                manifest[fullId] = {
                  id: fileUrl,
                  chunks: [],
                  name: exportName,
                };
              }
            }
            if (typeof mod.default === 'function') {
              manifest[fileUrl] = {
                id: fileUrl,
                chunks: [],
                name: 'default',
              };
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
  }

  scanDir(serverSrcDir);
  return manifest;
}

// ---------------------------------------------------------------------------
// SSR endpoint — produces native instruction stream
//
// Pipeline: Flight server (port 6000) → Flight stream (HTTP)
//           → Flight client → React elements → Fizz → instruction stream
// ---------------------------------------------------------------------------

function handleSSR(flightURL, req, res, formState) {
  // Fetch the Flight stream from the RSC server
  http.get(flightURL, function (flightRes) {
    if (flightRes.statusCode !== 200) {
      res.status(502).send('Flight server returned status ' + flightRes.statusCode);
      return;
    }

    // Intercept the Flight stream to emit JS instructions inline.
    // Each Flight row is emitted as a ["JS", "self.__next_f.push([1, ...])"]
    // instruction, interleaved with Fizz output. The client's document polyfill
    // evaluates these to populate the Flight data ReadableStream.
    var shellReady = false;
    var pendingRows = [];
    var partialRow = '';

    // Bootstrap: initialize the client's Flight data receiver
    var bootstrap = JSON.stringify(['JS', 'self.__next_f.push([0])']) + '\n';
    pendingRows.push(bootstrap);

    // Bootstrap: initialize the client's debug data receiver
    var debugBootstrap = JSON.stringify(['JS', 'self.__next_debug.push([0])']) + '\n';
    pendingRows.push(debugBootstrap);

    // Set the fixture name so callServer knows where to POST action requests.
    // Extract fixture name from the Flight URL.
    var fixtureMatch = flightURL.match(/\/fixtures\/([^/]+)$/);
    if (fixtureMatch) {
      var setFixtureJS = JSON.stringify(['JS',
        'globalThis.__REACT_DOM_NATIVE__._setFixtureName(' + JSON.stringify(fixtureMatch[1]) + ')'
      ]) + '\n';
      pendingRows.push(setFixtureJS);
    }

    // Emit formState for useActionState matching during hydration
    if (formState) {
      var formStateJS = JSON.stringify(['JS',
        'globalThis.__REACT_DOM_NATIVE__._formState = ' + JSON.stringify(formState)
      ]) + '\n';
      pendingRows.push(formStateJS);
    }

    function emitFlightRow(row) {
      // Emit as JS instruction that pushes Flight data into the inline receiver
      var jsCode = 'self.__next_f.push([1,' + JSON.stringify(row + '\n') + '])';
      var instruction = JSON.stringify(['JS', jsCode]) + '\n';
      if (shellReady) {
        res.write(instruction);
      } else {
        pendingRows.push(instruction);
      }
    }

    function emitDebugRow(row) {
      // Emit as JS instruction that pushes debug data into the inline receiver
      var jsCode = 'self.__next_debug.push([1,' + JSON.stringify(row + '\n') + '])';
      var instruction = JSON.stringify(['JS', jsCode]) + '\n';
      if (shellReady) {
        res.write(instruction);
      } else {
        pendingRows.push(instruction);
      }
    }

    var debugPassThrough = new PassThrough();

    var flightCapture = new Transform({
      transform: function (chunk, encoding, callback) {
        // Parse rows (newline-delimited) and classify as flight or debug
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

        // Separate flight rows and debug rows
        var flightChunks = [];
        for (var i = 0; i < lines.length; i++) {
          if (lines[i] === '') continue;
          if (lines[i][0] === '\t') {
            // Debug row — strip tab prefix, emit as debug instruction
            var debugRow = lines[i].substring(1);
            emitDebugRow(debugRow);
            debugPassThrough.write(debugRow + '\n');
          } else {
            // Flight row — pass through to Flight client and emit as instruction
            flightChunks.push(lines[i] + '\n');
            emitFlightRow(lines[i]);
          }
        }

        // Push only flight data to the passthrough (for createFromNodeStream)
        if (flightChunks.length > 0) {
          this.push(flightChunks.join(''));
        }

        callback();
      },
      flush: function (callback) {
        // Flush any remaining partial row
        if (partialRow !== '') {
          if (partialRow[0] === '\t') {
            var debugRow = partialRow.substring(1);
            emitDebugRow(debugRow);
            debugPassThrough.write(debugRow + '\n');
          } else {
            this.push(partialRow + '\n');
            emitFlightRow(partialRow);
          }
          partialRow = '';
        }
        // Close the Flight data stream on the client
        var closeJS = JSON.stringify(['JS', 'globalThis.__REACT_DOM_NATIVE__.__closeFlightDataStream__()']) + '\n';
        // Close the debug data stream on the client
        var closeDebugJS = JSON.stringify(['JS', 'globalThis.__REACT_DOM_NATIVE__.__closeDebugDataStream__()']) + '\n';
        if (shellReady) {
          res.write(closeJS);
          res.write(closeDebugJS);
        } else {
          pendingRows.push(closeJS);
          pendingRows.push(closeDebugJS);
        }
        debugPassThrough.end();
        callback();
      },
    });

    // Pipe: flightRes → flightCapture (demuxes debug rows) → passThrough (flight only, for Flight client)
    var passThrough = new PassThrough();
    flightRes.pipe(flightCapture).pipe(passThrough);

    var createFromNodeStream =
      require('react-server-dom-webpack/client.node').createFromNodeStream;

    var ssrManifest = getSSRManifest();

    // Create a Root component that consumes Flight data via React.use().
    // Flight data arrives progressively, and Fizz renders each chunk as
    // it resolves through Suspense boundaries.
    var cachedResult;
    var Root = function () {
      if (!cachedResult) {
        cachedResult = createFromNodeStream(passThrough, ssrManifest, {
          debugChannel: debugPassThrough,
        });
      }
      return React.use(cachedResult);
    };

    var nativeSSR = require('react-dom-native/server');
    var renderToNativeStream = nativeSSR.renderToPipeableStream;
    var nativeStream = renderToNativeStream(React.createElement(Root), {
      bootstrapScripts: [FLIGHT_SERVER + '/bundle.js'],
      formState: formState || undefined,
      onShellReady: function () {
        res.setHeader('Content-Type', 'application/x-native-ssr');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');

        // Flush any rows (bootstrap + Flight data) that arrived before the shell was ready.
        for (var i = 0; i < pendingRows.length; i++) {
          res.write(pendingRows[i]);
        }
        pendingRows = null;
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
        res.setHeader('Content-Type', 'application/x-native-ssr');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');

        // Flush any rows so the client can process the Flight stream
        // (which contains the E row for the error). The client-side
        // ErrorBoundary will catch the error during hydration.
        if (pendingRows) {
          for (var i = 0; i < pendingRows.length; i++) {
            res.write(pendingRows[i]);
          }
        }

        // Mark shell as ready so remaining async JS instructions (from Suspense-
        // wrapped sections) stream directly to the response as they arrive.
        pendingRows = null;
        shellReady = true;

        // Render a minimal fallback shell so the client gets a valid
        // instruction stream. Don't end the response yet — the Flight
        // stream is still producing rows for async Suspense content.
        var fallbackStream = renderToNativeStream(
          React.createElement('div'),
          {
            onShellReady: function () {
              var fallbackPassThrough = new PassThrough();
              fallbackStream.pipe(fallbackPassThrough);
              fallbackPassThrough.on('data', function (chunk) {
                res.write(chunk);
              });
              // Don't res.end() here — wait for the Flight stream to finish.
            },
          }
        );

        // End the response when the Flight stream completes, so all async
        // Flight rows (resolved Suspense content) are delivered to the client.
        flightCapture.on('end', function () {
          res.end();
        });
      },
      onError: function (error) {
        console.error('[SSR] Error:', error);
      },
    });
  }).on('error', function (err) {
    console.error('[SSR] Failed to fetch Flight stream:', err.message);
    res.status(502).send('Failed to connect to Flight server: ' + err.message);
  });
}

// ---------------------------------------------------------------------------
// MPA form POST — render from an existing Flight stream
//
// Like handleSSR but receives a Flight stream directly (from a POST to the
// Flight server) instead of fetching via HTTP GET. Simplified for MPA/Server
// Only mode: emits only SSR instructions (no JS/Flight bootstrapping needed
// since there's no hydration).
// ---------------------------------------------------------------------------

function handleSSRFromFlightStream(flightStream, req, res) {
  var partialRow = '';

  // Strip debug rows (tab-prefixed) from the Flight stream
  var debugPassThrough = new PassThrough();
  var flightCapture = new Transform({
    transform: function (chunk, encoding, callback) {
      var text = chunk.toString();
      var lines = text.split('\n');
      lines[0] = partialRow + lines[0];
      partialRow = '';
      if (text[text.length - 1] !== '\n') {
        partialRow = lines.pop();
      } else if (lines[lines.length - 1] === '') {
        lines.pop();
      }
      var flightChunks = [];
      for (var i = 0; i < lines.length; i++) {
        if (lines[i] === '') continue;
        if (lines[i][0] === '\t') {
          debugPassThrough.write(lines[i].substring(1) + '\n');
        } else {
          flightChunks.push(lines[i] + '\n');
        }
      }
      if (flightChunks.length > 0) {
        this.push(flightChunks.join(''));
      }
      callback();
    },
    flush: function (callback) {
      if (partialRow !== '') {
        if (partialRow[0] === '\t') {
          debugPassThrough.write(partialRow.substring(1) + '\n');
        } else {
          this.push(partialRow + '\n');
        }
        partialRow = '';
      }
      debugPassThrough.end();
      callback();
    },
  });

  var passThrough = new PassThrough();
  flightStream.pipe(flightCapture).pipe(passThrough);

  var createFromNodeStream =
    require('react-server-dom-webpack/client.node').createFromNodeStream;
  var ssrManifest = getSSRManifest();

  var cachedResult;
  var Root = function () {
    if (!cachedResult) {
      cachedResult = createFromNodeStream(passThrough, ssrManifest, {
        debugChannel: debugPassThrough,
      });
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
      console.error('[SSR/MPA] Shell error:', error);
      res.status(500).send('SSR shell error: ' + error.message);
    },
    onError: function (error) {
      console.error('[SSR/MPA] Error:', error);
    },
  });
}

// ---------------------------------------------------------------------------
// Prerender + Resume endpoint
//
// First request: prerenders the fixture via Fizz's createPrerenderRequest,
// aborting before async server components resolve. Caches the static shell
// (prelude) and the Fizz postponed state.
//
// Subsequent requests: sends the cached prelude instantly, then fetches a
// fresh Flight stream and resumes rendering to fill in the postponed
// Suspense boundaries with per-request data.
// ---------------------------------------------------------------------------

var prerenderCache = {};
var PRERENDER_ABORT_MS = 200;

app.get('/prerender/:name', function (req, res) {
  var name = req.params.name;

  function serve(cached) {
    if (!cached.postponed) {
      // Fully static — serve prelude via normal SSR flow (still need Flight data for hydration)
      handleSSR(FLIGHT_SERVER + '/fixtures/' + name, req, res);
      return;
    }

    // Return prelude + postponed state for client-side caching.
    // No resume happens server-side — the client sends postponed back via POST /resume.
    res.setHeader('Content-Type', 'application/x-native-ssr');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    // Flight JS bootstrap rows first (client needs receiver initialized)
    res.write(JSON.stringify(['JS', 'self.__next_f.push([0])']) + '\n');
    res.write(JSON.stringify(['JS', 'self.__next_debug.push([0])']) + '\n');

    // After the bootstrap rows
    res.write(JSON.stringify(['JS',
      'globalThis.__REACT_DOM_NATIVE__._setFixtureName(' + JSON.stringify(name) + ')'
    ]) + '\n');

    // Static shell (prelude from Fizz — includes BOOT and R instructions)
    res.write(cached.prelude);

    // Postponed state — client caches this and sends it back via POST /resume
    res.write(JSON.stringify(['POSTPONED', cached.postponed]) + '\n');
    res.end();
  }

  if (prerenderCache[name]) {
    serve(prerenderCache[name]);
    return;
  }

  // First request: prerender and cache
  doPrerender(name, function (err, cached) {
    if (err) {
      console.error('[Prerender] Error:', err.message);
      // Fall back to normal SSR
      handleSSR(FLIGHT_SERVER + '/fixtures/' + name, req, res);
      return;
    }
    prerenderCache[name] = cached;
    serve(cached);
  });
});

function doPrerender(name, callback) {
  var controller = new AbortController();
  var flightURL = FLIGHT_SERVER + '/fixtures/' + name;

  var flightReq = http.get(flightURL, function (flightRes) {
    if (flightRes.statusCode !== 200) {
      callback(new Error('Flight server returned ' + flightRes.statusCode));
      return;
    }

    // Strip debug rows (tab-prefixed) from Flight stream, pass only Flight data
    var partial = '';
    var debugStrip = new Transform({
      transform: function (chunk, encoding, cb) {
        var text = partial + chunk.toString();
        var lines = text.split('\n');
        partial = lines.pop();
        var output = [];
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].length > 0 && lines[i][0] !== '\t') {
            output.push(lines[i]);
          }
        }
        if (output.length > 0) {
          this.push(output.join('\n') + '\n');
        }
        cb();
      },
      flush: function (cb) {
        if (partial.length > 0 && partial[0] !== '\t') {
          this.push(partial + '\n');
        }
        partial = '';
        cb();
      },
    });

    var passThrough = new PassThrough();
    flightRes.pipe(debugStrip).pipe(passThrough);

    var createFromNodeStream =
      require('react-server-dom-webpack/client.node').createFromNodeStream;
    var ssrManifest = getSSRManifest();

    var cachedResult;
    var Root = function () {
      if (!cachedResult) {
        cachedResult = createFromNodeStream(passThrough, ssrManifest);
      }
      return React.use(cachedResult);
    };

    var prerenderToNodeStream =
      require('react-dom-native/static').prerenderToNodeStream;

    prerenderToNodeStream(React.createElement(Root), {
      signal: controller.signal,
      bootstrapScripts: [FLIGHT_SERVER + '/bundle.js'],
      onError: function () {}, // Suppress abort errors
    })
      .then(function (result) {
        var chunks = [];
        result.prelude.on('data', function (chunk) {
          chunks.push(chunk.toString());
        });
        result.prelude.on('end', function () {
          callback(null, {
            prelude: chunks.join(''),
            postponed: result.postponed,
          });
        });
        result.prelude.on('error', function (err) {
          callback(err);
        });
      })
      .catch(callback);

    // Abort before async server components resolve to capture pending state
    setTimeout(function () {
      controller.abort('prerender timeout');
      flightReq.destroy();
    }, PRERENDER_ABORT_MS);
  });
  flightReq.on('error', function (err) {
    if (err.code !== 'ECONNRESET') {
      callback(err);
    }
  });
}

// ---------------------------------------------------------------------------
// POST /resume/:name — accepts postponed state, returns resume stream
//
// The client sends the postponed state (from a previous prerender) and
// receives back the dynamic content: Flight JS bootstrap, resume Fizz
// output (completed segments + boundary reveals), and Flight close.
// ---------------------------------------------------------------------------

app.post('/resume/:name', function (req, res) {
  var name = req.params.name;
  var postponed = req.body && req.body.postponed;

  if (!postponed) {
    res.status(400).send('Missing postponed state in request body');
    return;
  }

  var flightURL = FLIGHT_SERVER + '/fixtures/' + name;

  http
    .get(flightURL, function (flightRes) {
      if (flightRes.statusCode !== 200) {
        res
          .status(502)
          .send('Flight server returned status ' + flightRes.statusCode);
        return;
      }

      // Flight capture/demux — captures Flight rows and emits them as JS instructions
      var shellReady = false;
      var pendingRows = [];
      var partialRow = '';

      // Set fixture name for callServer routing during resume
      var setFixtureResumeJS = JSON.stringify(['JS',
        'globalThis.__REACT_DOM_NATIVE__._setFixtureName(' + JSON.stringify(name) + ')'
      ]) + '\n';
      pendingRows.push(setFixtureResumeJS);

      function emitFlightRow(row) {
        var jsCode =
          'self.__next_f.push([1,' + JSON.stringify(row + '\n') + '])';
        var instruction = JSON.stringify(['JS', jsCode]) + '\n';
        if (shellReady) {
          res.write(instruction);
        } else {
          pendingRows.push(instruction);
        }
      }

      function emitDebugRow(row) {
        var jsCode =
          'self.__next_debug.push([1,' + JSON.stringify(row + '\n') + '])';
        var instruction = JSON.stringify(['JS', jsCode]) + '\n';
        if (shellReady) {
          res.write(instruction);
        } else {
          pendingRows.push(instruction);
        }
      }

      var debugPassThrough = new PassThrough();

      var flightCapture = new Transform({
        transform: function (chunk, encoding, callback) {
          var text = chunk.toString();
          var lines = text.split('\n');
          lines[0] = partialRow + lines[0];
          partialRow = '';
          if (text[text.length - 1] !== '\n') {
            partialRow = lines.pop();
          } else {
            if (lines[lines.length - 1] === '') {
              lines.pop();
            }
          }
          var flightChunks = [];
          for (var i = 0; i < lines.length; i++) {
            if (lines[i] === '') continue;
            if (lines[i][0] === '\t') {
              var debugRow = lines[i].substring(1);
              emitDebugRow(debugRow);
              debugPassThrough.write(debugRow + '\n');
            } else {
              flightChunks.push(lines[i] + '\n');
              emitFlightRow(lines[i]);
            }
          }
          if (flightChunks.length > 0) {
            this.push(flightChunks.join(''));
          }
          callback();
        },
        flush: function (callback) {
          if (partialRow !== '') {
            if (partialRow[0] === '\t') {
              var debugRow = partialRow.substring(1);
              emitDebugRow(debugRow);
              debugPassThrough.write(debugRow + '\n');
            } else {
              this.push(partialRow + '\n');
              emitFlightRow(partialRow);
            }
            partialRow = '';
          }
          var closeJS =
            JSON.stringify([
              'JS',
              'globalThis.__REACT_DOM_NATIVE__.__closeFlightDataStream__()',
            ]) + '\n';
          var closeDebugJS =
            JSON.stringify([
              'JS',
              'globalThis.__REACT_DOM_NATIVE__.__closeDebugDataStream__()',
            ]) + '\n';
          if (shellReady) {
            res.write(closeJS);
            res.write(closeDebugJS);
          } else {
            pendingRows.push(closeJS);
            pendingRows.push(closeDebugJS);
          }
          debugPassThrough.end();
          callback();
        },
      });

      var passThrough = new PassThrough();
      flightRes.pipe(flightCapture).pipe(passThrough);

      var createFromNodeStream =
        require('react-server-dom-webpack/client.node').createFromNodeStream;
      var ssrManifest = getSSRManifest();

      var cachedResult;
      var Root = function () {
        if (!cachedResult) {
          cachedResult = createFromNodeStream(passThrough, ssrManifest, {
            debugChannel: debugPassThrough,
          });
        }
        return React.use(cachedResult);
      };

      var resumeToPipeableStream =
        require('react-dom-native/server').resumeToPipeableStream;
      // Deep-clone postponed state — Fizz mutates replayNodes during resume
      var postponedClone = JSON.parse(JSON.stringify(postponed));
      var nativeStream = resumeToPipeableStream(
        React.createElement(Root),
        postponedClone,
        {
          onShellReady: function () {
            res.setHeader('Content-Type', 'application/x-native-ssr');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');

            // Flush Flight JS bootstrap rows
            for (var i = 0; i < pendingRows.length; i++) {
              res.write(pendingRows[i]);
            }
            pendingRows = null;
            shellReady = true;

            // Pipe resume Fizz output (completed segments + boundary reveals)
            // End response only when BOTH Fizz and Flight capture are done,
            // so the Flight stream close instructions are always sent.
            var fizzDone = false;
            var flightDone = false;
            function maybeEnd() {
              if (fizzDone && flightDone) {
                res.end();
              }
            }

            var fizzPassThrough = new PassThrough();
            nativeStream.pipe(fizzPassThrough);
            fizzPassThrough.on('data', function (chunk) {
              res.write(chunk);
            });
            fizzPassThrough.on('end', function () {
              fizzDone = true;
              maybeEnd();
            });

            flightCapture.on('end', function () {
              flightDone = true;
              maybeEnd();
            });
          },
          onShellError: function (error) {
            console.error('[Resume] Shell error:', error);
            res.status(500).send('Resume failed: ' + error.message);
          },
          onError: function (error) {
            console.error('[Resume] Error:', error);
          },
        },
      );
    })
    .on('error', function (err) {
      console.error(
        '[Resume] Failed to fetch Flight stream:',
        err.message,
      );
      res
        .status(502)
        .send('Failed to connect to Flight server: ' + err.message);
    });
});

app.post('/ssr/:name', function (req, res) {
  var name = req.params.name;

  // Forward the form data to the Flight server via POST.
  // The Flight server runs with --conditions react-server and can decode/execute
  // server actions. After execution, it returns a fresh Flight stream which we
  // render through Fizz to produce a new instruction stream.
  var querystring = require('querystring');
  var body = querystring.stringify(req.body || {});

  var flightURL = FLIGHT_SERVER + '/fixtures/' + name;
  var parsedURL = require('url').parse(flightURL);

  var postReq = http.request({
    hostname: parsedURL.hostname,
    port: parsedURL.port,
    path: parsedURL.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, function (flightRes) {
    if (flightRes.statusCode !== 200) {
      var errorBody = '';
      flightRes.on('data', function (chunk) { errorBody += chunk; });
      flightRes.on('end', function () {
        console.error('[SSR] Flight server action failed:', flightRes.statusCode, errorBody);
        res.status(502).send('Flight server action failed: ' + errorBody);
      });
      return;
    }
    // Flight server returned a new Flight stream — render through Fizz
    handleSSRFromFlightStream(flightRes, req, res);
  });

  postReq.on('error', function (err) {
    console.error('[SSR] Error forwarding to Flight server:', err);
    res.status(502).send('Error forwarding to Flight server: ' + err.message);
  });

  postReq.write(body);
  postReq.end();
});

app.get('/ssr/:name', function (req, res) {
  handleSSR(FLIGHT_SERVER + '/fixtures/' + req.params.name, req, res);
});

app.get('/ssr', function (req, res) {
  handleSSR(FLIGHT_SERVER + '/', req, res);
});

app.get('/healthz', function(req, res) {
  res.json({status: 'ok'});
});

// ---------------------------------------------------------------------------
// Inspector proxy — CDP discovery + preview routes
// ---------------------------------------------------------------------------
var proxy = createInspectorProxy({port: PORT});
mountInspectorRoutes(app, proxy);
var handleCDPUpgrade = createCDPUpgradeHandler(proxy);

// ---------------------------------------------------------------------------
// WebSocket servers (noServer mode — routed via HTTP upgrade)
// ---------------------------------------------------------------------------
var devWSS = new WebSocketServer({noServer: true});
var cdpWSS = new WebSocketServer({noServer: true});

// Track which dev WS client belongs to which target
// Map<ws, { targetId: string, identified: boolean }>
var devClientInfo = new Map();

// Track tracing state per target so it survives reconnects
var devTracingState = new Map(); // targetId -> boolean

devWSS.on('connection', function onDevConnection(ws) {
  devClientInfo.set(ws, {targetId: null, identified: false});
  console.log('[Inspector] App connected via WebSocket (awaiting identity)');

  ws.on('message', function onMessage(data) {
    var text = data.toString();
    var message;
    try {
      message = JSON.parse(text);
    } catch (e) {
      return;
    }

    var info = devClientInfo.get(ws);

    // Handle identity handshake
    if (message.type === 'connect') {
      var targetId = proxy.addTarget(message, function sendToApp(msg) {
        if (ws.readyState === 1) {
          ws.send(msg);
        }
      });
      info.targetId = targetId;
      info.identified = true;
      console.log('[Inspector] App identified: ' + targetId +
        ' (' + message.appName + ' — ' + message.deviceName + ')');

      // If tracing was active for this target, re-send start-tracing
      if (devTracingState.get(targetId) && ws.readyState === 1) {
        console.log('[Inspector] Re-sending start-tracing to ' + targetId);
        ws.send(JSON.stringify({type: 'start-tracing'}));
      }
      return;
    }

    // Broadcast reload/refresh to all OTHER app clients (from esbuild watcher)
    if (message.type === 'notify-reload') {
      console.log('[Inspector] Broadcasting reload');
      // Clear server-side prerender cache so fresh prerenders pick up changes
      prerenderCache = {};
      var reloadMsg = JSON.stringify({type: 'reload'});
      for (var [client] of devClientInfo) {
        if (client !== ws && client.readyState === 1) {
          client.send(reloadMsg);
        }
      }
      return;
    }

    if (message.type === 'notify-refresh') {
      console.log('[Inspector] Broadcasting refresh (' + message.chunks.length + ' chunk(s))');
      var refreshMsg = JSON.stringify({type: 'refresh', chunks: message.chunks});
      for (var [client] of devClientInfo) {
        if (client !== ws && client.readyState === 1) {
          client.send(refreshMsg);
        }
      }
      return;
    }

    // Handle open-devtools request from the app
    if (message.type === 'open-devtools') {
      if (info && info.targetId) {
        var devtoolsUrl = 'devtools://devtools/bundled/inspector.html?remoteFrontend=true&ws=127.0.0.1:' + PORT + '/__cdp/' + info.targetId;
        require('child_process').exec('open -a "Google Chrome" "' + devtoolsUrl + '"');
        console.log('[Inspector] Opening DevTools for ' + info.targetId);
      }
      return;
    }

    // Forward app messages to the correct target
    if (info.identified && info.targetId) {
      proxy.handleAppMessage(info.targetId, text);
    }
  });

  ws.on('close', function onClose() {
    var info = devClientInfo.get(ws);
    if (info && info.targetId) {
      console.log('[Inspector] App disconnected: ' + info.targetId);
      // Keep the target alive so Chrome DevTools stays connected across reloads
      proxy.disconnectTarget(info.targetId);
    }
    devClientInfo.delete(ws);
  });
  ws.on('error', function onError() {
    var info = devClientInfo.get(ws);
    if (info && info.targetId) {
      // Keep the target alive so Chrome DevTools stays connected across reloads
      proxy.disconnectTarget(info.targetId);
    }
    devClientInfo.delete(ws);
  });
});

// Track tracing state changes from proxy
proxy.onTracingStateChange = function (targetId, active) {
  devTracingState.set(targetId, active);
};

// ---------------------------------------------------------------------------
// HTTP server + upgrade routing
// ---------------------------------------------------------------------------
var server = http.createServer(app);

server.on('upgrade', function (req, socket, head) {
  var pathname = req.url || '/';

  if (pathname === '/__dev') {
    devWSS.handleUpgrade(req, socket, head, function (ws) {
      devWSS.emit('connection', ws, req);
    });
  } else if (pathname.startsWith('/__cdp/')) {
    cdpWSS.handleUpgrade(req, socket, head, function (ws) {
      handleCDPUpgrade(ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, function () {
  console.log('SSR server listening on http://localhost:' + PORT);
  console.log('[Inspector] Dev WS on ws://localhost:' + PORT + '/__dev');
  console.log('[Inspector] CDP discovery on http://localhost:' + PORT + '/json');
});
server.on('error', function(err) {
  if (err.code === 'EADDRINUSE') {
    var httpCheck = require('http');
    // Check if the existing server supports the unified dev endpoints
    httpCheck.get('http://localhost:' + PORT + '/json/version', function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var info = JSON.parse(data);
          if (info.Browser === 'React DOM Native') {
            console.log('Port ' + PORT + ' already has a unified SSR+dev server running, exiting.');
            process.exit(0);
          }
        } catch (e) {}
        // /json/version responded but not from our proxy — old server
        console.error('Port ' + PORT + ' has an old SSR server without dev tools support.');
        console.error('Restart the dev server: kill $(lsof -ti :' + PORT + ') && npm run dev');
        process.exit(1);
      });
    }).on('error', function() {
      // No /json/version endpoint — check if it's at least a healthy SSR server
      httpCheck.get('http://localhost:' + PORT + '/healthz', function(res) {
        console.error('Port ' + PORT + ' has an old SSR server without dev tools support.');
        console.error('Restart the dev server: kill $(lsof -ti :' + PORT + ') && npm run dev');
        process.exit(1);
      }).on('error', function() {
        console.error('Port ' + PORT + ' is in use by a non-SSR-server process.');
        console.error('Run: kill $(lsof -ti :' + PORT + ')');
        process.exit(1);
      });
    });
    return;
  }
  throw err;
});

// Cleanup
process.on('SIGTERM', function () {
  devWSS.close();
  cdpWSS.close();
  proxy.close();
  server.close();
  process.exit(0);
});
