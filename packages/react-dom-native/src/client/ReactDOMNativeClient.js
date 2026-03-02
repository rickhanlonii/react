'use strict';

var renderer = require('../renderer/renderer');

exports.createRoot = renderer.createRoot;
exports.hydrateRoot = renderer.hydrateRoot;
exports.flushSync = renderer.reconciler.flushSync;
