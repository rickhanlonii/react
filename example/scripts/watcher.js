'use strict';

const path = require('path');

function createWatcher(options) {
  const exampleDir = options.exampleDir;
  const libraryDir = options.libraryDir;
  const onChange = options.onChange;
  const ignored = options.ignored || [
    '**/node_modules/**',
    '**/__tests__/**',
    '**/*.test.js',
  ];

  let chokidar;
  let watcher;

  function start() {
    // Lazy-require chokidar to avoid loading it when not needed
    chokidar = require('chokidar');

    const watchPaths = [
      path.join(libraryDir, 'src/**/*.js'),
      path.join(libraryDir, 'src/**/*.jsx'),
      path.join(exampleDir, 'entry/**/*.js'),
      path.join(exampleDir, 'components/**/*.js'),
    ];

    watcher = chokidar.watch(watchPaths, {
      ignored,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('change', function onFileChange(filePath) {
      onChange({type: 'change', path: filePath});
    });

    watcher.on('add', function onFileAdd(filePath) {
      onChange({type: 'add', path: filePath});
    });

    watcher.on('unlink', function onFileRemove(filePath) {
      onChange({type: 'remove', path: filePath});
    });

    return watcher;
  }

  function close() {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  }

  return {start, close};
}

module.exports = {createWatcher};
