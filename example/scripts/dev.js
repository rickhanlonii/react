'use strict';

const path = require('path');
const {createDevServer} = require('./dev-server');
const {createInspectorProxy} = require('./inspector-proxy');
const {createWatcher} = require('./watcher');
const {createBuilder} = require('./builder');

async function dev(options) {
  const exampleDir = options.exampleDir || path.resolve(__dirname, '..');
  const rootDir = options.rootDir || path.resolve(exampleDir, '..');
  const port = options.port || 8082;

  console.log('');
  console.log('  react-dom-native dev server');
  console.log('  ==========================');
  console.log('');

  // 1. Create the builder
  const builder = createBuilder({rootDir: exampleDir, mode: 'development'});

  // 2. Initial build
  console.log('  [build] Building JS bundle...');
  try {
    const result = await builder.build();
    console.log('  [build] Bundle built: ' + result.outfile);
  } catch (err) {
    console.error('  [build] Initial build failed:', err.message);
  }

  // 3. Start WebSocket dev server for hot reload
  const devServer = createDevServer({port});
  console.log('  [hot-reload] WebSocket server on ws://localhost:' + port);

  // 4. Start CDP inspector proxy for Chrome DevTools Performance profiling
  const cdpPort = 9222;
  const proxy = createInspectorProxy({port: cdpPort});
  devServer.connectInspectorProxy(proxy);
  console.log('  [devtools] CDP inspector proxy on http://localhost:' + cdpPort);
  console.log('  [devtools] Open chrome://inspect or http://localhost:' + cdpPort + '/json');
  console.log('  [safari]   Safari Web Inspector: Develop → Simulator → Falcon — react-dom-native');
  console.log('             (Breakpoints, stepping, scope inspection)');

  // 5. Watch for file changes and rebuild
  const watcher = createWatcher({
    exampleDir,
    libraryDir: path.join(rootDir, 'packages/react-dom-native'),
    onChange: async function onFileChange(event) {
      console.log(
        '  [watch] [' + event.type + '] ' + path.relative(rootDir, event.path),
      );

      try {
        devServer.notifyClearErrors();
        await builder.build();
        console.log('  [watch] Rebuild complete');
        devServer.notifyReload();
      } catch (err) {
        console.error('  [watch] Build error:', err.message);
        devServer.notifyError({
          message: err.message,
          stack: err.stack,
          file: event.path,
        });
      }
    },
  });
  watcher.start();
  console.log('  [watch] Watching for file changes...');

  console.log('');
  console.log('  Ready.');
  console.log('');

  // 6. Cleanup handler
  function cleanup() {
    console.log('\n  Shutting down...');
    watcher.close();
    proxy.close();
    devServer.close();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return {devServer, watcher, builder, inspectorProxy: proxy};
}

module.exports = {dev};
