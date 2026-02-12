'use strict';

const path = require('path');
const {createDevServer} = require('./dev-server');
const {createWatcher} = require('./watcher');
const {createBuilder} = require('./builder');

async function dev(options) {
  const exampleDir = options.exampleDir || path.resolve(__dirname, '..');
  const rootDir = options.rootDir || path.resolve(exampleDir, '..');
  const port = options.port || 8082;

  console.log('Starting react-dom-native dev server...');

  // 1. Create the builder
  const builder = createBuilder({rootDir: exampleDir, mode: 'development'});

  // 2. Initial build
  console.log('Building JS bundle...');
  try {
    const result = await builder.build();
    console.log('Bundle built: ' + result.outfile);
  } catch (err) {
    console.error('Initial build failed:', err.message);
  }

  // 3. Start WebSocket dev server for hot reload
  const devServer = createDevServer({port});
  console.log('Dev server listening on ws://localhost:' + port);

  // 4. Watch for file changes and rebuild
  const watcher = createWatcher({
    exampleDir,
    libraryDir: path.join(rootDir, 'packages/react-dom-native'),
    onChange: async function onFileChange(event) {
      console.log(
        '[' + event.type + '] ' + path.relative(rootDir, event.path),
      );

      try {
        devServer.notifyClearErrors();
        await builder.build();
        console.log('Rebuild complete');
        devServer.notifyReload();
      } catch (err) {
        console.error('Build error:', err.message);
        devServer.notifyError({
          message: err.message,
          stack: err.stack,
          file: event.path,
        });
      }
    },
  });
  watcher.start();

  // 5. Cleanup handler
  function cleanup() {
    console.log('\nShutting down...');
    watcher.close();
    devServer.close();
    process.exit(0);
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return {devServer, watcher, builder};
}

module.exports = {dev};
