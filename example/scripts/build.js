'use strict';

const path = require('path');
const webpack = require('webpack');
const configFactory = require('../webpack.config');

async function build() {
  const mode = process.argv.includes('--production') ? 'production' : 'development';
  const isWatch = process.argv.includes('--watch');
  const config = configFactory({ production: mode === 'production' });
  const compiler = webpack(config);

  if (isWatch) {
    // Connect to the WebSocket server so we can notify it on rebuild
    let ws = null;
    let wsConnected = false;
    function connectWebSocket() {
      const WebSocket = require('ws');
      ws = new WebSocket('ws://localhost:' + (process.env.SSR_PORT || 6001) + '/__dev');
      ws.on('open', () => { wsConnected = true; });
      ws.on('close', () => {
        wsConnected = false;
        setTimeout(connectWebSocket, 2000);
      });
      ws.on('error', () => {});
    }
    connectWebSocket();

    function notifyMessage(msg) {
      if (wsConnected) {
        ws.send(JSON.stringify(msg));
      }
    }

    // Watch webpack dependency graph (client components, entry points)
    let isFirstBuild = true;
    compiler.watch({}, (err, stats) => {
      if (err) { console.error(err); return; }
      if (stats.hasErrors()) { console.error(stats.toString({ errors: true })); return; }

      console.log('Rebuild complete');
      if (isFirstBuild) {
        isFirstBuild = false;
        return;
      }

      // Determine what changed
      var emitted = stats.compilation.emittedAssets;
      if (!emitted || emitted.size === 0) {
        console.log('[watch] No assets emitted');
        return;
      }

      console.log('[watch] Emitted assets:', Array.from(emitted).join(', '));

      // Collect changed client component chunks with their module IDs
      var changedChunks = [];
      for (var chunk of stats.compilation.chunks) {
        if (chunk.name === 'main') continue; // Skip the entry bundle
        // Check if any of this chunk's files were emitted
        var chunkEmitted = false;
        for (var file of chunk.files) {
          if (emitted.has(file)) {
            chunkEmitted = true;
            break;
          }
        }
        if (!chunkEmitted) continue;

        var modules = [];
        for (var module of stats.compilation.chunkGraph.getChunkModulesIterable(chunk)) {
          if (module.resource) {
            // Use the same identifier webpack uses for __webpack_require__
            modules.push(module.id != null ? String(module.id) : module.identifier());
          }
        }
        if (modules.length > 0) {
          changedChunks.push({file: Array.from(chunk.files)[0], modules: modules});
        }
      }

      // If client component chunks changed, try Fast Refresh.
      // bundle.js is often re-emitted alongside chunks (webpack updates its
      // chunk manifest), but that doesn't mean framework code changed.
      if (changedChunks.length > 0) {
        console.log('[watch] Sending refresh:', changedChunks.map(c => c.file).join(', '));
        notifyMessage({type: 'notify-refresh', chunks: changedChunks});
      } else {
        // Only non-chunk assets changed (bundle.js, manifests) — full reload
        console.log('[watch] No client chunks changed, sending reload');
        notifyMessage({type: 'notify-reload'});
      }
    });

    // Watch server source files (not in webpack's dependency graph)
    const chokidar = require('chokidar');
    const serverSrcDir = path.resolve(__dirname, '../server/src');
    chokidar.watch(serverSrcDir, {
      ignoreInitial: true,
      // Ignore client components — webpack watches those and handles refresh
      ignored: /server\/src\/components\//,
      awaitWriteFinish: {stabilityThreshold: 100, pollInterval: 50},
    }).on('all', (event, filePath) => {
      console.log('[watch] Server file ' + event + ': ' + path.relative(path.resolve(__dirname, '..'), filePath));
      notifyMessage({type: 'notify-reload'});
    });

    console.log('Watching for changes...');
  } else {
    compiler.run((err, stats) => {
      if (err) { console.error(err); process.exit(1); }
      if (stats.hasErrors()) {
        console.error(stats.toString({ errors: true }));
        process.exit(1);
      }
      console.log(stats.toString({ chunks: true, colors: true }));
    });
  }
}

build();
