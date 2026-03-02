'use strict';

exports.createRoot = require('./src/client/ReactDOMNativeClient').createRoot;
exports.hydrateRoot = require('./src/client/ReactDOMNativeClient').hydrateRoot;
exports.version = require('./src/shared/version').version;
