'use strict';

// ---------------------------------------------------------------------------
// react-dom-native Flight Client
//
// Public API for consuming RSC Flight streams.
//
// Stream parsing and module loading have been moved to Swift
// (FlightStreamClient.swift + FlightStreamDelegate.swift).
// The JS-side low-level API is kept for Fantom tests which run in Node.js.
// ---------------------------------------------------------------------------

var client = require('./client');
var http = require('./http');
var config = require('./config');

module.exports = {
  // Low-level API — manual stream parsing (used by Fantom tests)
  createResponse: client.createResponse,
  createStreamState: client.createStreamState,
  processStringChunk: client.processStringChunk,
  getRoot: client.getRoot,
  close: client.close,
  reportGlobalError: client.reportGlobalError,

  // Chunk management (used by bridge globals)
  processRow: client.processRow,
  getOrCreateChunk: client.getOrCreateChunk,
  resolveChunk: client.resolveChunk,
  rejectChunk: client.rejectChunk,

  // HTTP layer — bridge-based networking (used by callServer)
  fetchWithBridge: http.fetchWithBridge,
  callServer: http.callServer,
  createStream: http.createStream,

  // Config — Flight client configuration (for Fantom tests)
  resolveClientReference: config.resolveClientReference,
  resolveServerReference: config.resolveServerReference,
};
