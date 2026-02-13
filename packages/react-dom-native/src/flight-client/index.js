'use strict';

// ---------------------------------------------------------------------------
// react-dom-native Flight Client
//
// Public API for consuming RSC Flight streams from a Next.js server.
//
// Usage:
//   const { createFromFetch, fetchRSC } = require('@react-dom-native/flight-client');
//   const root = createFromFetch(fetchRSC('/page'), { serverURL });
//   root.then(element => reactRoot.render(element));
// ---------------------------------------------------------------------------

var client = require('./client');
var http = require('./http');
var config = require('./config');

module.exports = {
  // High-level API — creates a Flight response from a stream or fetch promise
  createFromStream: client.createFromStream,
  createFromFetch: client.createFromFetch,

  // Low-level API — manual stream parsing
  createResponse: client.createResponse,
  createStreamState: client.createStreamState,
  processStringChunk: client.processStringChunk,
  processBinaryChunk: client.processBinaryChunk,
  getRoot: client.getRoot,
  close: client.close,
  reportGlobalError: client.reportGlobalError,

  // HTTP layer — bridge-based networking
  fetchRSC: http.fetchRSC,
  fetchWithBridge: http.fetchWithBridge,
  callServer: http.callServer,
  createStream: http.createStream,

  // Config — Flight client configuration (for advanced use)
  resolveClientReference: config.resolveClientReference,
  resolveServerReference: config.resolveServerReference,
  requireModule: config.requireModule,
  preloadModule: config.preloadModule,
};
